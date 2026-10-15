/**
 * Statuses, categories, and the rules a workflow must keep.
 *
 * A project's columns are its statuses. The **category** — not the name — decides
 * whether an issue counts as finished, so a team can call its last column
 * "Shipped" and every figure still knows it is done. The API enforces the same
 * rules; these exist so the editor can say why before it sends.
 */

import type {
  Issue,
  Project,
  ProjectStatus,
  StatusCategory,
  StatusInput,
} from "./types";

export const MIN_STATUSES = 2;

/** The workflow a new project starts with. WIP limits are advisory. */
export const DEFAULT_STATUS_INPUTS: readonly StatusInput[] = [
  { name: "To Do", category: "TODO", wipLimit: null },
  { name: "In Progress", category: "IN_PROGRESS", wipLimit: 5 },
  { name: "In Review", category: "IN_PROGRESS", wipLimit: 3 },
  { name: "Done", category: "DONE", wipLimit: null },
];

export function sortStatuses(
  statuses: readonly ProjectStatus[],
): ProjectStatus[] {
  return [...statuses].sort((a, b) => a.position - b.position);
}

export function statusOf(
  statuses: readonly ProjectStatus[],
  statusId: string,
): ProjectStatus | null {
  return statuses.find((s) => s.id === statusId) ?? null;
}

/**
 * The status an issue is shown under. An issue whose status has gone (it should
 * not happen — a status with issues cannot be removed) falls into the first
 * column rather than vanishing from the board.
 */
export function effectiveStatus(
  statuses: readonly ProjectStatus[],
  statusId: string,
): ProjectStatus {
  const ordered = sortStatuses(statuses);
  return ordered.find((s) => s.id === statusId) ?? ordered[0]!;
}

export function categoryOf(
  statuses: readonly ProjectStatus[],
  statusId: string,
): StatusCategory {
  return effectiveStatus(statuses, statusId).category;
}

export function isDone(
  statuses: readonly ProjectStatus[],
  issue: Pick<Issue, "statusId">,
): boolean {
  return categoryOf(statuses, issue.statusId) === "DONE";
}

/** The first status in a category, in column order. */
export function firstOfCategory(
  statuses: readonly ProjectStatus[],
  category: StatusCategory,
): ProjectStatus | null {
  return sortStatuses(statuses).find((s) => s.category === category) ?? null;
}

/**
 * The status a sub-task's checkbox moves it to: ticking goes to the first DONE
 * status, un-ticking back to the first TODO status (or the first column).
 */
export function checkboxTarget(
  statuses: readonly ProjectStatus[],
  currentlyDone: boolean,
): ProjectStatus {
  const ordered = sortStatuses(statuses);
  if (currentlyDone) {
    return firstOfCategory(ordered, "TODO") ?? ordered[0]!;
  }
  return firstOfCategory(ordered, "DONE") ?? ordered[ordered.length - 1]!;
}

export function statusInUse(
  issues: readonly Pick<Issue, "statusId">[],
  statusId: string,
): number {
  return issues.filter((issue) => issue.statusId === statusId).length;
}

/** Why a status cannot be removed right now, or null when it can. */
export function removalBlocker(
  statuses: readonly ProjectStatus[],
  issues: readonly Pick<Issue, "statusId">[],
  statusId: string,
): string | null {
  const target = statusOf(statuses, statusId);
  if (!target) return null;
  const inUse = statusInUse(issues, statusId);
  if (inUse > 0) {
    return `${inUse} ${inUse === 1 ? "issue is" : "issues are"} in ${target.name}. Move ${inUse === 1 ? "it" : "them"} to another status first.`;
  }
  if (statuses.length <= MIN_STATUSES) {
    return `A workflow needs at least ${MIN_STATUSES} statuses.`;
  }
  const remainingDone = statuses.filter(
    (s) => s.id !== statusId && s.category === "DONE",
  ).length;
  if (target.category === "DONE" && remainingDone === 0) {
    return "Keep at least one Done status.";
  }
  return null;
}

/** Why a draft workflow cannot be saved, or null when it can. */
export function workflowProblem(draft: readonly StatusInput[]): string | null {
  if (draft.length < MIN_STATUSES) {
    return `A workflow needs at least ${MIN_STATUSES} statuses.`;
  }
  if (!draft.some((s) => s.category === "DONE")) {
    return "Keep at least one Done status.";
  }
  const names = new Set<string>();
  for (const status of draft) {
    const name = status.name.trim();
    if (!name) return "Every status needs a name.";
    const folded = name.toLowerCase();
    if (names.has(folded)) return `Two statuses are called ${name}.`;
    names.add(folded);
    if (
      status.wipLimit !== null &&
      (!Number.isInteger(status.wipLimit) || status.wipLimit < 1)
    ) {
      return `The WIP limit on ${name} must be a whole number of 1 or more.`;
    }
  }
  return null;
}

/** Whether a column's count is within, at or past its advisory limit. */
export type WipState = "none" | "within" | "over";

export function wipState(count: number, limit: number | null): WipState {
  if (limit === null) return "none";
  return count > limit ? "over" : "within";
}

/**
 * Whether the board type can change. Refused with a reason while a sprint is
 * active or any issue still sits in a sprint, because turning a Scrum project
 * into Kanban would strand them.
 */
export function boardTypeChangeBlocker(
  project: Pick<Project, "type">,
  next: Project["type"],
  issues: readonly Pick<Issue, "sprintId">[],
  sprints: readonly { state: string }[],
): string | null {
  if (next === project.type) return null;
  if (sprints.some((s) => s.state === "ACTIVE")) {
    return "Complete the active sprint before changing the board type.";
  }
  if (issues.some((issue) => issue.sprintId !== null)) {
    return "Some issues are still planned into sprints. Move them to the backlog first.";
  }
  return null;
}
