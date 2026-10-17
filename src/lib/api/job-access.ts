import { request } from "@/lib/api/client";

/**
 * Who can reach one job, and what they can see of it. `/api/v1/recruitment/requisitions/:id/access`.
 *
 * The wire and nothing else: no React, no wording. `lib/hiring/access/api-gateway.ts`
 * turns these into what the access panel draws, and is the one file to edit if either
 * side renames a thing.
 *
 * Reads need hiring access to the job; every change needs `MANAGE_HIRING`. A restricted
 * job is a `404` to anybody who is not on it, so an id that is not theirs is not one
 * they are told exists.
 */

const BASE = "/recruitment";

export type ApiAccessRole = "HIRING_MANAGER" | "RECRUITER" | "PANELIST";

/** How somebody reaches the job. */
export type ApiAccessVia =
  "ACCESS_LIST" | "HIRING_MANAGER" | "STAGE_PANEL" | "INTERVIEW_PANEL";

export type ApiAccessStatus =
  "ACTIVE" | "INVITED" | "INVITATION_EXPIRED" | "NO_SIGN_IN";

export type ApiAccessPerson = {
  /** The list row's id, to change or remove it. `null` for somebody who is here some other way. */
  id: string | null;
  userId: string | null;
  employeeId: string | null;
  name: string;
  email: string | null;
  /** Their role on the list; `null` when they are not on it. */
  role: ApiAccessRole | null;
  via: ApiAccessVia[];
  status: ApiAccessStatus;
  addedAt: string | null;
  addedBy: string | null;
  /** Whether this person is shown this job's fit scores. */
  canSeeScores: boolean;
  seats: { stages: string[]; interviews: number };
};

export type ApiAccessView = {
  requisitionId: string;
  reference: string;
  jobTitle: string;
  restricted: boolean;
  panelistsSeeScores: boolean;
  hiringManager: {
    employeeId: string;
    name: string;
    userId: string | null;
  } | null;
  people: ApiAccessPerson[];
  /** Company-wide hiring permission: how many hold it, whether it opens this job, in words. */
  companyWide: { holders: number; opensThisJob: boolean; note: string };
  /** Who can open the job whether or not they are listed. */
  overrideHolders: { userId: string; name: string }[];
};

/** What happened to an invitation: `issued` when one was made or sent again. */
export type ApiInvitation = {
  issued: boolean;
  /** `true` when the provider took the email. */
  delivered: boolean;
  /** Only when it was not delivered: what to do about it. */
  delivery: {
    delivered: false;
    note: string;
    token?: string;
    expiresAt?: string;
  } | null;
};

export type ApiGrantBody = {
  role: ApiAccessRole;
  /** Name one of these three. */
  userId?: string;
  employeeId?: string;
  email?: string;
  /** With `email`: an invitation needs both. */
  firstName?: string;
  lastName?: string;
};

export type ApiGrantResult = {
  accessId: string;
  person: ApiAccessPerson | null;
  invitation: ApiInvitation | null;
};

export type ApiAccessSettings = {
  restricted?: boolean;
  panelistsSeeScores?: boolean;
};

export type ApiAccessChange = ApiAccessView & {
  changed: string[];
  /** Restricting a job you could not then open: you were put on the list. */
  addedYou: boolean;
};

export const jobAccessApi = {
  get: (requisitionId: string, signal?: AbortSignal) =>
    request<ApiAccessView>(`${BASE}/requisitions/${requisitionId}/access`, {
      ...(signal ? { signal } : {}),
    }),

  update: (requisitionId: string, body: ApiAccessSettings) =>
    request<ApiAccessChange>(`${BASE}/requisitions/${requisitionId}/access`, {
      method: "PATCH",
      body,
    }),

  grant: (requisitionId: string, body: ApiGrantBody) =>
    request<ApiGrantResult>(`${BASE}/requisitions/${requisitionId}/access`, {
      method: "POST",
      body,
    }),

  changeRole: (requisitionId: string, accessId: string, role: ApiAccessRole) =>
    request<ApiAccessPerson | null>(
      `${BASE}/requisitions/${requisitionId}/access/${accessId}`,
      { method: "PATCH", body: { role } },
    ),

  revoke: (requisitionId: string, accessId: string) =>
    request<{ revoked: true; closedInvitation: boolean }>(
      `${BASE}/requisitions/${requisitionId}/access/${accessId}`,
      { method: "DELETE" },
    ),

  resend: (requisitionId: string, accessId: string) =>
    request<ApiInvitation>(
      `${BASE}/requisitions/${requisitionId}/access/${accessId}/resend`,
      { method: "POST" },
    ),
};
