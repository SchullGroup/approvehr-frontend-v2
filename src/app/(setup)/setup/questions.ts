import type { ApiWizardQuestion } from "@/lib/api/setup";

/**
 * The questions the wizard asks, which is every question the API serves except
 * "roles".
 *
 * That question listed roles a new company does not have and could not be
 * answered: its main button was "Skip for now", and it set nothing (U58).
 * Access is set up on the Access page when somebody is ready to.
 *
 * Leaving it out cannot strand a company: `setupStep` is forward-only and set
 * to the step of the question answered, so answering the question after it
 * counts it as answered.
 */
export function askedQuestions(
  questions: readonly ApiWizardQuestion[],
): ApiWizardQuestion[] {
  return questions.filter((question) => question.id !== "roles");
}

/**
 * Where a half-finished wizard resumes: the first asked question past the
 * company's `step`, or the last one when everything is answered.
 */
export function resumeIndex(
  questions: readonly ApiWizardQuestion[],
  step: number,
): number {
  if (questions.length === 0) return 0;
  const next = questions.findIndex((question) => question.step > step);
  return next === -1 ? questions.length - 1 : next;
}
