import { readFileSync } from "node:fs";
import type { BrowserContext, Page } from "@playwright/test";

/**
 * Everything that watches the run without changing what the app does.
 *
 * ## Actors and observers
 *
 * The rule of the walkthrough is that a journey only does what a person can do.
 * That is a rule about *actors*, the things that change what the app does. The
 * things in this file only listen, so they are allowed, and they are the reason
 * the walkthrough finds anything: a click that worked and logged an error is
 * exactly what a person never notices and a developer needs to know.
 *
 * - **console, pageerror**: an error the page logged or threw. A hydration
 *   mismatch is a blocker, anything else is major.
 * - **requestfailed, response**: a request that did not complete, and any answer
 *   of 400 or over, with the URL and status. Some of those are expected (a
 *   sign-in form's first look at `/auth/me`), and the report says which route and
 *   step they came from, so the reader can tell.
 * - **external**: the browser may reach localhost and nothing else. Anything
 *   else is aborted and recorded as a finding ("the app calls X"). This is also
 *   what stops a font or an analytics tag from quietly leaving the machine.
 * - **axe**: an accessibility scan after the first visit to each route. Serious
 *   and critical are blockers, the rest are listed.
 *
 * This is one of the files the guard test allows to use `evaluate`, `route` and
 * the other things a journey is forbidden to touch.
 */

export type Severity = "blocker" | "major" | "minor" | "nit";

export type Observed = {
  kind: "console" | "pageerror" | "requestfailed" | "http" | "external" | "axe";
  severity: Severity;
  route: string;
  role: string;
  step: string;
  message: string;
  /** Milliseconds from the start of the recording. */
  at: number;
};

type Where = { role: () => string; step: () => string; now: () => number };

/** `/hiring/candidates/6f1c…` and `/hiring/candidates/9a0b…` are one route. */
export function normaliseRoute(path: string): string {
  return path
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      ":id",
    )
    .replace(/\/\d+(?=\/|$)/g, "/:n");
}

export class Observers {
  readonly list: Observed[] = [];
  private readonly scanned = new Set<string>();
  private readonly allowedPorts: Set<string>;
  private axeSource: string | null = null;

  constructor(
    private readonly where: Where,
    allowed: readonly string[],
  ) {
    this.allowedPorts = new Set(allowed.map((u) => new URL(u).port));
  }

  private add(
    kind: Observed["kind"],
    severity: Severity,
    page: Page | null,
    message: string,
  ): void {
    let route = "";
    try {
      route = page ? normaliseRoute(new URL(page.url()).pathname) : "";
    } catch {
      route = "";
    }
    this.list.push({
      kind,
      severity,
      route,
      role: this.where.role(),
      step: this.where.step(),
      message: message.slice(0, 600),
      at: this.where.now(),
    });
  }

  /** The pages we are testing, as opposed to the stand-ins beside them. */
  private ours(url: string): boolean {
    try {
      const { hostname, port } = new URL(url);
      return (
        (hostname === "localhost" || hostname === "127.0.0.1") &&
        this.allowedPorts.has(port) &&
        // The mail sink and the Atlassian stand-in are not the product.
        !url.includes(":8798") &&
        !url.includes(":8799")
      );
    } catch {
      return false;
    }
  }

  async attach(context: BrowserContext): Promise<void> {
    await context.route("**/*", async (route) => {
      const url = route.request().url();
      if (/^(data|blob|about):/.test(url)) return route.continue();
      let local = false;
      try {
        const { hostname, port } = new URL(url);
        local =
          (hostname === "localhost" || hostname === "127.0.0.1") &&
          this.allowedPorts.has(port);
      } catch {
        local = false;
      }
      if (local) return route.continue();
      this.add("external", "major", null, `The app calls ${url}`);
      return route.abort("blockedbyclient");
    });
  }

  watch(page: Page): void {
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      if (!this.ours(page.url())) return;
      const text = message.text();
      this.add(
        "console",
        /hydrat/i.test(text) ? "blocker" : "major",
        page,
        text,
      );
    });
    page.on("pageerror", (error) => {
      if (!this.ours(page.url())) return;
      this.add("pageerror", "blocker", page, error.message);
    });
    page.on("requestfailed", (request) => {
      if (!this.ours(request.url())) return;
      const reason = request.failure()?.errorText ?? "failed";
      /* A navigation away aborts whatever was still loading; that is the
         browser, not the product. */
      if (/ERR_ABORTED/.test(reason)) return;
      this.add(
        "requestfailed",
        "major",
        page,
        `${request.method()} ${request.url()}: ${reason}`,
      );
    });
    page.on("response", (response) => {
      if (response.status() < 400) return;
      if (!this.ours(response.url())) return;
      this.add(
        "http",
        response.status() >= 500 ? "major" : "minor",
        page,
        `${String(response.status())} ${response.request().method()} ${response.url()}`,
      );
    });
  }

  /**
   * Scan this route once per role. The scan is `evaluate` of a string, which runs
   * through the debugging protocol and so is not stopped by the app's own
   * Content-Security-Policy the way a script tag would be, and the policy stays
   * switched on for everything else, because a policy violation is a finding too.
   */
  async scan(page: Page): Promise<void> {
    if (!this.ours(page.url())) return;
    const route = normaliseRoute(new URL(page.url()).pathname);
    const key = `${this.where.role()} ${route}`;
    if (this.scanned.has(key)) return;
    this.scanned.add(key);

    this.axeSource ??= readFileSync(
      require.resolve("axe-core/axe.min.js"),
      "utf8",
    );
    await page.evaluate(this.axeSource);
    const result = await page.evaluate(async () => {
      const axe = (
        window as unknown as {
          axe: {
            run: (
              context: unknown,
              options: unknown,
            ) => Promise<{
              violations: {
                id: string;
                impact: string | null;
                help: string;
                nodes: { target: unknown[] }[];
              }[];
            }>;
          };
        }
      ).axe;
      const run = await axe.run(
        { exclude: [["#__walk"]] },
        { resultTypes: ["violations"] },
      );
      return run.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        count: v.nodes.length,
        first: String(v.nodes[0]?.target[0] ?? ""),
      }));
    });
    for (const violation of result) {
      const severity: Severity =
        violation.impact === "critical" || violation.impact === "serious"
          ? "blocker"
          : violation.impact === "moderate"
            ? "major"
            : "minor";
      this.add(
        "axe",
        severity,
        page,
        `${violation.id}: ${violation.help} (${String(violation.count)} on this page, first: ${violation.first})`,
      );
    }
  }
}
