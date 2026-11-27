/**
 * What the page that explains how appraisals work says when the company has
 * written no competencies.
 *
 * A company writes its own framework: nothing is created for it. The set-up
 * wizard and the finished-setup page never make groups, and the API's own
 * setup note says "A company writes its own". That page used to say "Finish
 * setup and the four standard parts are created for you", which sent an
 * administrator whose setup was already finished looking for a step that does
 * not exist (F35, 25 Nov 2026).
 *
 * The person's own list of competencies says nothing at all for a company with
 * no framework, and the dialog that records a level has no sentence about it:
 * where something is absent, nothing is drawn. This page is the one place that
 * is a reference and has to say what it holds.
 */
export const NO_FRAMEWORK_TITLE = "No framework yet";

/** The same fact on the page that explains how appraisals work, for every reader. */
export const NO_FRAMEWORK_EXPLAINED =
  "Nobody has written the company's competencies yet, so there are no groups to show.";
