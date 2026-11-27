import {
  weightLabel,
  type ApiAppraiserContext,
  type ApiFormQuestion,
  type ApiReviewDetail,
} from "@/lib/api/performance";
import {
  draftFrom,
  filled,
  type Draft,
} from "@/app/(app)/performance/review-parts";
import { WRITTEN_ANSWER_MAX_LENGTH } from "@/lib/performance/question-limits";
import { appraiserStripLine } from "@/lib/performance/score-wording";
import type { LocalDraft } from "./draft-storage";

/**
 * The parts of the one-question-at-a-time form that are decisions rather than
 * layout, kept out of the component so they can be read — and tested — on their
 * own.
 */

/** What the API accepts in one written answer, and in the closing note. */
export const TEXT_LIMIT = WRITTEN_ANSWER_MAX_LENGTH;

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

/**
 * What this form holds in this browser and nowhere else until it is sent.
 *
 * Answers to the questions are saved to the server as they are written. These are
 * not, because they travel with the send and nothing takes them before it
 * (`draft-storage.ts`). Said from one list, so the introduction, the pages that
 * ask for them and the header cannot name different things.
 *
 * The closing note is on every form, so it is always in the list; the other two
 * only where the form asks.
 */
export function keptInBrowser(
  kind: ApiReviewDetail["kind"],
  asks: { mark: boolean; potential: boolean },
): string[] {
  return [
    ...(asks.mark ? ["your overall rating"] : []),
    ...(asks.potential ? ["how far they could go"] : []),
    kind === "MANAGER" ? "your recommendations" : "what you add at the end",
  ];
}

/**
 * The introduction's sentence about them, built from `keptInBrowser`.
 *
 * "Kept in this browser only, until you send: …" and the list, so it needs no
 * verb to agree with it: the items are "your recommendations" and "what you add
 * at the end", and "is" or "are" is wrong for one of them whichever is chosen.
 * It opens with the words `KEPT_HERE` uses on each page, so they read as one
 * statement said in two places.
 */
