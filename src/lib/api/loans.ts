"use client";

import { request, requestPaged, type Paged } from "@/lib/api/client";

/**
 * Staff loans — `/api/v1/loans`.
 *
 * Typed wrappers only, hand-written in the same style as `endpoints.ts` and
 * `grades.ts`. No React, no state: this file knows the shape of the wire and
 * nothing else.
 *
 * ## Money
 *
 * Every amount in and out is integer **kobo**, and every field carrying one says
 * so in its name. `naira()` and `kobo()` at the bottom are the whole boundary —
 * nothing else in this module or in `store/loans.ts` divides by 100, and no
 * screen should either. A loan instalment that has been through a float is an
 * instalment that no longer matches the deduction payroll took.
 *
 * ## Three list endpoints, one row shape
 *
 * `GET /loans`, `GET /loans/pending` and `GET /loans/me` all answer with the
 * same `ApiLoan`. They differ only in what they are scoped to:
 *
 * | | Scope | Permission |
 * |---|---|---|
 * | `list` | everybody's, filterable | `VIEW_SALARIES` |
 * | `pending` | waiting for a decision, oldest first | `APPROVE_LOANS` |
 * | `mine` | the caller's own | none — a person can always see their own |
 *
 * One row shape means the approval queue is the list with a filter on it, which
 * is what the screen renders it as.
 *
 * ## `q` is sent, and may be ignored
 *
 * The list takes the shared `listQuery`, so `q` validates. Until the service
 * searches on it (employee name and number, being added to the API) it is
 * accepted and ignored, so nothing here may rely on it narrowing the answer: the
 * screen filters what it has loaded itself, and sends `q` only as well, for a
 * book too big to load in one request. Sending it early is harmless.
 */

/* ------------------------------------------------------------------- shapes */

/**
 * Mirrors `LoanStatus` in the Prisma schema.
 *
 * `APPROVED` exists in the enum and is not currently reachable: approval
 * generates the schedule and goes straight to `ACTIVE` in one transaction,
 * because a loan that is approved with no schedule deducts nothing and looks
 * fine. Handle it anyway — a status a screen cannot render is a blank cell.
 */
export type LoanStatus =
  | "PENDING"
  | "APPROVED"
  | "ACTIVE"
  | "SETTLED"
  | "DECLINED"
  /** Folded into another loan, which now carries what was still owed on it. Lists leave it out unless asked. */
  | "CONSOLIDATED"
  /** Stopped by an administrator after approval. Kept, with who and why, and listed under its own tab. */
  | "CANCELLED";

/** Mirrors `LoanRepaymentStatus`. `WAIVED` means forgiven, not paid. */
export type LoanRepaymentStatus = "SCHEDULED" | "PARTIAL" | "PAID" | "WAIVED";

/** A loan as every list endpoint returns it. No schedule — see `ApiLoanDetail`. */
export type ApiLoan = {
  id: string;
  employeeId: string;
  /** Joined by the API. One name, not two fields. */
  employeeName: string;
  employeeNo: string;
  jobTitle: string;

  /** The accumulated loan: what was originally lent. Never reduced. */
  principalKobo: number;
  /** Repaid before it was entered here. Zero or absent for a loan that started here. */
  alreadyRepaidKobo?: number;
  /**
   * What was still owed on earlier loans when they were folded into this one. Part of `principalKobo` and
   * earning no new interest. Zero or absent for a loan that never took another in.
   */
  carriedForwardKobo?: number;
  /** On a loan that was folded into another: which one took it over, and when. */
  consolidatedIntoId?: string | null;
  consolidatedAt?: string | null;
  /** Flat annual rate as a fraction: 0.05 is 5% a year. 0 is the common case. */
  interestRate: number;
  interestKobo: number;
  /** Principal plus interest. What the schedule sums to once approved. */
  totalRepayableKobo: number;
  termMonths: number;
  monthlyRepaymentKobo: number;
  /** Recomputed from the schedule on every write, so it cannot drift. */
  outstandingKobo: number;

  status: LoanStatus;
  reason: string | null;
  /** First pay period deductions come out of. Null until somebody decides. */
  startPeriod: string | null;

  /**
   * For a PENDING application only, and only on the single-loan read: what approving it will
   * fold in from the borrower's other live loans. Null when there is nothing to fold.
   */
  combinesWith?: { count: number; owedKobo: number } | null;

  /**
   * Whoever **decided**, either way.
   *
   * The schema has no `declinedById`, so `approvedById` carries the decliner
   * too and the API surfaces the pair under a neutral name. Without it a
   * declined loan has nobody's name against it outside the audit log.
   */
  decidedById: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  declinedReason: string | null;
  /** Set when an administrator cancelled the loan. Absent from an older API. */
  cancelledAt?: string | null;
  cancelledById?: string | null;
  cancelledReason?: string | null;
  completedAt: string | null;
  createdAt: string;
};

