// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PEOPLE } from "../people";
import { startAtlassianStandIn, type StandIn } from "./atlassian-standin";
import { startMailSink, type MailSink } from "./mail-sink";

/**
 * The two local stand-ins the walkthrough points the product at.
 *
 * These are held to the contract the backend actually uses (one call to the mail
 * provider; six to Atlassian), because a stand-in that answers differently from
 * the real thing makes the walkthrough show a product that does not exist. The
 * end-to-end proof, the real backend talking to them, is the stage's own check.
 */

describe("the mail sink", () => {
  let sink: MailSink;
  let base: string;
  beforeAll(async () => {
    sink = await startMailSink({ port: 0 });
    base = `http://127.0.0.1:${String(sink.port)}`;
  });
  afterAll(() => sink.close());

  const send = (body: unknown, authorised = true) =>
    fetch(`${base}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authorised ? { Authorization: "Bearer throwaway" } : {}),
      },
      body: JSON.stringify(body),
    });

  it("refuses a send with no key, as the provider does", async () => {
    const response = await send({ subject: "x" }, false);
    expect(response.status).toBe(401);
    expect(sink.messages).toHaveLength(0);
  });

  it("takes a send, answers with an id, and keeps everything that was sent", async () => {
    const response = await send({
      from: '"Fictional Works" <hr@walkthrough.example>',
      to: [PEOPLE.hrManager.email],
      reply_to: ["careers@walkthrough.example"],
      subject: "Verify your email",
      html: '<p>Hello <a href="http://localhost:3297/verify-email?token=abc">verify</a></p><script>steal()</script>',
      text: "Hello",
      attachments: [
        {
          filename: "offer.pdf",
          content: Buffer.from("12345").toString("base64"),
          content_type: "application/pdf",
        },
      ],
    });
    expect(response.status).toBe(200);
    const { id } = (await response.json()) as { id: string };
    const stored = sink.messages.find((m) => m.id === id);
    expect(stored?.to).toEqual([PEOPLE.hrManager.email]);
    expect(stored?.replyTo).toEqual(["careers@walkthrough.example"]);
    expect(stored?.attachments).toEqual([
      { filename: "offer.pdf", contentType: "application/pdf", bytes: 5 },
    ]);
  });

  it("shows the inbox, and the message with its link intact and its script gone", async () => {
    const inbox = await (await fetch(`${base}/`)).text();
    expect(inbox).toContain("Verify your email");
    expect(inbox).toContain("Nothing shown here left this machine");
    const id = /href="\/m\/([0-9a-f-]{36})"/.exec(inbox)?.[1];
    expect(id).toBeDefined();
    const page = await (await fetch(`${base}/m/${String(id)}`)).text();
    expect(page).toContain(
      'href="http://localhost:3297/verify-email?token=abc"',
    );
    expect(page).not.toContain("steal()");
    expect(page).toContain("Reply-to");
    expect(page).toContain("offer.pdf");
  });

  it("escapes a subject rather than rendering it", async () => {
    await send({
      to: ["a@walkthrough.example"],
      subject: "<b>bold</b>",
      html: "",
    });
    const inbox = await (await fetch(`${base}/`)).text();
    expect(inbox).toContain("&lt;b&gt;bold&lt;/b&gt;");
    expect(inbox).not.toContain("<b>bold</b>");
  });

  it("says plainly when there is no such message", async () => {
    const response = await fetch(
      `${base}/m/00000000-0000-0000-0000-000000000000`,
    );
    expect(response.status).toBe(404);
  });
});

describe("the Atlassian stand-in", () => {
  let standIn: StandIn;
  let base: string;
  const redirect = "http://localhost:8797/api/v1/work-trackers/oauth/callback";
  beforeAll(async () => {
    standIn = await startAtlassianStandIn({
      port: 0,
      now: new Date("2026-10-21T12:00:00Z"),
    });
    base = `http://127.0.0.1:${String(standIn.port)}`;
  });
  afterAll(() => standIn.close());

  const authorize = async () => {
    const query = new URLSearchParams({
      audience: "api.atlassian.com",
      client_id: "walk-client",
      scope: "read:jira-work read:jira-user offline_access",
      redirect_uri: redirect,
      state: "state-123",
      response_type: "code",
      prompt: "consent",
    });
    return (await fetch(`${base}/authorize?${query.toString()}`)).text();
  };
  const codeFrom = (page: string): string => {
    const accept = /class="accept" href="([^"]+)"/.exec(page)?.[1] ?? "";
    return (
      new URL(accept.replace(/&amp;/g, "&")).searchParams.get("code") ?? ""
    );
  };
  const exchange = (body: Record<string, string>) =>
    fetch(`${base}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const connect = async () => {
    const code = codeFrom(await authorize());
    const response = await exchange({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirect,
    });
    return (await response.json()) as {
      access_token: string;
      refresh_token: string;
    };
  };
  const bearer = (accessToken: string) => ({
    Authorization: `Bearer ${accessToken}`,
  });
  const jql = (projects: string[], since = "2026-01-01") =>
    `project in (${projects.map((p) => `"${p}"`).join(", ")}) AND updated >= "${since}" ORDER BY updated ASC`;

  it("says on the consent page that it is not Atlassian", async () => {
    const page = await authorize();
    expect(page).toContain("Atlassian simulated by a local stand-in");
    expect(page).toContain("read:jira-work");
  });

  it("sends Accept back to the product with a code and the state it was given", async () => {
    const page = await authorize();
    const accept = /class="accept" href="([^"]+)"/.exec(page)?.[1] ?? "";
    const target = new URL(accept.replace(/&amp;/g, "&"));
    expect(`${target.origin}${target.pathname}`).toBe(redirect);
    expect(target.searchParams.get("state")).toBe("state-123");
    expect(target.searchParams.get("code")).toBeTruthy();
  });

  it("sends Cancel back as a refusal, with the state", async () => {
    const page = await authorize();
    const cancel = /class="cancel" href="([^"]+)"/.exec(page)?.[1] ?? "";
    const target = new URL(cancel.replace(/&amp;/g, "&"));
    expect(target.searchParams.get("error")).toBe("access_denied");
    expect(target.searchParams.get("state")).toBe("state-123");
  });

  it("exchanges a code once, for the redirect it was issued against", async () => {
    const code = codeFrom(await authorize());
    expect(
      (
        await exchange({
          grant_type: "authorization_code",
          code,
          redirect_uri: "http://localhost:9/elsewhere",
        })
      ).status,
    ).toBe(400);
    const ok = await exchange({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirect,
    });
    expect(ok.status).toBe(200);
    expect(
      (
        await exchange({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirect,
        })
      ).status,
    ).toBe(400);
  });

  it("rotates a refresh token and refuses the old one", async () => {
    const first = await connect();
    const second = await exchange({
      grant_type: "refresh_token",
      refresh_token: first.refresh_token,
    });
    expect(second.status).toBe(200);
    const again = await exchange({
      grant_type: "refresh_token",
      refresh_token: first.refresh_token,
    });
    expect(again.status).toBe(403);
  });

  it("answers nothing without a token it issued", async () => {
    const response = await fetch(`${base}/oauth/token/accessible-resources`, {
      headers: bearer("made-up"),
    });
    expect(response.status).toBe(401);
  });

  it("lists the one site, with the scope the adapter filters on", async () => {
    const { access_token } = await connect();
    const sites = (await (
      await fetch(`${base}/oauth/token/accessible-resources`, {
        headers: bearer(access_token),
      })
    ).json()) as { id: string; name: string; scopes: string[] }[];
    expect(sites).toHaveLength(1);
    expect(sites[0]?.scopes).toContain("read:jira-work");
  });

  it("lists the projects", async () => {
    const { access_token } = await connect();
    const page = (await (
      await fetch(
        `${base}/ex/jira/walk-site-0001/rest/api/3/project/search?maxResults=50&startAt=0&orderBy=key`,
        { headers: bearer(access_token) },
      )
    ).json()) as { values: { key: string }[]; isLast: boolean };
    expect(page.values.map((p) => p.key)).toEqual(["WALK", "OPS"]);
    expect(page.isLast).toBe(true);
  });

  const search = async (accessToken: string, body: Record<string, unknown>) =>
    fetch(`${base}/ex/jira/walk-site-0001/rest/api/3/search/jql`, {
      method: "POST",
      headers: { ...bearer(accessToken), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("searches the tickets of the projects it is asked for, oldest update first", async () => {
    const { access_token } = await connect();
    const page = (await (
      await search(access_token, { jql: jql(["WALK"]), maxResults: 100 })
    ).json()) as {
      issues: {
        key: string;
        fields: { updated: string; project: { key: string } };
      }[];
      isLast: boolean;
    };
    expect(page.issues.length).toBeGreaterThan(3);
    expect(page.issues.every((i) => i.fields.project.key === "WALK")).toBe(
      true,
    );
    const updated = page.issues.map((i) => i.fields.updated);
    expect([...updated].sort()).toEqual(updated);
    expect(page.isLast).toBe(true);
  });

  it("pages with a token, and the pages add up to the whole", async () => {
    const { access_token } = await connect();
    const seen: string[] = [];
    let next: string | undefined;
    do {
      const page = (await (
        await search(access_token, {
          jql: jql(["WALK", "OPS"]),
          maxResults: 5,
          ...(next ? { nextPageToken: next } : {}),
        })
      ).json()) as {
        issues: { key: string }[];
        nextPageToken?: string;
        isLast: boolean;
      };
      seen.push(...page.issues.map((i) => i.key));
      next = page.isLast ? undefined : page.nextPageToken;
    } while (next);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toHaveLength(12);
  });

  it("leaves out what was last updated before the date", async () => {
    const { access_token } = await connect();
    const page = (await (
      await search(access_token, { jql: jql(["WALK", "OPS"], "2026-10-21") })
    ).json()) as { issues: unknown[] };
    expect(page.issues).toHaveLength(0);
  });

  it("assigns tickets to the walkthrough's own people by email", async () => {
    const { access_token } = await connect();
    const page = (await (
      await search(access_token, { jql: jql(["WALK", "OPS"]) })
    ).json()) as {
      issues: { fields: { assignee: { emailAddress: string } | null } }[];
    };
    const emails = new Set(
      page.issues.flatMap((i) =>
        i.fields.assignee ? [i.fields.assignee.emailAddress] : [],
      ),
    );
    expect(emails.has(PEOPLE.employee.email)).toBe(true);
    expect(emails.has(PEOPLE.projectMember.email)).toBe(true);
  });

  it("refuses a query of a shape the adapter does not write, rather than guessing", async () => {
    const { access_token } = await connect();
    const response = await search(access_token, {
      jql: "assignee = currentUser()",
    });
    expect(response.status).toBe(400);
  });
});
