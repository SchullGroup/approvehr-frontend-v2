import { EMPLOYEES, employeeById } from "./people";
import { fullName } from "@/lib/types";

/* =========================================================== Approvals ==== */

/**
 * The approval inbox is the product's namesake, and the one screen that has to
 * span every module: leave, payroll, offers, requisitions, expenses, records.
 *
 * They share a shape rather than each module inventing its own, so one queue
 * can rank them by what actually matters — money at risk and time waiting —
 * instead of by which team happened to raise it.
 */
export type ApprovalKind =
  | "leave"
  | "payroll_run"
  | "offer"
  | "requisition"
  | "expense"
  | "record_change"
  | "loan";

export type ApprovalItem = {
  id: string;
  kind: ApprovalKind;
  title: string;
  /** One line of the detail an approver needs to decide without clicking in. */
  summary: string;
  requestedById: string;
  requestedAt: string;
  /** Days the request has been waiting. Drives the ageing treatment. */
  waitingDays: number;
  /** Naira at stake, where the decision moves money. */
  amount?: number;
  /** Where the full record lives. */
  href: string;
  /** Set when a deadline makes this urgent regardless of age. */
  deadline?: string;
  /**
   * The record this approval *is*, where the inbox derives it from a real one.
   *
   * Leave approvals carry `{ store: "leave", id: "lv-01" }`, and deciding them
   * writes to that leave request rather than to any state of the inbox's own.
   * This exists because the two used to be independently-authored objects: an
   * `APPROVALS` row described a leave request it was not linked to, so
   * approving in the inbox left the actual request pending, and approving on
   * the leave screen left the inbox row sitting there. Anything without a
   * `ref` is a seed row whose underlying module has no store yet.
   */
  ref?: { store: "leave"; id: string };
};

export const APPROVAL_LABEL: Record<ApprovalKind, string> = {
  leave: "Leave",
  payroll_run: "Payroll",
  offer: "Offer",
  requisition: "Requisition",
  expense: "Expense",
  record_change: "Record change",
  loan: "Loan",
};

/**
 * Approvals whose underlying module has no store yet, so the row itself is the
 * record. Leave is deliberately absent: those rows are derived from
 * LEAVE_REQUESTS by `lib/workflows/queue.ts`, which is why there is no longer a
 * hand-written "Annual leave — Ngozi Eze" entry here. When payroll runs,
 * offers, requisitions, expenses and loans each grow a store, they should leave
 * this array the same way.
 */
export const APPROVALS: ApprovalItem[] = [
  {
    id: "ap-01",
    kind: "payroll_run",
    title: "August payroll run",
    summary: "264 employees · pays 28 Aug · reviewed by Fatima Bello",
    requestedById: "p-06",
    requestedAt: "24 Aug",
    waitingDays: 2,
    amount: 93_004_500,
    href: "/payroll",
    deadline: "26 Aug — bank cut-off",
  },
  {
    id: "ap-02",
    kind: "offer",
    title: "Offer — Zainab Yusuf",
    summary: "Senior Backend Engineer · ₦1,750,000 · within band",
    requestedById: "p-06",
    requestedAt: "25 Aug",
    waitingDays: 1,
    amount: 1_750_000,
    href: "/hiring/offers",
  },
  {
    id: "ap-04",
    kind: "requisition",
    title: "Operations Associate ×3",
    summary: "OPS-051 · ₦400k–₦550k band · contract · Abuja",
    requestedById: "p-02",
    requestedAt: "16 Aug",
    waitingDays: 10,
    amount: 19_800_000,
    href: "/hiring",
  },
  {
    id: "ap-05",
    kind: "record_change",
    title: "Bank account change — Chidi Nwosu",
    summary: "Zenith ····8820 → GTBank ····4471",
    requestedById: "p-03",
    requestedAt: "26 Aug",
    waitingDays: 0,
    href: "/people/p-03",
    deadline: "Before the August run",
  },
  {
    id: "ap-06",
    kind: "expense",
    title: "Travel reimbursement — Musa Ibrahim",
    summary: "Lagos → Abeokuta site visits · 3 receipts attached",
    requestedById: "p-07",
    requestedAt: "22 Aug",
    waitingDays: 4,
    amount: 84_500,
    href: "/people/p-07",
  },
  {
    id: "ap-07",
    kind: "loan",
    title: "Salary advance — Halima Sani",
    summary: "₦200,000 over 4 months · leaving 31 Aug",
    requestedById: "p-10",
    requestedAt: "20 Aug",
    waitingDays: 6,
    amount: 200_000,
    href: "/people/p-10",
  },
];

/* =============================================================== Leave ==== */

