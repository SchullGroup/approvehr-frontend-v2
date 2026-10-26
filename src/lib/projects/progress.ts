/**
 * Progress arithmetic: sub-task and epic bars, sprint points, sums.
 *
 * Nothing here invents a figure. An epic with no issues has no progress ("No
 * issues"), not zero per cent; an issue with no points weighs one in an epic's bar
 * (the design's rule) so unestimated work still counts for something.
 */

import type { Issue, ProjectStatus, Sprint } from "./types";
import { isDone } from "./workflow";

export function sumPoints(issues: readonly Pick<Issue, "points">[]): number {
  return issues.reduce((n, issue) => n + (issue.points ?? 0), 0);
}

/** Done over total for a sub-task list or an epic's stories, counted by issue. */
export function countProgress(
  statuses: readonly ProjectStatus[],
  children: readonly Issue[],
): { done: number; total: number; ratio: number } {
  const done = children.filter((child) => isDone(statuses, child)).length;
  const total = children.length;
  return { done, total, ratio: total === 0 ? 0 : done / total };
}

/**
 * An epic's bar: weighted by points, an unestimated issue counting as one.
 * `ratio` is null when the epic has no issues, so a caller can say so.
 */
export function epicProgress(
  statuses: readonly ProjectStatus[],
  stories: readonly Issue[],
): { done: number; total: number; ratio: number | null } {
  const real = stories.filter((s) => s.type !== "SUBTASK");
  if (real.length === 0) return { done: 0, total: 0, ratio: null };
  const weight = (issue: Issue) => issue.points ?? 1;
  const totalWeight = real.reduce((n, i) => n + weight(i), 0);
  const doneWeight = real
    .filter((i) => isDone(statuses, i))
    .reduce((n, i) => n + weight(i), 0);
  return {
    done: real.filter((i) => isDone(statuses, i)).length,
    total: real.length,
    ratio: totalWeight === 0 ? 0 : doneWeight / totalWeight,
  };
}

/** Top-level, non-epic issues planned into a sprint. Sub-tasks never carry points of their own here. */
export function sprintScope(
  issues: readonly Issue[],
  sprintId: string,
): Issue[] {
  return issues.filter(
    (issue) =>
      issue.sprintId === sprintId &&
      issue.type !== "EPIC" &&
      issue.type !== "SUBTASK",
  );
}

export function sprintPoints(
  statuses: readonly ProjectStatus[],
  issues: readonly Issue[],
  sprint: Pick<Sprint, "id">,
): { done: number; total: number } {
  const scope = sprintScope(issues, sprint.id);
  return {
    done: sumPoints(scope.filter((issue) => isDone(statuses, issue))),
    total: sumPoints(scope),
  };
}

/** Whole per cent, for a label. */
export function percent(ratio: number): number {
  return Math.round(ratio * 100);
}
