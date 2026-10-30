import type { Issue } from "./types";

/**
 * Several people on one issue.
 *
 * `assigneeIds` is everybody, the lead first; `assigneeId` is the lead alone,
 * who credit for finished work and the weekly task follow. Everything that asks
 * "is this mine?" or "who is on it?" reads all of them.
 */

/**
 * Everybody on an issue, the lead first.
 *
 * The list is read only when it agrees with the lead, as the API always keeps
 * it; a row that changed `assigneeId` alone (an older cache, a sample) means
 * that one person.
 */
export function assigneesOf(
  issue: Pick<Issue, "assigneeId"> & { assigneeIds?: readonly string[] },
): string[] {
  const list = issue.assigneeIds ?? [];
  if (issue.assigneeId === null) return [];
  if (list[0] === issue.assigneeId) return [...list];
  return [issue.assigneeId];
}

/** Whether this person is one of those on it. */
export const isOn = (
  issue: Pick<Issue, "assigneeId"> & { assigneeIds?: readonly string[] },
  employeeId: string,
): boolean => assigneesOf(issue).includes(employeeId);

/**
 * Everybody, with `lead` made the lead in place of the old one. Used when a
 * card is dropped in somebody's swimlane: they take the lead, the others stay.
 */
export function leadingWith(
  issue: Pick<Issue, "assigneeId"> & { assigneeIds?: readonly string[] },
  lead: string | null,
): string[] {
  if (lead === null) return [];
  const rest = assigneesOf(issue).filter(
    (id) => id !== lead && id !== issue.assigneeId,
  );
  return [lead, ...rest];
}
