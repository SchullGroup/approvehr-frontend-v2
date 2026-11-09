/**
 * The filter bar's filter, and what it does to a list of issues.
 *
 * One filter object is shared by every view of a project (Board, Backlog, All
 * issues), so narrowing the board and then opening the table keeps the narrowing.
 * The text matches the key, the title, the labels and the names of the people on
 * it, and a task also matches when one of its subtasks does, so typing a subtask's
 * name finds the card it lives under (`FilterContext`). Assignees are a multi-select
 * with `UNASSIGNED` standing for nobody; "Only my tasks" is its own switch.
 *
 * The stage filter is one of this project's own stages (`statusIds`), as named in
 * its settings, so "In review" means In review and not everything in progress. A
 * category (not started, in progress, done) is still possible: it is how the address
 * bar asks, as `?status=DONE` (`statusFromParam`), and it works the same on every
 * project whatever its columns are called.
 */

import { assigneesOf, isOn } from "./assignees";
import { STAGE_FILTER_LABEL, displayType } from "./terms";
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
  /** Some of this project's own stages, by id. Empty means any. */
  statusIds: string[];
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
export const STATUS_FILTER_LABEL: Record<StatusCategory, string> =
  STAGE_FILTER_LABEL;

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
  statusIds: [],
  department: "",
};

/**
 * What the text search needs beyond the task itself: whose names to match, and each
 * task's subtasks. Built once per list from every task in the project
 * (`filterContext`), not just the ones on screen, so a subtask hidden from a view
 * (the backlog never shows one) still brings its parent up.
 */
export type FilterContext = {
  nameOf?: (id: string) => string;
  subtasksOf?: ReadonlyMap<string, readonly Issue[]>;
};

export function filterContext(
  issues: readonly Issue[],
  nameOf?: (id: string) => string,
): FilterContext {
  const subtasksOf = new Map<string, Issue[]>();
  for (const issue of issues) {
    if (!issue.parentId) continue;
    const list = subtasksOf.get(issue.parentId);
    if (list) list.push(issue);
    else subtasksOf.set(issue.parentId, [issue]);
  }
  return nameOf ? { nameOf, subtasksOf } : { subtasksOf };
}

/** The task's own words: key, title, labels. */
function wordsMatch(issue: Issue, q: string): boolean {
  return (
    issue.title.toLowerCase().includes(q) ||
    issue.key.toLowerCase().includes(q) ||
    issue.labels.some((label) => label.toLowerCase().includes(q))
  );
}

/** Its words, the names of the people on it, or any of its subtasks' words. */
export function textMatches(
  issue: Issue,
  rawQuery: string,
  context: FilterContext = {},
): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  if (wordsMatch(issue, q)) return true;
  const { nameOf, subtasksOf } = context;
  if (
    nameOf &&
    assigneesOf(issue).some((id) => nameOf(id).toLowerCase().includes(q))
  )
    return true;
  const children = subtasksOf?.get(issue.id);
  return (
    children !== undefined && children.some((child) => wordsMatch(child, q))
  );
}

export function isFiltering(filter: IssueFilter): boolean {
  return (
    filter.q.trim() !== "" ||
    filter.assigneeIds.length > 0 ||
    filter.type !== "" ||
    filter.mine ||
    filter.statusCategory !== "" ||
    filter.statusIds.length > 0 ||
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
 * only for the category filter, `departments` only for the department filter, and
 * `context` only to match names and subtasks; without them that part is not applied.
 */
export function matchesFilter(
  issue: Issue,
  filter: IssueFilter,
  meId: string | null,
  statuses?: readonly ProjectStatus[],
  departments?: MemberDepartments,
  context?: FilterContext,
): boolean {
  if (!textMatches(issue, filter.q, context)) return false;
  if (filter.statusIds.length > 0 && !filter.statusIds.includes(issue.statusId))
    return false;
  /* A stored STORY is a Task, so the Task filter finds it. */
  if (filter.type && displayType(issue.type) !== displayType(filter.type))
    return false;
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
  context?: FilterContext,
): Issue[] {
  if (!isFiltering(filter)) return [...issues];
  return issues.filter((issue) =>
    matchesFilter(issue, filter, meId, statuses, departments, context),
  );
}

/**
 * The people the assignee filter offers: the project's members first, then anyone
 * who holds an issue but is no longer a member. Every one of them: the filter is a
 * search by name, so a large project needs no cap.
 */
export function filterAssigneeIds(
  memberIds: readonly string[],
  issues: readonly Issue[],
): string[] {
  const ids = new Set(memberIds);
  for (const issue of issues) for (const id of assigneesOf(issue)) ids.add(id);
  return [...ids];
}
