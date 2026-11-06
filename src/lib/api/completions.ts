"use client";

import { request, requestPaged } from "@/lib/api/client";
import type { ApiWorkRecord } from "@/lib/api/performance";
import {
  byProject,
  newestFirst,
  summarise,
  type CompletedWork,
  type Completion,
  type CompletionObjective,
  type PersonCompletions,
  type TeamCompleted,
  type TeamCompletedPerson,
  type WorkThisCycle,
} from "@/lib/projects/completions";
import type { ObjectiveLevel } from "@/lib/projects/objectives";

/**
 * Completed work, over the wire: the manager's Completed view, the work inside a
 * review, and the work under an objective.
 *
 * Every read goes through a `to…` function that tolerates what is absent and
 * claims only what the API said: an unlinked task has `objective: null`, a
 * missing due date is `onTime: null` (neither on time nor late), and nothing here
 * ever invents a grade, a score or a reason to worry.
 */

type Raw = Record<string, unknown>;

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;
const strOrNull = (v: unknown): string | null =>
  typeof v === "string" && v !== "" ? v : null;
const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const list = (v: unknown): Raw[] => (Array.isArray(v) ? (v as Raw[]) : []);
const isLevel = (v: unknown): v is ObjectiveLevel =>
  v === "company" || v === "department" || v === "personal";

/** The objective a completed task is linked to, or `null` for none. */
export function toObjectiveRef(raw: unknown): CompletionObjective | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  const goalId = strOrNull(r["goalId"]) ?? strOrNull(r["id"]);
  if (!goalId) return null;
  return {
    goalId,
    title: str(r["title"], "An objective"),
    level: isLevel(r["level"]) ? r["level"] : "personal",
    keyResultId: strOrNull(r["keyResultId"]),
    keyResultTitle: strOrNull(r["keyResultTitle"]),
    closed: r["closed"] === true,
  };
}

/** One finished task. Never has a grade on it. */
export function toCompletion(raw: Raw): Completion {
  const dueDate = strOrNull(raw["dueDate"]);
  const onTime =
    typeof raw["onTime"] === "boolean" && dueDate !== null
      ? raw["onTime"]
      : null;
  const person = (raw["person"] ?? raw["employee"] ?? {}) as Raw;
  const doneAt = str(raw["doneAt"]);
  const level = strOrNull(raw["linkedAt"]);
  return {
    id: str(raw["id"]),
    key: str(raw["key"]),
    title: str(raw["title"]),
    projectId: str(raw["projectId"]),
    projectName: str(raw["projectName"]),
    personal: /^MY-\d+$/i.test(str(raw["key"])),
    personId: str(raw["personId"] ?? person["id"]),
    personName: str(raw["personName"] ?? person["name"], "Someone"),
    doneAt,
    doneDay: str(raw["doneDay"]) || doneAt.slice(0, 10),
    dueDate,
    onTime,
    objective: toObjectiveRef(raw["objective"]),
    ...(isLevel(level) ? { linkedAt: level } : {}),
  };
}

function toPerson(raw: Raw): TeamCompletedPerson {
  const emp = (raw["employee"] ?? {}) as Raw;
  const items = list(raw["items"] ?? raw["tasks"]).map((row) =>
    toCompletion({
      ...row,
      personId: str(row["personId"]) || str(emp["id"]),
      personName: str(row["personName"]) || str(emp["name"]),
    }),
  );
  return {
    employee: {
      id: str(emp["id"]),
      name: str(emp["name"], "Someone"),
      jobTitle: str(emp["jobTitle"]),
      departmentName: strOrNull(emp["departmentName"]),
    },
    summary: summarise(items),
    items,
    itemsTotal: Math.max(num(raw["itemsTotal"], items.length), items.length),
  };
}

export function toTeamCompleted(raw: Raw): TeamCompleted {
  const period = (raw["period"] ?? {}) as Raw;
  return {
    period: {
      kind: str(period["kind"]),
      start: str(period["start"]),
      end: str(period["end"]),
      label: str(period["label"]),
    },
    people: list(raw["people"]).map(toPerson),
  };
}

