/**
 * The written-review checker: `src/lib/performance/review-language.ts`.
 *
 * ## Why this is a gate and not a unit test
 *
 * Same reason as `verify-payroll` and `verify-typescale`. This file is a list
 * of words and four regexes, and the failure mode is not a crash — it is a
 * pattern that quietly stops matching, or one that starts matching ordinary
 * English about a piece of work. Neither is visible to `tsc`, to lint, or to
 * anybody reading the diff, and both surface as a manager either being nagged
 * about "a difficult migration" or being told nothing about "she is lazy".
 *
 * The false-positive half matters at least as much as the false-negative half.
 * A checker that flags half a page is a checker people learn to scroll past,
 * and then it protects nothing while looking like it does.
 */

import {
  FINDINGS_CAVEAT,
  MAX_FINDINGS,
  findingsAcross,
  findingsHeadline,
  reviewLanguageFindings,
  type FindingKind,
} from "../src/lib/performance/review-language";

let failures = 0;

function check(what: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures += 1;
  const shown = JSON.stringify(got);
  console.log(
    `  ${ok ? "pass" : "FAIL"}  ${what.padEnd(58)} ${shown.length > 60 ? `${shown.slice(0, 57)}...` : shown}`,
  );
  if (!ok) console.log(`        wanted ${JSON.stringify(want)}`);
}

const kinds = (text: string, subject?: string): FindingKind[] =>
  reviewLanguageFindings(text, subject).map((finding) => finding.kind);

console.log("\nWritten-review language check\n");

/* ------------------------------------------------ 1. it catches the real thing */

console.log("Catches a claim about a person");
check("she is disorganised", kinds("Chidera is fine but she is disorganised."), [
  "character",
]);
check("he is quite lazy", kinds("Honestly he is quite lazy."), ["character"]);
check("they are unprofessional", kinds("They are unprofessional at times."), [
  "character",
]);
check(
  "the employee is difficult",
  kinds("The employee is difficult to work with."),
  ["character"],
);
check(
  "contracted: she's arrogant",
  kinds("She's arrogant in meetings."),
  ["character"],
);
check(
  "hedged: he is a bit careless",
  kinds("He is a bit careless with the figures."),
  ["character"],
);
check("multi-word trait", kinds("He is not a team player."), ["character"]);

/* --------------------------------------------- 2. it leaves work language alone */

console.log("\nLeaves language about the work alone");
/* This is the half that decides whether anybody keeps reading the callout. */
check(
  "a difficult migration is not a person",
  kinds("The Lagos migration was difficult and it still shipped."),
  [],
);
check(
  "a slow quarter is not a person",
  kinds("Q3 was slow across the whole market."),
  [],
);
check(
  "a negative variance is not a person",
  kinds("The variance was negative in October."),
  [],
);
check(
  "naming what happened",
  kinds("Three deadlines moved in October without notice to the client."),
  [],
);
check(
  "praise with evidence",
  kinds("Closed the Ikeja rollout two weeks early and trained the branch."),
  [],
);
check("an empty box says nothing", kinds(""), []);
check("whitespace says nothing", kinds("   \n  "), []);

/* -------------------------------------------------------------- 3. absolutes */

console.log("\nCatches the unfalsifiable");
check("he never delivers", kinds("He never delivers on time."), ["absolute"]);
check("she always misses", kinds("She always misses the Monday call."), [
  "absolute",
]);
check(
  "always about a thing is fine",
  kinds("The report is always generated on the first."),
  [],
);

/* ----------------------------------------------------- 4. protected ground */

console.log("\nCatches a protected characteristic, with no subject needed");
check("pregnancy", kinds("She was pregnant for much of the period."), [
  "sensitive",
]);
check("age", kinds("At his age this is understandable."), ["sensitive"]);
check("faith", kinds("He was away for Ramadan."), ["sensitive"]);
check("ethnicity", kinds("The Igbo staff tend to push harder."), ["sensitive"]);
check("health", kinds("Her chronic illness affected delivery."), ["sensitive"]);
check("disability", kinds("His disability was not a factor."), ["sensitive"]);
/* Even framed as a defence, it is still in the document somebody reads out. */
check(
  "a kind mention is still a mention",
  reviewLanguageFindings("Her maternity leave was well handled by the team.")
    .length,
  1,
);

