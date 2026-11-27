import { parseMeasure, type MeasureKind } from "@/lib/api/performance";

/**
 * Whether a target is meant to come down: it ends below where it starts.
 *
 * What the "Add a target" dialog sends as `lowerIsBetter` instead of asking.
 * Where the start is blank it is 0, as everywhere else.
 */
export function goesDown(start: string, target: string): boolean {
  return parseMeasure(target.trim()) < parseMeasure(start.trim() || "0");
}

/**
 * What is wrong with a target as it is typed, field by field.
 *
 * One copy, read by the "Add a target" dialog and by the new-objective wizard,
 * so the two cannot come to refuse different things. The API checks the same
 * direction rule on save; this says it before anything is sent.
 *
 * `countDown` is what the person said. Leave it out and the direction is read
 * from the two figures (see `goesDown`), so the only thing wrong with them is
 * that they are the same; pass it where somebody is asked, and a target on the
 * wrong side of its start is refused.
 *
 * Empty means nothing is wrong. The keys are the fields the sentence belongs
 * under: `label` and `target`.
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
  countDown?: boolean;
}): { label?: string; target?: string } {
  const found: { label?: string; target?: string } = {};
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
  const from = parseMeasure(start.trim() || "0");
  const to = parseMeasure(target.trim());
  if (from === to) {
    found.target =
      "That is the same as the starting number, so there is nothing to measure.";
  } else if (countDown === true && to > from) {
    found.target =
      "This one counts down, so the target has to be below the starting number.";
  } else if (countDown === false && to < from) {
    found.target =
      "The target is below the starting number. Tick the box if it is meant to come down.";
  }
  return found;
}
