"use client";

import { request } from "@/lib/api/client";

/**
 * "This is wrong": a person's flag on an item of their own finished work, over the wire.
 *
 * `GET`, `PUT` and `DELETE` on `/performance/cycles/:cycleId/employees/:employeeId/work-flags`.
 *
 * ## What a flag is
 *
 * The person the work is about says, in a few words, that an item on the list the appraiser reads is
 * not right: not theirs, the wrong day, a task that was never finished. It is a statement for the
 * reader. **It removes nothing from any list and moves no mark**, and the panel says so, so a flag is
 * never mistaken for a correction. Only the person themselves can raise one, and they can take it
 * back.
 *
 * ## `on` says what can be done, and `flags` says what was written
 *
 * The answer is `{ on, flags }`, and the two are different facts. **`flags` is what was written and is
 * read whether or not the switch is on**: turning "Work in review answers" off stops anything new and
 * keeps everything already written, so a flag stays on the list for whoever could read it. **`on` says
 * only whether a flag can be raised or changed now.** Taking one back is the person's own and stays
 * open while it is off.
 *
 * ## An absence is not an empty list
 *
 * - `flags` is a list, possibly empty: a fact. An empty one says nothing was flagged.
 * - `flags` is `null` when the server did not send it. A server one deploy behind answers `{ on:
 *   false }` with no list at all, and that is **no claim**: a screen draws no flag and no count, and
 *   never "nothing was flagged".
 * - An answer this side cannot read, a failed request or a reader the API refuses: `null` for the
 *   whole read, and a panel draws nothing and offers nothing.
 */
export type ApiWorkFlag = {
  /** The task, which is how a row finds its flag. */
  issueId: string;
  key: string;
  /** The person's own words, 3 to 280 characters. */
  reason: string;
  flaggedAt: string;
};

export type WorkFlags = {
  /** A flag can be raised or changed now. Not whether one exists. */
  on: boolean;
  /** What was written, or `null` when the server did not say. */
  flags: ApiWorkFlag[] | null;
};

/** The shortest and longest reason, in characters. The API enforces both. */
export const FLAG_REASON_MIN = 3;
export const FLAG_REASON_MAX = 280;

type Raw = Record<string, unknown>;

const obj = (value: unknown): Raw =>
  value && typeof value === "object" ? (value as Raw) : {};
const str = (value: unknown): string =>
  typeof value === "string" ? value : "";

/** One flag, or `null` when it is not one. Fields are picked by name. */
export function toWorkFlag(raw: unknown): ApiWorkFlag | null {
  const row = obj(raw);
  const issueId = str(row["issueId"]);
  const reason = str(row["reason"]).trim();
  if (issueId === "" || reason === "") return null;
  return {
    issueId,
    key: str(row["key"]),
    reason,
    flaggedAt: str(row["flaggedAt"]),
  };
}

/** Claims only what the API said; `null` for anything it cannot read. */
export function toWorkFlags(raw: unknown): WorkFlags | null {
  const row = obj(raw);
  /* No boolean, no claim about whether anything can be done. */
  if (typeof row["on"] !== "boolean") return null;
  const list = row["flags"];
  return {
    on: row["on"],
    /* Read whether or not `on`: what was written stays. Absent is not empty. */
    flags: Array.isArray(list)
      ? (list as unknown[]).flatMap((item) => toWorkFlag(item) ?? [])
      : null,
  };
}

const base = (cycleId: string, employeeId: string): string =>
  `/performance/cycles/${cycleId}/employees/${employeeId}/work-flags`;

export const workFlagsApi = {
  /** Whoever may read that person's work for that cycle. A reader the API refuses gets a 404. */
  read: async (
    cycleId: string,
    employeeId: string,
    signal?: AbortSignal,
  ): Promise<WorkFlags | null> =>
    toWorkFlags(
      await request<unknown>(base(cycleId, employeeId), {
        ...(signal ? { signal } : {}),
      }),
    ),

  /**
   * Flag one item, or change the reason on a flag already there. The person themselves only, and only
   * while the switch is on (the API refuses it otherwise, in its own sentence).
   *
   * Resolves to the flag as the server now holds it, or `null` when the answer cannot be read: the
   * flag was written, and the caller reads the list again rather than claiming nothing happened.
   */
  flag: async (
    cycleId: string,
    employeeId: string,
    issueId: string,
    reason: string,
  ): Promise<ApiWorkFlag | null> =>
    toWorkFlag(
      obj(
        await request<unknown>(`${base(cycleId, employeeId)}/${issueId}`, {
          method: "PUT",
          body: { reason: reason.trim() },
        }),
      )["flag"],
    ),

  /** Take a flag back. The person themselves, **whatever the switch says**. */
  unflag: async (
    cycleId: string,
    employeeId: string,
    issueId: string,
  ): Promise<void> => {
    await request<unknown>(`${base(cycleId, employeeId)}/${issueId}`, {
      method: "DELETE",
    });
  },
};
