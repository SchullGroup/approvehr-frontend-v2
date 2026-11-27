import type { ApiProgressStep } from "@/lib/api/performance";

/**
 * What an appraisal's progress says, from its steps.
 *
 * "Done" is the API's: every required question in a step is answered. It is
 * not "something has been answered", so a person who has answered one of two
 * questions has not finished the step. The words used to say only which step
 * was next, so that person read "Step 1 of 2: Questions" beside **Start**, as if
 * they had not begun, and a manager saw "Done 1 of 2 steps" for somebody whose
 * form had not been sent. Both are counted from `answered` and `total`, which
 * the API already sends.
 */

/** How many questions are answered, and how many there are, across every step. */
export function answeredIn(steps: readonly ApiProgressStep[]): {
  answered: number;
  total: number;
} {
  return {
    answered: steps.reduce((sum, step) => sum + step.answered, 0),
    total: steps.reduce((sum, step) => sum + step.total, 0),
  };
}

/** Has any work been done at all: a finished step or even one answer. */
export function hasStarted(steps: readonly ApiProgressStep[]): boolean {
  return steps.some((step) => step.done || step.answered > 0);
}

/**
 * "Step 2 of 4: Core competencies", and what is answered of it when something is.
 * Null when there are no steps, or when every step is done.
 */
export function stepLine(steps: readonly ApiProgressStep[]): string | null {
  if (steps.length === 0) return null;
  const index = steps.findIndex((step) => !step.done);
  if (index === -1) return null;
  const step = steps[index];
  const where = `Step ${String(index + 1)} of ${String(steps.length)}: ${step?.label ?? ""}`;
  return step && step.answered > 0 && step.total > 0
    ? `${where}, ${String(step.answered)} of ${String(step.total)} answered`
    : where;
}

/** Under a person in a team list: "1 of 2 answered", or nothing when nothing is. */
export function answeredLine(steps: readonly ApiProgressStep[]): string | null {
  const { answered, total } = answeredIn(steps);
  return answered > 0 && total > 0
    ? `${String(answered)} of ${String(total)} answered`
    : null;
}
