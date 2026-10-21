import { randomBytes } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import {
  PROJECTS,
  SITE,
  fixtureIssues,
  type FixtureIssue,
} from "./jira-fixture";

/**
 * A local stand-in for Atlassian's sign-in and Jira Cloud, for the walkthrough.
 *
 * The backend's Jira adapter reads two base URLs from its environment
 * (`JIRA_AUTH_BASE_URL`, `JIRA_API_BASE_URL`). Pointed here, the whole connect
 * flow runs for real in a browser: the product sends the person to `/authorize`,
 * they press Accept, the product exchanges the code, lists the sites and
 * projects, and pulls tickets. Nothing leaves the machine.
 *
 * ## What it is not
 *
 * Not Atlassian. It answers the six calls the adapter makes, and the consent
 * page says on its face that it is a stand-in, so a recording of it cannot be
 * mistaken for the real thing. The walkthrough's captions say the same. What it
 * cannot show is anything that depends on a real tenant: scopes a real admin
 * refuses, a token the real service revokes, the real rate limit.
 *
 * ## The calls
 *
 * | Call | Used for |
 * | ---- | -------- |
 * | `GET /authorize` | the consent page the browser is sent to |
 * | `POST /oauth/token` | code exchange and refresh |
 * | `GET /oauth/token/accessible-resources` | which sites the grant covers |
 * | `GET /ex/jira/:site/rest/api/3/project/search` | the project picker |
 * | `POST /ex/jira/:site/rest/api/3/search/jql` | the tickets |
 *
 * The JQL is read only as far as the adapter writes it (`project in (...) AND
 * updated >= "YYYY-MM-DD" ORDER BY updated ASC`); a query of any other shape is
 * refused rather than guessed at, so a change to what the adapter asks for shows
 * up as a failure here and not as quietly different data.
 */

export type StandIn = {
  server: Server;
  port: number;
  /** Everything it was asked, newest last, for the stage to print when something fails. */
  requests: string[];
  close: () => Promise<void>;
};

const SCOPES = ["read:jira-work", "read:jira-user", "offline_access"];
const PAGE = 100;

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function html(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(body);
}

const token = (): string => randomBytes(18).toString("hex");

