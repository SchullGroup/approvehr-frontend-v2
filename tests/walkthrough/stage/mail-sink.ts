import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

/**
 * A local stand-in for the mail provider, with an inbox somebody can read.
 *
 * The backend sends through Resend and `RESEND_API_BASE_URL` says where; pointed
 * here, every message the product sends lands in this process and goes nowhere
 * else. The inbox page is what the walkthrough opens as a second tab, so the
 * verification, invitation and candidate links are clicked the way a person
 * clicks them in a mail client.
 *
 * It answers like the provider for the one call the product makes (`POST
 * /emails`, 200 with an id) and keeps the whole message, including the reply-to,
 * because "the candidate's reply-to is the company's address" is something the
 * walkthrough has to be able to show.
 *
 * Plain `node:http` and no dependency: it runs from `npx tsx` beside a stage
 * and has nothing to install.
 */

export type SinkMessage = {
  id: string;
  receivedAt: string;
  from: string;
  to: string[];
  replyTo: string[];
  subject: string;
  html: string;
  text: string;
  attachments: { filename: string; contentType: string; bytes: number }[];
};

export type MailSink = {
  server: Server;
  port: number;
  messages: SinkMessage[];
  close: () => Promise<void>;
};

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const list = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : typeof value === "string"
      ? [value]
      : [];

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function send(
  response: ServerResponse,
  status: number,
  type: string,
  body: string,
): void {
  response.writeHead(status, {
    "Content-Type": `${type}; charset=utf-8`,
    "Cache-Control": "no-store",
  });
  response.end(body);
}

