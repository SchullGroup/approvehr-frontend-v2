import {
  MEASURE_NUMBER_PROBLEM,
  isPlainNumber,
  parseMeasure,
  type MeasureKind,
} from "@/lib/api/performance";

/**
 * What is wrong with a target as it is typed, field by field.
 *
 * One copy, read by the "Add a target" dialog and by the new-objective wizard,
 * so the two cannot come to refuse different things. The API checks the same
 * direction rule on save; this says it before anything is sent.
 *
 * Empty means nothing is wrong. The keys are the fields the sentence belongs
 * under: `label`, `start` and `target`. A start or a target that is not a plain
 * number is refused here and not left to `parseMeasure`, which turns it into 0
 * and then calls it "the same as the starting number" (F17).
 */
export function measureProblems({
  kind,
  label,
  start,
  target,
  countDown,
}: {
  kind: MeasureKind;
  label: string;
  start: string;
  target: string;
  countDown: boolean;
}): { label?: string; start?: string; target?: string } {
  const found: { label?: string; start?: string; target?: string } = {};
  if (label.trim().length < 2) {
    found.label =
      kind === "DONE"
        ? "Say what done means, in a few words."
        : "Name what is being measured.";
  }
  if (kind !== "NUMBER") return found;

  if (!target.trim()) {
    found.target = "Set the number you are aiming at.";
    return found;
  }
  if (start.trim() && !isPlainNumber(start)) {
    found.start = `The starting number is not a number. ${MEASURE_NUMBER_PROBLEM}`;
  }
  if (!isPlainNumber(target)) {
    found.target = MEASURE_NUMBER_PROBLEM;
    return found;
  }
  if (found.start) return found;
  const from = parseMeasure(start.trim() || "0");
  const to = parseMeasure(target.trim());
  if (from === to) {
    found.target =
      "That is the same as the starting number, so there is nothing to measure.";
  } else if (countDown && to > from) {
    found.target =
      "This one counts down, so the target has to be below the starting number.";
  } else if (!countDown && to < from) {
    found.target =
      "The target is below the starting number. Tick the box if it is meant to come down.";
  }
  return found;
}
