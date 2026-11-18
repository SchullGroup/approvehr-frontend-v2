"use client";

import { request } from "@/lib/api/client";

/**
 * The two assists, as the API answers them: the tasks linked to a done-or-not measure, shown beside
 * Confirm, and the finished tasks of the week offered as text for a weekly line.
 *
 * ## They list and they offer; they never decide
 *
 * `GET /performance/key-results/:id/linked-work` lists the tasks linked to a measure and where each
 * stands. It never says the measure is done and nothing here turns it into a recommendation.
 * `GET /performance/goals/:id/task-suggestions` offers the owner's own finished tasks of the week as
 * lines of text to edit. It writes nothing. **Neither is a number**, and neither carries a task title
 * except the suggestions' `text`, which is the owner's own and is never stored.
 *
 * ## An absence is not an empty list
 *
 * - `{ on: false }`: the company has not switched the assists on, or Projects is off. There is **no
 *   other key**, so nothing can read it as "no task is linked" or "nothing was finished".
 * - `{ on: true, ... }`: the answer, whose list may be empty. An empty list here is a fact.
 * - Anything else, a failed request, or a reader the API refuses (it answers as if the measure were
 *   not there): `null`, and a screen **draws nothing** for it. A server that does not say makes no
 *   claim, and a hint that failed to load is not a reason to hold up a confirmation.
 */

export type LinkedState = "OPEN" | "FINISHED" | "WONT_DO";
const STATES: readonly LinkedState[] = ["OPEN", "FINISHED", "WONT_DO"];

/**
 * A task the reader may open: its key and where it stands. No title is sent.
 */
export type OpenableLinkedTask = {
  issueId: string;
  /** `PLT-12`. */
  key: string;
  type: string;
  state: LinkedState;
  /** The company's day it was finished, `YYYY-MM-DD`; null unless it was finished. */
  finishedOn: string | null;
  /** On somebody's own list and not on a board. */
  personal: boolean;
  accepted: { byName: string; at: string } | null;
  canOpen: true;
};

/**
 * A task linked to the measure that this reader may not open. The API sends **nothing about it** but
 * its id: no key, no kind, no state, no day, no acceptance, because each of those is a fact about a
 * piece of work the reader cannot see. It is counted in `total` and listed as one plain line.
 */
export type HiddenLinkedTask = { issueId: string; canOpen: false };

export type LinkedTask = OpenableLinkedTask | HiddenLinkedTask;

export type LinkedWork =
  | { on: false }
  | {
      on: true;
      measure: { id: string; label: string; kind: string };
      items: LinkedTask[];
      /** Every task linked, on every page: more than `items` when `truncated`. */
      total: number;
      truncated: boolean;
    };

export type SuggestedLine = {
  issueId: string;
  key: string;
  type: string;
  /** The company's day, `YYYY-MM-DD`. */
  finishedOn: string;
  /** `KEY title`, one line, cut to the longest a weekly line may be. The owner's own words. */
  text: string;
};

export type TaskSuggestions =
  | { on: false }
  | {
      on: true;
      /** The submission week, Monday to Sunday, `YYYY-MM-DD`. */
      week: { start: string; end: string };
      items: SuggestedLine[];
      total: number;
      truncated: boolean;
    };

type Raw = Record<string, unknown>;

const obj = (value: unknown): Raw =>
  value && typeof value === "object" ? (value as Raw) : {};
const str = (value: unknown): string =>
  typeof value === "string" ? value : "";
const wholeNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
const day = (value: unknown): string | null => {
  const text = str(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
};

/** Claims only what the API said; `null` for anything it cannot read. */
export function toLinkedWork(raw: unknown): LinkedWork | null {
  const row = obj(raw);
  if (row["on"] === false) return { on: false };
  const total = wholeNumber(row["total"]);
  if (row["on"] !== true || !Array.isArray(row["items"]) || total === null) {
    return null;
  }
  const measure = obj(row["measure"]);
  const items = (row["items"] as unknown[]).flatMap((entry): LinkedTask[] => {
    const one = obj(entry);
    const issueId = str(one["issueId"]);
    if (issueId === "") return [];
    /* Only `canOpen: true` carries a description. Anything else, including a server that does not say,
       is read as a task this reader may not open, and **whatever else arrives with it is ignored**: a
       key, a state or a day for a task the reader cannot see is exactly what must never reach a screen. */
    if (one["canOpen"] !== true) return [{ issueId, canOpen: false }];
    const key = str(one["key"]);
    const state = STATES.find((s) => s === one["state"]);
    /* A task with no key, or in a state this side does not know, is not one it will describe. */
    if (key === "" || !state) return [];
    const accepted = obj(one["accepted"]);
    return [
      {
        issueId,
        key,
        type: str(one["type"]),
        state,
        finishedOn: state === "FINISHED" ? day(one["finishedOn"]) : null,
        personal: one["personal"] === true,
        accepted:
          str(accepted["at"]) !== ""
            ? { byName: str(accepted["byName"]), at: str(accepted["at"]) }
            : null,
        canOpen: true,
      },
    ];
  });
  return {
    on: true,
    measure: {
      id: str(measure["id"]),
      label: str(measure["label"]),
      kind: str(measure["kind"]),
    },
    items,
    total,
    truncated: row["truncated"] === true,
  };
}

/** Claims only what the API said; `null` for anything it cannot read. */
export function toTaskSuggestions(raw: unknown): TaskSuggestions | null {
  const row = obj(raw);
  if (row["on"] === false) return { on: false };
  const total = wholeNumber(row["total"]);
  const week = obj(row["week"]);
  const start = day(week["start"]);
  const end = day(week["end"]);
  if (
    row["on"] !== true ||
    !Array.isArray(row["items"]) ||
    total === null ||
    start === null ||
    end === null
  ) {
    return null;
  }
  const items = (row["items"] as unknown[]).flatMap(
    (entry): SuggestedLine[] => {
      const one = obj(entry);
      const issueId = str(one["issueId"]);
      const finishedOn = day(one["finishedOn"]);
      const text = str(one["text"]);
      /* A line with no text is nothing to offer. */
      if (issueId === "" || finishedOn === null || text.trim() === "")
        return [];
      return [
        {
          issueId,
          key: str(one["key"]),
          type: str(one["type"]),
          finishedOn,
          text,
        },
      ];
    },
  );
  return {
    on: true,
    week: { start, end },
    items,
    total,
    truncated: row["truncated"] === true,
  };
}

/** Where a linked task opens: the task by its id, which sends a board task on to its board. */
export const linkedTaskHref = (issueId: string): string =>
  `/projects/tasks/${encodeURIComponent(issueId)}`;

export const workAssistsApi = {
  /**
   * The people who may confirm the measure, and the objective's owner. A 404 for anybody else, whether
   * or not the setting is on, and 422 for a measure that is a number.
   */
  linkedWork: async (
    measureId: string,
    signal?: AbortSignal,
  ): Promise<LinkedWork | null> =>
    toLinkedWork(
      await request<unknown>(
        `/performance/key-results/${encodeURIComponent(measureId)}/linked-work`,
        { ...(signal ? { signal } : {}) },
      ),
    ),

  /** The objective's owner, on an agreed objective. A 404 for anybody else, a manager included. */
  taskSuggestions: async (
    goalId: string,
    signal?: AbortSignal,
  ): Promise<TaskSuggestions | null> =>
    toTaskSuggestions(
      await request<unknown>(
        `/performance/goals/${encodeURIComponent(goalId)}/task-suggestions`,
        { ...(signal ? { signal } : {}) },
      ),
    ),
};
