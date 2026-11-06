/**
 * What the server will take for one question, so a form can say so before the
 * request and not as a refusal after it.
 *
 * These are the API's own numbers and sentences (`questionBody` in the backend's
 * performance schemas). Two forms write questions, HR's in the Questions dialog and
 * a manager's own one on their Overview, and both read this file: a limit that one
 * of them knew and the other did not would be a question the second form let
 * through and the server then refused, in a banner, after the person had finished
 * typing it.
 *
 * Nothing here is a `maxLength` on a box. That truncates a pasted paragraph without
 * a word, which is worse than a sentence saying it is too long.
 *
 * No em dashes: these sentences are on screen.
 */

export const QUESTION_MIN_LENGTH = 5;
export const QUESTION_MAX_LENGTH = 300;

/** The server's sentence for a question under the minimum. */
export const QUESTION_TOO_SHORT = "Write the question out.";
/** The server's sentence for a question over the maximum. */
export const QUESTION_TOO_LONG =
  "Keep the question short enough to read on a phone.";

/**
 * From how many characters the count is worth showing. "12 of 300" under every box
 * is noise, and the person who needs it is the one who is nearly there.
 */
export const QUESTION_COUNTER_FROM = 250;

/** Choices on a pick-from-a-list question, and the length of each. */
export const MAX_CHOICES = 10;
export const MAX_CHOICE_LENGTH = 120;

/**
 * What is wrong with a question's wording, in the server's sentence, or `null`.
 *
 * Measured the way the server measures it: trimmed, so spaces around the words are
 * not words.
 */
export function questionWordingProblem(prompt: string): string | null {
  const length = prompt.trim().length;
  if (length < QUESTION_MIN_LENGTH) return QUESTION_TOO_SHORT;
  if (length > QUESTION_MAX_LENGTH) return QUESTION_TOO_LONG;
  return null;
}

/**
 * "260 of 300 characters" once the question is long enough to need it, else `null`.
 *
 * It keeps counting past the limit (`301 of 300 characters`), which is the clearest
 * way to say by how much.
 */
export function questionCounter(prompt: string): string | null {
  const length = prompt.trim().length;
  if (length < QUESTION_COUNTER_FROM) return null;
  return `${String(length)} of ${String(QUESTION_MAX_LENGTH)} characters`;
}

/* -------------------------------------------------------------------------- */
/* A written answer                                                            */
/* -------------------------------------------------------------------------- */

/**
 * What the server takes for one written answer: 1 to 4,000 characters once the
 * spaces round it are gone.
 *
 * It is one figure for every door a written answer comes in by (a manager recording
 * it under Competency ratings, a person answering it on the review form, a review's
 * ordinary text question and its closing note), and the server says it once
 * (`WRITTEN_ANSWER_MAX` in its performance schemas). Read by the box a manager
 * writes in under Record a level, which says so before the request, and by the
 * page-by-page form's own box (`TEXT_LIMIT`), so the two cannot come to hold
 * different numbers. Not a `maxLength` on the box, for the reason at the top of this
 * file: that truncates a paste without a word.
 */
export const WRITTEN_ANSWER_MAX_LENGTH = 4000;

/** From how many characters the count is worth showing: the last 500. */
export const WRITTEN_ANSWER_COUNTER_FROM = WRITTEN_ANSWER_MAX_LENGTH - 500;

/** The server's sentence for a written answer over the maximum, character for character. */
export const WRITTEN_ANSWER_TOO_LONG = `Keep it to ${String(WRITTEN_ANSWER_MAX_LENGTH)} characters.`;

/**
 * Ours, and not the server's: said while somebody is still typing, in the register
 * of the sentences above. A blank written answer is not an answer, and the server
 * has its own words for a blank one if one ever gets through.
 */
export const WRITTEN_ANSWER_BLANK = "Write the answer in words.";

/**
 * What is wrong with a written answer, or `null`. Measured the way the server
 * measures it: trimmed, so a box of spaces is not an answer.
 */
export function writtenAnswerProblem(text: string): string | null {
  const length = text.trim().length;
  if (length === 0) return WRITTEN_ANSWER_BLANK;
  if (length > WRITTEN_ANSWER_MAX_LENGTH) return WRITTEN_ANSWER_TOO_LONG;
  return null;
}

/** Whether a written answer is past what the server takes. */
export function writtenAnswerIsOver(text: string): boolean {
  return text.trim().length > WRITTEN_ANSWER_MAX_LENGTH;
}

/**
 * "3,620 of 4,000 characters" once the answer is long enough to need it, else `null`.
 *
 * It keeps counting past the limit, which is the clearest way to say by how much.
 */
export function writtenAnswerCounter(text: string): string | null {
  const length = text.trim().length;
  if (length < WRITTEN_ANSWER_COUNTER_FROM) return null;
  return `${length.toLocaleString("en-GB")} of ${WRITTEN_ANSWER_MAX_LENGTH.toLocaleString("en-GB")} characters`;
}
