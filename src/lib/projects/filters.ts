/**
 * The filter bar's filter, and what it does to a list of issues.
 *
 * One filter object is shared by every view of a project (Board, Backlog, All
 * issues), so narrowing the board and then opening the table keeps the narrowing.
 * The text matches the key, the title and the labels; assignees are a multi-select
 * with `UNASSIGNED` standing for nobody; "Only my tasks" is its own switch.
 * The status filter is a category (not started, in progress, done), so it works
 * the same on every project whatever its columns are called; it can arrive from
 * the address bar as `?status=DONE` (`statusFromParam`).
 */

import { assigneesOf, isOn } from "./assignees";
import {
  STATUS_CATEGORIES,
  type Issue,
  type IssueType,
  type ProjectStatus,
  type StatusCategory,
} from "./types";
import { categoryOf } from "./workflow";

/** The assignee filter's value for issues with no assignee. */
export const UNASSIGNED = "none";

export type IssueFilter = {
  q: string;
  /** Employee ids, plus `UNASSIGNED`. Empty means everybody. */
  assigneeIds: string[];
  type: IssueType | "";
  mine: boolean;
  /** A status category, or `""` for any. */
  statusCategory: StatusCategory | "";
  /**
   * The assignee's department: a department id, `DEPT_NONE` (somebody on it has
   * no department), `DEPT_UNASSIGNED` (nobody is on it), or `""` for any.
   */
  department: string;
};

export const DEPT_NONE = "none";
export const DEPT_UNASSIGNED = "unassigned";

/** Who is in which department, from the project (`memberDepartments`). */
export type MemberDepartments = Readonly<Record<string, string | null>>;

/** The status filter's choices, in the order they are offered. */
export const STATUS_FILTER_LABEL: Record<StatusCategory, string> = {
  TODO: "Not started",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

/** `?status=` read ignoring case; anything else is no status filter. */
export function statusFromParam(value: string | null): StatusCategory | "" {
  const wanted = (value ?? "").trim().toUpperCase();
  return (STATUS_CATEGORIES as readonly string[]).includes(wanted)
    ? (wanted as StatusCategory)
    : "";
}

export const EMPTY_FILTER: IssueFilter = {
  q: "",
  assigneeIds: [],
  type: "",
  mine: false,
  statusCategory: "",
  department: "",
};

export function isFiltering(filter: IssueFilter): boolean {
  return (
    filter.q.trim() !== "" ||
    filter.assigneeIds.length > 0 ||
    filter.type !== "" ||
    filter.mine ||
    filter.statusCategory !== "" ||
    filter.department !== ""
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

/**
 * Whether `issue` passes `filter`. `statuses` (the project's columns) is needed
 * only for the status filter, and `departments` only for the department filter;
 * without them that filter is not applied.
 */
export function matchesFilter(
  issue: Issue,
  filter: IssueFilter,
  meId: string | null,
  statuses?: readonly ProjectStatus[],
  departments?: MemberDepartments,
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
  if (
    filter.statusCategory &&
    statuses &&
    statuses.length > 0 &&
    categoryOf(statuses, issue.statusId) !== filter.statusCategory
  ) {
    return false;
  }
  if (filter.department && departments) {
    const on = assigneesOf(issue);
    if (filter.department === DEPT_UNASSIGNED) {
      if (on.length > 0) return false;
    } else if (filter.department === DEPT_NONE) {
      if (!on.some((id) => id in departments && departments[id] === null))
        return false;
    } else if (!on.some((id) => departments[id] === filter.department)) {
      return false;
    }
  }
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
  statuses?: readonly ProjectStatus[],
  departments?: MemberDepartments,
): Issue[] {
  if (!isFiltering(filter)) return [...issues];
  return issues.filter((issue) =>
    matchesFilter(issue, filter, meId, statuses, departments),
  );
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
