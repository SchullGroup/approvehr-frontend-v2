"use client";

import { ApiError, request, requestPaged, type Paged } from "@/lib/api/client";

/**
 * Expense claims — `/api/v1/reimbursements`.
 *
 * The backend module is called `reimbursements` because that is what the table
 * and the payroll seam are called. **The interface says "Expenses"**, always:
 * people claim expenses, and nobody has ever said "I submitted a
 * reimbursement". This file is the only place in the frontend where the
 * backend's word appears, and it is the only place it should.
 *
 * ## Money
 *
 * Every amount in and out is integer **kobo**, and every field carrying one is
 * named `…Kobo` so a mistake is visible at the call site. `naira()` and
 * `kobo()` at the bottom are the whole boundary — the store maps wire shapes to
 * naira view models once, and nothing above it divides by 100. A claim that has
 * been through a float is a claim that no longer matches the receipt.
 *
 * ## Two things about the API worth knowing before you use it
 *
 * 1. **`awaitingDecision` does not reach the wire on the list routes.** The
 *    service assembles it, but `GET /`, `/me` and `/pending` serialise through
 *    the API's `page()` helper, which answers `{ data, meta }` and drops
 *    everything else. So the count of undecided claims has to come from
 *    `GET /summary` (which is `ok()`, not `page()`), or be derived from the rows
 *    on screen. Not worth a backend change — but it *is* a surprise, and
 *    `lib/api/grades.ts` records the same one on its own list route.
 *
 * 2. **The receipt is a key, not a file.** The field is `receiptKey` rather
 *    than `receiptUrl` precisely so nobody expects to click it. Nothing
 *    uploads, stores or serves a file anywhere in the stack yet; the two routes
 *    that will do it are named in a TODO in the API's `router.ts`. Until they
 *    exist, `requiresReceipt` means "a reference is present", which is honestly
 *    all either side can check — and the claim form says so in those words
 *    rather than drawing a drop zone that loses somebody's receipt.
 */

/* ------------------------------------------------------------------- shapes */

/**
 * `SUBMITTED` is undecided, and the only state a claim can be edited in.
 * `PAID` is terminal and means the employee is no longer out of pocket.
 */
export type ClaimStatus = "SUBMITTED" | "APPROVED" | "DECLINED" | "PAID";

/** How a settled claim was settled. `null` while it is still owed. */
export type SettledThrough = "payroll" | "direct";

/** Mirrors `serializeType` in the API's reimbursements service. */
export type ApiExpenseType = {
  id: string;
  name: string;
  description: string | null;
  requiresReceipt: boolean;
  /** Per claim, not per month. `null` means no cap. */
  capAmountKobo: number | null;
  /** Switched off types stay readable; nothing new can be claimed against them. */
  active: boolean;
  archived: boolean;
  /** Present on the list route only — `createType` and `updateType` omit it. */
  claimCount?: number;
};

/** Mirrors `SerializedClaim`. */
export type ApiClaim = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNo: string;
  typeId: string;
  /** The type's name, already joined. */
  type: string;
  amountKobo: number;
  /** The date the cost happened, `YYYY-MM-DD`. Not the date it was claimed. */
  incurredOn: string;
  description: string;
  /** An object-storage key. There is nothing to fetch it with yet. */
  receiptKey: string | null;
  status: ClaimStatus;
  /** True only while SUBMITTED. Saves every screen the same check. */
  editable: boolean;
  approvedById: string | null;
  approvedByName: string | null;
  decidedAt: string | null;
  declinedReason: string | null;
  paidAt: string | null;
  payslipId: string | null;
  settledThrough: SettledThrough | null;
  submittedAt: string;
};

/** `GET /:id` adds the limits the claim was measured against, for an edit form. */
export type ApiClaimDetail = ApiClaim & {
  policy: { requiresReceipt: boolean; capAmountKobo: number | null };
};

/**
 * `GET /summary`.
 *
 * `outstanding` is approved and unpaid — money the company owes a named person
 * today. `awaitingDecision` is a queue, reported separately on purpose: adding
 * the two together produces a figure that means nothing, because half of it may
 * never be owed at all.
 */
export type ApiExpenseSummary = {
  outstanding: {
    claimCount: number;
    amountKobo: number;
    oldestIncurredOn: string | null;
  };
  byType: {
    typeId: string;
    type: string;
    claimCount: number;
    amountKobo: number;
  }[];
  awaitingDecision: { claimCount: number; amountKobo: number };
};

export type ClaimListParams = {
  page?: number;
  pageSize?: number;
  status?: ClaimStatus;
  employeeId?: string;
  typeId?: string;
  /** Both bound `incurredOn`. `YYYY-MM-DD`. */
  from?: string;
  to?: string;
  /** Matches the description. */
  q?: string;
  sort?: "incurredOn" | "amount" | "createdAt" | "status";
  order?: "asc" | "desc";
};

export type CreateTypeBody = {
  name: string;
  description?: string;
  requiresReceipt?: boolean;
  capAmountKobo?: number;
};

export type UpdateTypeBody = {
  name?: string;
  description?: string | null;
  requiresReceipt?: boolean;
  /** `null` removes the cap. Absent leaves it alone. */
  capAmountKobo?: number | null;
  /** `true` on an archived type un-archives it, freeing the name for reuse. */
  active?: boolean;
};

