"use client";

import { request } from "@/lib/api/client";

/**
 * The colleagues who shared a project with somebody: `GET /performance/employees/:id/shared-projects`.
 *
 * ## What it is for
 *
 * When feedback is asked for about somebody, or an appraiser is chosen for them, the people who worked
 * on the same project are listed first and say how many projects they shared. It is an ordering and a
 * label over a list the person still picks from. Nothing is chosen for anybody, and it says nothing
 * about the work: no task, no project name, no title.
 *
 * ## An absence is not an empty list
 *
 * - `{ on: false }`: the company has not switched the setting on. There is **no `colleagues` key**, so
 *   nothing can read it as "they shared no projects".
 * - `{ on: true, colleagues }`: the list, possibly empty. An empty list here is a fact: nobody shared
 *   a project.
 * - Anything else, a failed request, or a reader the API refuses (it answers as if the person were not
 *   there): `null`, and a screen **changes nothing** and says nothing. A server that does not say
 *   makes no claim.
 */
export type SharedColleague = {
  employeeId: string;
  name: string;
  /** How many projects both people are members of. Always at least 1. */
  sharedProjects: number;
};

export type SharedProjects =
  { on: false } | { on: true; colleagues: SharedColleague[] };

type Raw = Record<string, unknown>;

const obj = (value: unknown): Raw =>
  value && typeof value === "object" ? (value as Raw) : {};
const str = (value: unknown): string =>
  typeof value === "string" ? value : "";

/** Claims only what the API said; `null` for anything it cannot read. */
export function toSharedProjects(raw: unknown): SharedProjects | null {
  const row = obj(raw);
  if (row["on"] === false) return { on: false };
  if (row["on"] !== true || !Array.isArray(row["colleagues"])) return null;
  const colleagues = (row["colleagues"] as unknown[]).flatMap(
    (item): SharedColleague[] => {
      const one = obj(item);
      const employeeId = str(one["employeeId"]);
      const shared = one["sharedProjects"];
      /* Somebody who shared no project is not a suggestion, and a count that is not a whole
         number is not one this side will print. */
      if (
        employeeId === "" ||
        typeof shared !== "number" ||
        !Number.isInteger(shared) ||
        shared < 1
      ) {
        return [];
      }
      return [{ employeeId, name: str(one["name"]), sharedProjects: shared }];
    },
  );
  return { on: true, colleagues };
}

export const sharedProjectsApi = {
  /** Self or `EDIT_RECORDS`; anybody else gets what a missing employee gets (a 404). */
  read: async (
    employeeId: string,
    signal?: AbortSignal,
  ): Promise<SharedProjects | null> =>
    toSharedProjects(
      await request<unknown>(
        `/performance/employees/${employeeId}/shared-projects`,
        { ...(signal ? { signal } : {}) },
      ),
    ),
};