/** One instalment. */
export type ApiRepayment = {
  id: string;
  /** 1-based. What the payslip line calls it: "Staff loan 2 of 6". */
  sequence: number;
  dueDate: string;
  amountKobo: number;
  paidAmountKobo: number;
  /** Zero on a waived instalment — it is forgiven, not owing. */
  remainingKobo: number;
  status: LoanRepaymentStatus;
  paidAt: string | null;
  /** The payslip that took it. Null when the payment came in outside payroll. */
  payslipId: string | null;
  /**
   * Money recorded by hand that no payslip has taken yet: the month it comes off, and whether that
   * month's payroll was approved without it. Until then the payroll takes it, so it is not outside payroll.
   * Absent from an API that does not send it.
   */
  handRecordedFor?: { period: string; payrollClosed: boolean } | null;
  note: string | null;
};

/** The answer to "how much is left after March", which is why it is stored. */
export type ApiLoanProgress = {
  instalmentsTotal: number;
  /** Paid or written off. Either way, done with. */
  instalmentsSettled: number;
  scheduledKobo: number;
  paidKobo: number;
  waivedKobo: number;
  remainingKobo: number;
  nextDueDate: string | null;
  nextDueKobo: number;
};

/**
 * `GET /loans/:id`, and the answer to every write.
 *
 * A pending loan has an **empty** schedule: it is generated at approval, in the
 * same transaction as the status flip. A screen must render the empty case, not
 * assume a loan has instalments.
 */
export type ApiLoanDetail = ApiLoan & {
  /**
   * On a loan waiting for a decision: how many of the person's other live loans approving it will fold in, and
   * what is still owed on them. Null or absent when there are none.
   */
  combinesWith?: { count: number; owedKobo: number } | null;
  /** The loans this one took in. Empty or absent when it took none. */
  foldedLoans?: ApiLoan[];
  schedule: ApiRepayment[];
  progress: ApiLoanProgress;
};

/**
 * `GET /loans/summary`.
 *
 * `thisMonth.deductionKobo` is what payroll will actually try to take: every
 * instalment still owing that is due this month **or earlier**. `arrearsKobo` is
 * how much of that is late — a rising figure means salaries are not covering the
 * deductions being scheduled against them.
 */
export type ApiLoanSummary = {
  /** `YYYY-MM`. */
  period: string;
  outstandingKobo: number;
  activeCount: number;
  pendingCount: number;
  thisMonth: {
    deductionKobo: number;
    instalmentCount: number;
    arrearsKobo: number;
  };
};

/* -------------------------------------------------------------------- input */

export type LoanListParams = {
  page?: number;
  pageSize?: number;
  /** Allow-list: createdAt | principal | outstanding | status | startPeriod. */
  sort?: "createdAt" | "principal" | "outstanding" | "status" | "startPeriod";
  order?: "asc" | "desc";
  status?: LoanStatus;
  employeeId?: string;
  /** Employee name or staff number, words in any order. See the note at the top. */
  q?: string;
};

/**
 * Applying.
 *
 * `employeeId` absent means "for me" — what an employee applying for themselves
 * sends. Naming somebody else needs `EDIT_RECORDS`, checked in the service
 * because the rule depends on the caller's own employee record.
 *
 * `startPeriod` is refused in a month that has already been paid.
 */
export type ApplyLoanBody = {
  employeeId?: string;
  principalKobo: number;
  /** Repaid before this was entered here. `principalKobo` stays the original. */
  alreadyRepaidKobo?: number;
  /** Either this, or `monthlyKobo`. */
  termMonths?: number;
  /** Take this much a month and let the term follow. Interest-free loans only. */
  monthlyKobo?: number;
  /** Fraction, not a percentage. Defaults to 0 server-side. */
  interestRate?: number;
  reason?: string;
  startPeriod?: string;
};

