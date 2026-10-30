/**
 * Removing people from a project.
 *
 * The API will not take somebody off a project while they still hold open
 * (not-done) issues in it: it adds nobody silently, and removes nobody silently
 * either. Their finished work keeps their name. These are that rule, worked out
 * from the project's own issues, so the settings page can say so before it asks
 * and the demo can refuse in the same words.
 */

import { assigneesOf } from "./assignees";
import type { Issue, ProjectStatus } from "./types";
import { isDone } from "./workflow";

/** How many open issues each person holds, only counting those who hold any. */
export function openIssuesHeldBy(
  statuses: readonly ProjectStatus[],
  issues: readonly Issue[],
): Map<string, number> {
  const held = new Map<string, number>();
  for (const issue of issues) {
    if (isDone(statuses, issue)) continue;
    for (const id of assigneesOf(issue)) held.set(id, (held.get(id) ?? 0) + 1);
  }
  return held;
}

/**
 * Who among `removing` still holds open issues, with how many. Empty means the
 * removal is allowed.
 */
export function removalHolders(
  statuses: readonly ProjectStatus[],
  issues: readonly Issue[],
  removing: readonly string[],
): { employeeId: string; open: number }[] {
  const held = openIssuesHeldBy(statuses, issues);
  return removing
    .map((employeeId) => ({ employeeId, open: held.get(employeeId) ?? 0 }))
    .filter((entry) => entry.open > 0);
}

/** The sentence for a refused removal, with names. */
export function removalRefusal(
  holders: readonly { employeeId: string; open: number }[],
  nameOf: (employeeId: string) => string,
): string {
  const parts = holders.map((h) => `${nameOf(h.employeeId)} (${h.open} open)`);
  return holders.length === 1
    ? `${parts[0]} still has open issues in this project. Reassign them first, then remove them.`
    : `${parts.join(", ")} still have open issues in this project. Reassign them first, then remove them.`;
}
