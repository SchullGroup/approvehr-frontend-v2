import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The clock, read raw, outside `lib/time.ts`.
 *
 * ## Why this is an invariant and not a list of shapes
 *
 * Task 7d found four distinct spellings of "read the clock and derive a day,
 * month or wall-clock time without asking which zone" across three batches —
 * `toLocaleDateString`-family formatting (7b), a hand-rolled
 * `getFullYear()`/`getMonth()`/`getDate()` getter (7c), and, in this batch,
 * `new Date().toISOString().slice(0, 10)` *and* `Date.UTC(now.getUTCFullYear(),
 * now.getUTCMonth(), now.getUTCDate())` *and* `new Date().toTimeString().slice(0,
 * 5)` — three more spellings of the same bug, each found only after a grep
 * written for the previous ones missed it. A fifth spelling nobody has thought
 * of yet is not a hypothetical; it is the pattern so far.
 *
 * So this does not enumerate reductions. It states the invariant every one of
 * them breaks: **outside `lib/time.ts`, a zero-argument `new Date()` — "the
 * clock, right now" — is safe in exactly one shape, and every other use of it
 * needs a zone or a written reason.**
 *
 * ## The one safe shape
 *
 * `new Date().toISOString()`, used **whole**, with nothing chained onto its
 * result. `toISOString()` always serialises in UTC, so the string it returns
 * names one specific instant unambiguously — a `createdAt`, an `approvedAt`,
 * an `at`. There is nothing left to get wrong about a zone, because nothing
 * has been asked to name a *day*, a *month* or a *wall-clock time* yet.
 *
 * The moment anything is chained onto that string — `.slice(0, 10)`,
 * `.split("T")`, or any other reduction — a *day* has been asked for, and a
 * day needs a zone. That is the entire 7d bug in one sentence, and it is why
 * `new Date().toISOString().slice(...)` fails this check even though
 * `new Date().toISOString()` alone passes: the difference is not the API
 * called, it is what happens to what it returns.
 *
 * ## Everything else needs the allowlist
 *
 * `new Date()` assigned to a variable, passed as a bare argument, chained
 * into `.getFullYear()`/`.toTimeString()`/anything else, or given as a
 * default parameter, is a clock read this test cannot prove is safe from the
 * text alone — so it is refused unless the exact file and snippet are named
 * below, with a reason. Every current entry is real code, checked by hand
 * while writing this test:
 *
 * - Four sites pass the clock straight into an already zone-aware function
 *   alongside a `timeZone` argument (`hourIn`, `daysBetweenIn`, `formatTime`),
 *   or capture it once as a raw instant that every consumer downstream reads
 *   together with a `timeZone` (`notifications.ts`, `audit.ts` — each
 *   consumed by `groupByDay`/`timeLabel`/`dayHeading`). None of these reduce
 *   the clock to a day themselves.
 * - Two sites (`assets.ts`, `reimbursements.ts`) are seed generators: they
 *   read the clock to make static demo data look plausible on whichever day
 *   the app happens to load, and no real user ever reads that exact day —
 *   see task-7d's report for the fuller argument.
 * - One site is a copyright year in the public marketing footer, which has no
 *   signed-in company to read a zone from and is not an operational value.
 *
 * ## What this still does not catch
 *
 * A literal substring search over one line at a time, not a type checker:
 *
 * 1. **A line-wrapped `.toISOString()`.** `new Date()\n  .toISOString()` is
 *    the safe shape, spread across lines; this only looks at what follows
 *    the match on the *same* line, so it would misread the wrap as unsafe
 *    (a false positive, not a missed bug — the safer direction to fail in,
 *    but still worth a reviewer's eye if it fires on a reformatted line).
 * 2. **An allowlisted snippet, reused for an unrelated reason.** The
 *    allowlist matches by file **and** substring, not by line number (line
 *    numbers drift, as this repo's own review rounds keep proving) — so a
 *    second, unjustified `isConnected ? new Date() : DEMO_NOW` added to a
 *    file that already has one exempted for a good reason would also pass.
 *    Each entry below is one line in real code today; this is a risk to
 *    revisit if that ever stops being true.
 *
 * Closing either needs the TypeScript compiler's own data-flow analysis, not
 * a string search — the same conclusion `no-raw-date-formatting.test.ts`'s
 * header reaches about its own three gaps, and for the same reason: widening
 * a regex has twice already traded one blind spot for another in this repo
 * rather than closing the underlying one.
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

/**
 * Every current, hand-checked exception to the invariant.
 *
 * `snippet` only has to be a distinguishing substring of the offending
 * line — see "What this still does not catch" above for what that trades
 * away. Written as a plain array rather than a per-line map because the
 * point is that each entry costs something to add: a file, an exact piece
 * of code, and a sentence defending it.
 */
const ALLOWLIST: ReadonlyArray<{
  file: string;
  snippet: string;
  reason: string;
}> = [
  {
    file: "src/app/(app)/dashboard/header.tsx",
    snippet: "hourIn(new Date(), timeZone)",
    reason:
      "The clock, passed straight into the zone-aware hourIn alongside timeZone — never reduced to a day or an hour locally.",
  },
  {
    file: "src/lib/api/approvals.ts",
    snippet: "daysBetweenIn(new Date(), due, timeZone)",
    reason:
      "The clock, passed straight into the zone-aware daysBetweenIn alongside timeZone — never reduced locally.",
  },
  {
    file: "src/lib/store/attendance.ts",
    snippet: "formatTime(new Date(), timeZone)",
    reason:
      "nowTime()'s own body: the clock, passed straight into the zone-aware formatTime alongside timeZone.",
  },
  {
    file: "src/lib/store/notifications.ts",
    snippet: "isConnected ? new Date() : DEMO_NOW",
    reason:
      "Captured once as a raw instant and returned as `now`; every consumer (groupByDay, timeLabel, dayHeading in notifications/inbox.tsx) reads it together with timeZone rather than this file reducing it.",
  },
  {
    file: "src/lib/store/audit.ts",
    snippet: "isConnected ? new Date() : DEMO_NOW",
    reason:
      "Same shape as notifications.ts, in two hooks in this file (useAuditTrail, useRecordTimeline): a raw instant, consumed downstream (dayHeading) alongside timeZone.",
  },
  {
    file: "src/lib/store/assets.ts",
    snippet: "const date = new Date();",
    reason:
      "daysAgo()'s seed generator: reads the clock to make the static demo catalogue's dates look plausible whenever the app happens to load. No real user reads this exact day — see task-7d's report.",
  },
  {
    file: "src/lib/store/reimbursements.ts",
    snippet: "const date = new Date();",
    reason:
      "The same seed-only daysAgo() as assets.ts, for the seeded expense-claims catalogue.",
  },
  {
    file: "src/components/marketing/chrome.tsx",
    snippet: "new Date().getFullYear()",
    reason:
      "A copyright year in the public marketing footer. No signed-in company to read a zone from on a public page, and a cosmetic year label is not an operational value.",
  },
];

const NEW_DATE = /\bnew Date\(\)/g;
/** The one safe shape: `.toISOString()`, and nothing chained after it. */
const SAFE_TAIL = /^\.toISOString\(\)(?!\s*\.)/;

function isAllowlisted(relPath: string, line: string): boolean {
  return ALLOWLIST.some(
    (entry) => relPath === entry.file && line.includes(entry.snippet),
  );
}

function violationsIn(source: string, relPath: string): string[] {
  const lines = source.split("\n");
  const hits: string[] = [];

  lines.forEach((line, i) => {
    const matches = [...line.matchAll(NEW_DATE)];
    if (matches.length === 0) return;

    const unsafe = matches.some((match) => {
      const tail = line.slice((match.index ?? 0) + match[0].length);
      return !SAFE_TAIL.test(tail);
    });
    if (!unsafe) return;
    if (isAllowlisted(relPath, line)) return;

    hits.push(`${relPath}:${i + 1}: ${line.trim()}`);
  });

  return hits;
}

describe("the clock is read raw only where lib/time.ts is allowed to", () => {
  const files = collectSourceFiles(SRC).filter((f) => !EXCLUDED.has(f));

  it("has no unjustified zero-arg new Date() outside lib/time.ts", () => {
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
 * the detection logic itself, including the two shapes 7d's earlier,
 * narrower guardrail could not see at all.
 */
describe("the detector itself", () => {
  it("passes a bare timestamp, used whole", () => {
    const hits = violationsIn(
      `store.commit({ createdAt: new Date().toISOString() });`,
      "sample.ts",
    );
    expect(hits).toEqual([]);
  });

  it("catches the same clock read reduced to a day", () => {
    const hits = violationsIn(
      `const today = new Date().toISOString().slice(0, 10);`,
      "sample.ts",
    );
    expect(hits).toHaveLength(1);
  });

  it("catches the Date.UTC(...getUTC...) reduction — a spelling the old, narrower guardrail never looked for", () => {
    const hits = violationsIn(
      [
        "const now = new Date();",
        "return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());",
      ].join("\n"),
      "sample.ts",
    );
    expect(hits).toHaveLength(1);
  });

  it("catches a wall-clock reduction via toTimeString", () => {
    const hits = violationsIn(
      `time: new Date().toTimeString().slice(0, 5),`,
      "sample.ts",
    );
    expect(hits).toHaveLength(1);
  });

  it("catches a bare new Date() assigned to a variable and never reduced on the same line — closing the intermediate-variable gap the old guardrail admitted", () => {
    /* This is the exact shape lib/store/insights.ts had: `new Date()` here
       is followed by `;`, not `.toISOString()`, so it fails the safe-tail
       check regardless of what a later, separate line does with `now`. */
    const hits = violationsIn(`const now = new Date();`, "sample.ts");
    expect(hits).toHaveLength(1);
  });

  it("does not flag new Date(someValue) — parsing a given date is not reading the clock", () => {
    const hits = violationsIn(
      `const due = new Date(dueDate + "T00:00:00Z");`,
      "sample.ts",
    );
    expect(hits).toEqual([]);
  });

  it("passes an allowlisted file+snippet", () => {
    const hits = violationsIn(
      `const hello = greeting(hourIn(new Date(), timeZone));`,
      "src/app/(app)/dashboard/header.tsx",
    );
    expect(hits).toEqual([]);
  });

  it("still flags the same snippet in a file that is not on the allowlist", () => {
    const hits = violationsIn(
      `const hello = greeting(hourIn(new Date(), timeZone));`,
      "src/app/(app)/some/other-screen.tsx",
    );
    expect(hits).toHaveLength(1);
  });

  it("does not mistake a doc comment mentioning the banned shape for a call", () => {
    const stripped = withoutComments(
      "/** Not `new Date().toISOString().slice(0, 10)`: reads todayIn instead. */\nconst x = 1;",
    );
    expect(violationsIn(stripped, "sample.ts")).toEqual([]);
  });
});
