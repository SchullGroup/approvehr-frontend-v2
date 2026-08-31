"use client";

import { request, requestPaged, type Paged } from "@/lib/api/client";
import type { DeliveryHint } from "@/lib/api/account";

/**
 * Inviting staff to sign in — `/api/v1/invites`.
 *
 * There is no `Invite` model on the API. A pending invitation **is** a `User`
 * row with no password, plus a live email token — see the header of
 * `approvehr-api/src/modules/invites/service.ts`. Nothing here needs to know
 * that; it is mentioned so nobody "fixes" the shape below to look more like a
 * standalone record.
 */

export type SentInvite = {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  employeeId: string | null;
  roles: { id: string; name: string }[];
  expiresAt: string | null;
  /** Present only while no mail transport is wired, and never in production —
   *  see `DeliveryHint`. */
  delivery: DeliveryHint;
};

export type PendingInvite = {
  userId: string;
  email: string;
  name: string;
  employeeId: string | null;
  roles: string[];
  invitedAt: string;
  expiresAt: string | null;
  expired: boolean;
};

export type BulkInvitePerson = { employeeId: string; email: string };

/**
 * Somebody being invited who has no staff record — see `inviteByEmailSchema`
 * on the API. Names are here rather than derived from the address because
 * `acceptInvite` never asks for them, so a guess would be permanent.
 */
export type InviteByEmailPerson = {
  firstName: string;
  lastName: string;
  email: string;
};

export type BulkInviteResult = {
  sent: SentInvite[];
  failed: { employeeId: string; name: string; message: string }[];
};

/** A real sign-in with no personnel file — see `unlinkedUsers` on the API. */
export type UnlinkedUser = {
  userId: string;
  name: string;
  email: string;
  lastSignInAt: string | null;
};

export type LinkedAccount = {
  userId: string;
  name: string;
  email: string;
  employeeId: string | null;
  employeeName: string | null;
};

/**
 * Backing a stray sign-in with a new personnel record — the other half of
 * `linkEmployee`. Mirrors `createEmployeeForUserSchema` on the API: no
 * `email`, `canLogin` or `invite` here, because the address is the one
 * already on the account being linked and there is nothing left to invite.
 */
export type CreateEmployeeForUserBody = {
  firstName: string;
  lastName: string;
  middleName?: string;
  jobTitle: string;
  /** `YYYY-MM-DD`. */
  startDate: string;
  grossMonthlyKobo?: number;
  departmentId?: string | null;
  managerId?: string | null;
  legalEntityId?: string;
  workLocationId?: string | null;
  salaryGradeId?: string | null;
  taxState?: string;
};

export const invitesApi = {
  send: (employeeId: string, roleIds: string[]): Promise<SentInvite> =>
    request<SentInvite>("/invites", {
      method: "POST",
      body: { employeeId, roleIds },
    }),

  /**
   * Inviting a list of staff to sign in, in one go — writes each person's
   * email onto their record and invites them with it. See the header of
   * `bulkInviteSchema` on the API for why this is the one place an invite
   * route accepts an address rather than reading one off a record: here, that
   * is the point.
   */
  bulkSend: (
    people: BulkInvitePerson[],
    roleIds: string[],
  ): Promise<BulkInviteResult> =>
    request<BulkInviteResult>("/invites/bulk", {
      method: "POST",
      body: { people, roleIds },
    }),

  /**
   * Give people access with no employee record behind it — the path for
   * somebody who is not on the payroll, and for a company defining its roles
   * before it has added anybody.
   */
  sendByEmail: (
    people: InviteByEmailPerson[],
    roleIds: string[],
  ): Promise<BulkInviteResult> =>
    request<BulkInviteResult>("/invites/by-email", {
      method: "POST",
      body: { people, roleIds },
    }),

  list: (
    params: { page?: number; pageSize?: number } = {},
    signal?: AbortSignal,
  ): Promise<Paged<PendingInvite>> =>
    requestPaged<PendingInvite>("/invites", {
      query: { page: params.page ?? 1, pageSize: params.pageSize ?? 50 },
      ...(signal ? { signal } : {}),
    }),

  /**
   * Whether an invitation will actually reach anybody.
   *
   * Asked before offering to send one. With no mail transport wired the API
   * creates the account, sends nothing and answers 200 — so a screen promising
   * "they can set a password from the link in their email" was describing an
   * email that does not exist. This is how a screen finds out.
   */
  delivery: (
    signal?: AbortSignal,
  ): Promise<{ email: boolean; note: string | null }> =>
    request<{ email: boolean; note: string | null }>(
      "/invites/delivery",
      signal ? { signal } : {},
    ),

  /**
   * A fresh invitation link, to pass on by hand.
   *
   * A **POST**, because it mints a new token and invalidates the previous one —
   * so a link taken last week stops working when a new one is taken, and a link
   * cannot be quietly harvested and left live alongside its replacement. It also
   * keeps the token out of a URL and therefore out of browser history.
   *
   * Refused for an account that already has a password: this is an onboarding
   * tool, not a password reset performed on somebody else's behalf. Audited by
   * user on the API.
   */
  link: (
    userId: string,
  ): Promise<{
    userId: string;
    email: string;
    name: string;
    url: string;
    expiresAt: string;
  }> =>
    request(`/invites/${userId}/link`, { method: "POST" }),

  resend: (userId: string): Promise<SentInvite> =>
    request<SentInvite>(`/invites/${userId}/resend`, { method: "POST" }),

  revoke: (userId: string): Promise<{ userId: string; email: string }> =>
    request<{ userId: string; email: string }>(`/invites/${userId}`, {
      method: "DELETE",
    }),

  /** Real accounts with nobody to be — the company's own registrant, most
   *  often. Needs `MANAGE_ROLES`, not `INVITE_STAFF`: see `linkToEmployee`. */
  unlinked: (signal?: AbortSignal): Promise<UnlinkedUser[]> =>
    request<UnlinkedUser[]>("/invites/unlinked", {
      ...(signal ? { signal } : {}),
    }),

  /** `employeeId: null` clears the link rather than leaving it alone. */
  linkEmployee: (
    userId: string,
    employeeId: string | null,
  ): Promise<LinkedAccount> =>
    request<LinkedAccount>(`/invites/${userId}/employee`, {
      method: "PATCH",
      body: { employeeId },
    }),

  /** The other half of `linkEmployee` — create a record for them instead of
   *  pointing them at one that already exists. */
  createEmployee: (
    userId: string,
    input: CreateEmployeeForUserBody,
  ): Promise<LinkedAccount> =>
    request<LinkedAccount>(`/invites/${userId}/employee`, {
      method: "POST",
      body: input,
    }),
};
