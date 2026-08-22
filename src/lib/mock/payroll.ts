import { EMPLOYEES } from "./people";
import { fullName, type Employee } from "@/lib/types";

/**
 * One person as the payroll surface needs them.
 *
 * Declared here rather than imported, now that the frontend payroll engine is
 * gone: this is a *projection of the directory*, not an engine input. Nothing in
 * the browser computes a payslip from it — the API does, or demo mode reads
 * fixed illustrative figures keyed on `grossMonthly` (`lib/mock/demo-payslips`).
 *
 * `grossMonthly` is naira, in step with `Employee`. Every figure derived from it
 * is kobo, and the conversion happens once, at the boundary.
 */
export type PayrollEmployee = {
  id: string;
  name: string;
  jobTitle: string;
  department: string;
  /**
   * Null where no pay is agreed. A run raises `missing_pay` naming them and
   * writes no payslip — it never prorates an absent figure to zero.
   */
  grossMonthly: number | null;
  bankAccount: string | null;
  pensionPin: string | null;
  taxState: string;
  /** Set when the person joined or left mid-period. */
  joinedThisPeriod?: boolean;
  leftThisPeriod?: boolean;
};

/** The period this prototype's run covers. */
const PERIOD_START = "2026-08-01";
const PERIOD_END = "2026-08-31";

/**
 * The people in the August run, projected from the employee directory rather
 * than listed separately. Payroll and the directory therefore cannot disagree
 * about who works here — which is the whole reason this product exists.
 *
 * Joiners and leavers are derived from the dates on the record, not flagged by
 * hand, so a start date correction automatically changes the run.
 */
export function runPeopleFrom(employees: Employee[]): PayrollEmployee[] {
  return employees
    .filter((e) => e.status !== "inactive")
    .map((e) => ({
      id: e.id,
      name: fullName(e),
      jobTitle: e.jobTitle,
      department: e.department,
      grossMonthly: e.grossMonthly,
      bankAccount: e.bankAccount,
      pensionPin: e.pensionPin,
      taxState: e.taxState,
      joinedThisPeriod: e.startDate >= PERIOD_START && e.startDate <= PERIOD_END,
      leftThisPeriod: Boolean(
        e.endDate && e.endDate >= PERIOD_START && e.endDate <= PERIOD_END,
      ),
    }));
}

/**
 * The unedited run list, for server rendering and static params.
 *
 * Client screens must derive their own from the employee store instead —
 * see `runPeopleFrom`. Reading this constant on the client means a record
 * edited a moment ago is not reflected in the run, which is precisely the
 * disagreement this product exists to remove.
 */
export const RUN_PEOPLE: PayrollEmployee[] = runPeopleFrom(EMPLOYEES);

/** Last month's net pay per person, used to catch large swings. */
export const PREVIOUS_NET = new Map<string, number>(DEMO_ENABLED ? [
  ["p-01", 1_383_003],
  ["p-02", 1_552_120],
  ["p-03", 1_243_880],
  ["p-04", 1_083_440],
  ["p-05", 771_260],
  ["p-06", 706_115],
  ["p-07", 566_940],
  ["p-10", 613_780],
] : []);

/* ------------------------------------------------------------ Distribution */

/**
 * How each payslip reached its employee.
 *
 * `viewed` is tracked separately from `delivered` because they answer
 * different questions: delivered is whether we did our job, viewed is whether
 * the employee has actually seen their pay. Only the first is our fault when
 * it fails, but the second is the one that generates help-desk tickets.
 */
export type DeliveryState =
  | "ready"
  | "sent"
  | "delivered"
  | "viewed"
  | "bounced"
  | "no_email";

export type Distribution = {
  employeeId: string;
  email: string | null;
  state: DeliveryState;
  sentAt?: string;
  viewedAt?: string;
  /** Present when state is "bounced". Shown verbatim — the reason matters. */
  failureReason?: string;
};

export const DISTRIBUTION: Distribution[] = DEMO_ENABLED ? [
  { employeeId: "p-01", email: "adaeze.okonkwo@schulltech.com", state: "viewed", sentAt: "28 Aug 09:02", viewedAt: "28 Aug 09:14" },
  { employeeId: "p-02", email: "tunde.bakare@schulltech.com", state: "viewed", sentAt: "28 Aug 09:02", viewedAt: "28 Aug 10:41" },
  { employeeId: "p-03", email: "chidi.nwosu@schulltech.com", state: "delivered", sentAt: "28 Aug 09:02" },
  { employeeId: "p-04", email: "ngozi.eze@schulltech.com", state: "viewed", sentAt: "28 Aug 09:02", viewedAt: "29 Aug 07:33" },
  { employeeId: "p-05", email: "fatima.bello@schulltech.com", state: "delivered", sentAt: "28 Aug 09:02" },
  { employeeId: "p-06", email: "amara.nwachukwu@schulltech.com", state: "sent", sentAt: "28 Aug 09:02" },
  {
    employeeId: "p-07",
    email: "musa.ibrahim@schulltech.com",
    state: "bounced",
    sentAt: "28 Aug 09:02",
    failureReason: "Mailbox full — the receiving server rejected the message.",
  },
  { employeeId: "p-08", email: null, state: "no_email" },
  { employeeId: "p-09", email: "emeka.anyanwu@schulltech.com", state: "ready" },
  { employeeId: "p-10", email: "halima.sani@schulltech.com", state: "ready" },
] : [];

export const distributionFor = (id: string) =>
  DISTRIBUTION.find((d) => d.employeeId === id);

/** Loan repayments already scheduled against this period. */
export const SCHEDULED_DEDUCTIONS = new Map<string, { label: string; amount: number }>(
  DEMO_ENABLED ? [
  ["p-01", { label: "Staff loan", amount: 75_000 }],
  ["p-04", { label: "Salary advance", amount: 120_000 }],
  ["p-07", { label: "Equipment loan", amount: 35_000 }],
] : []);
