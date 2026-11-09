import { UNLINKED, type IssueObjective } from "@/lib/projects/types";

/**
 * A task's link as the API says it, for tests that need one.
 *
 * `linkedTo("Cut tickets")` reads "Linked to Cut tickets", the same sentence the
 * server sends; `closedLink` is the objective that has closed; `UNLINKED` is the
 * ordinary state of most tasks.
 */
export { UNLINKED };

export const linkedTo = (
  title: string,
  over: Partial<IssueObjective> = {},
): IssueObjective => ({
  state: "LINKED",
  source: "TASK",
  goalId: "g1",
  title,
  level: "personal",
  keyResultId: null,
  keyResultTitle: null,
  visible: true,
  message: `Linked to ${title}`,
  ...over,
});

export const closedLink = (title = "An old goal"): IssueObjective =>
  linkedTo(title, {
    state: "CLOSED",
    message: "Linked objective is closed",
  });
