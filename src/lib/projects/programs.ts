/**
 * Programs: the shapes, and the arithmetic the demo does in place of the API.
 *
 * A program is a department or team's collection of projects (Operations,
 * Technology), one level above a project. The shapes here are what the API's
 * `/programs` and `/work` endpoints send (see "Backend as built" in
 * `docs/specs/projects-hierarchy.md`), read through `lib/api/programs.ts`.
 *
 * ## One engine, two callers
 *
 * Demo mode has no server, so the same rules the API applies are applied here to
 * the demo book: who may open which project (`accessFor`), what a program's card
 * counts, what a rollup says, what a page of work holds. The connected screens
 * never call these; the demo and the tests do. Everything is a pure function: no
 * React, no fetch, no clock. "Today" is an argument.
 *
 * ## What is counted
 *
 * Over the projects the viewer may open, never more: a person on one project of
 * a program sees that project's tasks and nothing of its siblings. Tasks, not
 * initiatives; subtasks count (as a project's own open count does). The week
 * runs Monday to Sunday.
 */

import {
  accessFor,
  canCreateProjectIn,
  canManageProgram,
  programAccessFor,
  type Actor,
  type ProgramFacts,
  type ProgramLevel,
  type ProjectAccess,
} from "./access";
import { addDays, dayToMs } from "./dates";
import { STATUS_CATEGORIES } from "./types";
import type {
  Issue,
  IssueType,
  Priority,
  Project,
  ProjectData,
  StatusCategory,
} from "./types";

/* ------------------------------------------------------------------ shapes -- */

/** What a person has in a program: its lead (`MANAGE`), a level, or nothing but a project of theirs. */
export type ProgramAccess = "MANAGE" | "WRITE" | "READ" | null;

export type Program = {
  id: string;
  name: string;
  description: string;
  /** `#RRGGBB`. */
  color: string;
  departmentId: string | null;
  departmentName: string | null;
  leadId: string;
  leadName: string | null;
  archived: boolean;
  archivedAt: string | null;
  access: ProgramAccess;
  canManage: boolean;
  canCreateProject: boolean;
  /** Of what the person asking can open. */
  projectCount: number;
  /** Open (not finished) tasks, initiatives excluded, of what they can open. */
  openTaskCount: number;
  /** The size of the access list, for people who manage it; null for everybody else. */
  accessCount: number | null;
  createdAt: string;
  updatedAt: string;
};

export type ProgramPerson = {
  employeeId: string;
  name: string;
  jobTitle: string;
  departmentId: string | null;
  departmentName: string | null;
  level: ProgramLevel;
};

export type ProgramPeople = {
  lead: { id: string; name: string };
  total: number;
  capped: boolean;
  people: ProgramPerson[];
};

export type Metrics = {
  total: number;
  open: number;
  overdue: number;
  dueThisWeek: number;
  doneThisWeek: number;
  byCategory: Record<StatusCategory, number>;
};

export const EMPTY_METRICS: Metrics = {
  total: 0,
  open: 0,
  overdue: 0,
  dueThisWeek: 0,
  doneThisWeek: 0,
  byCategory: { TODO: 0, IN_PROGRESS: 0, DONE: 0 },
};

export type ProjectRollupRow = Metrics & {
  id: string;
  key: string;
  name: string;
  color: string;
  type: Project["type"];
  leadId: string;
  leadName: string | null;
};

export type WorkloadPerson = {
  employeeId: string;
  name: string;
  open: number;
  overdue: number;
};

export type Workload = {
  /** The busiest ten by open tasks. */
  people: WorkloadPerson[];
  /** Everybody past ten, rolled up. */
  others: { people: number; open: number; overdue: number };
  totalPeople: number;
  /** Open tasks with nobody on them. */
  unassigned: number;
};

export type Week = { start: string; end: string };

export type ProgramRollup = {
  program: Program;
  asOf: string;
  week: Week;
  totals: Metrics;
  projects: ProjectRollupRow[];
  workload: Workload;
  capped: boolean;
};

