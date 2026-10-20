/**
 * Sprint rules, for the Backlog view and for demo mode.
 *
 * A Scrum project has at most one ACTIVE sprint. Starting one needs issues in it
 * and fixes `committedPoints` at that moment; completing one records
 * `completedPoints`, closes it, and moves what was not finished to the backlog, a
 * planned sprint, or a new one.
 */

import { addDays, daysBetween } from "./dates";
import { sprintScope, sumPoints } from "./progress";
import type {
  CompleteSprintMove,
  Issue,
  Project,
  ProjectData,
  Sprint,
  SprintPatch,
} from "./types";
import { isDone } from "./workflow";

export const DEFAULT_SPRINT_DAYS = 14;

/** Why a sprint cannot start, or null when it can. */
export function startBlocker(
  sprint: Sprint,
  sprints: readonly Sprint[],
  issues: readonly Issue[],
): string | null {
  if (sprint.state !== "PLANNED")
    return "Only a planned sprint can be started.";
  if (sprints.some((s) => s.state === "ACTIVE")) {
    return "Complete the active sprint first.";
  }
  if (sprintScope(issues, sprint.id).length === 0) return "Add issues first.";
  return null;
}

/** Why a sprint's dates are wrong, or null. */
export function sprintDatesProblem(
  startDate: string | null,
  endDate: string | null,
): string | null {
  if (startDate && endDate && endDate < startDate) {
    return "The end date must be on or after the start date.";
  }
  return null;
}

/** Name and dates for the next sprint of a project, following the last one's end. */
export function nextSprintDraft(
  project: Pick<Project, "key">,
  sprints: readonly Sprint[],
  today: string,
): { name: string; startDate: string; endDate: string } {
  const lastEnd = sprints
    .map((s) => s.endDate)
    .filter((d): d is string => Boolean(d))
    .sort()
    .pop();
  const startDate = lastEnd && lastEnd >= today ? addDays(lastEnd, 1) : today;
  /* One more than the sprints there are, unless that name is taken: after a
     sprint is deleted, "Sprint 3" can already exist with only two sprints left. */
  const taken = new Set(sprints.map((s) => s.name.toLowerCase()));
  let n = sprints.length + 1;
  while (taken.has(`${project.key} Sprint ${n}`.toLowerCase())) n += 1;
  return {
    name: `${project.key} Sprint ${n}`,
    startDate,
    endDate: addDays(startDate, DEFAULT_SPRINT_DAYS - 1),
  };
}

export function startSprint(
  data: ProjectData,
  sprintId: string,
  edits: SprintPatch,
): ProjectData {
  const committed = sumPoints(sprintScope(data.issues, sprintId));
  return {
    ...data,
    sprints: data.sprints.map((s) =>
      s.id === sprintId
        ? {
            ...s,
            ...edits,
            state: "ACTIVE" as const,
            committedPoints: committed,
          }
        : s,
    ),
  };
}

export type CompleteResult = {
  data: ProjectData;
  /** The sprint unfinished work went to, when there was any and a destination. */
  movedTo: string | null;
};

/**
 * Closes a sprint. `newSprint` is the sprint to create for `"new"`; the caller
 * supplies it so ids and names stay in one place.
 */
export function completeSprint(
  data: ProjectData,
  sprintId: string,
  move: CompleteSprintMove,
  now: string,
  newSprint: Sprint | null,
): CompleteResult {
  const scope = data.issues.filter(
    (i) => i.sprintId === sprintId && i.type !== "EPIC",
  );
  const top = scope.filter((i) => i.type !== "SUBTASK");
  const completed = sumPoints(
    top.filter((i) => isDone(data.project.statuses, i)),
  );
  const destination = move === "new" ? (newSprint?.id ?? null) : move;

  /* What moves: each unfinished top-level issue and all of its sub-tasks, as the
     API does. A finished parent keeps its sub-tasks with it, finished or not —
     a sub-task never has a sprint of its own. */
  const open = new Set(
    top.filter((i) => !isDone(data.project.statuses, i)).map((i) => i.id),
  );
  const unfinished = new Set(
    scope
      .filter((i) => open.has(i.id) || (i.parentId && open.has(i.parentId)))
      .map((i) => i.id),
  );
  const issues = data.issues.map((issue) =>
    unfinished.has(issue.id)
      ? { ...issue, sprintId: destination, updatedAt: now }
      : issue,
  );
  const sprints = data.sprints
    .map((s) =>
      s.id === sprintId
        ? {
            ...s,
            state: "CLOSED" as const,
            completedPoints: completed,
            closedAt: now,
          }
        : s,
    )
    .concat(move === "new" && newSprint ? [newSprint] : []);
  return {
    data: { ...data, issues, sprints },
    movedTo: unfinished.size > 0 ? destination : null,
  };
}

/** Days a sprint is planned to run, or null without both dates. */
export function sprintLength(
  sprint: Pick<Sprint, "startDate" | "endDate">,
): number | null {
  if (!sprint.startDate || !sprint.endDate) return null;
  return daysBetween(sprint.startDate, sprint.endDate);
}