/**
 * Approving, with optional counter-offer.
 *
 * Every field is an override because a counter-offer is normal: ₦200,000 over
 * six months against an application for ₦300,000 over three. Sending `{}` —
 * which is what a one-click Approve does — takes the loan exactly as applied
 * for. `startPeriod` is usually the approver's to set; the applicant does not
 * know which run their loan lands in.
 */
export type ApproveLoanBody = {
  principalKobo?: number;
  alreadyRepaidKobo?: number;
  termMonths?: number;
  interestRate?: number;
  startPeriod?: string;
  note?: string;
};

/** Recording money that came back outside payroll — a transfer, cash, a cheque. */
export type PayRepaymentBody = {
  amountKobo: number;
  paidAt?: string;
  note?: string;
};

/* -------------------------------------------------------------------- calls */

const listQuery = (params: LoanListParams) => ({
  page: params.page,
  pageSize: params.pageSize,
  sort: params.sort,
  order: params.order,
  status: params.status,
  employeeId: params.employeeId,
  q: params.q,
});

export const loansApi = {
  list: (params: LoanListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiLoan>("/loans", {
      query: listQuery(params),
      ...(signal ? { signal } : {}),
    }),

  /** The queue. Oldest first — the person who waited longest goes first. */
  pending: (params: LoanListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiLoan>("/loans/pending", {
      query: listQuery(params),
      ...(signal ? { signal } : {}),
    }),

  /** A login with no employee record gets an empty page, not an error. */
  mine: (params: LoanListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiLoan>("/loans/me", {
      query: listQuery(params),
      ...(signal ? { signal } : {}),
    }),

  summary: (signal?: AbortSignal) =>
    request<ApiLoanSummary>("/loans/summary", {
      ...(signal ? { signal } : {}),
    }),

  get: (id: string, signal?: AbortSignal) =>
    request<ApiLoanDetail>(`/loans/${id}`, {
      ...(signal ? { signal } : {}),
    }),

  /** Prices the instalment up front, and refuses a second live loan per person. */
  apply: (body: ApplyLoanBody) =>
    request<ApiLoanDetail>("/loans", { method: "POST", body }),

  /**
   * Generates the schedule and flips to ACTIVE in one transaction.
   *
   * Safe to press twice: the status flip is narrowed to `PENDING`, so a second
   * press answers 409 rather than writing a second schedule over the first.
   * Self-approval is refused whatever the permission.
   */
  approve: (id: string, body: ApproveLoanBody = {}) =>
    request<ApiLoanDetail>(`/loans/${id}/approve`, { method: "POST", body }),

  /** Move the first deduction of a loan nothing has come off yet. */
  reschedule: (id: string, startPeriod: string) =>
    request<ApiLoanDetail>(`/loans/${id}/reschedule`, {
      method: "POST",
      body: { startPeriod },
    }),

  /** The reason is required. "Declined" with nothing against it is a support call. */
  decline: (id: string, reason: string) =>
    request<ApiLoanDetail>(`/loans/${id}/decline`, {
      method: "POST",
      body: { reason },
    }),

  /** An administrator stopping an approved loan. The reason is required. */
  cancel: (id: string, reason: string) =>
    request<ApiLoanDetail>(`/loans/${id}/cancel`, {
      method: "POST",
      body: { reason },
    }),

  /** Bookkeeping, not a decision — hence `EDIT_RECORDS` rather than approval. */
  pay: (id: string, sequence: number, body: PayRepaymentBody) =>
    request<ApiLoanDetail>(`/loans/${id}/repayments/${sequence}/pay`, {
      method: "POST",
      body,
    }),

  /** Giving up company money. The note is the record, so it is required. */
  waive: (id: string, sequence: number, note: string) =>
    request<ApiLoanDetail>(`/loans/${id}/repayments/${sequence}/waive`, {
      method: "POST",
      body: { note },
    }),
};

export type PagedLoans = Paged<ApiLoan>;

/* ---------------------------------------------------------------- the money */

/**
 * Kobo to naira, for the screen. The only division by 100 on this side.
 *
 * `Math.round` first because a kobo figure is an integer by contract, and a
 * fractional one means something upstream is already wrong — rounding here keeps
 * the display honest instead of rendering ₦1,234.5678.
 */
export const naira = (kobo: number): number => Math.round(kobo) / 100;

/** Naira to kobo, for a form. The only multiplication by 100 on this side. */
export const kobo = (amount: number): number => Math.round(amount * 100);
