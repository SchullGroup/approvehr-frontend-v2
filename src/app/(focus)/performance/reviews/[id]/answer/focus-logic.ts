import type { ApiFormQuestion, ApiReviewDetail } from "@/lib/api/performance";
import {
  draftFrom,
  filled,
  type Draft,
} from "@/app/(app)/performance/review-parts";
import type { LocalDraft } from "./draft-storage";

/**
 * The parts of the one-question-at-a-time form that are decisions rather than
 * layout, kept out of the component so they can be read — and tested — on their
 * own.
 */

/** What the API accepts in one written answer, and in the closing note. */
export const TEXT_LIMIT = 4000;

/**
 * What the closing page is called, on each kind of form.
 *
 * It is one field, the review's closing note, and what goes in it depends on who
 * is writing. A manager is writing about somebody else and what is worth saying
 * after the answers is what they recommend, so their page says so and the record
 * reads it as theirs. The person's own page and a peer's ask for anything to add.
 * Said once, so the page, the preview row and the progress line cannot name the
 * same box three ways.
 */
export function closingNoteWords(kind: ApiReviewDetail["kind"]): {
  title: string;
  lead: string;
  placeholder: string;
  /** The row on the preview, and the line above the progress bar. */
  row: string;
} {
  if (kind === "MANAGER") {
    return {
      title: "Your recommendations",
      lead: "Optional. What you recommend for them, and anything else you want to say, in your own words.",
      placeholder: "Type here if you have a recommendation or more to say",
      row: "Recommendations",
    };
  }
  return {
    title: "Anything to add?",
    lead: "Optional. A line or two in your own words.",
    placeholder: "Type here if there is more to say",
    row: "Anything to add",
  };
}

/** A signature of what is in a box, to tell "changed" from "typed and undone". */
export const sigOf = (held: Draft): string =>
  JSON.stringify([
    held.text ?? null,
    held.rating ?? null,
    held.choice ?? null,
    held.bool ?? null,
    held.file
      ? `${held.file.filename}:${String(held.file.contentBase64.length)}`
      : null,
  ]);

/**
 * Which page the form opens on.
 *
 * Where they were, if this browser remembers — the last page being the
 * questions plus the introduction, the note and the preview, minus one, and one
 * more where the company asks for an overall mark. Otherwise from what the
 * server holds: the first required question with no answer, or the page after
 * the questions if every required one has one. A review with nothing in it opens
 * on the introduction.
 *
 * `withMark` is whether the company asks for an overall mark at all
 * (`ApiReviewDetail.overallMark`). A mark held in this browser only counts as
 * something done while it is being asked for.
 */
export function startIndex(
  review: Pick<ApiReviewDetail, "questions">,
  local: LocalDraft,
  withMark = false,
): number {
  const last = review.questions.length + (withMark ? 3 : 2);
  if (local.step > 0) return Math.min(local.step, last);

  const hasAnswers = review.questions.some((question) =>
    filled(question, draftFrom(question)),
  );
  const heldMark = withMark && local.mark !== "";
  if (!hasAnswers && !heldMark && !local.summary) return 0;
  const open = review.questions.findIndex(
    (question) => question.required && !filled(question, draftFrom(question)),
  );
  return open === -1 ? 1 + review.questions.length : 1 + open;
}

/**
 * What is on the record for one question.
 *
 * What is in the box, if it holds an answer; otherwise what was last saved.
 *
 * An answer cannot be taken back once it is saved: the API refuses an empty one
 * ("needs an answer in words"), and a rating, choice or yes/no has no empty
 * state to send. So a box somebody has emptied leaves the saved answer standing,
 * and every place that says "this is what you are sending" has to say *that*
 * rather than the blank the box shows. Reading the box alone would have told a
 * person their note was gone and then sent it.
 */
export function onRecordOf(
  question: ApiFormQuestion,
  box: Draft | undefined,
  saved: Draft,
): Draft {
  const held = box ?? saved;
  return filled(question, held) ? held : saved;
}

/** True when the box is empty but an answer already saved will stand. */
export function savedAnswerStands(
  question: ApiFormQuestion,
  box: Draft | undefined,
  saved: Draft,
): boolean {
  if (!box) return false;
  return !filled(question, box) && filled(question, saved);
}
