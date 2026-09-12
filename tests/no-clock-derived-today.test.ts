import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The clock, read raw, outside `lib/time.ts`.
 *
 * ## What this is, honestly
 *
 * This is a textual speed bump, not a dataflow analysis. It stands in for
 * the tool that would actually settle this — a typed ESLint rule built on
 * the TypeScript compiler API, which can follow a value through an
 * assignment, a function boundary, a file — because that tool does not
 * exist here yet. A regex cannot win an argument about dataflow, and after
 * three rounds of widening this one to close a real escape and finding the
 * next one already open, the answer is not a fourth round: it is to stop,
 * say plainly what a green run does and does not prove, and leave the rest
 * to the tool built for it. **This file is frozen** — read what follows as
 * the boundary of what it promises, not a todo list.
 *
 * ## Why an invariant, not a list of shapes
 *
 * Five distinct spellings of "read the clock and derive a day, month or
 * wall-clock time without asking which zone" have been found across three
 * batches and three review rounds — `toLocaleDateString`-family formatting
 * (7b), a hand-rolled `getFullYear()`/`getMonth()`/`getDate()` getter (7c),
 * and, in this batch, `new Date().toISOString().slice(0, 10)`,
 * `Date.UTC(now.getUTCFullYear(), ...)`, and `new
 * Date().toTimeString().slice(0, 5)` — each found only after a check
 * written for the previous ones missed it. So this does not enumerate
 * reductions; it states the invariant every one of them breaks: **outside
 * `lib/time.ts`, "the clock, right now" — a zero-argument `new Date()`, a
 * bare `Date.now()`, a bare `Date()` call, or a `new Date(...)` built from
 * any of those — is safe in exactly one shape, and every other use needs a
 * marker naming a reason, on the exact line it appears on.**
 *
 * ## What counts as "the clock"
 *
 * - `new Date()` — no arguments.
 * - `Date.now()` — bare, anywhere it appears.
 * - `Date()` — called without `new`. Legacy JavaScript: this ignores
 *   whatever arguments it is given and always returns the current moment as
 *   a browser-local string, unlike `new Date()`, which stays zone-agnostic
 *   until something formats it. Zero instances exist in `src/` today, so
 *   there is nothing this addition could newly misclassify.
 * - `new Date(<expr>)` where `<expr>` itself contains any of the above,
 *   however deeply nested — because `new Date(new Date().toISOString())`
 *   reconstructs a fresh, clock-anchored `Date` free to be reduced with
 *   local getters anywhere afterward, and only the *outer* call's own tail
 *   (not the inner expression's) can say whether that happens here.
 *
 * ## The one safe shape, for each form
 *
 * A `Date`-shaped clock read is safe used **whole**, with nothing chained
 * onto `.toISOString()`'s result: that method always serialises in UTC, so
 * the string it returns names one specific instant unambiguously. The
 * moment anything is chained onto that string, a *day* has been asked for,
 * and a day needs a zone.
 *
 * A bare `Date.now()` has one safe shape for the same reason a number can
 * offer no UTC-anchored string: `.toString(...)`, a radix conversion, which
 * cannot produce a calendar concept no matter what. Bare `Date()` has none —
 * the string it returns is already zone-committed the instant it is called.
 *
 * ## Everything else needs a marker, on its own line
 *
 * An occurrence is exempt only if the *exact line it appears on* — nowhere
 * else — contains, inside an actual comment (not a string literal; see
 * below), the literal substring `reads-the-clock:` followed by a real
 * reason, not just a comment's own closing punctuation.
 *
 * "Its own line" is deliberately the whole rule, with two rounds of review
 * behind why a wider one keeps failing in both directions at once. A
 * lookback window (tried in round 2) fails *open* the moment a line is
 * inserted between the marker and the code it was meant to cover — a
 * second, unrelated clock read lands inside the same window and reads as
 * exempted — and fails *closed*, oppositely, the moment enough lines are
 * inserted *before* the marker to push the original, legitimate site back
 * outside it, so the guardrail reports the wrong line and stays silent on
 * the real one. Scoping to one line removes the window rather than resizing
 * it again: an insertion anywhere else cannot change what a given line's
 * own marker does or doesn't cover. When a clock read is one part of a
 * wrapped, multi-line expression, the marker goes on whichever physical
 * line the clock-reading token itself sits on — a trailing comment, not a
 * comment on the line before — which is why several sites in this codebase
 * were reformatted (a function signature split across lines, a `useMemo`'s
 * callback body) rather than left as a leading block comment: there was no
 * other way to put the marker on the token's own line without doing so.
 *
 * The marker is checked against the line's comment content specifically —
 * extracted the same way `withoutComments` recognises a comment in the
 * first place — not the raw line, so the phrase sitting inside an ordinary
 * string literal (`"reads-the-clock: not a real marker"`) cannot exempt
 * anything: a plain string matches neither the block- nor line-comment
 * shape, so nothing is extracted from it to test the marker against.
 *
 * Every marker in this codebase today was written while fixing this exact
 * finding; grep for `reads-the-clock:` to read all of them at once.
 *
 * ## What this cannot promise — the class, not today's list
 *
 * A textual, per-line check cannot follow a *value*, only recognise a
 * *shape* written directly at one spot. Concretely, and permanently:
 *
 * - **Any clock value that passes through an intermediate — a variable, a
 *   parameter, a return, a store, a second file — is invisible the moment
 *   it is reduced somewhere other than where it was captured.**
 *   `const stamp = new Date().toISOString();` two lines above
 *   `stamp.slice(0, 10)` is exactly this: the first line is the one
 *   textually safe shape this file knows, and the second line contains no
 *   clock-reading token at all, so there is nothing here to flag on either
 *   line — the same class of gap `insights.ts` demonstrated for real in this
 *   batch's first round, now demonstrated again by a mutation the reviewer
 *   invented in round 3. Wrapping the clock read across a `String(...)` or a
 *   template literal, or across a `new Date(\n  ...\n)` that prettier has
 *   reformatted onto several lines, are the same gap wearing different
 *   clothes: the read and the reduction are not on one line together, and
 *   this only ever looks at one line at a time.
 * - **A marker is trusted on its word.** Nothing here checks that the
 *   reason it gives is still true of the code beneath it, or was ever true.
 *   A wrong marker (one was found and corrected in round 2 of review) reads
 *   as authoritative and is *harder* to notice than no marker at all.
 * - **Every product site this file currently green-lights was, in fact,
 *   verified by hand** — the four live instances of the one safe `Date`
 *   shape were each individually read and confirmed correct in round 3 of
 *   review, and every marker in the codebase was read against the line it
 *   sits on and found true. This file did not do that verification; it
 *   only stopped being wrong about the shapes it happened to check.
 *
 * None of this is closable by widening the pattern further — that has
 * traded one blind spot for another twice already in this exact file, which
 * is the reason it is frozen rather than extended a fourth time. The actual
 * fix is a typed lint rule with real dataflow, which is follow-up work, not
 * this one. A green run here means: no *textually direct* clock read was
 * found unmarked. It does not mean no clock value is ever misused, and it
 * should not be read as though it does.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.resolve(REPO_ROOT, "src");

const EXCLUDED = new Set([path.resolve(SRC, "lib/time.ts")]);

/**
 * Comments out, code in — a block comment is replaced with the same number
 * of newlines it contained (not with nothing), so a match after it still
 * reports the line it is actually on.
 */
const withoutComments = (code: string): string =>
  code
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ""))
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

