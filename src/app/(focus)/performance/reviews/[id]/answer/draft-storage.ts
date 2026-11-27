/**
 * What a review remembers in this browser before it is sent.
 *
 * Answers to questions go to the API as they are written. Three things do not:
 * the overall mark (where the company asks for one), how far the person could go
 * (on a manager's form) and the closing note. They travel with the send, and
 * there is no endpoint that holds them on their own. Without this, closing the
 * page after writing a paragraph in "anything to add" would lose it — which is
 * exactly what a person trusts a page that says it saves as you go *not* to do.
 *
 * It is also all this is: the page says so wherever it asks for one of the three
 * (`KEPT_HERE` in `focus-logic.ts`), because a draft that follows nobody to
 * another device, described as "saved", is a claim a person finds out is false
 * on the morning they open their laptop instead of their phone.
 *
 * It also remembers which page they were on, so coming back is coming back to
 * the same place rather than to the first question nobody answered — which is
 * the wrong place for somebody who skipped an optional one on purpose.
 *
 * Browser storage, per person per browser, and only for the unsent draft. It is
 * a convenience: every read and write is wrapped, because storage can be absent
 * or full (private windows, blocked site data) and the page must work without
 * it. Cleared the moment the review is sent.
 *
 * A `mark` is only read and sent while the company asks for one (`FocusForm`
 * decides, from `ApiReviewDetail.overallMark`), so one left in a draft from before
 * the setting moved can never reach a send that is not asking for it. The same
 * goes for `potential`, which is only read on a form that asks it.
 */

/** The three answers to "how far could they go", as the API takes them. */
export const POTENTIAL_LEVELS = ["HIGH", "MEDIUM", "LOW"] as const;
export type PotentialLevel = (typeof POTENTIAL_LEVELS)[number];

const isPotentialLevel = (value: unknown): value is PotentialLevel =>
  typeof value === "string" &&
  (POTENTIAL_LEVELS as readonly string[]).includes(value);

export type LocalDraft = {
  mark: string;
  summary: string;
  step: number;
  /** "" when nothing is picked; otherwise one of `POTENTIAL_LEVELS`. */
  potential: string;
  /** What was said for "ready for a bigger role". Only ever sent beside that answer. */
  potentialReason: string;
};

const EMPTY: LocalDraft = {
  mark: "",
  summary: "",
  step: 0,
  potential: "",
  potentialReason: "",
};

const keyFor = (reviewId: string) => `ahr:review-draft:${reviewId}`;

export function readLocalDraft(reviewId: string): LocalDraft {
  try {
    const raw = window.localStorage.getItem(keyFor(reviewId));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<LocalDraft> | null;
    return {
      mark: typeof parsed?.mark === "string" ? parsed.mark : "",
      summary: typeof parsed?.summary === "string" ? parsed.summary : "",
      step:
        typeof parsed?.step === "number" && Number.isInteger(parsed.step)
          ? Math.max(0, parsed.step)
          : 0,
      /* A value that is not one of the three is not an answer, whatever put it
         there: sending it would be refused, and showing it would be a claim. */
      potential: isPotentialLevel(parsed?.potential) ? parsed.potential : "",
      potentialReason:
        typeof parsed?.potentialReason === "string"
          ? parsed.potentialReason
          : "",
    };
  } catch {
    return EMPTY;
  }
}

export function writeLocalDraft(reviewId: string, draft: LocalDraft): void {
  try {
    if (
      !draft.mark &&
      !draft.summary.trim() &&
      !draft.potential &&
      !draft.potentialReason.trim() &&
      draft.step <= 0
    ) {
      window.localStorage.removeItem(keyFor(reviewId));
      return;
    }
    window.localStorage.setItem(keyFor(reviewId), JSON.stringify(draft));
  } catch {
    /* Nothing to do: the draft simply is not kept. */
  }
}

export function clearLocalDraft(reviewId: string): void {
  try {
    window.localStorage.removeItem(keyFor(reviewId));
  } catch {
    /* As above. */
  }
}
