/**
 * What a review remembers in this browser before it is sent.
 *
 * Answers to questions go to the API as they are written. The closing note does
 * not: it travels with the send, and there is no endpoint that holds it on its
 * own. Without this, closing the page after writing a paragraph in "anything to
 * add" would lose it — which is exactly what a person trusts a page that says it
 * saves as you go *not* to do.
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
 * A draft stored before the overall mark was taken out of the form may still
 * carry a `mark`. It is ignored on the way in and not written back, so it can
 * never reach the send.
 */

export type LocalDraft = { summary: string; step: number };

const EMPTY: LocalDraft = { summary: "", step: 0 };

const keyFor = (reviewId: string) => `ahr:review-draft:${reviewId}`;

export function readLocalDraft(reviewId: string): LocalDraft {
  try {
    const raw = window.localStorage.getItem(keyFor(reviewId));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<LocalDraft> | null;
    return {
      summary: typeof parsed?.summary === "string" ? parsed.summary : "",
      step:
        typeof parsed?.step === "number" && Number.isInteger(parsed.step)
          ? Math.max(0, parsed.step)
          : 0,
    };
  } catch {
    return EMPTY;
  }
}

export function writeLocalDraft(reviewId: string, draft: LocalDraft): void {
  try {
    if (!draft.summary.trim() && draft.step <= 0) {
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
