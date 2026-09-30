/**
 * The autolinker: `src/lib/linked-text.ts`.
 *
 * ## Why this is a gate and not a unit test
 *
 * Same reason as `verify-review-language` beside it. This is one regex and a
 * punctuation rule, and the failure mode is never a crash — it is a pattern
 * that quietly stops matching a link, or one that starts swallowing the full
 * stop after it and produces a 404 nobody can see in the text they are reading.
 * Neither is visible to `tsc`, to lint, or to anybody reading the diff.
 *
 * The false-positive half matters at least as much as the false-negative half,
 * and one case here is a security property rather than a nicety: this renders
 * text a colleague typed into a free-text box, so a `javascript:` run must come
 * out as text and never as an `href`.
 *
 * ## The invariant every case is checked against
 *
 * The pieces concatenate back to the input, exactly. A splitter that can drop a
 * character is a renderer that shows something other than what somebody wrote,
 * which is a worse failure than a missed link.
 */

import { splitLinks, trimUrl, hrefFor } from "../src/lib/linked-text";

let failures = 0;
let assertions = 0;

function check(what: string, got: unknown, want: unknown): void {
  assertions += 1;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures += 1;
  const shown = JSON.stringify(got);
  console.log(
    `  ${ok ? "pass" : "FAIL"}  ${what.padEnd(56)} ${shown.length > 58 ? `${shown.slice(0, 55)}...` : shown}`,
  );
  if (!ok) console.log(`        wanted ${JSON.stringify(want)}`);
}

/** The linked runs, in order. */
const links = (text: string): string[] =>
  splitLinks(text)
    .filter((piece) => piece.href !== null)
    .map((piece) => piece.text);

/** Every `href` produced, in order. */
const hrefs = (text: string): (string | null)[] =>
  splitLinks(text)
    .filter((piece) => piece.href !== null)
    .map((piece) => piece.href);

/**
 * The property that has to hold everywhere, asserted on every input this file
 * uses rather than on a chosen few.
 */
function lossless(text: string): void {
  assertions += 1;
  const rebuilt = splitLinks(text)
    .map((piece) => piece.text)
    .join("");
  const ok = rebuilt === text;
  if (!ok) {
    failures += 1;
    console.log(`  FAIL  text was not preserved: ${JSON.stringify(text)}`);
    console.log(`        rebuilt ${JSON.stringify(rebuilt)}`);
  }
}

console.log("\nA link in the middle of a sentence — the case this exists for");

const middle =
  "shipped the retry, PR at https://github.com/acme/api/pull/412, notes in the doc";
check("the URL is found mid-sentence", links(middle), [
  "https://github.com/acme/api/pull/412",
]);
check(
  "the text around it survives in order",
  splitLinks(middle).map((p) => p.text),
  [
    "shipped the retry, PR at ",
    "https://github.com/acme/api/pull/412",
    ", notes in the doc",
  ],
);
check("the trailing comma is not part of the link", hrefs(middle), [
  "https://github.com/acme/api/pull/412",
]);

check(
  "a link at the very start",
  links("https://a.example/x then I wrote it up"),
  ["https://a.example/x"],
);
check("a link at the very end", links("wrote it up: https://a.example/x"), [
  "https://a.example/x",
]);
check(
  "two links in one line",
  links("see https://a.example/1 and https://b.example/2 for both"),
  ["https://a.example/1", "https://b.example/2"],
);

console.log("\nPunctuation belongs to the sentence, not to the link");

