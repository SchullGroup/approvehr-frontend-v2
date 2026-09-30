import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * One more call site.
 *
 * Converting the others was a day's work; letting one back in is a moment's,
 * and the symptom — one screen in company time and another in whoever is
 * looking's browser time — is worse than the original bug because it looks
 * deliberate. `src/lib/time.ts` is the one place allowed to reach for
 * `Intl.DateTimeFormat`.
 *
 * ## Why this bans date APIs and not "any locale formatting"
 *
 * The plan this replaces banned bare `toLocaleString`, which this codebase
 * calls roughly 70 times — kobo amounts, headcounts, row counts, character
 * limits — none of them a date, none of them taking a `timeZone`, all of them
 * `Number.prototype.toLocaleString`. A test written that way could never
 * pass, and would not say anything true about the bug this branch fixes: a
 * naira figure does not disagree between two colleagues in different
 * countries, a scheduled interview does. So this bans exactly the APIs that
 * format a *date*: `toLocaleDateString`, `toLocaleTimeString`,
 * `Intl.DateTimeFormat`, and `toLocaleString` — but only where the receiver
 * is traceably a `Date`. `toLocaleDateString`, `toLocaleTimeString` and
 * `Intl.DateTimeFormat` need no tracing at all: `Number` has no such methods,
 * so any call to them is already unambiguous.
 *
 * ## How "traceably a Date" is decided for `toLocaleString`, and where that stops working
 *
 * A name is treated as a Date if the source shows any of:
 * - `const x = new Date(...)` / `let x = new Date(...)`, anywhere in the file;
 * - `x: Date` as a type annotation — a typed parameter (`(x: Date) => …`), a
 *   typed prop (`{ x }: { x: Date }`), or an annotated local (`let x: Date`) —
 *   except when `Date` is followed, later on the *same physical line*, by
 *   `.`, since `word: Date.now()` / `Date.UTC(...)` / `Date.parse(...)` is a
 *   static member access on a value (typically a `number`), not a type
 *   annotation, and `\bDate\b` alone cannot otherwise tell the two apart;
 * - `new Date(...)` chained straight into `.toLocaleString(` on the same line;
 * - `(... as Date)` chained straight into `.toLocaleString(` on the same line.
 *
 * This is regex over text, standing in for a type checker, and it is known
 * to be evadable *and* provokable — three separate ways, all found by
 * mutation testing rather than by inspection, which is the honest way to
 * read this list: as a record of what has actually gone wrong here twice
 * already, not a closed set.
 *
 * 1. **Under-matching.** A value that is a `Date` only by *inference* —
 *    assigned from an untyped destructure, returned from a hook or helper
 *    with no `Date` spelled out at the call site, or reached a few
 *    properties deep off something typed elsewhere (`props.session.expiresAt`
 *    where only `session`'s own type says `expiresAt: Date`, not this file) —
 *    is never tracked, and slips through.
 * 2. **Over-matching, name collisions.** `dateVars` is file-wide, not
 *    scope-aware: a name used for a genuine `Date` in one function and for
 *    something else (typically a `number`) in another, unrelated function in
 *    the *same file*, gets the second one flagged too.
 * 3. **Over-matching, the same-line lookahead.** The `Date.` exception above
 *    only inspects the rest of the line `Date` itself appears on — a
 *    line-wrapped member access, `Date\n  .now()`, still reads as a bare
 *    annotation and adds the name to `dateVars` regardless. This needs both
 *    a name collision *and* a line-wrapped `Date.now()`/`.UTC()`/`.parse()`
 *    to actually misfire, which is why it can sit unnoticed rather than
 *    failing outright — the same shape gap 2 already describes, just with a
 *    line break inserted before the deciding character.
 *
 * Closing any of these fully needs the TypeScript compiler's own type
 * checker, not a regex. Widening the regex further has, twice now, traded
 * one false-positive shape for another (limit 2's fix is what created limit
 * 3) rather than closing the underlying problem — so this is a deliberate
 * stopping point, not an oversight left for the next reviewer to tidy up. A
 * reviewer who hits one of these three should rename the colliding variable
 * or reformat the offending line, not reach for a fourth regex widening.
 *
 * Comments are stripped before matching (same as
 * `org-chart-has-no-pay.test.ts`'s `withoutComments`), so a doc comment that
 * merely *mentions* `toLocaleDateString` — explaining why a component hand-
 * rolls its date formatting instead, for example — is not mistaken for a
 * call.
 *
 * `src/lib/time.ts` is excluded because it is the one module allowed to
 * format a date. `src/lib/marketing/careers.ts` is excluded because it is a
 * public careers page with no signed-in company to read a zone from, and the
 * one date it formats is a date-only value deliberately anchored to UTC —
 * not an instance of this bug.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.resolve(REPO_ROOT, "src");

const EXCLUDED = new Set([
  path.resolve(SRC, "lib/time.ts"),
  path.resolve(SRC, "lib/marketing/careers.ts"),
]);

/** Comments out, code in — see org-chart-has-no-pay.test.ts for why. */
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
 * Every name in `source` traceable to a `Date` — see the header comment for
 * exactly which shapes count and which do not. A named function (not a
 * closure inside `violationsIn`) so a test below can assert directly on it,
 * rather than only on whether some file somewhere happens to exhibit a given
 * shape today.
 */
function dateVarsIn(source: string): Set<string> {
  const dateVars = new Set<string>();
  for (const line of source.split("\n")) {
    const assigned = line.match(/\b(?:const|let)\s+(\w+)\s*=\s*new Date\(/);
    if (assigned) dateVars.add(assigned[1]);

    /* Typed as `Date`, wherever that appears: a parameter (`(x: Date) => …`),
       a destructured prop's type (`{ x }: { x: Date }`), or an annotated
       local (`let x: Date`). A line can carry more than one.

       The trailing `(?!\s*\.)` matters: `Date` immediately followed by `.`
       is a static member access — `Date.now()`, `Date.UTC(...)`,
       `Date.parse(...)` — not a type annotation, and without it `\bDate\b`
       cannot tell the two apart (`.` is a non-word character, so it
       satisfies the boundary exactly like the end of a bare `x: Date`
       does). `at: Date.now()` is a real object-literal value in
       `day-timer.tsx` — without this guard it wrongly marked `at` as a
       Date, so an unrelated `at: number` elsewhere calling
       `at.toLocaleString(` was misread as a date violation. */
    for (const match of line.matchAll(/\b(\w+)\s*:\s*Date\b(?!\s*\.)/g)) {
      dateVars.add(match[1]);
    }
  }
  return dateVars;
}

function violationsIn(source: string, relPath: string): string[] {
  const lines = source.split("\n");
  const dateVars = dateVarsIn(source);

  const hits: string[] = [];
  lines.forEach((line, i) => {
    const lineNo = i + 1;
    const flag = () => hits.push(`${relPath}:${lineNo}: ${line.trim()}`);

    if (line.includes(".toLocaleDateString(")) flag();
    if (line.includes(".toLocaleTimeString(")) flag();
    if (line.includes("Intl.DateTimeFormat(")) flag();

    if (line.includes(".toLocaleString(")) {
      const chainedOffDate = /new Date\([^()]*\)\s*\.\s*toLocaleString\(/.test(
        line,
      );
      const chainedOffCast = /as\s+Date\s*\)?\s*\.\s*toLocaleString\(/.test(
        line,
      );
      const offDateVariable = [...dateVars].some((name) =>
        new RegExp(`\\b${name}\\b\\s*\\.\\s*toLocaleString\\(`).test(line),
      );
      if (chainedOffDate || chainedOffCast || offDateVariable) flag();
    }
  });

  return hits;
}

describe("date formatting goes through lib/time", () => {
  const files = collectSourceFiles(SRC).filter((f) => !EXCLUDED.has(f));

  it("has no raw date-locale formatting outside the helper", () => {
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
       above pass on an empty file list, which is a silent no-op wearing a
       green checkmark. This keeps that honest. */
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith(path.join("lib", "time.ts")))).toBe(
      false,
    );

    const timeDotTs = readFileSync(path.resolve(SRC, "lib/time.ts"), "utf8");
    expect(timeDotTs).toMatch(/Intl\.DateTimeFormat/);
  });
});

/**
 * `violationsIn` against synthetic snippets rather than real files.
 *
 * The suite above only proves the *codebase* is clean today — it cannot
 * prove the *detector* would catch a regression, since a clean codebase and
 * a blind detector produce the same empty result. These assert the
 * detection logic itself, against small fixtures built to exercise exactly
 * the shapes the header comment claims to catch (and the one it admits it
 * does not).
 */
describe("the detector itself", () => {
  it("catches a Date chained straight into toLocaleDateString", () => {
    const hits = violationsIn(
      `new Date(iv.scheduledFor).toLocaleDateString("en-NG", { day: "numeric" });`,
      "sample.ts",
    );
    expect(hits).toHaveLength(1);
  });

  it("catches a Date-typed parameter — the gap this round closed", () => {
    const hits = violationsIn(
      `function label(when: Date): string {\n  return when.toLocaleString("en-GB");\n}`,
      "sample.ts",
    );
    expect(hits).toHaveLength(1);
  });

  it("catches a Date-typed destructured prop — also part of that gap", () => {
    const hits = violationsIn(
      `function Row({ when }: { when: Date }) {\n  return when.toLocaleString("en-GB");\n}`,
      "sample.ts",
    );
    expect(hits).toHaveLength(1);
  });

  it("catches a Date reached through an intermediate variable", () => {
    const hits = violationsIn(
      `const expires = new Date(hint.expiresAt);\nconst clock = expires.toLocaleString([], { hour: "2-digit" });`,
      "sample.ts",
    );
    expect(hits).toHaveLength(1);
  });

  it("catches a `toLocaleString` call reached via an `as Date` cast", () => {
    const hits = violationsIn(
      `const clock = (value as Date).toLocaleString("en-GB");`,
      "sample.ts",
    );
    expect(hits).toHaveLength(1);
  });

  it("does not flag Number.prototype.toLocaleString", () => {
    const hits = violationsIn(
      `const label = rows.toLocaleString("en-NG");`,
      "sample.ts",
    );
    expect(hits).toEqual([]);
  });

  it("does not flag a doc comment that only mentions the banned name", () => {
    /* This module strips comments before calling `violationsIn` — see
       `withoutComments` above — so this asserts the input this function
       receives is already comment-free, not that it strips them itself. */
    const stripped = withoutComments(
      "/** Not `toLocaleDateString`: renders on the server too. */\nconst x = 1;",
    );
    expect(violationsIn(stripped, "sample.ts")).toEqual([]);
  });

  it("admits the gap the header comment describes: an untyped inferred Date", () => {
    /* No `new Date(`, no `: Date` annotation anywhere in this snippet — `d`
       is a Date only because whatever called `label` happens to pass one.
       This is the residual gap a real type checker would close and a regex
       cannot; the assertion records that honestly rather than silently. */
    const hits = violationsIn(
      `function label(d) {\n  return d.toLocaleString("en-GB");\n}`,
      "sample.ts",
    );
    expect(hits).toEqual([]);
  });

  it("does not mistake `word: Date.something(...)` for a type annotation", () => {
    /* `Date` followed by `.` is a static member access (`Date.now()`,
       `Date.UTC(...)`, `Date.parse(...)`), never a type annotation — but
       `\bDate\b` alone cannot tell the two apart, since `.` is a
       non-word character and satisfies the trailing word boundary exactly
       like the end of a bare `x: Date`. `at: Date.now()` (a real object
       literal in src/app/(app)/people/attendance/day-timer.tsx) put `at`
       into `dateVars` even though `Date.now()` returns a `number`, so an
       unrelated `at.toLocaleString("en-NG")` formatting a plain number
       elsewhere in the same file was misread as a date violation. */
    const hits = violationsIn(
      [
        "const anchor = { at: Date.now() };",
        'function formatRowCount(at: number) { return at.toLocaleString("en-NG"); }',
      ].join("\n"),
      "sample.ts",
    );
    expect(hits).toEqual([]);
  });
});
