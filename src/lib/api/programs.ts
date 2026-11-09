"use client";

import { ApiError, request, requestPaged } from "@/lib/api/client";
import { toProject } from "@/lib/api/projects";
import type { ProgramLevel } from "@/lib/projects/access";
import {
  EMPTY_METRICS,
  type Metrics,
  type Program,
  type ProgramAccess,
  type ProgramPeople,
  type ProgramPerson,
  type ProgramRollup,
  type ProgramSummary,
  type ProjectRollupRow,
  type Week,
  type WorkBucket,
  type WorkPage,
  type WorkQuery,
  type WorkRollup,
  type WorkRow,
  type WorkStage,
  type Workload,
} from "@/lib/projects/programs";
import type {
  IssueType,
  Priority,
  Project,
  StatusCategory,
} from "@/lib/projects/types";

/**
 * Programs and the work across them: `/api/v1/programs` and `/api/v1/work`.
 *
 * The contract is "Backend as built" in `docs/specs/projects-hierarchy.md`. One
 * adapter, as `lib/api/projects.ts` is: every response is read through a `to…`
 * function that tolerates what is absent, so a small difference between this
 * client and the API's own shape is a change in one place.
 *
 * ## What the API decides, and this does not
 *
 * Who may see which program or project, what each person's level is, who may
 * start or move a project: all the API's (`accessFor`). The screens ask the
 * program's own `access`, `canManage` and `canCreateProject`, which the API
 * works out for the person asking, and draw only what will work.
 *
 * ## Errors worth knowing
 *
 * - **404 is also "you cannot see it"**, for a program as for a project.
 * - **403 with `details.reason === "read_only"`** is a person who can read a
 *   project changing it; the message is written to be shown as it is.
 * - **409** a program name taken, or deleting one that still holds projects.
 */

type Raw = Record<string, unknown>;

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;
const strOrNull = (v: unknown): string | null =>
  typeof v === "string" && v !== "" ? v : null;
const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const list = (v: unknown): Raw[] => (Array.isArray(v) ? (v as Raw[]) : []);
const obj = (v: unknown): Raw =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {};

const signalOf = (signal?: AbortSignal) => (signal ? { signal } : {});

const accessOf = (v: unknown): ProgramAccess =>
  v === "MANAGE" || v === "WRITE" || v === "READ" ? v : null;

export function toProgram(raw: Raw): Program {
  return {
    id: str(raw["id"]),
    name: str(raw["name"]),
    description: str(raw["description"]),
    color: str(raw["color"], "#2B3990"),
    departmentId: strOrNull(raw["departmentId"]),
    departmentName: strOrNull(raw["departmentName"]),
    leadId: str(raw["leadId"]),
    leadName: strOrNull(raw["leadName"]),
    archived: raw["archived"] === true,
    archivedAt: strOrNull(raw["archivedAt"]),
    access: accessOf(raw["access"]),
    canManage: raw["canManage"] === true,
    canCreateProject: raw["canCreateProject"] === true,
    projectCount: num(raw["projectCount"]),
    openTaskCount: num(raw["openTaskCount"]),
    accessCount:
      typeof raw["accessCount"] === "number"
        ? (raw["accessCount"] as number)
        : null,
    createdAt: str(raw["createdAt"]),
    updatedAt: str(raw["updatedAt"]),
  };
}

const levelOf = (v: unknown): ProgramLevel =>
  v === "WRITE" ? "WRITE" : "READ";

export function toPerson(raw: Raw): ProgramPerson {
  return {
    employeeId: str(raw["employeeId"]),
    name: str(raw["name"], "Someone"),
    jobTitle: str(raw["jobTitle"]),
    departmentId: strOrNull(raw["departmentId"]),
    departmentName: strOrNull(raw["departmentName"]),
    level: levelOf(raw["level"]),
  };
}

export function toPeople(raw: Raw): ProgramPeople {
  const lead = obj(raw["lead"]);
  return {
    lead: { id: str(lead["id"]), name: str(lead["name"], "Someone") },
    total: num(raw["total"]),
    capped: raw["capped"] === true,
    people: list(raw["people"]).map(toPerson),
  };
}

