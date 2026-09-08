import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { RATING_LABELS, RATING_MEANING } from "../src/lib/api/performance";

/**
 * The 1–5 scale must say the same thing on both sides of the wire.
 *
 * This is the gate for a defect that had already happened twice over. **Three**
 * label sets existed across the two repos:
 *
 *  - `scoring.ts`'s `RATING_LABELS` on the API — zero importers;
 *  - `lib/api/performance.ts`'s copy on the frontend — zero importers;
 *  - `review-parts.tsx`'s own, which was the only one ever rendered, and which
 *    read **"3: Did what was needed"** where the company's own guide and both
 *    unused copies said "Meets Expectations".
 *
 * So the wording the testing feedback asked for was already written down twice
 * and shown nowhere, and nothing in `tsc`, lint or any test could see it — each
 * copy was internally consistent and the wrong one was the one on screen.
 *
 * A rating is the unit a mark is defended in. Two managers picking "3" for
 * different reasons is the whole problem an appraisal exists to avoid, so the
 * screen and the engine disagreeing about what "3" is called is worse than a
 * copy bug: it is the record misquoting the scale it was recorded against.
 *
 * Same mechanism as `verify-signature-wording.ts` and `verify-template.ts`, and
 * for the same reason — a sentence in a header asking somebody to keep two
 * copies in step is not a gate. Parsed out of the API's source as text, because
 * this package cannot resolve that tree.
 *
 * Skips when `approvehr-api` is not checked out beside this repo; the
 * frontend's CI clones this one alone.
 *
 * Run by `npm run check`.
 */

const SOURCE = path.resolve(
  import.meta.dirname,
  "../../../approvehr-api/src/modules/performance/scoring.ts",
);

/**
 * Read a `export const NAME: Record<number, string> = { 5: "…", … };` block out
 * of the API's source.
 *
 * Deliberately not `eval`: what is being compared is the words a person reads,
 * not the shape of the source. Keys are normalised to numbers so a reordering
 * of the literal — which changes nothing anybody sees — does not fail the gate.
 */
function recordFrom(
  source: string,
  name: string,
): Record<number, string> | null {
  const at = source.indexOf(`export const ${name}: Record<number, string> = {`);
  if (at === -1) return null;
  const open = source.indexOf("{", at);
  const close = source.indexOf("\n};", open);
  if (close === -1) return null;

  const out: Record<number, string> = {};
  const body = source.slice(open + 1, close);
  for (const match of body.matchAll(/(\d+)\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
    const level = Number(match[1]);
    out[level] = (match[2] ?? "").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return Object.keys(out).length === 0 ? null : out;
}

let failures = 0;
let checks = 0;

function compare(
  label: string,
  ours: Record<number, string>,
  theirs: Record<number, string> | null,
): void {
  checks += 1;
  if (theirs === null) {
    failures += 1;
    console.log(`  FAIL  ${label} — not found in the API's source`);
    return;
  }

  const levels = [...new Set([...Object.keys(ours), ...Object.keys(theirs)])]
    .map(Number)
    .sort((a, b) => a - b);

  const wrong = levels.filter((level) => ours[level] !== theirs[level]);
  if (wrong.length > 0) {
    failures += 1;
    console.log(`  FAIL  ${label} differs between the two repos`);
    for (const level of wrong) {
      console.log(`        ${level} web: ${ours[level] ?? "(missing)"}`);
      console.log(`        ${level} api: ${theirs[level] ?? "(missing)"}`);
    }
    return;
  }
  console.log(`  ok    ${label} matches the API, level for level`);
}

/**
 * The scale is five points, and that is not arbitrary — `REVIEW_RATING_MAX`,
 * `submitReviewSchema` and `Competency.scaleMax` all say so, and `levelToBp`
 * maps 1 to nought and 5 to full marks. A frontend that offered four or six
 * would be offering a rating the engine cannot score.
 */
function checkShape(): void {
  checks += 1;
  const levels = Object.keys(RATING_LABELS).map(Number).sort((a, b) => a - b);
  if (levels.join(",") !== "1,2,3,4,5") {
    failures += 1;
    console.log(`  FAIL  the scale is not 1–5: ${levels.join(", ")}`);
    return;
  }
  const unexplained = levels.filter(
    (level) => (RATING_MEANING[level] ?? "").trim().length < 10,
  );
  if (unexplained.length > 0) {
    failures += 1;
    console.log(
      `  FAIL  ${unexplained.join(", ")} have a label but no meaning. A word ` +
        `with no sentence beside it is read differently by every manager.`,
    );
    return;
  }
  console.log("  ok    five levels, each with a label and what it means");
}

/**
 * A mark that has been given is read back in **words**, never as a digit.
 *
 * The standup asked for descriptive ratings *instead of* numerical values, and
 * the first pass put them on the picker only. Every screen that showed a mark
 * somebody had already given still read `3 out of 5` — eight places, including
 * the confirmation dialog for making a mark final. So the scale was words while
 * you chose and a number ever afterwards, which is worse than either: the
 * reader has to remember what 3 was called to know whether it is good news.
 *
 * `ratingWords` in `lib/api/performance.ts` is the one formatter. This bans the
 * phrase that would mean somebody had gone round it, inside the appraisal
 * screens only — `settings/performance` legitimately argues *about* the scale
 * in prose ("rates themselves 5 out of 5 rather than 3 out of 5"), and the exit
 * interview has its own unrelated recommendation score.
 *
 * Comments are stripped first, for the reason `verify-stores.ts` records: this
 * repo's files are heavily commented, a comment renders nothing, and the
 * *continuation* lines of a block comment start with neither `*` nor `/`, so a
 * leading-marker test is not a comment test.
 */
const SCREENS = path.resolve(import.meta.dirname, "../src/app/(app)/performance");
const BANNED = /\bout of (?:5|five)\b/i;
const ESCAPE = "rating-scale-prose";

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else if (full.endsWith(".tsx") || full.endsWith(".ts")) out.push(full);
  }
  return out;
}

