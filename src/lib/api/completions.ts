"use client";

import { requestPaged } from "@/lib/api/client";
import { toIssueObjective } from "@/lib/api/projects";
import {
  newestFirst,
  type CompletedWork,
  type Completion,
  type CompletionSummary,
  type ObjectiveCount,
  type PersonCompletions,
  type ProjectCount,
  type WorkThisCycle,
} from "@/lib/projects/completions";
import type { ObjectiveLevel } from "@/lib/projects/objectives";

/**
 * Completed work, over the wire: the manager's Completed view, the work inside a
 * review, and the work under an objective or KPI.
 *
 * The contract is "Phase 1 backend as built" in
 * `docs/specs/projects-performance-link.md`. Every read goes through a `to…`
 * function that claims only what the API said: an unlinked task has an
 * `UNLINKED` objective (which is not a fault), a missing due date is `onTime:
 * null` (neither on time nor late), and nothing here invents a grade, a score or
 * a reason to worry. The API sends no grade on any of these reads and neither
 * does this.
 *
 * ## Paging
 *
 * All three are keyset-paged by position (person by name, then newest first): a
 * page is `limit` tasks, `meta.nextCursor` goes back untouched as `cursor`, and a
 * person can be cut across two pages, in which case their next tasks are appended
 * to the group already shown.
 */

type Raw = Record<string, unknown>;

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;
const strOrNull = (v: unknown): string | null =>
  typeof v === "string" && v !== "" ? v : null;
const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const list = (v: unknown): Raw[] => (Array.isArray(v) ? (v as Raw[]) : []);
const obj = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const isLevel = (v: unknown): v is ObjectiveLevel =>
  v === "company" || v === "department" || v === "personal";

/** One finished task, as `CompletedItem` sends it. Never has a grade on it. */
export function toCompletion(
  raw: Raw,
  person?: { id: string; name: string },
): Completion {
  const dueDate = strOrNull(raw["dueDate"])?.slice(0, 10) ?? null;
  const onTime =
    dueDate === null
      ? null
      : typeof raw["onTime"] === "boolean"
        ? raw["onTime"]
        : raw["timing"] === "ON_TIME"
          ? true
          : raw["timing"] === "LATE"
            ? false
            : null;
  const doneAt = str(raw["doneAt"]);
  const objective = toIssueObjective(raw["objective"], null, null);
  /* An item under an objective above the KPI it is listed beneath says at which
     level, by that objective's own level. */
  const above = raw["linkedAt"] === "ANCESTOR" && isLevel(objective.level);
  return {
    id: str(raw["id"]),
    key: str(raw["key"]),
    title: str(raw["title"]),
    projectId: str(raw["projectId"]),
    projectName: str(raw["projectName"]),
    personal: raw["personal"] === true,
    personId: str(raw["employeeId"]) || (person?.id ?? ""),
    personName: person?.name ?? "Someone",
    doneAt,
    doneDay: strOrNull(raw["finishedOn"]) ?? doneAt.slice(0, 10),
    dueDate,
    onTime,
    objective,
    canOpen: raw["canOpen"] !== false,
    ...(above ? { linkedAt: objective.level as ObjectiveLevel } : {}),
  };
}

/** `Totals` as the API sends it, read as the figures a screen shows. */
export function toSummary(raw: unknown): CompletionSummary {
  const r = obj(raw);
  const withDueDate = num(r["withDueDate"]);
  const onTime = num(r["onTime"]);
  return {
    finished: num(r["finished"]),
    withDueDate,
    onTime,
    late: typeof r["late"] === "number" ? num(r["late"]) : withDueDate - onTime,
    linked: num(r["linked"]),
  };
}

function toPersonFacts(raw: unknown): {
  id: string;
  name: string;
  jobTitle: string;
  departmentName: string | null;
} {
  const r = obj(raw);
  return {
    id: str(r["id"]),
    name: str(r["name"], "Someone"),
    jobTitle: str(r["jobTitle"]),
    departmentName: strOrNull(r["departmentName"]),
  };
}

/* ------------------------------------------------------ the manager's view */

/**
 * One row of the Completed view: a finished task, with who it is credited to and
 * that person's whole totals for the period (the API sends them on every page, so
 * a person cut across two pages keeps the same figures).
 */
export type TeamRow = Completion & {
  jobTitle: string;
  departmentName: string | null;
  totals: CompletionSummary;
};

export type TeamCompletedPage = {
  rows: TeamRow[];
  total: number;
  next: string | null;
};