export function toMetrics(raw: Raw): Metrics {
  const by = obj(raw["byCategory"]);
  return {
    total: num(raw["total"]),
    open: num(raw["open"]),
    overdue: num(raw["overdue"]),
    dueThisWeek: num(raw["dueThisWeek"]),
    doneThisWeek: num(raw["doneThisWeek"]),
    byCategory: {
      TODO: num(by["TODO"]),
      IN_PROGRESS: num(by["IN_PROGRESS"]),
      DONE: num(by["DONE"]),
    },
  };
}

const toWeek = (raw: unknown): Week => {
  const w = obj(raw);
  return { start: str(w["start"]), end: str(w["end"]) };
};

function toWorkload(raw: Raw): Workload {
  const others = obj(raw["others"]);
  return {
    people: list(raw["people"]).map((p) => ({
      employeeId: str(p["employeeId"]),
      name: str(p["name"], "Someone"),
      open: num(p["open"]),
      overdue: num(p["overdue"]),
    })),
    others: {
      people: num(others["people"]),
      open: num(others["open"]),
      overdue: num(others["overdue"]),
    },
    totalPeople: num(raw["totalPeople"]),
    unassigned: num(raw["unassigned"]),
  };
}

function toRollupRow(raw: Raw): ProjectRollupRow {
  return {
    id: str(raw["id"]),
    key: str(raw["key"]),
    name: str(raw["name"]),
    color: str(raw["color"], "#2B3990"),
    type: str(raw["type"], "KANBAN") as Project["type"],
    leadId: str(raw["leadId"]),
    leadName: strOrNull(raw["leadName"]),
    ...toMetrics(raw),
  };
}

export function toProgramRollup(raw: Raw): ProgramRollup {
  return {
    program: toProgram(obj(raw["program"])),
    asOf: str(raw["asOf"]),
    week: toWeek(raw["week"]),
    totals: toMetrics(obj(raw["totals"])),
    projects: list(raw["projects"]).map(toRollupRow),
    workload: toWorkload(obj(raw["workload"])),
    capped: raw["capped"] === true,
  };
}

function toSummary(raw: Raw): ProgramSummary {
  return {
    id: str(raw["id"]),
    name: str(raw["name"]),
    color: str(raw["color"], "#2B3990"),
    archived: raw["archived"] === true,
    leadId: str(raw["leadId"]),
    leadName: strOrNull(raw["leadName"]),
    access: accessOf(raw["access"]),
    projects: num(raw["projects"]),
    ...toMetrics(raw),
  };
}

export function toWorkRollup(raw: Raw): WorkRollup {
  const loose = obj(raw["unassigned"]);
  return {
    asOf: str(raw["asOf"]),
    week: toWeek(raw["week"]),
    master: raw["master"] === true,
    totals: toMetrics(obj(raw["totals"])),
    programs: list(raw["programs"]).map(toSummary),
    unassigned: { projects: num(loose["projects"]), ...toMetrics(loose) },
    capped: raw["capped"] === true,
  };
}

/** The API sends resolved names; accept a bare name or an `{ id, name }`. */
function toAssignees(raw: Raw): { id: string; name: string }[] {
  const resolved = Array.isArray(raw["assignees"])
    ? (raw["assignees"] as unknown[])
    : [];
  return resolved.map((entry, index) => {
    if (typeof entry === "string") return { id: `${index}`, name: entry };
    const e = obj(entry);
    return {
      id: str(e["employeeId"] ?? e["id"], `${index}`),
      name: str(e["name"] ?? e["fullName"], "Someone"),
    };
  });
}

