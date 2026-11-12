import { Info } from "lucide-react";

/**
 * The API's own sentence about what a weight does, beside the weight that causes
 * it.
 *
 * Nothing here writes the sentence: it is `managerAppraisalNote`, from the weights
 * read or from a period, and it says what weighting the appraisers' overall mark
 * does, including that a manager's judgement then reaches the score by two routes.
 * It is a note and never a refusal.
 *
 * It is about the **saved** weights, so once anything typed has moved away from
 * them it says so. Without that a screen shows "Manager appraisal is weighted at
 * 0%" directly under a box somebody has just typed 30 into, which is two claims
 * about one weight on one screen.
 */
export function SavedWeightsNote({
  note,
  moved,
}: {
  note: string;
  /** What is typed differs from what is saved. */
  moved: boolean;
}) {
  return (
    <p className="flex items-start gap-2 text-body-sm text-body">
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-faint" />
      <span>
        {moved && (
          <span className="font-medium text-ink">
            Saved now, not yet changed:{" "}
          </span>
        )}
        {note}
      </span>
    </p>
  );
}