/**
 * The inverse of `withoutComments`, and only ever applied one line at a
 * time: whatever a block or line comment on `line` contains, concatenated —
 * nothing else. A marker is checked against this, not against `line`
 * itself, so a string literal that happens to contain the marker phrase
 * (`"reads-the-clock: not real"`) is not mistaken for one: it matches
 * neither comment shape, so nothing is extracted from it at all.
 */
function commentsOnlyOnLine(line: string): string {
  const blocks = [...line.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => m[0]);
  const lineComment = /(^|[^:])(\/\/.*)$/.exec(line);
  return [...blocks, lineComment ? lineComment[2] : ""].join(" ");
}

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

/** A bare `Date()` call — no `new`. Always unsafe; see the header. */
const BARE_DATE_CALL = /(?<!new )\bDate\(\)/;

/** Does `text` read the clock anywhere — bare, or nested in `new Date(...)`? */
function containsClockRead(text: string): boolean {
  if (/\bDate\.now\(\)/.test(text)) return true;
  if (BARE_DATE_CALL.test(text)) return true;
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
 * reason — not just a comment's own closing punctuation, which a bare
 * "one more character" test would accept as "a reason".
 */
const MARKER = /reads-the-clock:\s*[^\s*/]/;

/** Only the exact line an occurrence is on may exempt it — see the header. */
function isMarked(originalLine: string): boolean {
  return MARKER.test(commentsOnlyOnLine(originalLine));
}

/**
 * `strippedLines` and `originalLines` must be the same length, line for
 * line — `withoutComments` guarantees that. Violations are detected against
 * `strippedLines` (so a comment merely mentioning a banned shape is not
 * mistaken for a call) and exempted against `originalLines` (so a marker,
 * which lives inside a comment, is not stripped away before this ever sees
 * it) — but only the comment content of that same original line, via
 * `isMarked`, never a neighbouring one.
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

    const bareDate = /(?<!new )\bDate\(\)/g;
    while ((match = bareDate.exec(line))) {
      const idx = match.index;
      if (consumed.some(([s, e]) => idx >= s && idx < e)) continue;
      flagged = true; // no safe shape at all — see the header
    }

    if (flagged && !isMarked(originalLines[i] ?? "")) {
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
 * the detection logic itself, including the shapes each review round found
 * a previous version could not see.
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
    expect(
      run(`until: new Date(new Date(TODAY).getTime() + days * 86_400_000),`),
    ).toEqual([]);
  });

  it("catches a bare Date() call — round 3's addition, zero instances in this repo today", () => {
    expect(run(`const stamp = Date();`)).toHaveLength(1);
  });

  it("does not mistake new Date() for a bare Date() call", () => {
    expect(run(`const now = new Date();`)).toHaveLength(1); // one hit, not two
  });

  it("passes a marker on the same line", () => {
    expect(
      run(
        `const at = Date.now(); /* reads-the-clock: an id suffix, not a day. */`,
      ),
    ).toEqual([]);
  });

  it("does not honour a marker on the line before — round 3 scoped this to one line, not a window", () => {
    expect(
      run(
        [
          "// reads-the-clock: this no longer reaches the line below.",
          "const at = Date.now();",
        ].join("\n"),
      ),
    ).toHaveLength(1);
  });

  it("does not honour a marker phrase sitting inside a string literal — round 3's other fix", () => {
    expect(
      run(
        [
          'const msg = "reads-the-clock: not a real marker";',
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

  it("preserves line numbers across a multi-line comment", () => {
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

  it("admits the gap the header names: a stamp captured safely, reduced two lines later", () => {
    /* This is the exact mutation round 3 of review invented. Recorded here,
       not to close it — the header explains why that would mean another
       special case — but so a future reader sees this is a known,
       deliberate blind spot rather than an oversight. */
    const hits = run(
      [
        "const stamp = new Date().toISOString();",
        "const today = stamp.slice(0, 10);",
      ].join("\n"),
    );
    expect(hits).toEqual([]);
  });
});
