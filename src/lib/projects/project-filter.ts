/**
 * Narrowing the projects list by name and by department.
 *
 * The list arrives whole (the API returns up to `PROJECT_LIST_CAP` projects), so
 * both filters run here. Both live in the address bar (`?q=` and `?dept=`), so a
 * narrowed list survives a reload and can be shared.
 *
 * - **Search** matches the project's name or key, ignoring case.
 * - **Department** is a department id, or `none` for projects with no
 *   department. Tokens are compared ignoring case, so a hand-typed `?dept=NONE`
 *   still works.
 */

import type { Project } from "./types";

/** The department filter's value for projects with no department. */
export const NO_DEPARTMENT = "none";

/** What the API returns at most; a full page means there may be more. */
export const PROJECT_LIST_CAP = 500;

export type DepartmentOption = { value: string; label: string };

type Filterable = Pick<Project, "name" | "key" | "departmentId">;

/**
 * The departments the listed projects belong to, by name, then "No department"
 * when any project has none. Only departments that some project uses are offered,
 * so no choice leads to an empty list.
 */
export function departmentOptions(
  projects: readonly Pick<Project, "departmentId" | "departmentName">[],
): DepartmentOption[] {
  const named = new Map<string, string>();
  let anyWithout = false;
  for (const project of projects) {
    if (project.departmentId === null) {
      anyWithout = true;
      continue;
    }
    if (!named.has(project.departmentId)) {
      named.set(
        project.departmentId,
        project.departmentName ?? "Unnamed department",
      );
    }
  }
  const options = [...named]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
  if (anyWithout)
    options.push({ value: NO_DEPARTMENT, label: "No department" });
  return options;
}

/**
 * The department value to filter by, or `""` for none. A value no option offers
 * (a department since emptied, a mistyped link) is not applied.
 */
export function resolveDepartment(
  value: string,
  options: readonly DepartmentOption[],
): string {
  const wanted = value.trim().toLowerCase();
  if (!wanted) return "";
  return options.find((o) => o.value.toLowerCase() === wanted)?.value ?? "";
}

export function matchesProject(
  project: Filterable,
  query: string,
  department: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (
    q &&
    !project.name.toLowerCase().includes(q) &&
    !project.key.toLowerCase().includes(q)
  ) {
    return false;
  }
  if (department === NO_DEPARTMENT) return project.departmentId === null;
  if (department) return project.departmentId === department;
  return true;
}

export function filterProjects<T extends Filterable>(
  projects: readonly T[],
  query: string,
  department: string,
): T[] {
  return projects.filter((p) => matchesProject(p, query, department));
}
