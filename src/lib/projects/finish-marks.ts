/**
 * Won't do and acceptance on a finished task, as words and as limits. Pure: nothing here reads the
 * server or decides who may do what, because the server says that (`canMarkWontDo`, `canAccept`) and
 * the screen only follows it.
 *
 * ## Two recordings, and neither is a number
 *
 * **Won't do** says a task in a Done column was closed without being done. It stays in its column and
 * is no longer counted as finished work anywhere finished work is read. The person who closed it wrote
 * why, in their own words, 3 to 280 characters, and the reason is shown to whoever can read the task.
 * **Accepted** says a leader of the person the task is credited to has seen it and it stands. It
 * gates nothing. Neither feeds a mark, a score, a band or a rank, so nothing here turns either into a
 * percentage, a count that reads like a mark or a ranking.
 *
 * ## The limits are the server's
 *
 * 3 to 280 characters, trimmed as the server trims. They are written down here only to keep the button
 * off and the counter honest; **the sentence for a refusal is always the server's own**, and nothing
 * here writes one.
 */

import type { AcceptedMark, WontDoMark } from "./types";

/** The server's limits on the reason, measured on the trimmed text. */
export const WONT_DO_REASON_MIN = 3;
export const WONT_DO_REASON_MAX = 280;

/** The two words on a card, a row and the drawer. Plain text: a status is not a coloured chip. */
export const FINISH_TAG = {
  wontDo: "Won't do",
  accepted: "Accepted",
} as const;

/**
 * What accepting means, said in words beside the buttons that write it on one press (Accept and Take
 * back acceptance). Not behind a hover: a control that writes on a single press has to say what it
 * does where it can be read first. The backend's own words: a leader of the person it is credited to
 * says they have seen it and it stands, and it gates nothing and feeds no number.
 */
export const ACCEPTANCE_MEANS =
  "Acceptance says a leader has seen it and it stands. It changes no mark.";

/** The same, for the button that takes a won't-do mark off on one press. */
export const TAKE_BACK_WONT_DO_MEANS =
  "Taking it back puts it among finished work again.";

export type ReasonState = "ok" | "short" | "long";

/**
 * Whether a reason can be sent, by length alone. A reason of only spaces is `short`, because the
 * server trims before it counts.
 */
export function wontDoReasonState(text: string): ReasonState {
  const length = text.trim().length;
  if (length < WONT_DO_REASON_MIN) return "short";
  if (length > WONT_DO_REASON_MAX) return "long";
  return "ok";
}

/**
 * "250 of 280", once the reason is long enough to be near the limit, and null before then (a counter
 * on an empty box is noise). It counts the trimmed text, which is what the server counts.
 */
export function wontDoCounter(text: string): string | null {
  const length = text.trim().length;
  if (length < WONT_DO_REASON_MAX - 40) return null;
  return `${length} of ${WONT_DO_REASON_MAX}`;
}

/** "Closed as won't do by Ada Eze on 3 Nov", without the reason, which the screen shows on its own line. */
export function wontDoLine(
  mark: Pick<WontDoMark, "byName" | "at">,
  day: (iso: string) => string,
): string {
  const who = mark.byName.trim();
  return `Closed as won't do${who ? ` by ${who}` : ""} on ${day(mark.at)}`;
}

/** "Accepted by Ada Eze on 3 Nov". */
export function acceptedLine(
  mark: Pick<AcceptedMark, "byName" | "at">,
  day: (iso: string) => string,
): string {
  const who = mark.byName.trim();
  return `Accepted${who ? ` by ${who}` : ""} on ${day(mark.at)}`;
}

/**
 * What a list of tasks that sit in a Done column is, counted honestly: how many were finished, and how
 * many were closed as won't do. A won't-do task is in the list because it is in its column, and is
 * **not** a finished one, so a count that included it would read as work somebody did.
 */
export function finishedSplit<T extends { wontDo?: unknown }>(
  rows: readonly T[],
): { finished: number; wontDo: number } {
  let wontDo = 0;
  for (const row of rows) if (row.wontDo) wontDo += 1;
  return { finished: rows.length - wontDo, wontDo };
}

/**
 * The count beside a "Done" group: the finished ones, and what else is in it, said. "3" when every
 * task in it was finished, "3 finished, 1 won't do" when some were not. Never a bare number that
 * includes a task nobody did.
 */
export function finishedMeta(rows: readonly { wontDo?: unknown }[]): string {
  const { finished, wontDo } = finishedSplit(rows);
  return wontDo === 0
    ? String(finished)
    : `${finished} finished, ${wontDo} won't do`;
}
