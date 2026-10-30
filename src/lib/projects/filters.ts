/**
 * The filter bar's filter, and what it does to a list of issues.
 *
 * One filter object is shared by every view of a project (Board, Backlog, All
 * issues), so narrowing the board and then opening the table keeps the narrowing.
 * The text matches the key, the title and the labels; assignees are a multi-select
 * with `UNASSIGNED` standing for nobody; "Only my issues" is its own switch.
 */

import { assigneesOf, isOn } from "./assignees";
import type { Issue, IssueType } from "./types";

/** The assignee filter's value for issues with no assignee. */
export const UNASSIGNED = "none";

export type IssueFilter = {
  q: string;
  /** Employee ids, plus `UNASSIGNED`. Empty means everybody. */
  assigneeIds: string[];
  type: IssueType | "";
  mine: boolean;
};

export const EMPTY_FILTER: IssueFilter = {
  q: "",
  assigneeIds: [],
  type: "",
  mine: false,
};

export function isFiltering(filter: IssueFilter): boolean {
  return (
    filter.q.trim() !== "" ||
    filter.assigneeIds.length > 0 ||
    filter.type !== "" ||
    filter.mine
  );
}

export function toggleAssignee(filter: IssueFilter, id: string): IssueFilter {
  const has = filter.assigneeIds.includes(id);
  return {
    ...filter,
    assigneeIds: has
      ? filter.assigneeIds.filter((x) => x !== id)
      : [...filter.assigneeIds, id],
  };
}

export function matchesFilter(
  issue: Issue,
  filter: IssueFilter,
  meId: string | null,
): boolean {
  const q = filter.q.trim().toLowerCase();
  if (q) {
    const hit =
      issue.title.toLowerCase().includes(q) ||
      issue.key.toLowerCase().includes(q) ||
      issue.labels.some((label) => label.toLowerCase().includes(q));
    if (!hit) return false;
  }
  if (filter.type && issue.type !== filter.type) return false;
  if (filter.mine && (meId === null || !isOn(issue, meId))) return false;
  if (filter.assigneeIds.length > 0) {
    const on = assigneesOf(issue);
    const shown =
      on.length === 0
        ? filter.assigneeIds.includes(UNASSIGNED)
        : on.some((id) => filter.assigneeIds.includes(id));
    if (!shown) return false;
  }
  return true;
}

export function applyFilter(
  issues: readonly Issue[],
  filter: IssueFilter,
  meId: string | null,
): Issue[] {
  if (!isFiltering(filter)) return [...issues];
  return issues.filter((issue) => matchesFilter(issue, filter, meId));
}

/**
 * The people the assignee avatars offer: the project's members first, then anyone
 * who holds an issue but is no longer a member, capped so the row stays a row.
 */
export function filterAssigneeIds(
  memberIds: readonly string[],
  issues: readonly Issue[],
  cap = 9,
): string[] {
  const ids = new Set(memberIds);
  for (const issue of issues) for (const id of assigneesOf(issue)) ids.add(id);
  return [...ids].slice(0, cap);
}