/** Each line with its comments removed. Lifted from `verify-stores.ts`. */
function stripComments(lines: string[]): string[] {
  let inBlock = false;
  return lines.map((line) => {
    let out = "";
    let i = 0;
    while (i < line.length) {
      if (inBlock) {
        const close = line.indexOf("*/", i);
        if (close === -1) return out;
        inBlock = false;
        i = close + 2;
        continue;
      }
      if (line.startsWith("//", i)) return out;
      if (line.startsWith("/*", i)) {
        inBlock = true;
        i += 2;
        continue;
      }
      out += line[i];
      i += 1;
    }
    return out;
  });
}

function checkNoBareNumbers(): void {
  checks += 1;
  const found: string[] = [];

  for (const file of filesUnder(SCREENS)) {
    const raw = readFileSync(file, "utf8").split("\n");
    const code = stripComments(raw);
    code.forEach((line, index) => {
      if (!BANNED.test(line)) return;
      /* An average of ordinal words has no word, and says so on its own line. */
      if ((raw[index - 1] ?? "").includes(ESCAPE) || raw[index].includes(ESCAPE)) return;
      found.push(`${path.relative(SCREENS, file)}:${index + 1}  ${line.trim()}`);
    });
  }

  if (found.length > 0) {
    failures += 1;
    console.log(
      `  FAIL  ${found.length} ${found.length === 1 ? "place renders" : "places render"} ` +
        `a mark as a number. Use ratingWords, or add a "${ESCAPE}" comment if the ` +
        `line is prose about the scale rather than a mark somebody gave.`,
    );
    for (const line of found) console.log(`        ${line}`);
    return;
  }
  console.log("  ok    every mark in the appraisal screens is read back in words");
}

checkShape();
checkNoBareNumbers();

if (!existsSync(SOURCE)) {
  console.log(
    "  skip  the rating scale vs the API — approvehr-api is not checked out beside this repo",
  );
} else {
  const source = readFileSync(SOURCE, "utf8");
  compare("RATING_LABELS", RATING_LABELS, recordFrom(source, "RATING_LABELS"));
  compare("RATING_MEANING", RATING_MEANING, recordFrom(source, "RATING_MEANING"));
}

if (failures > 0) {
  console.log(`\nRating scale check FAILED: ${failures} of ${checks}.`);
  process.exit(1);
}
console.log(`\nRating scale check passed. ${checks} checks.`);
