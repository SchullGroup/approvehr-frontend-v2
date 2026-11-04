import type { ApiFormQuestion } from "@/lib/api/performance";

/**
 * The self review and the manager review of one person, lined up question by
 * question.
 *
 * Pure, and kept apart from the card that draws it, so what is shown beside what
 * is a decision about two lists rather than a thing to find by reading JSX.
 *
 * ## Matched by the question, never by position or by its words
 *
 * Both forms are written from the same period's questions, so a question that is
 * asked of both is **the same row** in each, with the same id. Matching on the
 * prompt would put two questions that happen to share words side by side, and
 * matching on position would shift every row below a question only one of them
 * was asked.
 *
 * A question put to one of them and not the other is still a row, with nothing in
 * the other column. Dropping it would make the comparison look as though the
 * other side had been asked and said nothing.
 */

export const SELF_REVIEW_LABEL = "Self review";
export const MANAGER_REVIEW_LABEL = "Manager review";

/**
 * The closing note is where a manager writes what they recommend, and where the
 * person writes anything they wanted to add, so the row is named for both.
 */
export const CLOSING_NOTE_LABEL = "Closing note and recommendations";

export type ComparisonRow = {
  id: string;
  /** The same on both forms; the manager's when both have it. */
  prompt: string;
  self: ApiFormQuestion | null;
  manager: ApiFormQuestion | null;
};

export function comparisonRows(
  manager: readonly ApiFormQuestion[],
  self: readonly ApiFormQuestion[],
): ComparisonRow[] {
  const rows = new Map<string, ComparisonRow>();
  for (const question of manager) {
    rows.set(question.id, {
      id: question.id,
      prompt: question.prompt,
      manager: question,
      self: null,
    });
  }
  for (const question of self) {
    const row = rows.get(question.id);
    if (row) row.self = question;
    else {
      rows.set(question.id, {
        id: question.id,
        prompt: question.prompt,
        manager: null,
        self: question,
      });
    }
  }
  /* By the period's own order, which both forms carry. The sort is stable, so
     questions that share a position stay in the order the manager's form had them
     and the ones only the person was asked follow. */
  const orderOf = (row: ComparisonRow): number =>
    (row.manager ?? row.self)?.order ?? 0;
  return [...rows.values()].sort((a, b) => orderOf(a) - orderOf(b));
}
