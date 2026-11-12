/**
 * Where a task just made from a project's New task dialog went, when that is not
 * the view on screen.
 *
 * "CHK-12 created" over a board that still looks the same reads as a task that
 * vanished. So the toast says where it is, judged with the functions the view
 * itself uses (`boardScope`, `buildBacklog`, `applyFilter`), so the toast and
 * the screen cannot disagree:
 *
 * - outside what the view shows at all (a board with cycles, and the task is not
 *   in the running one): "Added to Later on the Plan tab", or the planned cycle
 *   it went into;
 * - shown by the view but hidden by a filter (Only my tasks included): "Hidden by
 *   your filters";
 * - both: the first, because clearing the filters would not bring it back;
 * - visible, or a tab that is not a list of tasks: nothing.
 */

import { boardScope } from "./board";
import { buildBacklog } from "./backlog";
import { applyFilter, filterContext, type IssueFilter } from "./filters";
import { CREATED_NOTE, type ProjectViewId } from "./terms";
import type { Issue, Project, Sprint } from "./types";

export function whereItWent(args: {
  view: ProjectViewId;
  project: Pick<Project, "type" | "statuses" | "memberDepartments">;
  /** The task as the API returned it. */
  issue: Issue;
  /** The project's tasks, for matching a search against subtask names. */
  issues: readonly Issue[];
  sprints: readonly Sprint[];
  today: string;
  doneDayOf: (instant: string) => string | null;
  filter: IssueFilter;
  meId: string | null;
  nameOf: (id: string | null | undefined) => string;
}): string | null {
  const { view, project, issue, sprints, today, doneDayOf } = args;
  /* Initiatives have the Timeline and are never a card or a row of the plan, so
     neither message would be true of one. */
  if (issue.type === "EPIC") return null;

  let inScope: boolean;
  if (view === "board") {
    inScope =
      boardScope({ project, issues: [issue], sprints, today, doneDayOf }).issues
        .length > 0;
  } else if (view === "backlog") {
    const layout = buildBacklog({
      project,
      issues: [issue],
      sprints,
      today,
      doneDayOf,
    });
    inScope =
      layout.backlog.all.length > 0 ||
      layout.sprints.some((section) => section.all.length > 0);
  } else if (view === "issues") {
    inScope = true;
  } else {
    return null;
  }

  if (!inScope) {
    const cycle = issue.sprintId
      ? sprints.find((s) => s.id === issue.sprintId && s.state === "PLANNED")
      : undefined;
    return cycle ? CREATED_NOTE.inCycle(cycle.name) : CREATED_NOTE.later;
  }

  const all = args.issues.some((i) => i.id === issue.id)
    ? args.issues
    : [...args.issues, issue];
  const kept = applyFilter(
    [issue],
    args.filter,
    args.meId,
    project.statuses,
    project.memberDepartments,
    filterContext(all, args.nameOf),
  );
  return kept.length === 0 ? CREATED_NOTE.filtered : null;
}
