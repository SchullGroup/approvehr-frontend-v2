import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The clock, read raw, outside `lib/time.ts`.
 *
 * ## Why this is an invariant and not a list of shapes
 *
 * Task 7d found five distinct spellings of "read the clock and derive a day,
 * month or wall-clock time without asking which zone" across three batches
 * and two review rounds — `toLocaleDateString`-family formatting (7b), a
 * hand-rolled `getFullYear()`/`getMonth()`/`getDate()` getter (7c), and, in
 * this batch, `new Date().toISOString().slice(0, 10)`,
 * `Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())`, and
 * `new Date().toTimeString().slice(0, 5)` — each found only after a check
 * written for the previous ones missed it. A sixth is not a hypothetical; it
 * is the pattern so far.
 *
 * So this does not enumerate reductions. It states the invariant every one of
 * them breaks: **outside `lib/time.ts`, "the clock, right now" — a zero-
 * argument `new Date()`, a bare `Date.now()`, or a `new Date(...)` built from
 * either — is safe in exactly one shape, and every other use of it needs a
 * zone or a written reason at the site.**
 *
 * ## What counts as "the clock"
 *
 * Three forms, all treated the same way:
 *
 * - `new Date()` — no arguments.
 * - `Date.now()` — bare, anywhere it appears.
 * - `new Date(<expr>)` where `<expr>` itself contains either of the above,
 *   however deeply nested. Round 2 of review found this is not optional:
 *   `new Date(new Date().toISOString())` reconstructs a fresh, clock-anchored
 *   `Date` object that is then free to be reduced with local getters
 *   anywhere — including a different file — and a check that only looked at
 *   the *innermost* `new Date()` would call that safe, because the text
 *   immediately after it (`.toISOString())`) looks exactly like the one safe
 *   shape below. The fix is structural: a `new Date(...)` whose argument
 *   contains a clock read is itself a clock read, full stop, and its own
 *   safety is judged by what follows *its* closing parenthesis — not the
 *   inner expression's.
 *
 *   The same round found `Date.now()` was entirely outside the previous
 *   version of this invariant — its regex only matched `new Date()` — so
 *   `new Date(Date.now())` and `new Date(Date.now()).toISOString().slice(0,
 *   10)` (character-for-character the batch's original bug) both passed.
 *   `Date.now()` is "the clock, right now" exactly as much as `new Date()`
 *   is, and is checked identically now.
 *
 * ## The one safe shape, for each form
 *
 * A `Date`-shaped clock read (`new Date()`, or a `new Date(...)` built from
 * one) is safe used **whole**, with nothing chained onto
 * `.toISOString()`'s result: `toISOString()` always serialises in UTC, so the
 * string it returns names one specific instant unambiguously. The moment
 * anything is chained onto that string, a *day* has been asked for, and a
 * day needs a zone.
 *
 * A bare `Date.now()` has no equivalent — a number carries no proof of zone-
 * safety the way a UTC-anchored string does — except one shape that cannot
 * derive a calendar concept from a number no matter what: `.toString(...)`,
 * a radix conversion. Anything else — assigned, compared, subtracted,
 * divided, or interpolated bare — needs a marker.
 *
 * ## Everything else needs a marker, at the site
 *
 * The previous version of this test kept exceptions in a `file, snippet,
 * reason` array here, and round 2 of review found the two most generic
 * entries (`assets.ts` and `reimbursements.ts`, both exempting the single
 * line `const date = new Date();`) would have silently exempted a *second*,
 * unrelated, unjustified clock read added anywhere else in either of those
 * 500–800-line files — both of which also hold real user-facing mutations.
 * The fix is to stop keeping the exemption at a distance. An occurrence is
 * exempt only if the line it is on, or one of the five lines immediately
 * before it, contains the literal substring `reads-the-clock:` followed by
 * a real reason, not just a comment's own closing punctuation — written at
 * the call site itself, the way `no-raw-date-formatting.test.ts` already asks a
 * reviewer to rename a colliding variable rather than widen a regex.
 * Every marker in this codebase today was written while fixing this exact
 * finding; grep for `reads-the-clock:` to read all of them at once.
 *
 * ## What this still does not catch
 *
 * A line-by-line substring search, not a type checker or a data-flow
 * analysis:
 *
 * 1. **A line-wrapped safe shape.** `new Date()\n  .toISOString()` is the
 *    safe shape, spread across lines; this only looks at what follows a
 *    match on the *same* line, so a reformatted safe call could misread as
 *    unsafe (a false positive, the safer direction to fail in, but still
 *    worth a reviewer's eye).
 * 2. **A value laundered through an intermediate variable, function, or
 *    file.** `const now = new Date(); /* ...no marker... *\/ elsewhere(now)`
 *    is still refused here, because `now` itself is never immediately
 *    reduced — but if `elsewhere` is a *different function* that itself
 *    reads a parameter and reduces it locally, nothing connects that
 *    reduction back to this call. This is the same gap the very first
 *    version of this test admitted for `insights.ts`; nesting `new
 *    Date(...)` detection narrows it without closing it.
 * 3. **A marker that has stopped being true.** Nothing checks that the
 *    reason still describes the code beneath it after an edit — only that
 *    the words are present.
 * 4. **Unbalanced parentheses inside a string or template literal passed to
 *    `new Date(...)`.** The argument-matching below counts `(`/`)` textually
 *    to find where a call's arguments end; a literal `)` inside a string
 *    argument would close the count early. No such argument exists in this
 *    codebase today.
 *
 * Closing any of these needs the TypeScript compiler's own data-flow
 * analysis, not a string search — the same conclusion
 * `no-raw-date-formatting.test.ts`'s header reaches about its own three
 * gaps, and for the same reason: widening a regex has repeatedly traded one
 * blind spot for another in this repo rather than closing the underlying
 * one.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.resolve(REPO_ROOT, "src");

const EXCLUDED = new Set([path.resolve(SRC, "lib/time.ts")]);

/**
 * Comments out, code in — but a block comment is replaced with the same
 * number of newlines it contained, not with nothing, so a match after it
 * still reports the line it is actually on. The previous version collapsed
 * every block comment to `""`, so a violation appended after a multi-line
 * doc comment reported a line number from a shorter, post-strip file — a
 * `:66` that was nowhere near line 66 of the real thing, exactly the kind of
 * "the file said so" mistake this suite otherwise exists to catch. Also the
 * mechanism `reads-the-clock:` markers depend on staying accurate: the
 * marker check re-reads the *original*, uncommented lines by the same index
 * this produces.
 */
const withoutComments = (code: string): string =>
  code
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ""))
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

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

