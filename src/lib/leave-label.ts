/**
 * What a leave type is called in a sentence: its name, and the word "leave"
 * after it **unless the name already ends that way**.
 *
 * Types are named by the company, and the ones people write are "Study leave",
 * "Annual leave" and "Maternity leave" as often as "Study", "Annual" and
 * "Maternity". Every screen that wrote `${type} leave` turned the first kind into
 * "Study leave leave", in a dialog title or an approvals row nobody can reword.
 * One function, so a place that forgets is a place a test can find
 * (`tests/leave-label.test.ts` reads the source for the pattern).
 *
 * `casing` is how it sits in the sentence. `"as-named"` keeps the company's own
 * capitals, for a title or the start of a line ("Study leave, Ada"); `"lower"` is
 * for the middle of one ("Your sick leave was withdrawn").
 *
 * Only a trailing whole word counts: "Leaves of absence" and "Paid time off" get
 * the word, and "Leave" on its own is already complete.
 */
export function leaveLabel(
  type: string,
  casing: "as-named" | "lower" = "as-named",
): string {
  const named = type.trim();
  const complete = /(^|\s)leave$/i.test(named);
  const label = complete ? named : `${named} leave`;
  return casing === "lower" ? label.toLowerCase() : label;
}
