"use client";

import { request, requestPaged, type Paged } from "@/lib/api/client";
import type { DeliveryHint } from "@/lib/api/account";

/**
 * Giving staff a login — `/api/v1/invites`.
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

export const invitesApi = {
  send: (employeeId: string, roleIds: string[]): Promise<SentInvite> =>
    request<SentInvite>("/invites", {
      method: "POST",
      body: { employeeId, roleIds },
    }),

  /**
   * Setting a list of staff up with a login in one go — writes each person's
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

  resend: (userId: string): Promise<SentInvite> =>
    request<SentInvite>(`/invites/${userId}/resend`, { method: "POST" }),

  revoke: (userId: string): Promise<{ userId: string; email: string }> =>
    request<{ userId: string; email: string }>(`/invites/${userId}`, {
      method: "DELETE",
    }),
};
