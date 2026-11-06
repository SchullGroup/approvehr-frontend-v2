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

/**
 * What a person may do in one project: the one answer every show-or-hide
 * decision in Projects asks. Mirrors the API's `accessFor`, which is the
 * authority; the screen uses it to draw only what will work.
 *
 * - `NONE`: cannot open it (the API answers 404).
 * - `READ`: sees the project, its tasks, comments and history. Changes nothing.
 * - `WRITE`: also creates, edits, moves and deletes tasks, comments and links.
 * - `MANAGE`: also settings, stages, people, cycles and deleting the project.
 */
export type ProjectAccess = "NONE" | "READ" | "WRITE" | "MANAGE";

/** What a person has in a program through its access list. */
export type ProgramLevel = "READ" | "WRITE";

/** What the project's own program says about who is where, when it has one. */
export type ProgramFacts = {
  leadId: string;
  /** Employee id to level. The lead is never listed. */
  levels: Readonly<Record<string, ProgramLevel>>;
};

const RANK: Record<ProjectAccess, number> = {
  NONE: 0,
  READ: 1,
  WRITE: 2,
  MANAGE: 3,
};

const best = (a: ProjectAccess, b: ProjectAccess): ProjectAccess =>
  RANK[b] > RANK[a] ? b : a;

/**
 * The highest level any rule gives, and nothing a lower rule takes back.
 *
 * | Reason                                   | Level  |
 * | ---------------------------------------- | ------ |
 * | project lead; program lead; EDIT_RECORDS | MANAGE |
 * | project member; program level WRITE      | WRITE  |
 * | program level READ; SEE_ALL_WORK         | READ   |
 *
 * `program` is the program the project is in (null when it is in none). A
 * department linked to a program grants nothing here: it only seeds the list.
 */
export function accessFor(
  actor: Actor,
  project: Pick<Project, "leadId" | "memberIds">,
  program: ProgramFacts | null = null,
): ProjectAccess {
  let level: ProjectAccess = "NONE";
  const me = actor.employeeId;
  if (actor.editRecords) level = best(level, "MANAGE");
  if (me !== null) {
    if (project.leadId === me) level = best(level, "MANAGE");
    if (project.memberIds.includes(me)) level = best(level, "WRITE");
    if (program) {
      if (program.leadId === me) level = best(level, "MANAGE");
      const given = program.levels[me];
      if (given === "WRITE") level = best(level, "WRITE");
      else if (given === "READ") level = best(level, "READ");
    }
  }
  if (actor.seesAll) level = best(level, "READ");
  return level;
}

export const canSee = (access: ProjectAccess): boolean => access !== "NONE";
/** Create, edit, move, delete and comment. */
export const canWork = (access: ProjectAccess): boolean =>
  access === "WRITE" || access === "MANAGE";
/** Settings, stages, people, cycles, delete. */
export const canManage = (access: ProjectAccess): boolean =>
  access === "MANAGE";

/** What the API says a project card's `access` is, or `null` when it said nothing. */
export function accessOfProject(
  project: Pick<Project, "access" | "canManage" | "canWrite">,
): ProjectAccess | null {
  if (project.access) return project.access;
  if (project.canManage === true) return "MANAGE";
  if (project.canWrite === true) return "WRITE";
  return null;
}

/* --------------------------------------------------------------- programs -- */

/** The program as the access rules need it. */
export type ProgramRule = ProgramFacts & {
  archived?: boolean;
};

/** Start a program: `EDIT_RECORDS` or the Master grant. */
export function canCreateProgram(actor: Actor): boolean {
  return actor.editRecords || actor.seesAll === true;
}

/**
 * Rename, recolour, change its lead, archive, and see or change who has access:
 * the program's lead and `EDIT_RECORDS`. The Master grant reads; it never
 * manages.
 */
export function canManageProgram(
  actor: Actor,
  program: Pick<ProgramFacts, "leadId">,
): boolean {
  return (
    actor.editRecords ||
    (actor.employeeId !== null && program.leadId === actor.employeeId)
  );
}

/**
 * What the person has in the program itself: `MANAGE` (its lead, `EDIT_RECORDS`),
 * `WRITE` or `READ` from its list, `READ` from the Master grant, or `null` when
 * they reach it only through a project of theirs inside it.
 */
export function programAccessFor(
  actor: Actor,
  program: ProgramFacts,
): "MANAGE" | "WRITE" | "READ" | null {
  if (canManageProgram(actor, program)) return "MANAGE";
  const given =
    actor.employeeId === null ? undefined : program.levels[actor.employeeId];
  if (given === "WRITE") return "WRITE";
  if (given === "READ") return "READ";
  return actor.seesAll ? "READ" : null;
}

/**
 * Start a project in a program: its lead and `EDIT_RECORDS`, or somebody with
 * read-and-write who also passes today's rule (leads people or heads a
 * department). Read alone, and the Master grant alone, never.
 */
export function canCreateProjectIn(
  actor: Actor,
  program: ProgramFacts,
): boolean {
  if (canManageProgram(actor, program)) return true;
  const given =
    actor.employeeId === null ? undefined : program.levels[actor.employeeId];
  return given === "WRITE" && canCreateProject(actor);
}

export type Actor = {
  employeeId: string | null;
  /** Holds `EDIT_RECORDS`. */
  editRecords: boolean;
  /** Has anybody reporting to them. */
  leadsPeople: boolean;
  /** Heads at least one department. */
  headsDepartment: boolean;
  /**
   * Holds `SEE_ALL_WORK`: reads every project in the company and opens the Master
   * view. Optional, so a fixture from before it keeps compiling; absent reads as
   * "does not".
   */
  seesAll?: boolean;
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
