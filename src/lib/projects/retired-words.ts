/**
 * The words the Projects module used to use, kept for one job: so that typing
 * one of them into Find still lands on the right page.
 *
 * Somebody who has used a ticket tracker types "sprint" or "backlog", and the
 * answer is the Projects page whatever its screens now say. This list is the
 * only place those words may live outside a comment, which is why
 * `tests/projects-friendly-words.test.ts` does not read this file. Nothing here
 * is ever shown as text: `components/portal/sidebar-model.ts` reads it as
 * search keywords.
 */
export const RETIRED_WORDS: readonly string[] = [
  "issue",
  "issues",
  "epic",
  "epics",
  "sprint",
  "sprints",
  "backlog",
  "bug",
  "bugs",
  "story",
  "stories",
  "story points",
  "sub-task",
  "sub-tasks",
  "roadmap",
  "burndown",
  "velocity",
  "scrum",
  "watchers",
];