export type LeaveStatus = "pending" | "approved" | "declined" | "cancelled";

export type LeaveType =
  | "Annual"
  | "Sick"
  | "Compassionate"
  | "Maternity"
  | "Paternity";

export type LeaveRequest = {
  id: string;
  employeeId: string;
  type: LeaveType;
  from: string;
  to: string;
  days: number;
  status: LeaveStatus;
  reason?: string;
  /** Who the request is routed to. */
  approverId?: string;
  /** ISO date the request was raised. Drives ageing in the approval queue. */
  requestedAt?: string;
  /** Set when the request is decided, so the audit trail survives a reload. */
  decidedAt?: string;
  decidedById?: string;
  /** Why it was sent back. Shown to the requester. */
  decisionNote?: string;
};

/**
 * `requestedAt` is a real ISO date rather than a display string because the
 * approval queue ages these against `TODAY` (`lib/today.ts`) — the three
 * pending rows below are deliberately 2, 5 and 7 days old so the inbox has
 * something in each ageing band to show.
 */
export const LEAVE_REQUESTS: LeaveRequest[] = [
  { id: "lv-01", employeeId: "p-04", type: "Annual", from: "2026-09-12", to: "2026-09-16", days: 5, status: "pending", reason: "Family visit", approverId: "p-01", requestedAt: "2026-08-12" },
  { id: "lv-02", employeeId: "p-03", type: "Annual", from: "2026-09-14", to: "2026-09-15", days: 2, status: "pending", approverId: "p-01", requestedAt: "2026-08-17" },
  { id: "lv-03", employeeId: "p-07", type: "Sick", from: "2026-08-18", to: "2026-08-19", days: 2, status: "approved", approverId: "p-02", requestedAt: "2026-08-17", decidedAt: "2026-08-17", decidedById: "p-02" },
  { id: "lv-04", employeeId: "p-05", type: "Annual", from: "2026-08-04", to: "2026-08-08", days: 5, status: "approved", approverId: "p-02", requestedAt: "2026-07-20", decidedAt: "2026-07-22", decidedById: "p-02" },
  { id: "lv-05", employeeId: "p-06", type: "Compassionate", from: "2026-07-21", to: "2026-07-23", days: 3, status: "approved", approverId: "p-05", requestedAt: "2026-07-20", decidedAt: "2026-07-20", decidedById: "p-05" },
  { id: "lv-06", employeeId: "p-09", type: "Annual", from: "2026-09-01", to: "2026-09-05", days: 5, status: "declined", reason: "Still in probation", approverId: "p-01", requestedAt: "2026-08-05", decidedAt: "2026-08-07", decidedById: "p-01", decisionNote: "Still in probation — revisit after confirmation." },
  { id: "lv-07", employeeId: "p-01", type: "Annual", from: "2026-10-06", to: "2026-10-17", days: 10, status: "pending", approverId: "p-02", requestedAt: "2026-08-14" },
];

export const PUBLIC_HOLIDAYS = [
  { date: "2026-10-01", name: "Independence Day", confirmed: true },
  { date: "2026-12-25", name: "Christmas Day", confirmed: true },
  { date: "2026-12-26", name: "Boxing Day", confirmed: true },
  { date: "2026-09-27", name: "Eid al-Mawlid", confirmed: false },
];

/* ========================================================= Performance ==== */

export type Goal = {
  id: string;
  ownerId: string;
  title: string;
  /** 0–100. */
  progress: number;
  dueQuarter: string;
  parent?: string;
  status: "on_track" | "at_risk" | "off_track" | "done";
};

export const COMPANY_GOAL = "Process ₦2bn in client payroll by year end";

export const GOALS: Goal[] = [
  { id: "g-01", ownerId: "p-01", title: "Ship multi-entity payroll", progress: 72, dueQuarter: "Q3 2026", parent: COMPANY_GOAL, status: "on_track" },
  { id: "g-02", ownerId: "p-03", title: "Cut payroll run time to under 10 minutes", progress: 45, dueQuarter: "Q3 2026", parent: COMPANY_GOAL, status: "at_risk" },
  { id: "g-04", ownerId: "p-06", title: "Fill 12 open roles", progress: 58, dueQuarter: "Q3 2026", parent: COMPANY_GOAL, status: "on_track" },
  { id: "g-05", ownerId: "p-05", title: "Publish the employee handbook", progress: 100, dueQuarter: "Q2 2026", status: "done" },
  { id: "g-06", ownerId: "p-02", title: "Close month-end within 5 working days", progress: 30, dueQuarter: "Q3 2026", status: "off_track" },
];

