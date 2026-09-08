import { existsSync, readFileSync } from "node:fs";
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

checkShape();

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
