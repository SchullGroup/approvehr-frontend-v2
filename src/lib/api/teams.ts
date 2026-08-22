"use client";

import { request } from "@/lib/api/client";

/**
 * Teams — `/api/v1/teams`.
 *
 * Typed wrappers only, hand-written in the same style as `endpoints.ts` and
 * `performance.ts`. The one money field here is already integer kobo and stays
 * integer kobo; the screen divides by 100 at the `<Money>` call and nowhere else.
 *
 * ## A team is not a department, and it is not a department's child either
 *
 * `endpoints.ts`'s `departments` wrapper models the **cost-centre tree**, where
 * "a team is a department with a parent" and a person sits in exactly one node.
 * This is the other thing: a working group with a lead and a membership list,
 * which somebody joins without their cost centre moving.
 *
 * ## The one rule, and why the response shape carries it
 *
 * A team that belongs to a department implies its members are in that
 * department. The API enforces it by **moving people**, and every write that can
 * trigger it returns `moved` — a list of names, not a count. That is the reason
 * `moved` exists on the wire at all: a cost centre changing silently is the bug,
 * and a screen that drops the list is the bug arriving anyway. Show the names.
 *
 * A team with `departmentId: null` is `crossFunctional` and implies nothing.
 */

/* ------------------------------------------------------------------- shapes */

export type ApiTeam = {
  id: string;
  name: string;
  purpose: string | null;
  departmentId: string | null;
  departmentName: string | null;
  leadId: string | null;
  leadName: string | null;
  memberCount: number;
  archived: boolean;
  /** Belongs to no department, so membership implies nothing about pay. */
  crossFunctional: boolean;
};

export type ApiTeamMember = {
  membershipId: string;
  employeeId: string;
  name: string;
  jobTitle: string;
  roleLabel: string | null;
  joinedAt: string;
  departmentId: string | null;
  departmentName: string | null;
  /** Null where no pay is agreed; left out of totals, never zeroed. */
    grossMonthlyKobo: number | null;
  /**
   * Their department disagrees with the team's.
   *
   * Should be false everywhere the rule has run. A true here is a row from
   * before the rule existed, or a department changed on the person's own record
   * afterwards — surfaced rather than silently re-aligned, because moving a cost
   * centre is not a repair.
   */
  departmentMismatch: boolean;
};

export type ApiTeamDetail = ApiTeam & {
  members: ApiTeamMember[];
  /** Monthly cost of the people on it, in integer kobo. */
  payrollKobo: number;
};

/** Whoever the rule moved. Names, because a count cannot be checked by a human. */
export type ApiMoved = { employeeId: string; name: string; from: string | null };

export type ApiTeamUpdated = ApiTeamDetail & { moved: ApiMoved[] };

export type ApiMembersAdded = {
  teamId: string;
  added: number;
  /** Re-submitting a form is not an error. This is what happened instead. */
  alreadyOn: number;
  moved: ApiMoved[];
};

export type ApiMembersRemoved = {
  teamId: string;
  removed: number;
  /** The API's own sentence about what removal does *not* do. Render it. */
  note: string;
};

export type ApiTeamList = {
  teams: ApiTeam[];
  counts: {
    teams: number;
    crossFunctional: number;
    /** Distinct people, so somebody on two teams counts once. */
    peopleOnATeam: number;
  };
};

/* ----------------------------------------------------------------- requests */

const signalOf = (signal?: AbortSignal) => (signal ? { signal } : {});

export const teamsApi = {
  list: (
    params: { includeArchived?: boolean; departmentId?: string } = {},
    signal?: AbortSignal,
  ) =>
    request<ApiTeamList>("/teams", {
      query: {
        includeArchived: params.includeArchived ? "true" : undefined,
        departmentId: params.departmentId,
      },
      ...signalOf(signal),
    }),

  get: (id: string, signal?: AbortSignal) =>
    request<ApiTeamDetail>(`/teams/${id}`, signalOf(signal)),

  create: (body: {
    name: string;
    departmentId?: string;
    leadId?: string;
    purpose?: string;
  }) => request<ApiTeamDetail>("/teams", { method: "POST", body }),

  /**
   * Rename, re-lead, or move it between departments.
   *
   * `departmentId: null` makes it cross-functional. Absent leaves it alone — the
   * two are different, and sending `null` by accident dissolves the rule.
   */
  update: (
    id: string,
    body: {
      name?: string;
      departmentId?: string | null;
      leadId?: string | null;
      purpose?: string | null;
    },
  ) => request<ApiTeamUpdated>(`/teams/${id}`, { method: "PATCH", body }),

  archive: (id: string) =>
    request<{ id: string; archived: boolean; note: string }>(`/teams/${id}`, {
      method: "DELETE",
    }),

  restore: (id: string) =>
    request<ApiTeamDetail>(`/teams/${id}/restore`, { method: "POST" }),

  /** Needs `EDIT_RECORDS`: on a departmental team this moves a cost centre. */
  addMembers: (id: string, employeeIds: string[], roleLabel?: string) =>
    request<ApiMembersAdded>(`/teams/${id}/members`, {
      method: "POST",
      body: { employeeIds, ...(roleLabel ? { roleLabel } : {}) },
    }),

  removeMembers: (id: string, employeeIds: string[]) =>
    request<ApiMembersRemoved>(`/teams/${id}/members/remove`, {
      method: "POST",
      body: { employeeIds },
    }),
};

/**
 * One sentence for what adding somebody to this team will do to their pay.
 *
 * Written once, here, so the confirm copy in the dialog and the toast after the
 * write cannot drift apart — and so the sentence is shown *before* the write,
 * which is the whole difference between "we moved them" and "we moved them
 * without telling you".
 */
export function membershipEffect(team: {
  crossFunctional: boolean;
  departmentName: string | null;
}): string {
  return team.crossFunctional
    ? "This team belongs to no department, so nobody's department changes."
    : `Anybody added also moves into ${team.departmentName ?? "this team's department"}, which is where their pay will be reported.`;
}
