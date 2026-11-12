/**
 * The board layout of My tasks: three columns by category, and the rules for
 * moving a task between them.
 *
 * My tasks mixes tasks from many lists and boards, each with its own stages, so
 * the board cannot have one column per stage. It has one per category (To do,
 * In progress, Done), and a move asks the task's own project for its first stage
 * in the target category, by position.
 */

import type { PersonalTask } from "@/lib/api/projects";
import { CATEGORY_LABEL } from "./terms";
import type { Project, ProjectStatus, StatusCategory } from "./types";
import { sortStatuses } from "./workflow";

export type MyTasksLayout = "list" | "board";

/** Where the viewer's choice of layout is kept, in this browser. */
export const LAYOUT_STORAGE_KEY = "approvehr.my-tasks.layout";

export const layoutOf = (value: string | null | undefined): MyTasksLayout =>
  value === "board" ? "board" : "list";

export const BOARD_COLUMNS: readonly StatusCategory[] = [
  "TODO",
  "IN_PROGRESS",
  "DONE",
];

/** The tasks in each column, in the order they came. */
export function groupByCategory<T extends Pick<PersonalTask, "statusCategory">>(
  tasks: readonly T[],
): Record<StatusCategory, T[]> {
  const out: Record<StatusCategory, T[]> = {
    TODO: [],
    IN_PROGRESS: [],
    DONE: [],
  };
  for (const task of tasks) out[task.statusCategory].push(task);
  return out;
}

/**
 * The project's first stage in a category, by position: where a task dropped
 * on that column goes. Null when the project has no stage in it.
 */
export function firstStatusIn(
  statuses: readonly ProjectStatus[],
  category: StatusCategory,
): ProjectStatus | null {
  return sortStatuses(statuses).find((s) => s.category === category) ?? null;
}

/**
 * The task's own stage name, when it says more than its column does
 * ("In review" in In progress). Null when it is the column's label.
 */
export function stageNote(
  task: Pick<PersonalTask, "statusName" | "statusCategory">,
): string | null {
  const name = task.statusName.trim();
  if (!name) return null;
  const label = CATEGORY_LABEL[task.statusCategory];
  return name.toLowerCase() === label.toLowerCase() ? null : name;
}

/** Why a task cannot be moved from here, before asking, or null to try. */
export function cannotMoveReason(
  task: Pick<PersonalTask, "lostAccess">,
): string | null {
  return task.lostAccess ? "You're no longer on this project." : null;
}

/**
 * A board project's answer to "may this person move tasks here?". Only a
 * definite no counts: a project that did not say is left to the server.
 */
export function projectIsReadOnly(
  project: Pick<Project, "access" | "canWrite">,
): boolean {
  return project.canWrite === false || project.access === "READ";
}

/**
 * The rows with one task moved to a stage, for the optimistic board.
 *
 * A task that leaves Done stops being closed as won't do and stops being accepted: the server clears
 * both marks in the same write that reopens it, so a card dragged out of Done must not go on saying
 * either for the length of a round trip. A move that does not leave Done carries nothing off.
 */
export function withMove<T extends PersonalTask>(
  tasks: readonly T[],
  id: string,
  status: Pick<ProjectStatus, "id" | "name" | "category">,
): T[] {
  return tasks.map((task) =>
    task.id === id
      ? {
          ...task,
          statusId: status.id,
          statusName: status.name,
          statusCategory: status.category,
          ...(task.statusCategory === "DONE" && status.category !== "DONE"
            ? { wontDo: null, accepted: null }
            : {}),
        }
      : task,
  );
}
