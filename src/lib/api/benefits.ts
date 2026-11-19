"use client";

import { request } from "@/lib/api/client";

/**
 * Benefits — `/api/v1/benefits`.
 *
 * ## Two figures a screen must never merge
 *
 * `employeeMonthlyKobo` comes off somebody's pay and appears on their payslip.
 * `employerMonthlyKobo` does not — it is a company cost, the same shape as
 * employer pension, and this codebase says at length that employer pension is
 * added on top of gross and never subtracted from it. A screen that showed them
 * as one "cost" would be claiming the company's premium reduced somebody's pay.
 *
 * ## `preTax` is the expensive one
 *
 * `PRE_TAX_NOTICE` is not a tooltip. Only a narrow set of schemes comes off
 * before PAYE, and marking a plan pre-tax when it does not qualify understates
 * PAYE — with the shortfall landing on the **employer**. It is rendered beside
 * the switch, in full.
 */

export type ApiBenefitKind =
  | "HEALTH"
  | "LIFE_ASSURANCE"
  | "PENSION_TOP_UP"
  | "TRANSPORT"
  | "HOUSING"
  | "WELLNESS"
  | "OTHER";

export type ApiBenefitPlan = {
  id: string;
  name: string;
  kind: ApiBenefitKind;
  kindLabel: string;
  provider: string | null;
  description: string | null;
  employerMonthlyKobo: number;
  employeeMonthlyKobo: number;
  preTax: boolean;
  archived: boolean;
  enrolled: number;
  /** Summed per enrolment, so a family plan's higher price is not lost. */
  monthlyEmployerCostKobo: number;
};

export type ApiBenefitEnrolment = {
  id: string;
  planId: string;
  planName: string;
  kind: ApiBenefitKind;
  employeeId: string;
  employeeName: string;
  startedOn: string;
  endedOn: string | null;
  active: boolean;
  dependants: number;
  employerMonthlyKobo: number;
  employeeMonthlyKobo: number;
  /** True where the figures came from this enrolment rather than the plan. */
  priced: boolean;
  preTax: boolean;
};

export type ApiBenefitCost = {
  period: string;
  employerKobo: number;
  employeeKobo: number;
  people: number;
  plans: number;
};

export type ApiBenefitNotices = {
  preTax: string;
  wholeMonth: string;
  kinds: Record<ApiBenefitKind, string>;
};

/**
 * One HMO a member of staff is on, as `GET /benefits/me` tells them.
 *
 * Every field that can be absent **is** null — never an empty string and never a
 * zero — and the card renders null as "Not on file". The two money figures stay
 * apart for the reason at the top of this file: what comes off their pay is not
 * what the company pays.
 */
export type ApiHealthCover = {
  /** A deduction on their payslip, or a plan in Benefits. Same card either way. */
  source: "PAYROLL" | "BENEFIT_PLAN";
  name: string;
  provider: string | null;
  /** ISO date. Null when the cover has no start of its own (a company-wide premium). */
  since: string | null;
  /** What comes off their pay each month. Null when it is a percentage of pay, or has no figure. */
  employeeMonthlyKobo: number | null;
  /** What the company pays for them each month. Plans only; null otherwise. */
  employerMonthlyKobo: number | null;
  /** Spouse and children on the cover. Plans only; null otherwise. */
  dependants: number | null;
};

export type ApiMyHealthCover = {
  /** The member ID on their HMO card, if HR has entered it. */
  memberNumber: string | null;
  covers: ApiHealthCover[];
};

export type PlanBody = {
  name: string;
  kind: ApiBenefitKind;
  provider?: string | null;
  description?: string | null;
  employerMonthlyKobo: number;
  employeeMonthlyKobo: number;
  preTax?: boolean;
};

const signalOf = (signal?: AbortSignal) => (signal ? { signal } : {});

export const benefitsApi = {
  notices: (signal?: AbortSignal) =>
    request<ApiBenefitNotices>("/benefits/notices", signalOf(signal)),

  /**
   * The signed-in person's own HMO. No permission and no id: the API reads the
   * employee from the session, so this is the one benefits call every member of
   * staff can make and it can only ever answer about the caller.
   */
  mine: (signal?: AbortSignal) =>
    request<ApiMyHealthCover>("/benefits/me", signalOf(signal)),

  plans: (includeArchived = false, signal?: AbortSignal) =>
    request<ApiBenefitPlan[]>("/benefits/plans", {
      query: { includeArchived: includeArchived ? "true" : undefined },
      ...signalOf(signal),
    }),

  createPlan: (body: PlanBody) =>
    request<ApiBenefitPlan>("/benefits/plans", { method: "POST", body }),

  updatePlan: (id: string, body: Partial<PlanBody> & { archived?: boolean }) =>
    request<ApiBenefitPlan>(`/benefits/plans/${id}`, { method: "PATCH", body }),

  enrolments: (
    query: {
      planId?: string;
      employeeId?: string;
      includeEnded?: boolean;
    } = {},
    signal?: AbortSignal,
  ) =>
    request<ApiBenefitEnrolment[]>("/benefits/enrolments", {
      query: {
        planId: query.planId,
        employeeId: query.employeeId,
        includeEnded: query.includeEnded ? "true" : undefined,
      },
      ...signalOf(signal),
    }),

  enrol: (
    planId: string,
    body: {
      employeeId: string;
      startedOn: string;
      dependants?: number;
      /** Null means the plan's own price. Never send 0 to mean "the default". */
      employerMonthlyKobo?: number | null;
      employeeMonthlyKobo?: number | null;
    },
  ) =>
    request<ApiBenefitEnrolment>(`/benefits/plans/${planId}/enrolments`, {
      method: "POST",
      body,
    }),

  endEnrolment: (id: string, endedOn: string) =>
    request<ApiBenefitEnrolment>(`/benefits/enrolments/${id}/end`, {
      method: "POST",
      body: { endedOn },
    }),

  cost: (period: string, signal?: AbortSignal) =>
    request<ApiBenefitCost>("/benefits/cost", {
      query: { period },
      ...signalOf(signal),
    }),
};
