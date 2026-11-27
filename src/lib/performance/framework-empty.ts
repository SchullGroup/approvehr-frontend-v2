/**
 * What the product says when the company has written no competencies.
 *
 * A company writes its own framework: nothing is created for it. The set-up
 * wizard and the finished-setup page never make groups, and the API's own
 * setup note says "A company writes its own". These screens used to say
 * "Finish setup and the four standard parts are created for you", which sent an
 * administrator whose setup was already finished looking for a step that does
 * not exist (F35, 25 Nov 2026).
 *
 * One place, so the two screens that still say it (the How it works card and the
 * Record a level dialog) cannot say two different things. The person's own list
 * says nothing at all when there is no framework (owner, 27 Nov 2026: a list shows
 * what is recorded and hides what is empty), so it has nothing to promise. The
 * reader who may write the framework is told where; everybody else is told only
 * that it is not written yet, because they cannot do anything about it.
 */
export const NO_FRAMEWORK_TITLE = "No framework yet";

/** The same fact on the page that explains how appraisals work, for every reader. */
export const NO_FRAMEWORK_EXPLAINED =
  "Nobody has written the company's competencies yet, so there are no groups to show.";

/** Under the competency picker, when there is nothing to pick. */
export function nothingToRateWords(canEdit: boolean): string {
  return canEdit
    ? "There are no competencies to rate yet. Close this and use Edit competencies to add some."
    : "There are no competencies to rate yet. Your company has not written them.";
}