export function toWorkRow(raw: Raw): WorkRow {
  return {
    id: str(raw["id"]),
    key: str(raw["key"]),
    number: num(raw["number"]),
    type: str(raw["type"], "TASK") as IssueType,
    title: str(raw["title"]),
    projectId: str(raw["projectId"]),
    projectKey: str(raw["projectKey"]),
    projectName: str(raw["projectName"]),
    projectColor: str(raw["projectColor"], "#2B3990"),
    programId: strOrNull(raw["programId"]),
    programName: strOrNull(raw["programName"]),
    statusId: str(raw["statusId"]),
    statusName: str(raw["statusName"]),
    statusCategory: str(raw["statusCategory"], "TODO") as StatusCategory,
    priority: str(raw["priority"], "MEDIUM") as Priority,
    assigneeId: strOrNull(raw["assigneeId"]),
    assignees: toAssignees(raw),
    parentId: strOrNull(raw["parentId"]),
    epicId: strOrNull(raw["epicId"]),
    labels: Array.isArray(raw["labels"])
      ? (raw["labels"] as unknown[]).filter(
          (x): x is string => typeof x === "string",
        )
      : [],
    dueDate: strOrNull(raw["dueDate"])?.slice(0, 10) ?? null,
    dueTime: strOrNull(raw["dueTime"]),
    overdue: raw["overdue"] === true,
    doneAt: strOrNull(raw["doneAt"]),
    createdAt: str(raw["createdAt"]),
    updatedAt: str(raw["updatedAt"]),
  };
}

/** The query as the API spells it. `category` and `type` are comma lists. */
export function workQueryParams(
  query: WorkQuery,
  cursor: string | null,
): Record<string, string | undefined> {
  return {
    programId: query.programId,
    projectId: query.projectId,
    unassigned: query.unassigned ? "true" : undefined,
    assigneeId: query.assigneeId,
    category: query.category?.length ? query.category.join(",") : undefined,
    stage: query.stage?.length ? query.stage.join(",") : undefined,
    type: query.type?.length ? query.type.join(",") : undefined,
    dueBefore: query.dueBefore,
    dueAfter: query.dueAfter,
    bucket: query.bucket as WorkBucket | undefined,
    q: query.q?.trim() ? query.q.trim() : undefined,
    sort: query.sort,
    order: query.order,
    limit: query.limit ? String(query.limit) : undefined,
    cursor: cursor ?? undefined,
  };
}

export type ProgramList = {
  programs: Program[];
  /** May start a program. */
  canCreate: boolean;
  /** Holds the Master grant: show the Master view on this. */
  seesAll: boolean;
};

export type NewProgramBody = {
  name: string;
  description?: string;
  color?: string;
  departmentId?: string | null;
  leadId?: string;
};

export type ProgramPatchBody = Partial<{
  name: string;
  description: string;
  color: string;
  departmentId: string | null;
  leadId: string;
}>;

export type SeedResult = {
  departmentName: string;
  people: number;
  added: number;
  alreadyOn: number;
};

