/**
 * Sorting for the All issues table.
 */

import { byRank } from "./rank";
import {
  PRIORITY_WEIGHT,
  type Issue,
  type ProjectStatus,
  type Sprint,
} from "./types";
import { effectiveStatus, sortStatuses } from "./workflow";

export type SortKey =
  | "rank"
  | "key"
  | "title"
  | "status"
  | "assignee"
  | "priority"
  | "points"
  | "sprint"
  | "due"
  | "updated";

export type SortState = { key: SortKey; dir: 1 | -1 };

export const DEFAULT_SORT: SortState = { key: "rank", dir: 1 };

/** Clicking a header: the same key flips direction, a new key starts ascending. */
export function nextSort(current: SortState, key: SortKey): SortState {
  return current.key === key
    ? { key, dir: current.dir === 1 ? -1 : 1 }
    : { key, dir: 1 };
}

export function sortIssues(
  issues: readonly Issue[],
  sort: SortState,
  ctx: {
    statuses: readonly ProjectStatus[];
    sprints: readonly Sprint[];
    nameOf: (employeeId: string) => string;
  },
): Issue[] {
  const order = sortStatuses(ctx.statuses).map((s) => s.id);
  const sprintName = (id: string | null) =>
    ctx.sprints.find((s) => s.id === id)?.name.toLowerCase() ?? "";

  const value = (issue: Issue): string | number => {
    switch (sort.key) {
      case "key":
        return issue.number;
      case "title":
        return issue.title.toLowerCase();
      case "status":
        return order.indexOf(effectiveStatus(ctx.statuses, issue.statusId).id);
      case "assignee":
        /* Unassigned last in ascending order, so a sort by person starts with people. */
        return issue.assigneeId
          ? ctx.nameOf(issue.assigneeId).toLowerCase()
          : "￿";
      case "priority":
        return -PRIORITY_WEIGHT[issue.priority];
      case "points":
        return issue.points ?? -1;
      case "sprint":
        return sprintName(issue.sprintId) || "￿";
      case "due":
        return issue.dueDate ?? "9999-12-31";
      case "updated":
        return -Date.parse(issue.updatedAt);
      default:
        return issue.rank;
    }
  };

  return [...issues].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    const cmp = x < y ? -1 : x > y ? 1 : 0;
    return cmp * sort.dir || byRank(a, b);
  });
}
