import { request } from "@/lib/api/client";
import type { ApiBoard } from "@/lib/api/announcements";

/**
 * The dashboard and the reports, in one request each.
 *
 * Ten backend modules expose a `/summary` or `/analytics` of their own, and the
 * obvious build is a dashboard that calls all ten. That is ten round trips
 * before anybody sees a number, on the screen people open first, with the
 * aggregation on the wrong side of the network. `/insights` composes it where
 * the rows are and answers once.
 *
 * ## Blocks arrive absent, not empty
 *
 * The server omits a block the caller has no permission for — `money` and
 * `hiring` are simply not in the response rather than zeroed. So **check for
 * presence, never for a falsy value**: `data.money && …`, not
 * `data.money.loansOutstandingKobo > 0`. A screen that renders `₦0.00` where it
 * should render nothing has told somebody their company has no outstanding
 * loans, which is a different and wrong claim.
 *
 * `payroll` is the one field that is genuinely nullable: `null` means "you may
 * see runs and there is none for this month", which the screen answers with an
 * offer to start one. Absent means "you may not see runs" and the screen says
 * nothing at all.
 */

/** Money crosses as integer kobo. Naira is a display concern. */
export const naira = (kobo: number): number => kobo / 100;

export type DashboardData = {
  asOf: string;
  headcount: {
    active: number;
    startingThisMonth: number;
    leavingThisMonth: number;
    incomplete: number;
  };
  approvals: { waiting: number; overdue: number; oldestWaitingDays: number | null };
  today: {
    expected: number;
    clockedIn: number;
    late: number;
    onLeave: number;
    unaccountedFor: number;
  };
  /**
   * The noticeboard, as this person may read it. Drafts never appear.
   *
   * Present for everybody, unlike `hiring`, `payroll` and `money` — a
   * noticeboard needs no permission, so there is nothing to withhold. That does
   * not make an empty board a thing to draw: `notices: []` is a true statement
   * about the company and the panel renders **nothing** for it, because "Your
   * Announcements Will Appear Here" is furniture, not information.
   */
  announcements: ApiBoard;
  /**
   * Exits on the way out, for whoever may see the exit register.
   *
   * Absent for anybody who may only see their own exit — the same rule as
   * `hiring` and `money`, and for the sharper reason: `{ open: 0 }` would tell
   * a manager that nobody in the company is leaving, which is a claim about the
   * company rather than about their permissions.
   *
   * `withMandatoryOutstanding` counts **people**, not tasks. One person with
   * six unticked lines is one person on their way out, and summing lines would
   * put six on the dashboard.
   */
  exits?: {
    open: number;
    /** Of `open`, how many still have a mandatory checklist line unticked. */
    withMandatoryOutstanding: number;
  };
  hiring?: {
    candidatesInPlay: number;
    stalledSevenDays: number;
    interviewsNextSevenDays: number;
    offersOut: number;
  };
  /** Undefined = not permitted. Null = permitted, no run this month. */
  payroll?: {
    period: string;
    status: string;
    /** People with a payslip on the run. Not the headcount. */
    employeeCount: number;
    /**
     * People in the period deliberately left off it, with a reason recorded.
     *
     * Sent so this card can say "9 of 10 — 1 excluded" rather than a bare 9. It
     * is the same absent-versus-zero discipline as the blocks above, applied to
     * a figure that is *present* and incomplete: `employeeCount` is payslips,
     * which answers "how many were paid" and not "is everybody here".
     */
    excludedCount: number;
    grossKobo: number;
    netKobo: number;
    blockers: number;
    warnings: number;
  } | null;
  money?: {
    loansOutstandingKobo: number;
    expensesApprovedUnpaidKobo: number;
    overtimeAwaitingApprovalKobo: number;
  };
};

export type ReportsData = {
  period: string;
  payrollByDepartment:
    | { department: string; headcount: number; grossKobo: number; netKobo: number }[]
    | null;
  grossBreakdown: {
    basicKobo: number;
    housingKobo: number;
    transportKobo: number;
    allowancesKobo: number;
    employerPensionKobo: number;
  } | null;
  headcount: {
    byDepartment: { name: string; count: number }[];
    byEmploymentType: { type: string; count: number }[];
  };
  operationalLoad: {
    leaveRequests: number;
    ticketsOpen: number;
    approvalsPending: number;
    attendanceCorrections: number;
  };
};

export const insightsApi = {
  dashboard: (): Promise<DashboardData> =>
    request<DashboardData>("/insights/dashboard"),

  /** `period` is `YYYY-MM`. Omitted means this month. */
  reports: (period?: string): Promise<ReportsData> =>
    request<ReportsData>(
      period ? `/insights/reports?period=${period}` : "/insights/reports",
    ),
};

/** `FULL_TIME` → `Full time`. The API returns the enum; people read words. */
export function employmentTypeLabel(type: string): string {
  const words = type.toLowerCase().split("_").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** `DRAFT` → `Draft`, `IN_REVIEW` → `In review`. */
export const runStatusLabel = employmentTypeLabel;