export function toCompletedWork(raw: Raw): CompletedWork {
  const groups: PersonCompletions[] = list(raw["groups"] ?? raw["people"]).map(
    (g) => {
      const person = (g["person"] ?? g["employee"] ?? g) as Raw;
      const personId = str(person["id"] ?? g["personId"]);
      const personName = str(person["name"] ?? g["personName"], "Someone");
      return {
        personId,
        personName,
        items: list(g["items"])
          .map((row) => toCompletion({ ...row, personId, personName }))
          .sort(newestFirst),
      };
    },
  );
  const shown = groups.reduce((n, g) => n + g.items.length, 0);
  return {
    groups,
    total: Math.max(num(raw["total"], shown), shown),
    capped: raw["capped"] === true,
  };
}

/** A work record for a review period, read as the panel inside the review. */
export function workRecordToThisCycle(
  record: ApiWorkRecord,
  cap: number,
): WorkThisCycle {
  const all: Completion[] = record.days
    .flatMap((day) =>
      day.issues.map((issue) =>
        toCompletion({
          ...issue,
          doneDay: day.date,
          personId: record.employee.id,
          personName: record.employee.name,
        }),
      ),
    )
    .sort(newestFirst);
  const sums = summarise(all);
  return {
    summary: {
      ...sums,
      /* The API's own figures win where it sent them. */
      finished: record.summary.finished,
      withDueDate: record.summary.withDueDate,
      onTime: record.summary.onTime,
      late: record.summary.withDueDate - record.summary.onTime,
      linked: record.summary.linkedToObjective,
    },
    byProject: byProject(all),
    items: all.slice(0, cap),
    total: record.summary.finished,
    capped: all.length > cap || record.summary.finished > all.length,
  };
}

export type TeamCompletedParams = {
  period: "week" | "month" | "quarter";
  date?: string | undefined;
  /** Paging by person: the opaque marker the last page sent. */
  cursor?: string | null | undefined;
  limit?: number | undefined;
};

export type BulkLinkBody = {
  issueIds: string[];
  /** `null` clears the link on every task. */
  goalId: string | null;
  keyResultId: string | null;
};

/**
 * Provisional paths, written before the API's own contract existed. They are
 * confirmed or replaced in the "Phase 1 web as built" section of
 * `docs/specs/projects-performance-link.md`.
 */
export const completionsApi = {
  teamCompleted: async (
    params: TeamCompletedParams,
    signal?: AbortSignal,
  ): Promise<{
    page: TeamCompleted;
    next: string | null;
    total: number | null;
  }> => {
    const res = await requestPaged<Raw, Raw>("/projects/team-tasks/completed", {
      query: {
        period: params.period,
        date: params.date,
        cursor: params.cursor ?? undefined,
        limit: params.limit,
      },
      ...(signal ? { signal } : {}),
    });
    const meta = res.meta as unknown as Raw;
    return {
      page: toTeamCompleted({
        period: (meta["period"] ?? {}) as Raw,
        people: res.data,
      }),
      next: strOrNull(meta["nextCursor"]),
      total: typeof meta["total"] === "number" ? meta["total"] : null,
    };
  },

  /** What somebody finished in a review period: their work record, over the period. */
  workForCycle: (
    employeeId: string | null,
    params: {
      cycleId: string | null;
      from?: string | null;
      to?: string | null;
    },
    signal?: AbortSignal,
  ) =>
    request<ApiWorkRecord>(
      employeeId
        ? `/performance/employees/${employeeId}/work-record`
        : "/performance/work-record/mine",
      {
        query: {
          period: "cycle",
          cycleId: params.cycleId ?? undefined,
          from: params.from ?? undefined,
          to: params.to ?? undefined,
        },
        ...(signal ? { signal } : {}),
      },
    ),

  completedWork: async (
    goalId: string,
    signal?: AbortSignal,
  ): Promise<CompletedWork> =>
    toCompletedWork(
      await request<Raw>(`/performance/goals/${goalId}/completed-work`, {
        ...(signal ? { signal } : {}),
      }),
    ),
};