export type ProgramSummary = Metrics & {
  id: string;
  name: string;
  color: string;
  archived: boolean;
  leadId: string;
  leadName: string | null;
  access: ProgramAccess;
  projects: number;
};

export type WorkRollup = {
  asOf: string;
  week: Week;
  /** The Master grant's flag: show the Master view on this, not on how much came back. */
  master: boolean;
  totals: Metrics;
  programs: ProgramSummary[];
  unassigned: Metrics & { projects: number };
  capped: boolean;
};

export type WorkBucket = "open" | "overdue" | "dueThisWeek" | "doneThisWeek";

export type WorkSort = "due" | "updated" | "created" | "done" | "title";

export type WorkQuery = {
  programId?: string;
  projectId?: string;
  unassigned?: boolean;
  /** An employee id, or `none` for nobody on it. */
  assigneeId?: string;
  category?: readonly StatusCategory[];
  /**
   * Stage names, matched in any case across projects: each project names its own
   * stages, so "In review" finds that stage wherever it exists. ANDed with `category`.
   */
  stage?: readonly string[];
  type?: readonly IssueType[];
  /** `YYYY-MM-DD`, both exclusive. */
  dueBefore?: string;
  dueAfter?: string;
  bucket?: WorkBucket;
  q?: string;
  sort?: WorkSort;
  order?: "asc" | "desc";
  limit?: number;
};