export function keptInBrowserLine(parts: readonly string[]): string {
  if (parts.length === 0) return "";
  const list =
    parts.length === 1
      ? (parts[0] as string)
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1] as string}`;
  return `Kept in this browser only, until you send: ${list}.`;
}

/** On the page that asks for one of them. Short: the introduction has the whole sentence. */
export const KEPT_HERE = "Kept in this browser only, until you send.";

/** In the header, in place of "Saved", on those pages: "Saved" is about the questions. */
export const KEPT_HERE_STATUS = "Kept in this browser";

/**
 * Whether the form ends with an overall mark: the company's setting, or a period
 * that needs one from this appraiser.
 *
 * Needed implies asked. A form the API will not take without a mark must never be
 * one that has no page for it, whatever else the server sent.
 */
export function asksOverallMark(
  review: Pick<ApiReviewDetail, "overallMark" | "overallMarkRequired">,
): boolean {
  return review.overallMark === true || review.overallMarkRequired === true;
}

/**
 * Whether the mark has to be given before the review can go: only on a manager's
 * form in a period that weights the Manager appraisal part. **Absent means not
 * needed**, never needed: the API still refuses at Send where it is, in its own
 * sentence, and the form shows that.
 */
export function needsOverallMark(
  review: Pick<ApiReviewDetail, "overallMarkRequired">,
): boolean {
  return review.overallMarkRequired === true;
}

/**
 * What the mark page is called, and the one sentence behind its info icon.
 *
 * The page itself says nothing about weights: a required mark carries a small
 * "Needed" tag and an optional one is passed with Skip. What it counts for is a
 * rule, so it sits in a tooltip (`tip`), or nowhere. Where it is needed the tip
 * says why: this period counts it, and for how much when the API said
 * (`markShareBp`). The shares are the API's figures; nothing here works one out.
 *
 * **`markShareBp` is the whole part's share of the mark, not this appraiser's.**
 * With several appraisers, "it counts for 30% of the mark" would be the whole
 * part's weight said as this person's, and the strip on the record says their
 * own slice and the part's share separately. So where there is more than one
 * appraiser the tip is the strip's own sentence (`appraiserStripLine`), written
 * once, and the two screens cannot give two answers.
 *
 * An optional mark has a tip only where the period weights the part at nothing
 * (U36 / PERF-2: a question that counted 0% read as if it decided the rating). A
 * share the server did not send makes no claim, so there is no tip.
 */
export function markPageWords(
  required: boolean,
  appraiser?: Pick<
    ApiAppraiserContext,
    "weightBp" | "appraiserCount" | "markShareBp"
  >,
): { title: string; tip: string | null } {
  if (!required) {
    return {
      title: "Is there an overall rating?",
      tip:
        appraiser?.markShareBp === 0 ? "It does not change the score." : null,
    };
  }
  const title = "Your overall rating";
  const share = appraiser?.markShareBp;
  if (appraiser && share !== undefined && share > 0) {
    if (appraiser.appraiserCount > 1) {
      const line = appraiserStripLine({
        appraiser,
        mine: true,
        asksMark: true,
      });
      if (line) return { title, tip: line };
    }
    return {
      title,
      tip: `It counts for ${weightLabel(share)} of the score in this period.`,
    };
  }
  return { title, tip: "This period counts it towards the score." };
}

/**
 * The mark a form opens with.
 *
 * Only where the form asks for one at all. Then the one held in this browser
 * wins, because it is what somebody last picked; and otherwise the one the review
 * already holds, because a review sent back for revision keeps its rating (the
 * API clears when it was sent, and keeps what was given). Without that a manager
 * returned to a form that still has to carry a mark is blocked until they pick,
 * again, a mark the record already has, and the preview says "Not given yet"
 * beside a record that has one.
 *
 * A first-time form has no held mark (`null`, or absent from a fixture), so it
 * still has to be given one. A form that does not ask for one opens on none, and
 * sends none.
 */
export function startingMark(args: {
  asks: boolean;
  /** What this browser remembers, or "". */
  local: string;
  /** `ApiReview.rating`: what the record already holds. */
  held: number | null | undefined;
}): string {
  if (!args.asks) return "";
  if (args.local !== "") return args.local;
  return args.held == null ? "" : String(args.held);
}

/**
 * What is left to answer before this can go, as the text of one neutral link:
 * the questions that need an answer, and the overall mark where the period needs
 * one. Null when nothing is.
 */
export function toAnswerLine(
  questions: number,
  markMissing: boolean,
): string | null {
  const count = questions + (markMissing ? 1 : 0);
  return count === 0 ? null : `${String(count)} to answer`;
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
 * (`ApiReviewDetail.overallMark`), and `withPotential` whether this is a
 * manager's form in a period that asks how far the person could go. Something
 * held in this browser only counts as something done while it is being asked for.
 */
export function startIndex(
  review: Pick<ApiReviewDetail, "questions">,
  local: LocalDraft,
  withMark = false,
  withPotential = false,
): number {
  /* The pages are the introduction, the questions, the mark and the potential
     where asked, the note and the preview. The last index is one less than that
     count, so a page remembered on the preview is not pulled back one for want
     of counting the potential page. */
  const last =
    review.questions.length + 2 + (withMark ? 1 : 0) + (withPotential ? 1 : 0);
  if (local.step > 0) return Math.min(local.step, last);

  const hasAnswers = review.questions.some((question) =>
    filled(question, draftFrom(question)),
  );
  const heldMark = withMark && local.mark !== "";
  const heldPotential = withPotential && local.potential !== "";
  if (!hasAnswers && !heldMark && !heldPotential && !local.summary) return 0;
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

/** The shortcut for "go on" from a box, in the words of the machine somebody is using. */
export function continueKeys(): string {
  if (typeof navigator === "undefined") return "Ctrl Enter";
  return /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ Enter" : "Ctrl Enter";
}

/**
 * The one line behind the keyboard icon in the footer, or null where no key does
 * anything. It is the only place the keys are explained: the pages themselves say
 * nothing about them. `keys` is `continueKeys()`.
 */
export function keyboardHint(
  page: "intro" | "question" | "mark" | "potential" | "summary" | "check",
  /** Whether the page is answered by pressing a key beside an option. */
  picks: boolean,
  keys: string,
): string | null {
  if (page === "intro" || page === "check") return null;
  const close = "Esc saves and closes.";
  if (picks) return `Press an answer's key to pick it and go on. ${close}`;
  if (page === "potential") return `Enter goes on. ${close}`;
  return `${keys} goes on. ${close}`;
}

/** What the footer's one action is on this page. */
export type FooterAction =
  /** Nothing can be pressed: the page cannot be left yet, or sending is closed. */
  | { kind: "none" }
  | { kind: "go"; label: "Start" | "Continue" | "Next" | "Skip" }
  | { kind: "send" }
  /** The preview, with answers still to give: a link to the first, in Send's place. */
  | { kind: "answer"; label: string };

/**
 * The footer's right-hand side, decided once and with no refusals in it.
 *
 * **A button that can only refuse is not drawn.** Next is absent while the page
 * cannot be left (a required answer, or the reason a bigger role needs), Send is
 * absent while sending is closed, and with answers still to give the preview's
 * action is the way to the first of them. Where a page can be passed with nothing
 * in it, the button says Skip, not Next.
 */
export function footerAction(args: {
  page: "intro" | "question" | "mark" | "potential" | "summary" | "check";
  /** The form was opened again after some of it was answered. */
  resumed: boolean;
  /** The page cannot be left yet. */
  blocked: boolean;
  /** The page is optional and nothing is in it. */
  skippable: boolean;
  /** On the preview: `toAnswerLine`, or null when nothing is left. */
  toAnswer: string | null;
  sendClosed: boolean;
}): FooterAction {
  if (args.page === "intro") {
    return { kind: "go", label: args.resumed ? "Continue" : "Start" };
  }
  if (args.page === "check") {
    if (args.toAnswer) return { kind: "answer", label: args.toAnswer };
    return args.sendClosed ? { kind: "none" } : { kind: "send" };
  }
  if (args.blocked) return { kind: "none" };
  return { kind: "go", label: args.skippable ? "Skip" : "Next" };
}
