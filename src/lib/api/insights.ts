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

/**
 * The signed-in person's own three facts. Absent when the account has no
 * employee record behind it — an external administrator has no pay and no
 * leave, and three zeroes would say otherwise.
 */
export type MyOverview = {
  /** Absent when no payroll has ever included them. Never a zero. */
  pay?: {
    /** `YYYY-MM`. */
    period: string;
    netKobo: number;
    /** `PAID`, not `APPROVED`. Approving is a decision; paying moved money. */
    paid: boolean;
  };
  /**
   * Every type they have an entitlement in, biggest first.
   *
   * Deliberately not one headline figure: nothing on a leave type says which
   * is the ordinary annual one, so picking would be a guess — and the guess
   * the API first made showed a man 84 days of maternity leave. Empty is a
   * company that has configured no leave, which is not "no days left".
   */
  leave: {
    leaveType: string;
    entitled: number;
    taken: number;
    remaining: number;
  }[];
  /** Approvals addressed to them and still open. Zero is a real answer here. */
  waitingOnMe: number;
};

export type DashboardData = {
  asOf: string;
  /** The caller's own facts. See `MyOverview`. */
  me?: MyOverview;
  /**
   * Absent for a plain employee — the same rule as `hiring`, `payroll` and
   * `money` below. Headcount, the company-wide approval backlog and who has
   * not clocked in today are facts about the whole company, not about one
   * person, so `EDIT_RECORDS` or `VIEW_SALARIES` gates all three together.
   * `active: 0` here would be a false claim about the company rather than an
   * honest "you cannot see this" — check for presence, never for a falsy
   * value, same as every other gated block on this type.
   */
  headcount?: {
    active: number;
    startingThisMonth: number;
    leavingThisMonth: number;
    incomplete: number;
  };
  approvals?: {
    waiting: number;
    overdue: number;
    oldestWaitingDays: number | null;
  };
  today?: {
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
  /**
   * Starters still working through their onboarding checklist.
   *
   * Absent for anybody without access to the onboarding register (same rule as
   * `exits`). `{ open: 0 }` would tell a manager nobody is onboarding, which
   * may be false.
   *
   * `withMandatoryOutstanding` counts people, not tasks.
   */
  onboarding?: {
    open: number;
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
  /**
   * ## Every section here is optional, and that is not defensiveness
   *
   * A browser cannot pin the version of the API it is talking to. A deploy
   * puts a new bundle in front of people while the API behind it is whatever
   * it is, and any section this type declares as *present* is a promise the
   * client cannot keep on its own.
   *
   * It was declared present, and a real company's dashboard went white:
   *
   *     TypeError: Cannot read properties of undefined (reading 'trend')
   *       at chart-headcount-trend
   *
   * from `reports?.workforce.trend` — the `?.` guarded the object that can be
   * null while loading, and nothing guarded the section. TypeScript could not
   * help, because the type said the section was always there.
   *
   * `DashboardData` above already models this correctly: `pay?`, `headcount?`,
   * `approvals?`, `today?` are optional because the API omits them by
   * permission. This type is the same shape of answer from the same module and
   * was written as though it were not.
   */
  period: string;
  payrollByDepartment:
    | {
        department: string;
        headcount: number;
        grossKobo: number;
        netKobo: number;
      }[]
    | null;
  grossBreakdown: {
    basicKobo: number;
    housingKobo: number;
    transportKobo: number;
    allowancesKobo: number;
    employerPensionKobo: number;
  } | null;
  headcount?: {
    byDepartment: { name: string; count: number }[];
    byEmploymentType: { type: string; count: number }[];
  };
  operationalLoad?: {
    leaveRequests: number;
    ticketsOpen: number;
    approvalsPending: number;
    attendanceCorrections: number;
  };
  /**
   * Headcount over time, turnover and tenure.
   *
   * Derived on the API from `startDate` and `endDate`, which **are** the
   * historical record — not a snapshot table, and not the invented `Feb: 182 …
   * Aug: 264` array this product once drew on the dashboard.
   *
   * Needs no `VIEW_SALARIES`, unlike everything else on this report: how many
   * people work here and how long they stay carries no money.
   *
   * Optional for the reason at the top of this type: an older API does not
   * send it at all.
   */
  workforce?: {
    /** Oldest first, one per month. */
    trend: {
      month: string;
      headcount: number;
      joiners: number;
      leavers: number;
    }[];
    /**
     * Leavers against average headcount, in basis points.
     *
     * **Null, never 0**, for a company with nobody in it — 0% would claim it
     * retains everybody, which is a statement about a workforce that does not
     * exist.
     */
    turnoverBp: number | null;
    turnoverWindowMonths: number;
    /** Null for a company with nobody. Over current staff, not leavers. */
    averageTenureMonths: number | null;
    headcountNow: number;
  };
};

/**
 * One person's own dashboard arrangement.
 *
 * `layout` is **null** for somebody who has never opened the drawer, and an
 * empty `widgets` array for somebody who switched everything off. Those are
 * different answers and the screen treats them differently — the first takes
 * the catalogue's defaults for their role, which are allowed to change between
 * releases; the second is a decision to keep. See `DashboardLayout` on the API.
 */
export type ApiDashboardLayout = {
  layout: { widgets: string[]; updatedAt: string } | null;
};

export const insightsApi = {
  dashboard: (): Promise<DashboardData> =>
    request<DashboardData>("/insights/dashboard"),

  layout: (signal?: AbortSignal): Promise<ApiDashboardLayout> =>
    request<ApiDashboardLayout>("/insights/dashboard/layout", { signal }),

  /**
   * Replaces the whole arrangement.
   *
   * Order and membership are one fact, so there is no per-widget endpoint —
   * half a saved arrangement is a state nobody can describe. Same shape as the
   * appraiser weights and the payroll lines modal.
   */
  saveLayout: (widgets: readonly string[]): Promise<ApiDashboardLayout> =>
    request<ApiDashboardLayout>("/insights/dashboard/layout", {
      method: "PUT",
      body: { widgets },
    }),

  /**
   * Back to never having chosen, so the catalogue's defaults answer again.
   *
   * A DELETE rather than a PUT of today's defaults: that is what makes a later
   * release's better starting arrangement reach the person who reset, and it is
   * the only way back to the `null` state the API distinguishes.
   */
  clearLayout: (): Promise<ApiDashboardLayout> =>
    request<ApiDashboardLayout>("/insights/dashboard/layout", {
      method: "DELETE",
    }),

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