export function toTeamCompletedPage(data: Raw, meta: Raw): TeamCompletedPage {
  const rows: TeamRow[] = [];
  for (const group of list(data["people"])) {
    const employee = toPersonFacts(group["employee"]);
    const totals = toSummary(group);
    for (const item of list(group["items"])) {
      rows.push({
        ...toCompletion(item, employee),
        personId: str(item["employeeId"]) || employee.id,
        personName: employee.name,
        jobTitle: employee.jobTitle,
        departmentName: employee.departmentName,
        totals,
      });
    }
  }
  return {
    rows,
    total: num(meta["total"], rows.length),
    next: strOrNull(meta["nextCursor"]),
  };
}

/* ----------------------------------------------------------- inside a review */

function toProjectCounts(raw: unknown): ProjectCount[] {
  return list(raw).map((row) => ({
    projectId: str(row["projectId"]),
    projectName: str(row["projectName"], "A project"),
    finished: num(row["finished"]),
  }));
}

function toObjectiveCounts(raw: unknown): ObjectiveCount[] {
  return list(raw).map((row) => {
    const visible = row["visible"] !== false;
    return {
      goalId: strOrNull(row["goalId"]),
      title: strOrNull(row["title"]),
      keyResultTitle: strOrNull(row["keyResultLabel"]),
      unlinked: row["state"] === "UNLINKED",
      visible,
      finished: num(row["finished"]),
    };
  });
}

/**
 * `GET /performance/cycles/:cycleId/employees/:employeeId/work`, read as the panel
 * inside a review. `null` when the cycle states no dates: there is no stretch to
 * read, and the panel is hidden rather than shown empty.
 */
export function toWorkThisCycle(data: Raw, meta: Raw): WorkThisCycle | null {
  if (data["available"] === false) return null;
  const employee = toPersonFacts(data["employee"]);
  const items = list(data["items"])
    .map((item) => toCompletion(item, employee))
    .sort(newestFirst);
  return {
    summary: toSummary(data["summary"]),
    byProject: toProjectCounts(data["byProject"]),
    byObjective: toObjectiveCounts(data["byObjective"]),
    items,
    total: num(meta["total"], items.length),
    capped: meta["hasMore"] === true,
  };
}

/* --------------------------------------------------- under an objective or KPI */

/** `GET /performance/goals/:id/work`, grouped by person. */
export function toCompletedWork(data: Raw, meta: Raw): CompletedWork {
  const groups: PersonCompletions[] = list(data["people"]).map((group) => {
    const employee = toPersonFacts(group["employee"]);
    return {
      personId: employee.id,
      personName: employee.name,
      items: list(group["items"])
        .map((item) => toCompletion(item, employee))
        .sort(newestFirst),
    };
  });
  const shown = groups.reduce((n, g) => n + g.items.length, 0);
  return {
    groups,
    total: Math.max(num(meta["total"], shown), shown),
    capped: meta["hasMore"] === true,
  };
}

export type TeamCompletedParams = {
  period: "week" | "month" | "quarter";
  date?: string | undefined;
  /** One person only: somebody the reader leads (anybody, for HR), or themselves. */
  employeeId?: string | undefined;
  cursor?: string | null | undefined;
  limit?: number | undefined;
};

export const completionsApi = {
  /** What the people you lead finished in a period. Paged by position. */
  teamCompleted: async (
    params: TeamCompletedParams,
    signal?: AbortSignal,
  ): Promise<TeamCompletedPage> => {
    const res = await requestPaged<Raw, Raw>("/performance/team/completed", {
      query: {
        period: params.period,
        date: params.date,
        employeeId: params.employeeId,
        cursor: params.cursor ?? undefined,
        limit: params.limit,
      },
      ...(signal ? { signal } : {}),
    });
    return toTeamCompletedPage(
      res.data as unknown as Raw,
      res.meta as unknown as Raw,
    );
  },

  /** What somebody finished in a review cycle's dates, for the review forms. */
  workForCycle: async (
    cycleId: string,
    employeeId: string,
    params: { limit?: number },
    signal?: AbortSignal,
  ): Promise<WorkThisCycle | null> => {
    const res = await requestPaged<Raw, Raw>(
      `/performance/cycles/${cycleId}/employees/${employeeId}/work`,
      { query: { limit: params.limit }, ...(signal ? { signal } : {}) },
    );
    return toWorkThisCycle(
      res.data as unknown as Raw,
      res.meta as unknown as Raw,
    );
  },

  /** The completed work linked to one objective or KPI, by person. */
  completedWork: async (
    goalId: string,
    params: { limit?: number },
    signal?: AbortSignal,
  ): Promise<CompletedWork> => {
    const res = await requestPaged<Raw, Raw>(
      `/performance/goals/${goalId}/work`,
      { query: { limit: params.limit }, ...(signal ? { signal } : {}) },
    );
    return toCompletedWork(
      res.data as unknown as Raw,
      res.meta as unknown as Raw,
    );
  },
};
