/**
 * Which issues a board shows, how they are laid out, and what a drop does.
 *
 * The board is a pure function of the project, its issues, the filter and one
 * choice (swimlanes). The UI renders what these return and sends what
 * `resolveDrop` returns, so the rules a drag follows can be tested without a drag.
 */

import { leadingWith } from "./assignees";
import { daysBetween, daysLeft } from "./dates";
import { byRank, rankForInsert } from "./rank";
import type {
  Issue,
  IssuePatch,
  Project,
  ProjectStatus,
  Sprint,
} from "./types";
import { effectiveStatus, isDone } from "./workflow";

/** Done issues disappear from a Kanban board after this many days. */
export const KANBAN_DONE_DAYS = 14;

export type Swimlanes = "none" | "assignee" | "epic";

export const SWIMLANE_LABEL: Record<Swimlanes, string> = {
  none: "No swimlanes",
  assignee: "Lanes by assignee",
  epic: "Lanes by epic",
};

export function activeSprint(sprints: readonly Sprint[]): Sprint | null {
  return sprints.find((s) => s.state === "ACTIVE") ?? null;
}

/** Sprints that can still take work, planned or active, active first. */
export function openSprints(sprints: readonly Sprint[]): Sprint[] {
  return sprints
    .filter((s) => s.state !== "CLOSED")
    .sort(
      (a, b) =>
        Number(b.state === "ACTIVE") - Number(a.state === "ACTIVE") ||
        a.createdAt.localeCompare(b.createdAt),
    );
}

/**
 * A finished issue that has been finished long enough to leave a Kanban board.
 * `doneDay` is the day it finished in the company's zone, supplied by the caller.
 */
export function isStaleDone(
  issue: Pick<Issue, "doneAt">,
  doneDay: string | null,
  today: string,
): boolean {
  if (!issue.doneAt || !doneDay) return false;
  const age = daysBetween(doneDay, today);
  return age !== null && age > KANBAN_DONE_DAYS;
}

export type BoardScope = {
  /** Null for a Scrum project with nothing started: the board has nothing to show. */
  sprint: Sprint | null;
  issues: Issue[];
};

/**
 * The issues on the board, before the filter.
 *
 * Scrum: everything in the active sprint (sub-tasks included, they have their own
 * cards), never epics. Kanban: every non-epic issue except finished ones older
 * than fourteen days. `doneDayOf` turns an instant into the company's day.
 */
export function boardScope(args: {
  project: Pick<Project, "type" | "statuses">;
  issues: readonly Issue[];
  sprints: readonly Sprint[];
  today: string;
  doneDayOf: (iso: string) => string | null;
}): BoardScope {
  const { project, issues, sprints, today, doneDayOf } = args;
  if (project.type === "KANBAN") {
    return {
      sprint: null,
      issues: issues.filter((issue) => {
        if (issue.type === "EPIC") return false;
        if (!isDone(project.statuses, issue)) return true;
        const day = issue.doneAt ? doneDayOf(issue.doneAt) : null;
        return !isStaleDone(issue, day, today);
      }),
    };
  }
  const sprint = activeSprint(sprints);
  if (!sprint) return { sprint: null, issues: [] };
  return {
    sprint,
    issues: issues.filter(
      (issue) => issue.sprintId === sprint.id && issue.type !== "EPIC",
    ),
  };
}

/** Issues in one column, in rank order. Unknown statuses fall into the first column. */
export function columnIssues(
  statuses: readonly ProjectStatus[],
  status: ProjectStatus,
  issues: readonly Issue[],
): Issue[] {
  return issues
    .filter(
      (issue) => effectiveStatus(statuses, issue.statusId).id === status.id,
    )
    .sort(byRank);
}

export type Lane = {
  /** The assignee id, the epic id, or `none` / `all`. */
  key: string;
  kind: "all" | "assignee" | "epic";
  /** `null` for the single lane of "No swimlanes". */
  label: string | null;
  items: Issue[];
};

/**
 * Groups issues into lanes. `nameOf` resolves an assignee id to a name, for the
 * order (alphabetical, unassigned last). Epics go in rank order, "No epic" last.
 */