function consent(
  params: URLSearchParams,
  accept: string,
  cancel: string,
): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Atlassian, simulated: allow access</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; margin: 0; background: #f4f5f7; color: #172b4d; }
  .banner { background: #172b4d; color: #fff; padding: 12px 24px; font-size: 15px; }
  main { max-width: 480px; margin: 40px auto; background: #fff; border: 1px solid #dfe1e6; border-radius: 4px; padding: 28px; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  ul { padding-left: 20px; }
  .row { display: flex; gap: 12px; margin-top: 24px; }
  a.accept { background: #0052cc; color: #fff; padding: 10px 18px; border-radius: 3px; text-decoration: none; font-weight: 600; }
  a.cancel { padding: 10px 18px; color: #172b4d; }
  .note { font-size: 14px; color: #5e6c84; }
</style>
</head>
<body>
<div class="banner">Atlassian simulated by a local stand-in. This is not Atlassian and nothing here leaves this machine.</div>
<main>
  <h1>Allow ApproveHR to access ${escapeHtml(SITE.name)}?</h1>
  <p>ApproveHR is asking to:</p>
  <ul>
${SCOPES.filter((s) => (params.get("scope") ?? "").split(" ").includes(s))
  .map((s) => `    <li>${escapeHtml(s)}</li>`)
  .join("\n")}
  </ul>
  <div class="row">
    <a class="accept" href="${escapeHtml(accept)}">Accept</a>
    <a class="cancel" href="${escapeHtml(cancel)}">Cancel</a>
  </div>
  <p class="note">Site: ${escapeHtml(SITE.name)} (${escapeHtml(SITE.url)}), a made-up site.</p>
</main>
</body>
</html>`;
}

function search(
  issues: readonly FixtureIssue[],
  jql: string,
  maxResults: number,
  pageToken: string | undefined,
): { issues: FixtureIssue[]; nextPageToken?: string; isLast: boolean } | null {
  const shape =
    /^project in \(([^)]*)\) AND updated >= "(\d{4}-\d{2}-\d{2})" ORDER BY updated ASC$/.exec(
      jql.trim(),
    );
  if (!shape) return null;
  const keys = new Set(
    [...(shape[1] ?? "").matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) =>
      (m[1] ?? "").replace(/\\(.)/g, "$1"),
    ),
  );
  const since = Date.parse(`${shape[2] ?? ""}T00:00:00.000Z`);
  const matching = issues
    .filter(
      (issue) =>
        keys.has(issue.fields.project.key) &&
        Date.parse(issue.fields.updated) >= since,
    )
    .sort((a, b) => a.fields.updated.localeCompare(b.fields.updated));
  const start = pageToken ? Number(pageToken) : 0;
  const slice = matching.slice(start, start + maxResults);
  const end = start + slice.length;
  return end < matching.length
    ? { issues: slice, nextPageToken: String(end), isLast: false }
    : { issues: slice, isLast: true };
}

export function startAtlassianStandIn(options: {
  port: number;
  host?: string;
  now?: Date;
}): Promise<StandIn> {
  const issues = fixtureIssues(options.now ?? new Date());
  const requests: string[] = [];
  /* code -> what it was issued for; access and refresh tokens that are live. */
  const codes = new Map<string, { redirectUri: string; clientId: string }>();
  const access = new Set<string>();
  const refresh = new Set<string>();

  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      json(response, 500, {
        message:
          error instanceof Error ? error.message : "The stand-in failed.",
      });
    });
  });

  const authorised = (request: IncomingMessage): boolean => {
    const header = request.headers.authorization ?? "";
    return header.startsWith("Bearer ") && access.has(header.slice(7));
  };

  async function handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const url = new URL(request.url ?? "/", "http://standin.local");
    const method = request.method ?? "GET";
    requests.push(`${method} ${url.pathname}`);

    if (method === "GET" && url.pathname === "/health") {
      json(response, 200, { ok: true, standIn: "atlassian" });
      return;
    }

    if (method === "GET" && url.pathname === "/authorize") {
      const redirect = url.searchParams.get("redirect_uri");
      const state = url.searchParams.get("state") ?? "";
      if (!redirect || !URL.canParse(redirect)) {
        html(response, 400, "<p>redirect_uri is missing or not a URL.</p>");
        return;
      }
      const code = token();
      codes.set(code, {
        redirectUri: redirect,
        clientId: url.searchParams.get("client_id") ?? "",
      });
      const back = (extra: Record<string, string>) => {
        const target = new URL(redirect);
        for (const [k, v] of Object.entries({ ...extra, state })) {
          target.searchParams.set(k, v);
        }
        return target.toString();
      };
      html(
        response,
        200,
        consent(
          url.searchParams,
          back({ code }),
          back({ error: "access_denied" }),
        ),
      );
      return;
    }

    if (method === "POST" && url.pathname === "/oauth/token") {
      const body = JSON.parse(await readBody(request)) as Record<
        string,
        string
      >;
      if (body["grant_type"] === "authorization_code") {
        const issued = codes.get(body["code"] ?? "");
        if (!issued || issued.redirectUri !== body["redirect_uri"]) {
          json(response, 400, { error: "invalid_grant" });
          return;
        }
        codes.delete(body["code"] ?? "");
      } else if (body["grant_type"] === "refresh_token") {
        if (!refresh.has(body["refresh_token"] ?? "")) {
          json(response, 403, { error: "invalid_grant" });
          return;
        }
        refresh.delete(body["refresh_token"] ?? "");
      } else {
        json(response, 400, { error: "unsupported_grant_type" });
        return;
      }
      const accessToken = token();
      const refreshToken = token();
      access.add(accessToken);
      refresh.add(refreshToken);
      json(response, 200, {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 3600,
        token_type: "Bearer",
        scope: SCOPES.join(" "),
      });
      return;
    }

    if (!authorised(request)) {
      json(response, 401, { code: 401, message: "Unauthorized" });
      return;
    }

    if (
      method === "GET" &&
      url.pathname === "/oauth/token/accessible-resources"
    ) {
      json(response, 200, [{ ...SITE, scopes: SCOPES, avatarUrl: null }]);
      return;
    }

    const api = /^\/ex\/jira\/([^/]+)\/rest\/api\/3\/(.+)$/.exec(url.pathname);
    if (api && api[1] === SITE.id) {
      if (method === "GET" && api[2] === "project/search") {
        const startAt = Number(url.searchParams.get("startAt") ?? "0");
        const max = Number(url.searchParams.get("maxResults") ?? "50");
        const values = PROJECTS.slice(startAt, startAt + max);
        json(response, 200, {
          values,
          startAt,
          maxResults: max,
          total: PROJECTS.length,
          isLast: startAt + values.length >= PROJECTS.length,
        });
        return;
      }
      if (method === "POST" && api[2] === "search/jql") {
        const body = JSON.parse(await readBody(request)) as {
          jql?: string;
          maxResults?: number;
          nextPageToken?: string;
        };
        const found = search(
          issues,
          body.jql ?? "",
          body.maxResults ?? PAGE,
          body.nextPageToken,
        );
        if (!found) {
          json(response, 400, {
            errorMessages: [
              `The stand-in only understands the adapter's own query shape, not: ${body.jql ?? ""}`,
            ],
          });
          return;
        }
        json(response, 200, found);
        return;
      }
    }

    json(response, 404, { code: 404, message: `No ${method} ${url.pathname}` });
  }

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host ?? "127.0.0.1", () => {
      const address = server.address();
      const port =
        typeof address === "object" && address !== null
          ? address.port
          : options.port;
      resolve({
        server,
        port,
        requests,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
            server.closeAllConnections();
          }),
      });
    });
  });
}

/* Run directly: `npx tsx tests/walkthrough/stage/atlassian-standin.ts 8799` */
if (process.argv[1]?.endsWith("atlassian-standin.ts")) {
  const port = Number(process.argv[2] ?? "8799");
  void startAtlassianStandIn({ port }).then((standIn) => {
    process.stdout.write(
      `atlassian stand-in on http://127.0.0.1:${String(standIn.port)}\n`,
    );
  });
}
