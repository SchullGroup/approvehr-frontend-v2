/**
 * What My tasks does with the rows the API sends: search, the project-department
 * filter, and where a row opens.
 *
 * My tasks mixes the person's own list, colleagues' lists they are on and board
 * tasks assigned to them. A board row opens on its board (through
 * `/projects/tasks/{id}`, which redirects there); a personal one opens in the
 * drawer on this page. A board task in a project the person has left
 * (`lostAccess`) opens nowhere.
 */

import type { PersonalTask } from "@/lib/api/projects";
import { NO_DEPARTMENT, type DepartmentOption } from "./project-filter";

export { NO_DEPARTMENT };

/** The project's department, or `none` for personal lists and boards with none. */
export function departmentOfTask(task: Pick<PersonalTask, "project">): string {
  return task.project.personal
    ? NO_DEPARTMENT
    : (task.project.departmentId ?? NO_DEPARTMENT);
}

export function matchesMyTask(
  task: Pick<PersonalTask, "title" | "key" | "project">,
  query: string,
  department: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (
    q &&
    !task.title.toLowerCase().includes(q) &&
    !task.key.toLowerCase().includes(q)
  ) {
    return false;
  }
  if (department && departmentOfTask(task) !== department) return false;
  return true;
}

/** Departments the listed tasks' projects belong to, then "No department". */
export function taskDepartmentOptions(
  tasks: readonly Pick<PersonalTask, "project">[],
): DepartmentOption[] {
  const named = new Map<string, string>();
  let anyWithout = false;
  for (const task of tasks) {
    const id = departmentOfTask(task);
    if (id === NO_DEPARTMENT) anyWithout = true;
    else if (!named.has(id))
      named.set(id, task.project.departmentName ?? "Unnamed department");
  }
  const options = [...named]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
  if (anyWithout)
    options.push({ value: NO_DEPARTMENT, label: "No department" });
  return options;
}

/** Where a row goes: the board (by link), the drawer here, or nowhere. */
export function rowTarget(
  task: Pick<PersonalTask, "id" | "project" | "lostAccess">,
): { kind: "board"; href: string } | { kind: "drawer" } | { kind: "none" } {
  if (task.lostAccess) return { kind: "none" };
  if (task.project.personal) return { kind: "drawer" };
  return { kind: "board", href: `/projects/tasks/${task.id}?from=my-tasks` };
}

/** "Ada Okafor, Bola Ade +3": the first two names, then how many more. */
export function assigneeSummary(names: readonly string[]): string {
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${String(names.length - 2)}`;
}
