/**
 * Who may do what in Projects. One predicate each, used everywhere.
 *
 * These mirror the API's rules so the screen can offer only what will work. The
 * API is the authority: a button the screen should have hidden fails with the
 * server's own sentence, and nothing here is a substitute for that check.
 *
 * - **Create a project**: anyone who leads people or heads a department, plus
 *   `EDIT_RECORDS` holders.
 * - **See a project**: its members and its lead; `EDIT_RECORDS` sees every one.
 * - **Work in it** (create, edit, move, delete issues; comment): the same people.
 * - **Manage it** (settings, workflow, members, sprints, delete): the lead and
 *   `EDIT_RECORDS`.
 */

import type { IssueComment, Project } from "./types";

export type Actor = {
  employeeId: string | null;
  /** Holds `EDIT_RECORDS`. */
  editRecords: boolean;
  /** Has anybody reporting to them. */
  leadsPeople: boolean;
  /** Heads at least one department. */
  headsDepartment: boolean;
};

export function canCreateProject(actor: Actor): boolean {
  return actor.editRecords || actor.leadsPeople || actor.headsDepartment;
}

export function isMember(
  actor: Pick<Actor, "employeeId">,
  project: Pick<Project, "leadId" | "memberIds">,
): boolean {
  if (!actor.employeeId) return false;
  return (
    project.leadId === actor.employeeId ||
    project.memberIds.includes(actor.employeeId)
  );
}

export function canSeeProject(
  actor: Actor,
  project: Pick<Project, "leadId" | "memberIds">,
): boolean {
  return actor.editRecords || isMember(actor, project);
}

export function canWorkInProject(
  actor: Actor,
  project: Pick<Project, "leadId" | "memberIds">,
): boolean {
  return canSeeProject(actor, project);
}

export function canManageProject(
  actor: Actor,
  project: Pick<Project, "leadId">,
): boolean {
  return (
    actor.editRecords ||
    (actor.employeeId !== null && project.leadId === actor.employeeId)
  );
}

/** The one sentence shown on a read-only settings page. */
export const MANAGE_REASON =
  "Only the project lead and people who manage employee records can change settings.";

export function canDeleteComment(
  actor: Actor,
  project: Pick<Project, "leadId">,
  comment: Pick<IssueComment, "authorId">,
): boolean {
  return (
    (actor.employeeId !== null && comment.authorId === actor.employeeId) ||
    canManageProject(actor, project)
  );
}