/** Index just past the `)` matching the `(` at `openIndex`, or `null`. */
function matchParen(source: string, openIndex: number): number | null {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === "(") depth++;
    else if (source[i] === ")") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return null;
}

type NewDateSpan = { start: number; end: number; args: string };

/**
 * Every top-level `new Date(...)` call in `text`, left to right.
 *
 * "Top-level" because the scan jumps past a call's entire argument list
 * once it has matched one, so a `new Date(` nested inside another call's
 * arguments is never reported as its own, separate span — it is already
 * part of the outer one, which is the call that actually decides what
 * object gets built and handed onward.
 */
function findNewDateSpans(text: string): NewDateSpan[] {
  const spans: NewDateSpan[] = [];
  const pattern = /\bnew Date\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const openIndex = match.index + match[0].length - 1;
    const end = matchParen(text, openIndex);
    if (end === null) continue; // unbalanced on this line; not analysable
    spans.push({
      start: match.index,
      end,
      args: text.slice(openIndex + 1, end - 1),
    });
    pattern.lastIndex = end;
  }
  return spans;
}

/** Does `text` read the clock anywhere — bare, or nested in `new Date(...)`? */
function containsClockRead(text: string): boolean {
  if (/\bDate\.now\(\)/.test(text)) return true;
  return findNewDateSpans(text).some(
    (span) => span.args === "" || containsClockRead(span.args),
  );
}

/** The one safe shape for a `Date`: `.toISOString()`, nothing chained after. */
const SAFE_TAIL_DATE = /^\.toISOString\(\)(?!\s*\.)/;
/** The one safe shape for a bare `Date.now()`: a radix conversion, terminal. */
const SAFE_TAIL_NUMBER = /^\.toString\([^()]*\)(?!\s*\.)/;

/**
 * The marker itself: the phrase, plus at least one real character of a
 * reason — not just a comment's own closing punctuation, which `\S` alone
 * would accept as "a reason".
 */