export const programsApi = {
  list: async (
    includeArchived = false,
    signal?: AbortSignal,
  ): Promise<ProgramList> => {
    const page = await requestPaged<
      Raw,
      { canCreate?: boolean; seesAll?: boolean }
    >("/programs", {
      query: { includeArchived: includeArchived ? "true" : undefined },
      ...signalOf(signal),
    });
    return {
      programs: list(page.data).map(toProgram),
      canCreate: page.meta.canCreate === true,
      seesAll: page.meta.seesAll === true,
    };
  },

  get: async (id: string, signal?: AbortSignal) =>
    toProgram(await request<Raw>(`/programs/${id}`, signalOf(signal))),

  create: async (body: NewProgramBody) =>
    toProgram(await request<Raw>("/programs", { method: "POST", body })),

  update: async (id: string, patch: ProgramPatchBody) =>
    toProgram(
      await request<Raw>(`/programs/${id}`, { method: "PATCH", body: patch }),
    ),

  archive: async (id: string) =>
    toProgram(
      await request<Raw>(`/programs/${id}/archive`, { method: "POST" }),
    ),

  unarchive: async (id: string) =>
    toProgram(
      await request<Raw>(`/programs/${id}/unarchive`, { method: "POST" }),
    ),

  rollup: async (id: string, signal?: AbortSignal) =>
    toProgramRollup(
      await request<Raw>(`/programs/${id}/rollup`, signalOf(signal)),
    ),

  /** The stage names in use across the projects in view, for a work list's Stage filter. */
  workStages: async (
    target: { programId?: string; unassigned?: boolean },
    signal?: AbortSignal,
  ): Promise<WorkStage[]> =>
    list(
      await request<Raw[]>(
        target.programId
          ? `/programs/${target.programId}/work/stages`
          : "/work/stages",
        {
          query: { unassigned: target.unassigned ? "true" : undefined },
          ...signalOf(signal),
        },
      ),
    ).map((raw) => ({
      name: typeof raw["name"] === "string" ? raw["name"] : "",
      category: (["TODO", "IN_PROGRESS", "DONE"] as const).includes(
        raw["category"] as StatusCategory,
      )
        ? (raw["category"] as StatusCategory)
        : "TODO",
      projectCount:
        typeof raw["projectCount"] === "number" ? raw["projectCount"] : 0,
    })),

  workRollup: async (signal?: AbortSignal) =>
    toWorkRollup(await request<Raw>("/work/rollup", signalOf(signal))),

  /** The people on a program's access list. Its lead and HR only: 403 for anybody else. */
  access: async (id: string, signal?: AbortSignal) =>
    toPeople(await request<Raw>(`/programs/${id}/access`, signalOf(signal))),

  addPeople: (id: string, employeeIds: string[], level: ProgramLevel) =>
    request<Raw>(`/programs/${id}/access`, {
      method: "POST",
      body: { employeeIds, level },
    }),

  setLevel: (id: string, employeeId: string, level: ProgramLevel) =>
    request<Raw>(`/programs/${id}/access/${employeeId}`, {
      method: "PATCH",
      body: { level },
    }),

  removePerson: (id: string, employeeId: string) =>
    request<Raw>(`/programs/${id}/access/${employeeId}`, { method: "DELETE" }),

  seed: async (
    id: string,
    level: ProgramLevel,
    departmentId?: string,
  ): Promise<SeedResult> => {
    const raw = await request<Raw>(`/programs/${id}/access/seed`, {
      method: "POST",
      body: { level, ...(departmentId ? { departmentId } : {}) },
    });
    return {
      departmentName: str(raw["departmentName"]),
      people: num(raw["people"]),
      added: Array.isArray(raw["added"])
        ? raw["added"].length
        : num(raw["added"]),
      alreadyOn: num(raw["alreadyOn"]),
    };
  },

  /** The projects of one program the caller may read, or the ones in none. */
  projects: async (
    target: { programId: string } | { unassigned: true },
    scopeAll = false,
    signal?: AbortSignal,
  ): Promise<Project[]> =>
    list(
      await request<Raw[]>("/projects", {
        query: {
          programId: "programId" in target ? target.programId : undefined,
          unassigned: "unassigned" in target ? "true" : undefined,
          scope: scopeAll ? "all" : undefined,
        },
        ...signalOf(signal),
      }),
    ).map(toProject),

  /** One page of work across projects, or across one program's. */
  work: async (
    query: WorkQuery,
    cursor: string | null,
    signal?: AbortSignal,
  ): Promise<WorkPage> => {
    const path = query.programId
      ? `/programs/${query.programId}/work`
      : "/work";
    const { programId: _program, ...rest } = query;
    void _program;
    const page = await requestPaged<
      Raw,
      { nextCursor?: string | null; limit?: number }
    >(path, {
      query: workQueryParams(query.programId ? rest : query, cursor),
      ...signalOf(signal),
    });
    return {
      rows: list(page.data).map(toWorkRow),
      total: page.meta.total,
      hasMore: page.meta.hasMore === true,
      nextCursor:
        typeof page.meta.nextCursor === "string" ? page.meta.nextCursor : null,
    };
  },

  /** Moves a project into a program, or out of one. Nothing else about it changes. */
  moveProject: async (projectId: string, programId: string | null) =>
    toProject(
      await request<Raw>(`/projects/${projectId}`, {
        method: "PATCH",
        body: { programId },
      }),
    ),
};

/** Whether a failure is a person who can read a project changing it. */
export function isReadOnlyRefusal(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 403) return false;
  const details = error.details;
  return (
    !!details &&
    !Array.isArray(details) &&
    (details as Record<string, unknown>)["reason"] === "read_only"
  );
}

export { EMPTY_METRICS };