export type CreateClaimBody = {
  /** Absent means the caller. Somebody else's id needs `EDIT_RECORDS`. */
  employeeId?: string;
  typeId: string;
  amountKobo: number;
  incurredOn: string;
  description: string;
  receiptKey?: string;
};

export type UpdateClaimBody = {
  typeId?: string;
  amountKobo?: number;
  incurredOn?: string;
  description?: string;
  /** `null` detaches the reference. Refused where the type requires one. */
  receiptKey?: string | null;
};

/* -------------------------------------------------------------------- calls */

export const reimbursementsApi = {
  /* Reading the types needs no permission — the claim form cannot be filled in
     without them, and a cap is not a secret. */
  types: (includeArchived = false, signal?: AbortSignal) =>
    request<ApiExpenseType[]>("/reimbursements/types", {
      query: { includeArchived: includeArchived ? "true" : undefined },
      ...(signal ? { signal } : {}),
    }),

  createType: (body: CreateTypeBody) =>
    request<ApiExpenseType>("/reimbursements/types", { method: "POST", body }),

  updateType: (id: string, body: UpdateTypeBody) =>
    request<ApiExpenseType>(`/reimbursements/types/${id}`, {
      method: "PATCH",
      body,
    }),

  /** Archive, never delete: past claims reference the type they were made under. */
  archiveType: (id: string) =>
    request<{
      id: string;
      archived: boolean;
      /** Approved claims of this kind still owed. They will still be paid. */
      outstandingClaims: number;
      note: string;
    }>(`/reimbursements/types/${id}`, { method: "DELETE" }),

  /** The caller's own. `employeeId` comes from the token, never the query. */
  mine: (params: ClaimListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiClaim>("/reimbursements/me", {
      query: { pageSize: 100, ...params },
      ...(signal ? { signal } : {}),
    }),

  /** The approval queue. Everything undecided, oldest cost first. */
  pending: (params: ClaimListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiClaim>("/reimbursements/pending", {
      query: { pageSize: 100, ...params },
      ...(signal ? { signal } : {}),
    }),

  summary: (signal?: AbortSignal) =>
    request<ApiExpenseSummary>("/reimbursements/summary", {
      ...(signal ? { signal } : {}),
    }),

  /**
   * Every claim the caller may see. Narrows to their own without
   * `APPROVE_EXPENSES`, `EDIT_RECORDS` or `VIEW_SALARIES` — an employee opening
   * the expenses screen gets their expenses, not a 403.
   */
  list: (params: ClaimListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiClaim>("/reimbursements", {
      query: { pageSize: 100, ...params },
      ...(signal ? { signal } : {}),
    }),

  create: (body: CreateClaimBody) =>
    request<ApiClaim>("/reimbursements", { method: "POST", body }),

  get: (id: string, signal?: AbortSignal) =>
    request<ApiClaimDetail>(`/reimbursements/${id}`, {
      ...(signal ? { signal } : {}),
    }),

  update: (id: string, body: UpdateClaimBody) =>
    request<ApiClaim>(`/reimbursements/${id}`, { method: "PATCH", body }),

  approve: (id: string, note?: string) =>
    request<ApiClaim>(`/reimbursements/${id}/approve`, {
      method: "POST",
      body: note ? { note } : {},
    }),

  /** The reason is required. The API refuses an empty one, and says why. */
  decline: (id: string, reason: string) =>
    request<ApiClaim>(`/reimbursements/${id}/decline`, {
      method: "POST",
      body: { reason },
    }),

  /** Settle outside payroll — a transfer, or petty cash. No payslip attached. */
  markPaid: (id: string, paidOn?: string) =>
    request<ApiClaim>(`/reimbursements/${id}/mark-paid`, {
      method: "POST",
      body: paidOn ? { paidOn } : {},
    }),
};

/* ------------------------------------------------------------ policy errors */

/**
 * The machine-readable half of a 422 from the claim form.
 *
 * The API's cap and receipt refusals carry `error.details` alongside a sentence
 * already written for a person, so a form can point at the field that was wrong
 * *and* show the message it was given rather than inventing its own. Both
 * limits are named; nothing else in this module reads `details`.
 */
export type PolicyBreach =
  | { limit: "requiresReceipt"; typeName: string }
  | { limit: "capAmount"; typeName: string; capKobo: number; amountKobo: number };

export function policyBreach(error: unknown): PolicyBreach | null {
  if (!(error instanceof ApiError)) return null;
  const details = error.details;
  if (!details || Array.isArray(details)) return null;

  const limit = details["limit"];
  const typeName = typeof details["typeName"] === "string" ? details["typeName"] : "";

  if (limit === "requiresReceipt") return { limit: "requiresReceipt", typeName };
  if (limit === "capAmount") {
    const capKobo = details["capKobo"];
    const amountKobo = details["amountKobo"];
    if (typeof capKobo === "number" && typeof amountKobo === "number") {
      return { limit: "capAmount", typeName, capKobo, amountKobo };
    }
  }
  return null;
}

/* -------------------------------------------------------------------- money */

/** Kobo from the wire to naira for a screen. */
export const naira = (kobo: number): number => Math.round(kobo) / 100;

/** Naira from a form to kobo for the wire. Rounds, so a stray float cannot ride along. */
export const kobo = (amount: number): number => Math.round(amount * 100);

export type { Paged };