const page = (title: string, body: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  body { font: 16px/1.5 system-ui, sans-serif; margin: 0; background: #f4f6f8; color: #14202b; }
  header { background: #14202b; color: #fff; padding: 12px 24px; }
  header p { margin: 0; font-size: 14px; color: #c9d4de; }
  main { max-width: 860px; margin: 24px auto; padding: 0 24px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #d7dee5; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e6ebef; font-size: 15px; }
  th { font-size: 14px; color: #4a5a68; }
  a { color: #1d2f9a; }
  dl { display: grid; grid-template-columns: 8rem 1fr; gap: 4px 12px; margin: 0 0 16px; }
  dt { color: #4a5a68; }
  dd { margin: 0; overflow-wrap: anywhere; }
  .body { background: #fff; border: 1px solid #d7dee5; padding: 20px; overflow-wrap: anywhere; }
  .note { font-size: 14px; color: #4a5a68; }
</style>
</head>
<body>
<header>
  <p>Local mail sink. Nothing shown here left this machine.</p>
</header>
<main>
${body}
</main>
</body>
</html>`;

/** The part of an HTML mail that belongs on the page: no scripts, no document shell. */
function bodyOf(html: string): string {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  const inner = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(withoutScripts);
  return (
    inner?.[1] ?? withoutScripts.replace(/<\/?(html|head|body)[^>]*>/gi, "")
  );
}

function inbox(messages: readonly SinkMessage[]): string {
  if (messages.length === 0) {
    return page("Inbox", `<h1>Inbox</h1><p>No mail has arrived yet.</p>`);
  }
  const rows = [...messages]
    .reverse()
    .map(
      (m) => `<tr>
  <td>${escapeHtml(m.receivedAt.slice(11, 19))}</td>
  <td>${escapeHtml(m.to.join(", "))}</td>
  <td><a href="/m/${m.id}">${escapeHtml(m.subject)}</a></td>
</tr>`,
    )
    .join("\n");
  return page(
    "Inbox",
    `<h1>Inbox</h1>
<p class="note">${String(messages.length)} ${messages.length === 1 ? "message" : "messages"}, newest first.</p>
<table>
<thead><tr><th scope="col">Received</th><th scope="col">To</th><th scope="col">Subject</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`,
  );
}

function message(m: SinkMessage): string {
  return page(
    m.subject,
    `<p><a href="/">Back to the inbox</a></p>
<h1>${escapeHtml(m.subject)}</h1>
<dl>
  <dt>From</dt><dd>${escapeHtml(m.from)}</dd>
  <dt>To</dt><dd>${escapeHtml(m.to.join(", "))}</dd>
  ${m.replyTo.length > 0 ? `<dt>Reply-to</dt><dd>${escapeHtml(m.replyTo.join(", "))}</dd>` : ""}
  ${m.attachments.length > 0 ? `<dt>Attached</dt><dd>${escapeHtml(m.attachments.map((a) => `${a.filename} (${String(a.bytes)} bytes)`).join(", "))}</dd>` : ""}
</dl>
<div class="body" role="article" aria-label="Message">${bodyOf(m.html)}</div>`,
  );
}

export function startMailSink(options: {
  port: number;
  host?: string;
}): Promise<MailSink> {
  const messages: SinkMessage[] = [];

  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      send(
        response,
        500,
        "text/plain",
        error instanceof Error ? error.message : "The sink failed.",
      );
    });
  });

  async function handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const url = new URL(request.url ?? "/", "http://sink.local");
    const method = request.method ?? "GET";

    if (method === "POST" && url.pathname === "/emails") {
      const authorised = (request.headers.authorization ?? "").startsWith(
        "Bearer ",
      );
      if (!authorised) {
        send(
          response,
          401,
          "application/json",
          JSON.stringify({
            name: "missing_api_key",
            message: "Missing API key.",
          }),
        );
        return;
      }
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(await readBody(request)) as Record<string, unknown>;
      } catch {
        send(
          response,
          422,
          "application/json",
          JSON.stringify({ name: "validation_error", message: "Not JSON." }),
        );
        return;
      }
      const attachments = Array.isArray(body["attachments"])
        ? (body["attachments"] as Record<string, unknown>[]).map((a) => ({
            filename: String(a["filename"] ?? "attachment"),
            contentType: String(
              a["content_type"] ?? "application/octet-stream",
            ),
            bytes: Buffer.from(String(a["content"] ?? ""), "base64").length,
          }))
        : [];
      const stored: SinkMessage = {
        id: randomUUID(),
        receivedAt: new Date().toISOString(),
        from: String(body["from"] ?? ""),
        to: list(body["to"]),
        replyTo: list(body["reply_to"]),
        subject: String(body["subject"] ?? "(no subject)"),
        html: String(body["html"] ?? ""),
        text: String(body["text"] ?? ""),
        attachments,
      };
      messages.push(stored);
      send(
        response,
        200,
        "application/json",
        JSON.stringify({ id: stored.id }),
      );
      return;
    }

    if (method === "GET" && url.pathname === "/health") {
      send(
        response,
        200,
        "application/json",
        JSON.stringify({ ok: true, messages: messages.length }),
      );
      return;
    }

    /* For the stage and for debugging. A journey never reads this: it opens the
       inbox and clicks, which is what a person can do. */
    if (method === "GET" && url.pathname === "/api/messages") {
      send(response, 200, "application/json", JSON.stringify(messages));
      return;
    }

    if (method === "GET" && url.pathname === "/") {
      send(response, 200, "text/html", inbox(messages));
      return;
    }

    const open = /^\/m\/([0-9a-f-]{36})$/.exec(url.pathname);
    if (method === "GET" && open) {
      const found = messages.find((m) => m.id === open[1]);
      if (found) {
        send(response, 200, "text/html", message(found));
        return;
      }
    }

    send(
      response,
      404,
      "text/html",
      page(
        "Not found",
        `<h1>Not found</h1><p><a href="/">Back to the inbox</a></p>`,
      ),
    );
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
        messages,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
            server.closeAllConnections();
          }),
      });
    });
  });
}

/* Run directly: `npx tsx tests/walkthrough/stage/mail-sink.ts 8798` */
if (process.argv[1]?.endsWith("mail-sink.ts")) {
  const port = Number(process.argv[2] ?? "8798");
  void startMailSink({ port }).then((sink) => {
    process.stdout.write(
      `mail sink on http://127.0.0.1:${String(sink.port)}\n`,
    );
  });
}
