import type { ApiTaskGrade } from "@/lib/api/performance";

/**
 * What a weekly task's grade is called, how it looks, and when it needs a
 * comment.
 *
 * One copy, because there were three: the reviewer's queue, the employee's
 * own week and the per-objective log each kept their own label map, and a
 * new grade meant finding all of them. The comment rules mirror the API's
 * (`gradeTaskSchema`) exactly — a longer minimum here would refuse something
 * the server takes, and a shorter one would show a refusal that comes back
 * from the server instead.
 */

/** What the badge says. */
export const TASK_GRADE_LABEL: Record<ApiTaskGrade, string> = {
  COMPLETED: "Done",
  PARTIALLY_COMPLETED: "Partly done",
  NOT_COMPLETED: "Not done",
  REJECTED: "Rejected",
};

export const TASK_GRADE_TONE: Record<
  ApiTaskGrade,
  "success" | "warning" | "danger"
> = {
  COMPLETED: "success",
  PARTIALLY_COMPLETED: "warning",
  NOT_COMPLETED: "danger",
  REJECTED: "danger",
};

/** The comment's length, as the API holds it. */
export const GRADE_NOTE_MIN = 3;
export const GRADE_NOTE_MAX = 500;

/**
 * Partly done and Reject say nothing the employee can act on without a
 * reason; Done and Not done may carry one but do not need it.
 */
export function gradeNeedsNote(grade: ApiTaskGrade): boolean {
  return grade === "PARTIALLY_COMPLETED" || grade === "REJECTED";
}

/**
 * Why this grade and comment cannot be saved yet, or null when they can.
 * Counted on the trimmed text, which is what the API stores.
 */
export function gradeNoteProblem(
  grade: ApiTaskGrade,
  note: string,
): string | null {
  const text = note.trim();
  if (text.length > GRADE_NOTE_MAX) {
    return `Keep it to ${String(GRADE_NOTE_MAX)} characters or fewer.`;
  }
  if (gradeNeedsNote(grade) && text.length < GRADE_NOTE_MIN) {
    return "Say why in a few words. They will read it.";
  }
  return null;
}
