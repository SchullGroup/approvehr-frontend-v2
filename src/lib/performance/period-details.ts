/**
 * The words and rules for a period's dates, its message to staff and its
 * reminder. Pure, so they can be tested without a screen. Every sentence that
 * is also the API's is the API's, copied: a screen that refuses in different
 * words from the server it then asks is two voices for one rule.
 */

/** `updateCycle` on the API refuses half of a range, and a range that ends first. */
export function datesProblem(start: string, end: string): string | null {
  if ((start === "") !== (end === "")) {
    return "A period needs a start and an end. Set both, or clear both.";
  }
  if (start !== "" && end !== "" && start > end) {
    return "The period would end before it starts.";
  }
  return null;
}

/** The API's own limits on the message (`instructions`) and the guide (`guideUrl`). */
export const MESSAGE_MAX = 4000;

export function messageProblem(message: string): string | null {
  return message.trim().length > MESSAGE_MAX
    ? "Keep the introduction to something somebody will read."
    : null;
}

export function guideLinkProblem(link: string): string | null {
  const value = link.trim();
  if (value === "") return null;
  return /^https?:\/\/\S+$/i.test(value) && value.length <= 2048
    ? null
    : "That is not a link. Paste the whole address, starting with https://.";
}

/**
 * Where the message is read. It is addressed to the people being appraised, so it
 * is drawn above their own self-review and nowhere else: a manager writing about
 * somebody and a colleague giving feedback are not asked to complete one.
 */
export const STAFF_MESSAGE_WHERE =
  "Shown above the first question of each person's own self-review. It is not shown on a manager's form or on feedback about a colleague.";

/** Days before the due date that are offered. The API takes 1 to 30. */
export const REMINDER_CHOICES: number[] = [1, 2, 3, 5, 7, 14];

export function reminderWords(days: number | null): string {
  if (days === null || days === 0) return "No reminder is sent.";
  return days === 1
    ? "1 day before the due date"
    : `${String(days)} days before the due date`;
}
