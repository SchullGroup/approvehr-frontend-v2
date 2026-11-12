"use client";

import { request } from "@/lib/api/client";

/**
 * The work kept behind a final rating, over the wire: `GET /performance/reviews/:id/work-evidence`.
 *
 * A rating is read beside a list of what the person finished in the cycle, and that list is
 * read live, so a task reopened or removed afterwards changes what an old review shows. For a
 * company that has chosen a period, the list as it stood on the day the rating was made final is
 * kept with it. This reads that record.
 *
 * ## Evidence, never a number
 *
 * Nothing here carries a grade, and the totals are counts, written as counts. There is **no task
 * title** in it: the API does not keep one (a title can hold health or trade-union details), so
 * a reader opens a task by its id to read it as it is now.
 *
 * ## Four states, and a record that is not there is not an empty list
 *
 * - `NOT_FINAL`: the rating is not final, so nothing was kept and the live list is the one to read.
 * - `NOT_KEPT`: it is final and no record was kept with it (the company kept none then, Projects
 *   was off, the cycle stated no dates, or it was made final before this existed).
 * - `REMOVED`: a record was kept and its period has ended.
 * - `KEPT`: the record.
 *
 * `toKeptWork` claims only what the API said. A state it does not know, or a `KEPT` it cannot
 * read a list out of, is `null`, and a screen treats `null` as "nothing known" and draws nothing
 * about a record, never as "none was kept".
 */

export type WorkTiming = "ON_TIME" | "LATE" | "NO_DUE_DATE";

export type KeptWorkItem = {
  id: string;
  key: string;
  /** TASK, STORY or PROBLEM. Shown as the key's company, never as a rating. */
  type: string;
  /** On the person's own task list rather than a project board. */
  personal: boolean;
  projectId: string;
  doneAt: string;
  /** The company's calendar day it was finished, `YYYY-MM-DD`. */
  finishedOn: string;
  dueDate: string | null;
  timing: WorkTiming;
  linked: boolean;
  /** Who created it when that was somebody else. */
  setBy: { id: string; name: string } | null;
};

export type KeptWorkSummary = {
  finished: number;
  withDueDate: number;
  onTime: number;
  late: number;
  noDueDate: number;
  linked: number;
  unlinked: number;
};

export type KeptWork =
  | { state: "NOT_FINAL" }
  | { state: "NOT_KEPT" }
  | { state: "REMOVED"; frozenAt: string; endedAt: string }
  | {
      state: "KEPT";
      frozenAt: string;
      /** When it is removed, after any restart a dispute caused. */
      retainUntil: string;
      retainMonths: number;
      period: { start: string; end: string };
      summary: KeptWorkSummary;
      /** Newest first. */
      items: KeptWorkItem[];
      /** How many matched, more than `items` when `truncated`. */
      total: number;
      truncated: boolean;
    };

/** The record itself, once a `KEPT` answer is read. */
export type KeptWorkRecord = Extract<KeptWork, { state: "KEPT" }>;

type Raw = Record<string, unknown>;

const obj = (value: unknown): Raw =>
  value && typeof value === "object" ? (value as Raw) : {};
const str = (value: unknown): string =>
  typeof value === "string" ? value : "";
const num = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;
const isTiming = (value: unknown): value is WorkTiming =>
  value === "ON_TIME" || value === "LATE" || value === "NO_DUE_DATE";

function toItem(raw: unknown): KeptWorkItem | null {
  const row = obj(raw);
  const id = str(row["id"]);
  const key = str(row["key"]);
  const timing = row["timing"];
  if (id === "" || key === "" || !isTiming(timing)) return null;
  const setter = obj(row["setBy"]);
  const dueDate = str(row["dueDate"]);
  return {
    id,
    key,
    type: str(row["type"]),
    personal: row["personal"] === true,
    projectId: str(row["projectId"]),
    doneAt: str(row["doneAt"]),
    finishedOn: str(row["finishedOn"]),
    dueDate: dueDate === "" ? null : dueDate.slice(0, 10),
    timing,
    linked: row["linked"] === true,
    /* A name is shown only when the API named somebody. */
    setBy:
      str(setter["id"]) !== "" && str(setter["name"]) !== ""
        ? { id: str(setter["id"]), name: str(setter["name"]) }
        : null,
  };
}

/** Claims only what the API said; `null` for anything it cannot read. */
export function toKeptWork(raw: unknown): KeptWork | null {
  const row = obj(raw);
  const state = row["state"];
  if (state === "NOT_FINAL") return { state };
  if (state === "NOT_KEPT") return { state };
  if (state === "REMOVED") {
    const frozenAt = str(row["frozenAt"]);
    const endedAt = str(row["endedAt"]);
    return frozenAt === "" || endedAt === ""
      ? null
      : { state, frozenAt, endedAt };
  }
  if (state !== "KEPT") return null;

  const frozenAt = str(row["frozenAt"]);
  const retainUntil = str(row["retainUntil"]);
  const period = obj(row["period"]);
  if (
    frozenAt === "" ||
    retainUntil === "" ||
    str(period["start"]) === "" ||
    str(period["end"]) === "" ||
    !Array.isArray(row["items"])
  ) {
    return null;
  }
  const summary = obj(row["summary"]);
  const items = (row["items"] as unknown[]).flatMap(
    (item) => toItem(item) ?? [],
  );
  return {
    state,
    frozenAt,
    retainUntil,
    retainMonths: num(row["retainMonths"]),
    period: { start: str(period["start"]), end: str(period["end"]) },
    summary: {
      finished: num(summary["finished"]),
      withDueDate: num(summary["withDueDate"]),
      onTime: num(summary["onTime"]),
      late: num(summary["late"]),
      noDueDate: num(summary["noDueDate"]),
      linked: num(summary["linked"]),
      unlinked: num(summary["unlinked"]),
    },
    items,
    total: num(row["total"]),
    truncated: row["truncated"] === true,
  };
}

export const keptWorkApi = {
  /**
   * 404 rather than 403 when it is not the reader's to see, and the same 404 an
   * older server gives for a route it does not have. Both mean "nothing known".
   */
  read: async (
    reviewId: string,
    signal?: AbortSignal,
  ): Promise<KeptWork | null> =>
    toKeptWork(
      await request<unknown>(`/performance/reviews/${reviewId}/work-evidence`, {
        ...(signal ? { signal } : {}),
      }),
    ),
};
