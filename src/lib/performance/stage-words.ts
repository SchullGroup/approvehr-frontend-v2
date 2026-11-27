/**
 * The stage between manager reviews and publishing is called "Score review"
 * in the product (owner, 27 Nov 2026). "Calibration" is the HR textbook word and
 * means nothing to the people reading these screens.
 *
 * The server still names the stage `CALIBRATION` and still sends labels that say
 * "calibration" ("In calibration", `stageLabel`). That is the API's to keep; this
 * is the one place those labels are put into the product's words, so a screen
 * that shows one runs it through here.
 */
export function stageWords(label: string): string {
  return label.replace(/\bcalibration\b/gi, (word) =>
    word.startsWith("C") ? "Score review" : "score review",
  );
}