export type WorkRow = {
  id: string;
  key: string;
  number: number;
  type: IssueType;
  title: string;
  projectId: string;
  projectKey: string;
  projectName: string;
  projectColor: string;
  programId: string | null;
  programName: string | null;
  statusId: string;
  /** The project's own name for the stage. */
  statusName: string;
  /** What compares across projects. */
  statusCategory: StatusCategory;
  priority: Priority;
  assigneeId: string | null;
  assignees: { id: string; name: string }[];
  parentId: string | null;
  epicId: string | null;
  labels: string[];
  dueDate: string | null;
  dueTime: string | null;
  overdue: boolean;
  doneAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkPage = {
  rows: WorkRow[];
  /** Everything the filters match, on every page. */
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
};

/** The ids a bucket page URL and a tile agree on. */
export const WORK_BUCKETS: readonly WorkBucket[] = [
  "open",
  "overdue",
  "dueThisWeek",
  "doneThisWeek",
];

/* -------------------------------------------------------- the demo's scene -- */

/** What the demo keeps of a program. The rest is worked out per viewer. */
export type StoredProgram = {
  id: string;
  name: string;
  description: string;
  color: string;
  departmentId: string | null;
  departmentName: string | null;
  leadId: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Scene = {
  programs: Readonly<Record<string, StoredProgram>>;
  /** program id to employee id to level. The lead is never listed. */
  access: Readonly<Record<string, Readonly<Record<string, ProgramLevel>>>>;
  projects: readonly ProjectData[];
};

export type Viewer = {
  actor: Actor;
  today: string;
  /** The calendar day an instant falls on in the company's zone. */
  dayOf: (instant: string) => string | null;
  nameOf: (employeeId: string | null | undefined) => string;
  jobTitleOf?: (employeeId: string) => string;
  departmentOf?: (employeeId: string) => {
    id: string | null;
    name: string | null;
  };
};

export function factsOf(scene: Scene, programId: string | null | undefined) {
  if (!programId) return null;
  const program = scene.programs[programId];
  if (!program) return null;
  const facts: ProgramFacts = {
    leadId: program.leadId,
    levels: scene.access[programId] ?? {},
  };
  return facts;
}

/** What the viewer may do in one project of the scene. */
export function projectAccessIn(
  scene: Scene,
  viewer: Viewer,
  project: Pick<Project, "leadId" | "memberIds" | "programId">,
): ProjectAccess {
  return accessFor(viewer.actor, project, factsOf(scene, project.programId));
}

/** The projects the viewer may open, with the card fields the API adds. */
export function visibleProjects(scene: Scene, viewer: Viewer): ProjectData[] {
  const out: ProjectData[] = [];
  for (const data of scene.projects) {
    const access = projectAccessIn(scene, viewer, data.project);
    if (access === "NONE") continue;
    out.push({ ...data, project: decorate(scene, data.project, access) });
  }
  return out;
}

/** A project card with the program it is in and what the viewer may do there. */
export function decorate(
  scene: Scene,
  project: Project,
  access: ProjectAccess,
): Project {
  const program = project.programId ? scene.programs[project.programId] : null;
  return {
    ...project,
    programId: program ? program.id : null,
    programName: program ? program.name : null,
    programColor: program ? program.color : null,
    access: access === "NONE" ? null : access,
    canWrite: access === "WRITE" || access === "MANAGE",
    canManage: access === "MANAGE",
  };
}

/* ----------------------------------------------------------- the calendar -- */

/** The Monday to Sunday week that holds `today`; `end` is the next Monday. */
export function weekOf(today: string): Week {
  const ms = dayToMs(today);
  if (ms === null) return { start: today, end: today };
  const weekday = new Date(ms).getUTCDay();
  const sinceMonday = (weekday + 6) % 7;
  const start = addDays(today, -sinceMonday);
  return { start, end: addDays(start, 7) };
}

/* --------------------------------------------------------------- counting -- */

const isTask = (issue: Issue) => issue.type !== "EPIC";

function categoryOf(project: Project, issue: Issue): StatusCategory {
  return (
    project.statuses.find((s) => s.id === issue.statusId)?.category ?? "TODO"
  );
}

/** Whether one task is overdue, open, due this week or done this week. */
function flags(
  project: Project,
  issue: Issue,
  today: string,
  week: Week,
  dayOf: (instant: string) => string | null,
) {
  const category = categoryOf(project, issue);
  const open = category !== "DONE";
  const overdue = open && !!issue.dueDate && issue.dueDate < today;
  const dueThisWeek =
    open &&
    !overdue &&
    !!issue.dueDate &&
    issue.dueDate >= today &&
    issue.dueDate < week.end;
  const done = issue.doneAt ? dayOf(issue.doneAt) : null;
  const doneThisWeek =
    category === "DONE" &&
    done !== null &&
    done >= week.start &&
    done < week.end;
  return { category, open, overdue, dueThisWeek, doneThisWeek };
}

export function metricsOf(
  projects: readonly ProjectData[],
  today: string,
  dayOf: (instant: string) => string | null,
): Metrics {
  const week = weekOf(today);
  const m: Metrics = {
    ...EMPTY_METRICS,
    byCategory: { TODO: 0, IN_PROGRESS: 0, DONE: 0 },
  };
  for (const { project, issues } of projects) {
    for (const issue of issues) {
      if (!isTask(issue)) continue;
      const f = flags(project, issue, today, week, dayOf);
      m.total += 1;
      m.byCategory[f.category] += 1;
      if (f.open) m.open += 1;
      if (f.overdue) m.overdue += 1;
      if (f.dueThisWeek) m.dueThisWeek += 1;
      if (f.doneThisWeek) m.doneThisWeek += 1;
    }
  }
  return m;
}

/* --------------------------------------------------------------- programs -- */

export function programVisible(
  scene: Scene,
  viewer: Viewer,
  program: StoredProgram,
): boolean {
  const facts = factsOf(scene, program.id)!;
  if (viewer.actor.editRecords || viewer.actor.seesAll) return true;
  if (programAccessFor(viewer.actor, facts) !== null) return true;
  return scene.projects.some(
    (d) =>
      d.project.programId === program.id &&
      projectAccessIn(scene, viewer, d.project) !== "NONE",
  );
}

export function toProgram(
  scene: Scene,
  viewer: Viewer,
  stored: StoredProgram,
): Program {
  const facts = factsOf(scene, stored.id)!;
  const mine = visibleProjects(scene, viewer).filter(
    (d) => d.project.programId === stored.id,
  );
  const canManage = canManageProgram(viewer.actor, facts);
  return {
    id: stored.id,
    name: stored.name,
    description: stored.description,
    color: stored.color,
    departmentId: stored.departmentId,
    departmentName: stored.departmentName,
    leadId: stored.leadId,
    leadName: viewer.nameOf(stored.leadId),
    archived: stored.archivedAt !== null,
    archivedAt: stored.archivedAt,
    access: programAccessFor(viewer.actor, facts),
    canManage,
    canCreateProject:
      stored.archivedAt === null && canCreateProjectIn(viewer.actor, facts),
    projectCount: mine.length,
    openTaskCount: metricsOf(mine, viewer.today, viewer.dayOf).open,
    accessCount: canManage
      ? Object.keys(scene.access[stored.id] ?? {}).length
      : null,
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
  };
}

/** Every program the viewer can see, by name. Archived ones only when asked. */
export function programsFor(
  scene: Scene,
  viewer: Viewer,
  includeArchived = false,
): Program[] {
  return Object.values(scene.programs)
    .filter((p) => includeArchived || p.archivedAt === null)
    .filter((p) => programVisible(scene, viewer, p))
    .map((p) => toProgram(scene, viewer, p))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function programPeople(
  scene: Scene,
  viewer: Viewer,
  programId: string,
): ProgramPeople | null {
  const stored = scene.programs[programId];
  if (!stored) return null;
  const levels = scene.access[programId] ?? {};
  const people: ProgramPerson[] = Object.entries(levels)
    .map(([employeeId, level]) => {
      const dept = viewer.departmentOf?.(employeeId);
      return {
        employeeId,
        name: viewer.nameOf(employeeId),
        jobTitle: viewer.jobTitleOf?.(employeeId) ?? "",
        departmentId: dept?.id ?? null,
        departmentName: dept?.name ?? null,
        level,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    lead: { id: stored.leadId, name: viewer.nameOf(stored.leadId) },
    total: people.length,
    capped: false,
    people,
  };
}

/* ---------------------------------------------------------------- rollups -- */

function workloadOf(
  projects: readonly ProjectData[],
  viewer: Viewer,
): Workload {
  const week = weekOf(viewer.today);
  const per = new Map<string, { open: number; overdue: number }>();
  let unassigned = 0;
  for (const { project, issues } of projects) {
    for (const issue of issues) {
      if (!isTask(issue)) continue;
      const f = flags(project, issue, viewer.today, week, viewer.dayOf);
      if (!f.open) continue;
      const ids = issue.assigneeIds.length
        ? issue.assigneeIds
        : issue.assigneeId
          ? [issue.assigneeId]
          : [];
      if (ids.length === 0) unassigned += 1;
      for (const id of ids) {
        const row = per.get(id) ?? { open: 0, overdue: 0 };
        row.open += 1;
        if (f.overdue) row.overdue += 1;
        per.set(id, row);
      }
    }
  }
  const sorted = [...per.entries()]
    .map(([employeeId, row]) => ({
      employeeId,
      name: viewer.nameOf(employeeId),
      ...row,
    }))
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
  const rest = sorted.slice(10);
  return {
    people: sorted.slice(0, 10),
    others: {
      people: rest.length,
      open: rest.reduce((n, p) => n + p.open, 0),
      overdue: rest.reduce((n, p) => n + p.overdue, 0),
    },
    totalPeople: sorted.length,
    unassigned,
  };
}

export function programRollup(
  scene: Scene,
  viewer: Viewer,
  programId: string,
  asOf: string,
): ProgramRollup | null {
  const stored = scene.programs[programId];
  if (!stored || !programVisible(scene, viewer, stored)) return null;
  const mine = visibleProjects(scene, viewer).filter(
    (d) => d.project.programId === programId,
  );
  return {
    program: toProgram(scene, viewer, stored),
    asOf,
    week: weekOf(viewer.today),
    totals: metricsOf(mine, viewer.today, viewer.dayOf),
    projects: mine
      .map((d) => ({
        id: d.project.id,
        key: d.project.key,
        name: d.project.name,
        color: d.project.color,
        type: d.project.type,
        leadId: d.project.leadId,
        leadName: viewer.nameOf(d.project.leadId),
        ...metricsOf([d], viewer.today, viewer.dayOf),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    workload: workloadOf(mine, viewer),
    capped: false,
  };
}

export function workRollup(
  scene: Scene,
  viewer: Viewer,
  asOf: string,
): WorkRollup {
  const visible = visibleProjects(scene, viewer);
  const programs = Object.values(scene.programs)
    .filter((p) => programVisible(scene, viewer, p))
    .map((p): ProgramSummary => {
      const mine = visible.filter((d) => d.project.programId === p.id);
      return {
        id: p.id,
        name: p.name,
        color: p.color,
        archived: p.archivedAt !== null,
        leadId: p.leadId,
        leadName: viewer.nameOf(p.leadId),
        access: programAccessFor(viewer.actor, factsOf(scene, p.id)!),
        projects: mine.length,
        ...metricsOf(mine, viewer.today, viewer.dayOf),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const loose = visible.filter((d) => !d.project.programId);
  return {
    asOf,
    week: weekOf(viewer.today),
    master: viewer.actor.seesAll === true,
    totals: metricsOf(visible, viewer.today, viewer.dayOf),
    programs,
    unassigned: {
      projects: loose.length,
      ...metricsOf(loose, viewer.today, viewer.dayOf),
    },
    capped: false,
  };
}

/* ------------------------------------------------------------------- work -- */

function rowOf(
  scene: Scene,
  viewer: Viewer,
  project: Project,
  issue: Issue,
  week: Week,
): WorkRow {
  const status = project.statuses.find((s) => s.id === issue.statusId);
  const f = flags(project, issue, viewer.today, week, viewer.dayOf);
  const ids = issue.assigneeIds.length
    ? issue.assigneeIds
    : issue.assigneeId
      ? [issue.assigneeId]
      : [];
  const program = project.programId ? scene.programs[project.programId] : null;
  return {
    id: issue.id,
    key: issue.key,
    number: issue.number,
    type: issue.type,
    title: issue.title,
    projectId: project.id,
    projectKey: project.key,
    projectName: project.name,
    projectColor: project.color,
    programId: program?.id ?? null,
    programName: program?.name ?? null,
    statusId: issue.statusId,
    statusName: status?.name ?? "",
    statusCategory: f.category,
    priority: issue.priority,
    assigneeId: ids[0] ?? null,
    assignees: ids.map((id) => ({ id, name: viewer.nameOf(id) })),
    parentId: issue.parentId,
    epicId: issue.epicId,
    labels: issue.labels,
    dueDate: issue.dueDate,
    dueTime: issue.dueTime ?? null,
    overdue: f.overdue,
    doneAt: issue.doneAt,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
  };
}

const DEFAULT_LIMIT = 50;

/**
 * One page of work across the projects the viewer may open.
 *
 * The same filters, sort and bucket words as `GET /work`. A bucket is exactly
 * what the rollup counts under that name, so a tile and its list agree. The
 * cursor here is an offset; the API's is opaque and this one is too, to a
 * caller.
 */
export function workPage(
  scene: Scene,
  viewer: Viewer,
  query: WorkQuery,
  cursor: string | null = null,
): WorkPage {
  const week = weekOf(viewer.today);
  const types = query.type ? new Set<IssueType>(query.type) : null;
  const categories = query.category ? new Set(query.category) : null;
  const stageNames = query.stage?.length
    ? new Set(query.stage.map((name) => name.trim().toLowerCase()))
    : null;
  const needle = (query.q ?? "").trim().toLowerCase();

  const rows: WorkRow[] = [];
  for (const { project, issues } of visibleProjects(scene, viewer)) {
    if (query.projectId && project.id !== query.projectId) continue;
    if (query.programId && project.programId !== query.programId) continue;
    if (query.unassigned && project.programId) continue;
    for (const issue of issues) {
      if (types ? !types.has(issue.type) : !isTask(issue)) continue;
      const f = flags(project, issue, viewer.today, week, viewer.dayOf);
      if (categories && !categories.has(f.category)) continue;
      if (stageNames) {
        const name = project.statuses.find(
          (st) => st.id === issue.statusId,
        )?.name;
        if (!name || !stageNames.has(name.trim().toLowerCase())) continue;
      }
      if (query.bucket && !f[query.bucket]) continue;
      if (query.assigneeId) {
        const ids = issue.assigneeIds.length
          ? issue.assigneeIds
          : issue.assigneeId
            ? [issue.assigneeId]
            : [];
        if (
          query.assigneeId === "none"
            ? ids.length > 0
            : !ids.includes(query.assigneeId)
        )
          continue;
      }
      if (
        query.dueBefore &&
        !(issue.dueDate && issue.dueDate < query.dueBefore)
      )
        continue;
      if (query.dueAfter && !(issue.dueDate && issue.dueDate > query.dueAfter))
        continue;
      if (
        needle &&
        !issue.title.toLowerCase().includes(needle) &&
        !issue.key.toLowerCase().includes(needle)
      )
        continue;
      rows.push(rowOf(scene, viewer, project, issue, week));
    }
  }

  const sort = query.sort ?? "due";
  const dir = (query.order ?? "asc") === "asc" ? 1 : -1;
  const value = (row: WorkRow): string | null =>
    sort === "due"
      ? row.dueDate
      : sort === "updated"
        ? row.updatedAt
        : sort === "created"
          ? row.createdAt
          : sort === "done"
            ? row.doneAt
            : row.title.toLowerCase();
  rows.sort((a, b) => {
    const x = value(a);
    const y = value(b);
    /* No value (no deadline, not finished) is last in both directions. */
    if (x === null && y !== null) return 1;
    if (y === null && x !== null) return -1;
    if (x !== null && y !== null && x !== y) return x < y ? -dir : dir;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), 200);
  const from = cursor ? Math.max(Number.parseInt(cursor, 10) || 0, 0) : 0;
  const page = rows.slice(from, from + limit);
  const end = from + page.length;
  return {
    rows: page,
    total: rows.length,
    hasMore: end < rows.length,
    nextCursor: end < rows.length ? String(end) : null,
  };
}

/** A work query that names no program, project or filter: everything the viewer may open. */
export const EVERYTHING: WorkQuery = {};

export { STATUS_CATEGORIES };

/* ---------------------------------------------------------------- stages -- */

/** One stage name in use across the projects in view, for a work list's Stage filter. */
export type WorkStage = {
  name: string;
  category: StatusCategory;
  projectCount: number;
};

const CATEGORY_RANK: Record<StatusCategory, number> = {
  TODO: 0,
  IN_PROGRESS: 1,
  DONE: 2,
};

/**
 * The distinct stage names across these projects, the way `GET /work/stages` gives
 * them: once each whatever the case, with the category most projects give the name,
 * ordered by category, then by where the stage usually sits, then by name.
 */
export function workStagesOf(
  projects: readonly Pick<Project, "id" | "statuses">[],
): WorkStage[] {
  type Tally = {
    name: string;
    projects: Set<string>;
    categories: Map<StatusCategory, number>;
    positionSum: number;
    seen: number;
  };
  const byName = new Map<string, Tally>();
  for (const project of projects) {
    for (const status of project.statuses) {
      const key = status.name.trim().toLowerCase();
      let tally = byName.get(key);
      if (!tally) {
        tally = {
          name: status.name.trim(),
          projects: new Set(),
          categories: new Map(),
          positionSum: 0,
          seen: 0,
        };
        byName.set(key, tally);
      }
      tally.projects.add(project.id);
      tally.categories.set(
        status.category,
        (tally.categories.get(status.category) ?? 0) + 1,
      );
      tally.positionSum += status.position;
      tally.seen += 1;
    }
  }
  return [...byName.values()]
    .map((tally) => {
      let category: StatusCategory = "TODO";
      let best = -1;
      for (const [cat, count] of tally.categories) {
        if (count > best) {
          best = count;
          category = cat;
        }
      }
      return {
        stage: {
          name: tally.name,
          category,
          projectCount: tally.projects.size,
        },
        position: tally.positionSum / tally.seen,
      };
    })
    .sort(
      (a, b) =>
        CATEGORY_RANK[a.stage.category] - CATEGORY_RANK[b.stage.category] ||
        a.position - b.position ||
        a.stage.name.localeCompare(b.stage.name),
    )
    .map((entry) => entry.stage);
}
