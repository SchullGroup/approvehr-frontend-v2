import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * "Today", read off the clock, without going through `todayIn`.
 *
 * Task 7d converted every `new Date().toISOString().slice(0, 10)` (and the
 * `.slice(0, 7)` month variant) in `src/` to `todayIn(timeZone)` — the one
 * function allowed to turn "right now" into a calendar day, because it is the
 * only one that asks *which zone*. Every other spelling of "the clock, right
 * now, as a calendar day" reintroduces the bug this batch exists to fix: for
 * the first hour of every day in Africa/Lagos (UTC+1), and for thirteen hours
 * a day in Pacific/Auckland (UTC+13), `new Date().toISOString().slice(0, 10)`
 * names *yesterday*. A `max={today()}` bound then refuses today's own date as
 * "in the future", and a date input opens defaulted to the wrong day.
 *
 * ## Why this checks `new Date().toISOString().slice(`, and not
 * `new Date().toISOString()` on its own
 *
 * A bare, un-sliced `new Date().toISOString()` is a *timestamp* — `createdAt`,
 * `approvedAt`, `readAt`, and around forty more like them across `src/`. That
 * is the correct way to record an instant: UTC, unambiguous, complete. Only
 * *reducing* it to a calendar day with `.slice(0, 10)` or `.slice(0, 7)` is
 * where the zone gets silently dropped and the bug appears. A check against
 * the bare form would have to allowlist every one of those legitimate
 * timestamps to stay green — which is exactly the failure mode
 * `no-raw-date-formatting.test.ts`'s header warns about: a regex that also
 * matched legitimate currency formatting, and later one that matched
 * `at: Date.now()` in an object literal. This stays narrow instead, and checks
 * only the shape that is actually the bug.
 *
 * ## What this does not catch
 *
 * This is a literal substring match, not a type checker, and it is honest
 * about where that stops working:
 *
 * 1. **An intermediate variable.** `const now = new Date(); ...
 *    now.toISOString().slice(0, 10)` never spells the offending chain on one
 *    line, so it slips through. This is not hypothetical: `lib/store/
 *    insights.ts`'s `demo()` callbacks did exactly this (`const now = new
 *    Date()`, formatted through a local `iso`/`monthKey` helper) and were
 *    found only by tracing every call site by hand, the way this batch's brief
 *    asked every ambiguous site to be traced. A future instance of this shape
 *    needs the same manual trace; this test will not find it.
 * 2. **A reformatted chain.** `new Date()\n  .toISOString()\n  .slice(` —
 *    spread across lines — is still the bug, but is not the literal substring
 *    this looks for.
 *
 * Closing either fully needs the TypeScript compiler's own type checker, not a
 * string search. This is a deliberate stopping point for the same reason
 * `no-raw-date-formatting.test.ts` gives for its own three gaps: widening the
 * regex trades one blind spot for another rather than closing the underlying
 * one.
 *
 * `src/lib/time.ts` is excluded: it is the one module allowed to read the
 * clock, because `todayIn` is what every other file is supposed to call
 * instead.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.resolve(REPO_ROOT, "src");

const EXCLUDED = new Set([path.resolve(SRC, "lib/time.ts")]);

/** Comments out, code in — same rationale as `no-raw-date-formatting.test.ts`. */
const withoutComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const OFFENDING = "new Date().toISOString().slice(";

function violationsIn(source: string, relPath: string): string[] {
  const lines = source.split("\n");
  const hits: string[] = [];
  lines.forEach((line, i) => {
    if (line.includes(OFFENDING)) {
      hits.push(`${relPath}:${i + 1}: ${line.trim()}`);
    }
  });
  return hits;
}

describe("today comes from todayIn, not the bare clock", () => {
  const files = collectSourceFiles(SRC).filter((f) => !EXCLUDED.has(f));

  it("has no new Date().toISOString().slice(...) outside lib/time.ts", () => {
    const hits = files.flatMap((file) => {
      const raw = readFileSync(file, "utf8");
      const relPath = path.relative(REPO_ROOT, file);
      return violationsIn(withoutComments(raw), relPath);
    });

    /* An array rather than a joined string, so a failure prints one offending
       line per row — the working list this doubles as. */
    expect(hits).toEqual([]);
  });

  it("still reads the files it thinks it does", () => {
    /* A path or exclusion that stopped resolving would make the assertion
       above pass on an empty file list — a silent no-op wearing a green
       checkmark. This keeps that honest. */
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith(path.join("lib", "time.ts")))).toBe(
      false,
    );
  });
});

/**
 * `violationsIn` against synthetic snippets, not real files.
 *
 * The suite above only proves the *codebase* is clean today — a clean
 * codebase and a blind detector produce the same empty result. These assert
 * the detection logic itself, including the two shapes the header comment
 * says are deliberately out of scope.
 */
describe("the detector itself", () => {
  it("catches the clock read to a calendar day", () => {
    const hits = violationsIn(
      `const today = new Date().toISOString().slice(0, 10);`,
      "sample.ts",
    );
    expect(hits).toHaveLength(1);
  });

  it("catches the month variant too", () => {
    const hits = violationsIn(
      `const thisMonth = new Date().toISOString().slice(0, 7);`,
      "sample.ts",
    );
    expect(hits).toHaveLength(1);
  });

  it("does not flag a bare timestamp — the legitimate, unrelated shape", () => {
    const hits = violationsIn(
      `store.commit({ createdAt: new Date().toISOString() });`,
      "sample.ts",
    );
    expect(hits).toEqual([]);
  });

  it("does not flag an already-correct UTC-anchored Date's own round trip", () => {
    const hits = violationsIn(
      [
        "const edge = new Date(`${today}T00:00:00.000Z`);",
        "edge.setUTCDate(edge.getUTCDate() + 31);",
        "const limit = edge.toISOString().slice(0, 10);",
      ].join("\n"),
      "sample.ts",
    );
    expect(hits).toEqual([]);
  });

  it("does not flag a doc comment that only mentions the banned shape", () => {
    const stripped = withoutComments(
      "/** Not `new Date().toISOString().slice(0, 10)`: reads the org's zone. */\nconst x = 1;",
    );
    expect(violationsIn(stripped, "sample.ts")).toEqual([]);
  });

  it("admits the gap the header comment describes: an intermediate variable", () => {
    /* `now` is `new Date()`, but the offending chain never appears on one
       line, so this — the actual shape found in `lib/store/insights.ts`
       during this batch — slips through. A real type checker would close
       this; a substring search cannot. */
    const hits = violationsIn(
      [
        "const now = new Date();",
        "const today = now.toISOString().slice(0, 10);",
      ].join("\n"),
      "sample.ts",
    );
    expect(hits).toEqual([]);
  });
});
