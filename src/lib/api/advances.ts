"use client";

import { request } from "@/lib/api/client";

/**
 * Earned wage access — `/api/v1/advances`.
 *
 * Drawing pay you have already earned, before payday.
 *
 * ## Three sentences the API sends that a screen must render
 *
 * - `estimateNotice` — the earned figure is worked out from days at work and
 *   knows nothing about a bonus or leave taken later. A number that reads as a
 *   promise is worse than none.
 * - `fundingNotice` — the money comes out of the company's own wallet before
 *   payday, so the balance has to cover it.
 * - `feeNotice` — charging a fee may bring this under lending rules. It is zero
 *   unless somebody sets it deliberately.
 *
 * ## Null is not zero
 *
 * `earnedKobo`, `capKobo` and `availableKobo` are **null** for somebody with no
 * salary on their record. That is a missing fact about the company's data, not
 * a person who has earned nothing, and the two must not render the same.
 *
 * ## Approved is not paid
 *
 * `APPROVED` means somebody signed it off. `PAID` means money actually left,
 * which needs a payment provider. Nothing here sets `PAID` on its own.
 */

export type ApiAdvanceStatus =
  | "REQUESTED"
  | "APPROVED"
  | "PAID"
  | "DECLINED"
  | "CANCELLED"
  | "RECOVERED";

export const STATUS_LABELS: Record<ApiAdvanceStatus, string> = {
  REQUESTED: "Waiting on a decision",
  APPROVED: "Approved — money not sent yet",
  PAID: "Paid, to come off your payslip",
  DECLINED: "Declined",
  CANCELLED: "Withdrawn",
  RECOVERED: "Repaid from your payslip",
};

export type ApiEarned = {
  employeeId: string;
  period: string;
  asOf: string;
  /** Null when there is no salary on the record. Never zero. */
  grossMonthlyKobo: number | null;
  workingDaysInMonth: number;
  workingDaysElapsed: number;
  unpaidDaysSoFar: number;
  daysEarned: number;
  earnedKobo: number | null;
};

export type ApiEligibility = {
  employeeId: string;
  period: string;
  enabled: boolean;
  earnedKobo: number | null;
  capKobo: number | null;
  outstandingKobo: number;
  availableKobo: number | null;
  taken: number;
  maxPerPeriod: number;
  maxPercentBp: number;
  minAmountKobo: number;
  feeKobo: number;
  /** The one sentence saying why they cannot, or null when they can. */
  refusal: string | null;
  estimateNotice: string;
};

export type ApiAdvance = {
  id: string;
  employeeId: string;
  employeeName: string;
  period: string;
  amountKobo: number;
  feeKobo: number;
  outstandingKobo: number;
  earnedAtRequestKobo: number;
  capAtRequestKobo: number;
  status: ApiAdvanceStatus;
  requestedAt: string;
  decidedAt: string | null;
  declineReason: string | null;
  paidAt: string | null;
  recoveredAt: string | null;
  recoveredKobo: number;
};

export type ApiAdvancePolicy = {
  enabled: boolean;
  maxPercentBp: number;
  minAmountKobo: number;
  maxAmountKobo: number | null;
  maxPerPeriod: number;
  feeKobo: number;
  feeNotice: string;
  fundingNotice: string;
};

const signalOf = (signal?: AbortSignal) => (signal ? { signal } : {});

export const advancesApi = {
  policy: (signal?: AbortSignal) =>
    request<ApiAdvancePolicy>("/advances/policy", signalOf(signal)),

  setPolicy: (body: {
    enabled?: boolean;
    maxPercentBp?: number;
    minAmountKobo?: number;
    maxAmountKobo?: number | null;
    maxPerPeriod?: number;
    feeKobo?: number;
  }) => request<ApiAdvancePolicy>("/advances/policy", { method: "PATCH", body }),

  /** What the caller has earned, and what they could draw. No permission. */
  me: (signal?: AbortSignal) =>
    request<{ earned: ApiEarned; eligibility: ApiEligibility }>(
      "/advances/me",
      signalOf(signal),
    ),

  list: (
    query: { employeeId?: string; status?: ApiAdvanceStatus } = {},
    signal?: AbortSignal,
  ) =>
    request<ApiAdvance[]>("/advances", {
      query: { employeeId: query.employeeId, status: query.status },
      ...signalOf(signal),
    }),

  request: (amountKobo: number, employeeId?: string) =>
    request<ApiAdvance>("/advances", {
      method: "POST",
      body: { amountKobo, ...(employeeId ? { employeeId } : {}) },
    }),

  approve: (id: string) =>
    request<ApiAdvance>(`/advances/${id}/approve`, { method: "POST" }),

  decline: (id: string, reason: string) =>
    request<ApiAdvance>(`/advances/${id}/decline`, {
      method: "POST",
      body: { reason },
    }),

  cancel: (id: string) =>
    request<ApiAdvance>(`/advances/${id}/cancel`, { method: "POST" }),

  /** Only once a transfer has actually happened. See the header. */
  markPaid: (id: string, paymentInstructionId?: string) =>
    request<ApiAdvance>(`/advances/${id}/mark-paid`, {
      method: "POST",
      body: paymentInstructionId ? { paymentInstructionId } : {},
    }),
};