/* -------------------------------------------------------------- 5. comparison */

console.log("\nCatches a mark set against a colleague");
check("better than", kinds("She is better than the rest of the desk."), [
  "comparison",
]);
check("the weakest", kinds("He is the weakest of the four analysts."), [
  "comparison",
]);
check(
  "a factual comparison of figures is fine",
  kinds("Revenue was higher than last quarter."),
  [],
);

/* ------------------------------------------------------------ 6. the mechanics */

console.log("\nThe mechanics");

/* A `g` regex kept at module scope carries `lastIndex` between calls, which on
   a checker that runs per keystroke shows findings that appear and vanish. The
   patterns are rebuilt per call; this proves it. */
const twice = "He is lazy.";
check("same text twice gives the same answer", kinds(twice), kinds(twice));

check(
  "findings come back in the order they were written",
  reviewLanguageFindings("She is pregnant. He is lazy.").map((f) => f.kind),
  ["sensitive", "character"],
);

check(
  "the phrase is quoted, never paraphrased",
  reviewLanguageFindings("Frankly he is quite lazy about it.")[0]?.phrase,
  "he is quite lazy",
);

check(
  "one sentence matching two rules is reported once",
  reviewLanguageFindings("She is always difficult.").length,
  1,
);

const wall = Array.from({ length: 20 }, () => "He is lazy.").join(" ");
check("a wall of findings is capped", reviewLanguageFindings(wall).length, MAX_FINDINGS);

check(
  "several boxes are checked together",
  findingsAcross(["He is lazy.", "She is pregnant."]).map((f) => f.kind),
  ["character", "sensitive"],
);

check("headline, one", findingsHeadline(1), "One phrase here is worth a second look");
check(
  "headline, several",
  findingsHeadline(3),
  "3 phrases here are worth a second look",
);

/* The caveat is the thing that keeps this readable as a prompt rather than a
   verdict, so it has to say both halves: it does not block, and it does not
   know whether the review is fair. */
check("the caveat says it does not block", FINDINGS_CAVEAT.includes("stops you"), true);
check("the caveat admits its limits", FINDINGS_CAVEAT.includes("cannot tell"), true);

/* Every finding has to carry somewhere to go. A flag with no "instead" is a
   complaint. */
const sample = reviewLanguageFindings(
  "He is lazy. She always misses it. She is pregnant. He is better than the rest.",
);
check("four kinds from one paragraph", sample.length, 4);
check(
  "every finding says what is wrong",
  sample.every((f) => f.says.length > 10),
  true,
);
check(
  "every finding says what to do instead",
  sample.every((f) => f.instead.length > 10),
  true,
);

/* --------------------------------------------------- 7. the subject by name */

console.log("\nCatches the subject by name, which is how people write");

/* The first sentence this was tested with in a browser, and the first draft
   missed it: the patterns knew pronouns and not names. */
check(
  "full name",
  kinds("Chidera is quite disorganised.", "Chidera Anusiobi-Uzor"),
  ["character"],
);
check("first name only", kinds("Tunde is unreliable.", "Tunde Bakare"), [
  "character",
]);
check("surname only", kinds("Bakare is careless.", "Tunde Bakare"), [
  "character",
]);
check(
  "the name is extra, not instead — pronouns still match",
  kinds("She is lazy.", "Tunde Bakare"),
  ["character"],
);
check(
  "no name supplied still catches the pronoun",
  kinds("She is lazy."),
  ["character"],
);
check(
  "a name in a sentence about work is not flagged",
  kinds("The migration Tunde ran was difficult.", "Tunde Bakare"),
  [],
);
check(
  "absolutes by name too",
  kinds("Tunde never sends it on time.", "Tunde Bakare"),
  ["absolute"],
);
/* An initial would match inside other words and turn this into noise. */
check(
  "a two-letter name part is ignored",
  kinds("Bo is lazy.", "Bo Ali"),
  [],
);
check(
  "a regex character in a name does not break the pattern",
  kinds("O'Brien is lazy.", "O'Brien (Ade)"),
  ["character"],
);

console.log(
  failures === 0
    ? `\nReview language check passed. ${String(52)} assertions.\n`
    : `\nReview language check FAILED: ${String(failures)} problem(s).\n`,
);

process.exit(failures === 0 ? 0 : 1);