check("a full stop", links("done, see https://a.example/report."), [
  "https://a.example/report",
]);
check("a semicolon", links("https://a.example/a; next"), [
  "https://a.example/a",
]);
check(
  "a question mark after a path",
  links("did you read https://a.example/a?"),
  ["https://a.example/a"],
);
check("wrapped in brackets", links("(https://a.example/a)"), [
  "https://a.example/a",
]);
check("wrapped in square brackets", links("[https://a.example/a]"), [
  "https://a.example/a",
]);
check(
  "a bracket the URL opened itself is kept",
  links("https://en.wikipedia.org/wiki/Nigeria_(country)"),
  ["https://en.wikipedia.org/wiki/Nigeria_(country)"],
);
check(
  "and still kept when the sentence adds its own",
  links("(https://en.wikipedia.org/wiki/Nigeria_(country))"),
  ["https://en.wikipedia.org/wiki/Nigeria_(country)"],
);
check("a query string is kept whole", links("https://a.example/s?q=1&r=2 ok"), [
  "https://a.example/s?q=1&r=2",
]);
check("a fragment is kept", links("https://a.example/d#section-3."), [
  "https://a.example/d#section-3",
]);
check(
  "trimUrl leaves a clean URL alone",
  trimUrl("https://a.example/x"),
  "https://a.example/x",
);

console.log("\nA bare www host, because that is how people type one");

check("www is linked", links("notes at www.example.com/plan today"), [
  "www.example.com/plan",
]);
check("and gets an https href", hrefs("notes at www.example.com/plan"), [
  "https://www.example.com/plan",
]);

console.log("\nWhat must NOT become a link");

check("a javascript: run stays text", links("javascript:alert(1)"), []);
check(
  "…including one dressed as a URL",
  links("see javascript:alert(1) here"),
  [],
);
check(
  "a data: URI stays text",
  links("data:text/html;base64,PHNjcmlwdD4="),
  [],
);
check("a file: path stays text", links("file:///etc/passwd"), []);
check("a mailto stays text", links("mail grace@schull.io about it"), []);
check(
  "a bare domain is not guessed at",
  links("shipped it to example.com"),
  [],
);
check("ordinary prose with no link", links("closed 12 tickets this week"), []);
check(
  "a word ending in www is not a host",
  links("renamed the wwwroot folder"),
  [],
);
/* The scheme check is doubled on purpose. This is the half that still holds if
   somebody widens the pattern, so it is asserted directly rather than only
   through `splitLinks`. */
check("hrefFor refuses a non-web scheme", hrefFor("javascript:alert(1)"), null);
check("hrefFor refuses something unparseable", hrefFor("https://"), null);
check("hrefFor accepts http", hrefFor("http://a.example"), "http://a.example/");

console.log("\nNothing is lost, on every input above");

for (const text of [
  middle,
  "https://a.example/x then I wrote it up",
  "wrote it up: https://a.example/x",
  "see https://a.example/1 and https://b.example/2 for both",
  "done, see https://a.example/report.",
  "https://a.example/a; next",
  "did you read https://a.example/a?",
  "(https://a.example/a)",
  "[https://a.example/a]",
  "https://en.wikipedia.org/wiki/Nigeria_(country)",
  "(https://en.wikipedia.org/wiki/Nigeria_(country))",
  "https://a.example/s?q=1&r=2 ok",
  "https://a.example/d#section-3.",
  "notes at www.example.com/plan today",
  "javascript:alert(1)",
  "see javascript:alert(1) here",
  "data:text/html;base64,PHNjcmlwdD4=",
  "file:///etc/passwd",
  "mail grace@schull.io about it",
  "shipped it to example.com",
  "closed 12 tickets this week",
  "renamed the wwwroot folder",
  "",
  "   ",
  "https://a.example/x",
]) {
  lossless(text);
}

console.log("\nEdge shapes");

check("an empty line splits into nothing", splitLinks(""), []);
check(
  "a line that is only a link is one piece",
  splitLinks("https://a.example/x"),
  [{ text: "https://a.example/x", href: "https://a.example/x" }],
);
check("a line with no link is one plain piece", splitLinks("nothing here"), [
  { text: "nothing here", href: null },
]);

console.log(
  failures === 0
    ? `\nLinked-text check passed. ${String(assertions)} assertions.\n`
    : `\nLinked-text check FAILED: ${String(failures)} problem(s).\n`,
);

process.exit(failures === 0 ? 0 : 1);