const MARKER = /reads-the-clock:\s*[^\s*/]/;
/** How many lines *before* a hit a marker may sit on — see the header. */
const MARKER_LOOKBACK = 5;

function isMarked(originalLines: string[], lineIndex: number): boolean {
  const from = Math.max(0, lineIndex - MARKER_LOOKBACK);
  for (let i = from; i <= lineIndex; i++) {
    if (MARKER.test(originalLines[i] ?? "")) return true;
  }
  return false;
}

/**
 * `strippedLines` and `originalLines` must be the same length, line for
 * line — `withoutComments` guarantees that. Violations are detected against
 * `strippedLines` (so a comment merely mentioning a banned shape is not
 * mistaken for a call) and reported, and exempted, against `originalLines`
 * (so a marker, which lives inside a comment, is not stripped away before
 * this ever sees it).
 */
function violationsIn(
  strippedLines: string[],
  originalLines: string[],
  relPath: string,
): string[] {
  const hits: string[] = [];

  strippedLines.forEach((line, i) => {
    const consumed: Array<[number, number]> = [];
    let flagged = false;

    for (const span of findNewDateSpans(line)) {
      const isClockRead = span.args === "" || containsClockRead(span.args);
      if (!isClockRead) continue;
      consumed.push([span.start, span.end]);
      if (SAFE_TAIL_DATE.test(line.slice(span.end))) continue;
      flagged = true;
    }

    const dateNow = /\bDate\.now\(\)/g;
    let match: RegExpExecArray | null;
    while ((match = dateNow.exec(line))) {
      const idx = match.index;
      if (consumed.some(([s, e]) => idx >= s && idx < e)) continue;
      const tail = line.slice(idx + match[0].length);
      if (SAFE_TAIL_NUMBER.test(tail)) continue;
      flagged = true;
    }

    if (flagged && !isMarked(originalLines, i)) {
      hits.push(`${relPath}:${i + 1}: ${line.trim()}`);
    }
  });

  return hits;
}