export function laneGroups(args: {
  mode: Swimlanes;
  issues: readonly Issue[];
  allIssues: readonly Issue[];
  nameOf: (employeeId: string) => string;
}): Lane[] {
  const { mode, issues, allIssues, nameOf } = args;
  if (mode === "assignee") {
    const ids = [...new Set(issues.map((i) => i.assigneeId ?? ""))].sort(
      (a, b) =>
        a === "" ? 1 : b === "" ? -1 : nameOf(a).localeCompare(nameOf(b)),
    );
    return ids.map((id) => ({
      key: id || "none",
      kind: "assignee" as const,
      label: id ? nameOf(id) : "Unassigned",
      items: issues.filter((i) => (i.assigneeId ?? "") === id),
    }));
  }
  if (mode === "epic") {
    const epicIds = [...new Set(issues.map((i) => i.epicId ?? ""))];
    const epics = epicIds
      .filter((id) => id !== "")
      .map((id) => allIssues.find((i) => i.id === id))
      .filter((e): e is Issue => Boolean(e))
      .sort(byRank);
    const lanes: Lane[] = epics.map((epic) => ({
      key: epic.id,
      kind: "epic" as const,
      label: epic.title,
      items: issues.filter((i) => i.epicId === epic.id),
    }));
    /* Issues pointing at an epic that is no longer there read as "No epic". */
    const placed = new Set(epics.map((e) => e.id));
    const rest = issues.filter((i) => !i.epicId || !placed.has(i.epicId));
    if (rest.length > 0) {
      lanes.push({ key: "none", kind: "epic", label: "No epic", items: rest });
    }
    return lanes;
  }
  return [{ key: "all", kind: "all", label: null, items: [...issues] }];
}

/** A drop target as the board encodes it in `data-drop-id`. */
export type DropTarget = { statusId: string; laneKey: string };

const SEP = "|";

export function encodeDropTarget(target: DropTarget): string {
  return `${target.statusId}${SEP}${target.laneKey}`;
}

export function decodeDropTarget(id: string): DropTarget | null {
  const at = id.indexOf(SEP);
  if (at < 1) return null;
  return { statusId: id.slice(0, at), laneKey: id.slice(at + 1) };
}

/**
 * What dropping `issueId` into a column cell changes, or null when nothing would.
 *
 * - The status becomes the cell's column.
 * - Dropping into another **assignee** lane reassigns the assignee (to nobody for
 *   the Unassigned lane), but only to someone who is a member; a lane for a person
 *   who has since left does not hand work back to them.
 * - Dropping into another **epic** lane moves the story to that epic; sub-tasks
 *   keep their parent's, and epics are not on the board.
 * - The rank is the midpoint of the neighbours at the drop position, `beforeId`
 *   being the card it landed in front of, or null for the end of the cell.
 */
export function resolveDrop(args: {
  issue: Issue;
  target: DropTarget;
  /** The issues already in the target cell, in display order. */
  cell: readonly Issue[];
  beforeId: string | null;
  mode: Swimlanes;
  memberIds: readonly string[];
}): IssuePatch | null {
  const { issue, target, cell, beforeId, mode, memberIds } = args;
  const patch: IssuePatch = {};

  if (target.statusId !== issue.statusId) patch.statusId = target.statusId;

  if (mode === "assignee") {
    const next = target.laneKey === "none" ? null : target.laneKey;
    if (next === null || memberIds.includes(next)) {
      if (next !== issue.assigneeId)
        patch.assigneeIds = leadingWith(issue, next);
    }
  }
  if (mode === "epic" && issue.type !== "SUBTASK") {
    const next = target.laneKey === "none" ? null : target.laneKey;
    if (next !== issue.epicId) patch.epicId = next;
  }

  const sameCell =
    patch.statusId === undefined &&
    patch.assigneeIds === undefined &&
    patch.epicId === undefined;
  const rest = cell.filter((c) => c.id !== issue.id);
  if (sameCell) {
    /* Dropped where it already is: only worth a write if the order changed. */
    const index =
      beforeId === null
        ? rest.length
        : rest.findIndex((c) => c.id === beforeId);
    const current = cell.findIndex((c) => c.id === issue.id);
    if (index === current) return null;
  }
  /* Into an empty cell there is nothing to be ranked against, and a rank of its
     own would throw the issue to the top of every list that shares the ordering —
     the backlog among them. It keeps the rank it has. */
  if (rest.length > 0) patch.rank = rankForInsert(rest, beforeId, issue.id);
  return Object.keys(patch).length > 0 ? patch : null;
}

/** The sprint strip above the sprint board. */
export function sprintStrip(
  sprint: Sprint,
  today: string,
): { left: number | null; late: boolean } {
  const left = daysLeft(sprint.endDate, today);
  return { left, late: left !== null && left < 0 };
}
