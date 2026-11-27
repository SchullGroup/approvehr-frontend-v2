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
 * One place, so the three screens that can be empty (the person's own list, the
 * How it works card, the Record a level dialog) cannot say three different
 * things. The reader who may write the framework is told where; everybody else
 * is told only that it is not written yet, because they cannot do anything
 * about it.
 */
export const NO_FRAMEWORK_TITLE = "No framework yet";

export function noFrameworkWords(canEdit: boolean): string {
  return canEdit
    ? "Nobody has written your competencies yet. Use Edit competencies at the top of this page to add the groups and the competencies in each, then record levels."
    : "Your company has not written its competencies yet, so there is nothing to rate.";
}

/** The same fact on the page that explains how appraisals work, for every reader. */
export const NO_FRAMEWORK_EXPLAINED =
  "Nobody has written the company's competencies yet, so there are no groups to show.";

/** Under the competency picker, when there is nothing to pick. */
export function nothingToRateWords(canEdit: boolean): string {
  return canEdit
    ? "There are no competencies to rate yet. Close this and use Edit competencies to add some."
    : "There are no competencies to rate yet. Your company has not written them.";
}