describe("the clock is read raw only where lib/time.ts is allowed to", () => {
  const files = collectSourceFiles(SRC).filter((f) => !EXCLUDED.has(f));

  it("has no unjustified clock read outside lib/time.ts", () => {
    const hits = files.flatMap((file) => {
      const raw = readFileSync(file, "utf8");
      const relPath = path.relative(REPO_ROOT, file);
      const originalLines = raw.split("\n");
      const strippedLines = withoutComments(raw).split("\n");
      return violationsIn(strippedLines, originalLines, relPath);
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
 * the detection logic itself, including the shapes round 2 of review found
 * the previous version could not see at all.
 */
describe("the detector itself", () => {
  const run = (source: string, relPath = "sample.ts"): string[] => {
    const originalLines = source.split("\n");
    const strippedLines = withoutComments(source).split("\n");
    return violationsIn(strippedLines, originalLines, relPath);
  };

  it("passes a bare Date timestamp, used whole", () => {
    expect(
      run(`store.commit({ createdAt: new Date().toISOString() });`),
    ).toEqual([]);
  });

  it("catches the same clock read reduced to a day", () => {
    expect(
      run(`const today = new Date().toISOString().slice(0, 10);`),
    ).toHaveLength(1);
  });

  it("catches Date.UTC(...getUTC...) and toTimeString(...) — the two spellings round 1 of review found", () => {
    expect(
      run(
        [
          "const now = new Date();",
          "return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());",
        ].join("\n"),
      ),
    ).toHaveLength(1);
    expect(run(`time: new Date().toTimeString().slice(0, 5),`)).toHaveLength(1);
  });

  it("catches a bare new Date() assigned and never reduced on the same line", () => {
    expect(run(`const now = new Date();`)).toHaveLength(1);
  });

  it("does not flag new Date(someValue) — parsing a given date is not reading the clock", () => {
    expect(run(`const due = new Date(dueDate + "T00:00:00Z");`)).toEqual([]);
  });

  it("catches a bare Date.now(), with no proof it stays a duration", () => {
    expect(run(`const at = Date.now();`)).toHaveLength(1);
  });

  it("catches new Date(Date.now()) — round 2's escape: identical to new Date()", () => {
    expect(run(`const now = new Date(Date.now());`)).toHaveLength(1);
    /* Character-for-character the batch's original bug, laundered through
       Date.now() instead of a bare new Date(). */
    expect(
      run(`const today = new Date(Date.now()).toISOString().slice(0, 10);`),
    ).toHaveLength(1);
  });

  it("passes new Date(Date.now()).toISOString() — still the one safe shape, just spelled through Date.now()", () => {
    expect(run(`at: new Date(Date.now()).toISOString(),`)).toEqual([]);
  });

  it("passes Date.now() reduced only by a radix conversion", () => {
    expect(run(`id: \`role-\${Date.now().toString(36)}\`,`)).toEqual([]);
  });

  it("catches new Date(new Date().toISOString()) — round 2's other escape: a relaunder that hands back a fresh, clock-anchored Date", () => {
    /* The old detector saw only the inner new Date(), whose own tail
       (`.toISOString())`) looked exactly like the safe shape. The outer
       call is what actually matters: nothing follows *its* closing paren
       here, so it is refused, not laundered through. */
    expect(
      run(`const relaunched = new Date(new Date().toISOString());`),
    ).toHaveLength(1);
  });

  it("passes new Date(new Date().toISOString()).toISOString() — a redundant round trip, but still terminal", () => {
    expect(
      run(`at: new Date(new Date().toISOString()).toISOString(),`),
    ).toEqual([]);
  });

  it("passes Date.now() arithmetic wrapped in new Date(...) and used whole — the seed-only isoDaysAgo shape", () => {
    expect(
      run(`new Date(Date.now() - days * 86_400_000).toISOString();`),
    ).toEqual([]);
  });

  it("does not flag new Date(...) built entirely from a stored constant, even nested", () => {
    /* Neither level here is Date.now() or a bare new Date() — TODAY is a
       frozen string, so nothing reads the clock at all. */
    expect(
      run(`until: new Date(new Date(TODAY).getTime() + days * 86_400_000),`),
    ).toEqual([]);
  });

  it("passes a marker on the same line", () => {
    expect(
      run(
        `const at = Date.now(); /* reads-the-clock: an id suffix, not a day. */`,
      ),
    ).toEqual([]);
  });

  it("passes a marker up to five lines above — real markers in this repo sit as far as a preceding doc comment's own wording puts them", () => {
    expect(
      run(
        [
          "/* reads-the-clock: an elapsed-time anchor, compared only to",
          "   another instant below, never read as a calendar day. */",
          "",
          "",
          "",
          "const at = Date.now();",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("does not honour a marker six lines above — the window has an edge", () => {
    expect(
      run(
        [
          "/* reads-the-clock: too far away to count. */",
          "",
          "",
          "",
          "",
          "",
          "const at = Date.now();",
        ].join("\n"),
      ),
    ).toHaveLength(1);
  });

  it("does not honour the marker phrase with no reason after it", () => {
    expect(run(`const at = Date.now(); /* reads-the-clock: */`)).toHaveLength(
      1,
    );
  });

  it("still flags the same shape in a file with no marker nearby", () => {
    expect(
      run(`const hello = greeting(hourIn(new Date(), timeZone));`),
    ).toHaveLength(1);
  });

  it("does not mistake a doc comment mentioning the banned shape for a call", () => {
    const stripped = withoutComments(
      "/** Not `new Date().toISOString().slice(0, 10)`: reads todayIn instead. */\nconst x = 1;",
    );
    expect(
      violationsIn(stripped.split("\n"), stripped.split("\n"), "sample.ts"),
    ).toEqual([]);
  });

  it("preserves line numbers across a multi-line comment — the bug round 2 found in withoutComments itself", () => {
    const source = [
      "/**",
      " * A doc comment spanning",
      " * several lines, on purpose.",
      " */",
      "const today = new Date().toISOString().slice(0, 10);",
    ].join("\n");
    const originalLines = source.split("\n");
    const strippedLines = withoutComments(source).split("\n");
    expect(strippedLines).toHaveLength(originalLines.length);
    const hits = violationsIn(strippedLines, originalLines, "sample.ts");
    expect(hits).toEqual([
      "sample.ts:5: const today = new Date().toISOString().slice(0, 10);",
    ]);
  });
});