export type ReviewCycle = {
  id: string;
  name: string;
  stage: "self" | "manager" | "calibration" | "published";
  dueDate: string;
  participants: number;
  submitted: number;
};

export const REVIEW_CYCLE: ReviewCycle = {
  id: "rc-01",
  name: "H2 2026 review",
  stage: "manager",
  dueDate: "2026-08-24",
  participants: 10,
  submitted: 7,
};

/* ============================================================ Help desk === */

export type Ticket = {
  id: string;
  ref: string;
  subject: string;
  category: "Payroll" | "Leave" | "Records" | "IT" | "General";
  raisedById: string;
  assignedToId: string | null;
  status: "open" | "in_progress" | "waiting" | "resolved";
  priority: "low" | "normal" | "high";
  openedAt: string;
  /** Hours remaining against the category target. Negative means breached. */
  hoursToTarget: number;
};

export const TICKETS: Ticket[] = [
  { id: "t-01", ref: "HR-2841", subject: "Payslip missing for July", category: "Payroll", raisedById: "p-07", assignedToId: "p-05", status: "in_progress", priority: "high", openedAt: "24 Aug", hoursToTarget: 2 },
  { id: "t-02", ref: "HR-2840", subject: "Cannot see my leave balance", category: "Leave", raisedById: "p-09", assignedToId: "p-06", status: "open", priority: "normal", openedAt: "25 Aug", hoursToTarget: 9 },
  { id: "t-03", ref: "HR-2838", subject: "Request confirmation letter for visa", category: "Records", raisedById: "p-03", assignedToId: "p-05", status: "waiting", priority: "normal", openedAt: "23 Aug", hoursToTarget: -3 },
  { id: "t-04", ref: "HR-2836", subject: "Pension PIN not on my record", category: "Records", raisedById: "p-09", assignedToId: null, status: "open", priority: "high", openedAt: "26 Aug", hoursToTarget: 5 },
  { id: "t-05", ref: "HR-2830", subject: "Laptop replacement", category: "IT", raisedById: "p-04", assignedToId: "p-06", status: "resolved", priority: "low", openedAt: "18 Aug", hoursToTarget: 41 },
];

export const KB_ARTICLES = [
  { id: "kb-1", title: "How to read your payslip", views: 412, category: "Payroll" },
  { id: "kb-2", title: "Applying for annual leave", views: 288, category: "Leave" },
  { id: "kb-3", title: "Changing your pension PFA", views: 173, category: "Payroll" },
  { id: "kb-4", title: "Requesting a confirmation letter", views: 96, category: "Records" },
];

/* =========================================================== Onboarding === */

export type OnboardingTask = {
  id: string;
  label: string;
  owner: "employee" | "hr" | "manager" | "it";
  done: boolean;
  dueOffsetDays: number;
};

export type Onboarding = {
  employeeId: string;
  startDate: string;
  tasks: OnboardingTask[];
};

const TEMPLATE: Omit<OnboardingTask, "done">[] = [
  { id: "o1", label: "Signed contract returned", owner: "employee", dueOffsetDays: -7 },
  { id: "o2", label: "Bank account and pension PIN collected", owner: "hr", dueOffsetDays: -3 },
  { id: "o3", label: "TIN and NHF number recorded", owner: "hr", dueOffsetDays: -3 },
  { id: "o4", label: "Laptop and accounts provisioned", owner: "it", dueOffsetDays: -1 },
  { id: "o5", label: "Added to the payroll run", owner: "hr", dueOffsetDays: 0 },
  { id: "o6", label: "First-week check-in booked", owner: "manager", dueOffsetDays: 2 },
  { id: "o7", label: "Handbook and policies acknowledged", owner: "employee", dueOffsetDays: 5 },
  { id: "o8", label: "30-day review scheduled", owner: "manager", dueOffsetDays: 14 },
];

export const ONBOARDING: Onboarding[] = [
  {
    employeeId: "p-08",
    startDate: "2026-08-01",
    tasks: TEMPLATE.map((t, i) => ({ ...t, done: i < 3 })),
  },
  {
    employeeId: "p-09",
    startDate: "2026-08-04",
    tasks: TEMPLATE.map((t, i) => ({ ...t, done: i < 5 && i !== 2 })),
  },
];

/* ================================================================ Joins === */

export const approvalRequester = (item: ApprovalItem) => {
  const e = employeeById(item.requestedById);
  return e ? fullName(e) : "Unknown";
};

export const leaveEmployee = (r: LeaveRequest) => {
  const e = employeeById(r.employeeId);
  return e ? fullName(e) : "Unknown";
};

export const HEADCOUNT = EMPLOYEES.length;
