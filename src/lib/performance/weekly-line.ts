/**
 * What the server will take for one weekly line, so the box can say so before the request and not as
 * a refusal after it.
 *
 * These are the API's own numbers and sentences (`submitTaskSchema` and `TASK_DESCRIPTION_MAX` in the
 * backend's performance schemas): 3 to 300 characters once the spaces round it are gone, and the
 * suggestions it offers are cut to the same 300. Counted on the trimmed text, the way the server counts
 * it, so a box of spaces is not a line and the spaces round a line are not part of it.
 *
 * Nothing here is a `maxLength` on a box. That truncates a pasted paragraph without a word, which is
 * worse than a sentence saying it is too long (`question-limits.ts` says the same of questions).
 *
 * **A weekly line is one line.** Adding finished tasks to the box one after another takes it past 300
 * after two or three ordinary titles. The server will refuse that, so the box does not take it: a line
 * that would not fit is not added, its row says so, and the way on is the one the server allows, which
 * is to save this line and log the next on its own.
 *
 * No em dashes: these sentences are on screen.
 */

import { ApiError } from "@/lib/api/client";

export const WEEKLY_LINE_MIN_LENGTH = 3;
export const WEEKLY_LINE_MAX_LENGTH = 300;

/**
 * From how many characters the count is worth showing. "12 of 300" under every box is noise, and the
 * person who needs it is the one who is nearly there.
 */
export const WEEKLY_LINE_COUNTER_FROM = 250;

/** The server's sentence for a line over the maximum, character for character. */
export const WEEKLY_LINE_TOO_LONG = "Keep it short enough to read in a list.";

/** On the row of a finished task that cannot be added without taking the line past the limit. */
export const WEEKLY_LINE_NO_ROOM = `Would take the line past ${String(WEEKLY_LINE_MAX_LENGTH)} characters.`;

/** Said once under the list, when any row has no room: what the limit is and the way on. */
export const WEEKLY_LINE_ONE_AT_A_TIME = `A weekly line is ${String(WEEKLY_LINE_MAX_LENGTH)} characters at most. Save this one, then log the next on its own.`;

/** The length the server measures. */
export function weeklyLineLength(text: string): number {
  return text.trim().length;
}

/** Whether a line is past what the server takes. */
export function weeklyLineIsOver(text: string): boolean {
  return weeklyLineLength(text) > WEEKLY_LINE_MAX_LENGTH;
}

/**
 * "260 of 300 characters" once the line is long enough to need it, else `null`.
 *
 * It keeps counting past the limit (`329 of 300 characters`), which is the clearest way to say by how
 * much.
 */
export function weeklyLineCounter(text: string): string | null {
  const length = weeklyLineLength(text);
  if (length < WEEKLY_LINE_COUNTER_FROM) return null;
  return `${String(length)} of ${String(WEEKLY_LINE_MAX_LENGTH)} characters`;
}

/**
 * The box with one more line in it: an empty box takes it as it is, anything else gets it on a new
 * line after what is there, and what is there is never replaced.
 */
function joined(current: string, line: string): string {
  return current.trim() === ""
    ? line
    : `${current.replace(/\s+$/, "")}\n${line}`;
}

/** Whether the box would still be within the limit with this line added to it. */
export function lineFits(current: string, line: string): boolean {
  return !weeklyLineIsOver(joined(current, line));
}

/**
 * The box with the line added, or the box as it was when the line would take it past the limit. The
 * box is allowed to say no on its own account, whatever the list beside it believed.
 */
export function addLine(current: string, line: string): string {
  return lineFits(current, line) ? joined(current, line) : current;
}

/**
 * What to say about a weekly line the server refused: its own field sentence when it sent one (the
 * `description` one first, then any other, because "Some fields are not valid" tells nobody which),
 * otherwise its message, and ours only when it was not the server that answered.
 */
export function weeklyLineRefusal(error: unknown): string {
  if (!(error instanceof ApiError)) return "Could not log that.";
  return (
    error.messageFor("description") ??
    error.fieldErrors[0]?.message ??
    error.message
  );
}
