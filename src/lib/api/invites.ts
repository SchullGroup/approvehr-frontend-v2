"use client";

import { request, requestPaged, type Paged } from "@/lib/api/client";
import type { DeliveryHint } from "@/lib/api/account";

/**
 * Invitations — `/api/v1/invites`.
 *
 * Typed wrappers only, mirroring `lib/api/permissions.ts`. There is no demo
 * mirror for this one: an invitation is a real email address getting a real,
 * single-use link to a real account, and simulating that in a browser that
 * cannot send mail would not test anything — see `useInvites` in
 * `lib/store/invites.ts`, which says so rather than pretending.
 *
 * `employeeId` in, never a typed email — the address comes from the employee
 * record, so there is no form field that could send an invitation to the
 * wrong address.
 */

export type ApiSentInvite = {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  employeeId: string | null;
  roles: { id: string; name: string }[];
  expiresAt: string | null;
  /** Present only outside production, where there is no mail transport. */
  delivery: DeliveryHint;
};

export type ApiPendingInvite = {
  userId: string;
  email: string;
  name: string;
  employeeId: string | null;
  roles: string[];
  invitedAt: string;
  expiresAt: string | null;
  /** True once the link has passed its expiry — still listed, so resending
   *  stays discoverable rather than the invite just vanishing. */
  expired: boolean;
};

export const invitesApi = {
  send: (employeeId: string, roleIds: string[]): Promise<ApiSentInvite> =>
    request<ApiSentInvite>("/invites", {
      method: "POST",
      body: { employeeId, roleIds },
    }),

  list: (
    params: { page?: number; pageSize?: number } = {},
    signal?: AbortSignal,
  ): Promise<Paged<ApiPendingInvite>> =>
    requestPaged<ApiPendingInvite>("/invites", {
      query: { page: params.page ?? 1, pageSize: params.pageSize ?? 50 },
      ...(signal ? { signal } : {}),
    }),

  resend: (userId: string): Promise<ApiSentInvite> =>
    request<ApiSentInvite>(`/invites/${userId}/resend`, { method: "POST" }),

  revoke: (userId: string): Promise<{ userId: string; email: string }> =>
    request<{ userId: string; email: string }>(`/invites/${userId}`, {
      method: "DELETE",
    }),
};
