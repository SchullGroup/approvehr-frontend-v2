"use client";

import { request, requestPaged, type Paged } from "@/lib/api/client";
import type { StatutoryOperation } from "@/lib/api/payroll";

/**
 * Pay components — `/api/v1/pay-components`.
 *
 * Allowances and deductions as data: what the company has declared, who is on
 * it, and what it does to one person's take-home pay.
 *
 * ## Money
 *
 * Every amount in and out is integer **kobo**, and every field carrying one says
 * so in its name. `naira()` and `kobo()` at the bottom are the whole boundary —
 * nothing else in this module, the store, or a screen divides by 100. A
 * deduction that has been through a float is a deduction that no longer matches
 * the payslip explaining it.
 *
 * ## A rate is a fraction, not a percentage
 *
 * `0.1` is 10%, matching the API. The form multiplies by 100 for the input and
 * divides on the way back, in one place (`ratePercent` / `rateFraction`), for
 * the same reason: one representation removes the class of bug where a 10
 * becomes a 1000% deduction.
 *
 * ## The preview is the point
 *
 * `preview()` runs the real payroll engine on one person's live assignments and,
 * with `addComponentId` or `dropAssignmentId`, on an unsaved change beside it.
 * The answer carries `current` and `change`, so a screen can say what lands in
 * the account rather than what the gross becomes. There is deliberately no
 * second implementation of that arithmetic on this side — see the note in
 * `lib/store/pay-components.ts` about why demo mode refuses instead of guessing.
 */

/* ------------------------------------------------------------------- shapes */

export type PayComponentKind = "ALLOWANCE" | "DEDUCTION";

/** How the amount is worked out. `FIXED` uses an amount; the rest use a rate. */
export type PayComponentBasis =
  "FIXED" | "PERCENT_OF_GROSS" | "PERCENT_OF_BASIC";

/**
 * `PERMANENT` charges every active employee automatically, at the default
 * amount or rate — an HMO premium, a levy the whole company carries. No one
 * gets assigned to it; it just applies. `OPTIONAL` is the ordinary case:
 * applies to nobody until somebody is assigned it.
 */
export type PayComponentApplyMode = "PERMANENT" | "OPTIONAL";

/* ------------------------------------------------------------- schedules */

/** What the months are counted from. */
export type PayServiceClock = "START_DATE" | "ASSIGNMENT_DATE";

/** How often an allowance falls due once it has qualified. */
export type PayFrequency = "MONTHLY" | "EVERY_N_MONTHS" | "ONCE";

/**
 * When an allowance falls due, **in months and nothing else**.
 *
 * The screen turns "3 years" into 36 before it sends and 36 back into "3 years"
 * to show it (`lib/pay/schedule.ts`); the API never takes years. Sent **whole**:
 * on update it replaces the stored schedule, and a field left out takes the
 * default, so there is no half-merged schedule to reason about.
 *
 * The default, which every allowance that existed before schedules reads as, is
 * `{ qualifyingMonths: 0, serviceClock: "START_DATE", frequency: "MONTHLY",
 * intervalMonths: null, maxPayments: null, durationMonths: null }`: paid every
 * month, from the day it is assigned.
 */
export type PaySchedule = {
  /** 0..600. Whole months of service before it first falls due. */
  qualifyingMonths: number;
  serviceClock: PayServiceClock;
  frequency: PayFrequency;
  /** 2..600, and present exactly when `frequency` is `EVERY_N_MONTHS`. */
  intervalMonths: number | null;
  /** 1..600. Stop after this many payments. */
  maxPayments: number | null;
  /** 1..1200. Stop this many months after it first falls due. */
  durationMonths: number | null;
};

/** A schedule as it comes back: the six fields, plus the API's own wording. */
export type ApiSchedule = PaySchedule & {
  /** True for the default. Hide the schedule's detail for these. */
  isEveryMonth: boolean;
  /** "After 3 years of service, then every 3 years". Print it as it is. */
  summary: string;
};

/**
 * Whether one person's allowance falls due in the period asked about.
 *
 * Null (on an assignment) for a deduction and for an allowance paid every
 * month: print nothing. `text` is the API's sentence and is printed as it is.
 */
export type ApiScheduleStatus = {
  due: boolean;
  /** 1 for the first payment. Null when not due. */
  occurrence: number | null;
  /** "Due this month", "Next due Mar 2029", "No more payments", ... */
  text: string;
  /** First of the pay month it next falls due, or null. */
  nextDue: string | null;
  /** Null when due. */
  reason:
    | "NOT_YET_QUALIFIED"
    | "BETWEEN_PAYMENTS"
    | "FINISHED"
    | "LEFT_BEFORE_DUE"
    | "NOT_ON_IT"
    | null;
};

/**
 * What an edit to a schedule reaches. Null unless the schedule really changed;
 * sending the one it already has is not a change and is not audited.
 */
export type ApiScheduleChange = {
  from: PaySchedule;
  to: PaySchedule;
  /** Unapproved runs that will use the new schedule the next time they are calculated. */
  openRuns: { id: string; period: string; sequence: number; status: string }[];
  /** People who have ever been on it. */
  assignmentCount: number;
};

/** An allowance that does not fall due in the previewed month. */
export type ApiHeldAllowance = {
  componentId: string;
  code: string;
  name: string;
  status: ApiScheduleStatus;
};

/**
 * A component definition.
 *
 * The three flags are statutory claims, not display preferences. `taxable` and
 * `pensionable` are meaningful on an allowance, `preTax` on a deduction, and
 * all three are always present — the API sends the full row rather than a shape
 * that changes with `kind`.
 */
export type ApiPayComponent = {
  id: string;
  /** Machine identifier, derived from the name on the way in. */
  code: string;
  name: string;
  kind: PayComponentKind;
  basis: PayComponentBasis;
  /** PAYE applies. Almost always true on an allowance. */
  taxable: boolean;
  /** Enters the pension base — and, through it, the employer's 10%. */
  pensionable: boolean;
  /** Comes off before PAYE. True only for the narrow statutory set. */
  preTax: boolean;
  defaultAmountKobo: number | null;
  defaultRate: number | null;
  sortOrder: number;
  /** False means "stop charging it from the next run", rows intact. */
  active: boolean;
  /** Shipped by us. Cannot be archived, and its kind is fixed. */
  isSystem: boolean;
  archived: boolean;
  /** PERMANENT means nobody needs assigning — see the type's own header. */
  applyMode: PayComponentApplyMode;
  /** Assignments ever made, live or ended. What makes archiving refuse. */
  assignmentCount: number;
  /**
   * When it falls due. Absent from an API that predates schedules and from the
   * offline defaults, and **absent means every month**: read it through
   * `scheduleText` in `lib/pay/schedule.ts`, never as a blank.
   */
  schedule?: ApiSchedule;
};

/**
 * Just enough of a component to say how its amount is worked out.
 *
 * Named separately because the same three fields describe a definition and a
 * preview's hypothetical line, and `lib/pay/flags.ts` renders both.
 */
export type ApiPayComponentBasisSource = {
  basis: PayComponentBasis;
  defaultAmountKobo: number | null;
  defaultRate: number | null;
};

/** One person on a component, as the detail endpoint lists them. */
export type ApiPayComponentAssignee = {
  assignmentId: string;
  employeeId: string;
  employeeNo: string;
  name: string;
  amountKobo: number | null;
  rate: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export type ApiPayComponentDetail = ApiPayComponent & {
  /** On it now. This is the number the archive refusal counts. */
  liveAssignments: number;
  assignees: ApiPayComponentAssignee[];
};

/** One component attached to one person. */
export type ApiAssignment = {
  id: string;
  employeeId: string;
  componentId: string;
  code: string;
  name: string;
  kind: PayComponentKind;
  basis: PayComponentBasis;
  taxable: boolean;
  pensionable: boolean;
  preTax: boolean;
  /** What this assignment sets. Null means "use the component's default". */
  amountKobo: number | null;
  rate: number | null;
  fromDefault: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  note: string | null;
  /** False when the component has been switched off or archived. */
  componentActive: boolean;
  /** The definition's schedule. Absent from an API that predates schedules. */
  schedule?: ApiSchedule;
};

export type ApiResolvedAssignment = ApiAssignment & {
  /**
   * What it comes to this period, in kobo, as the engine resolved it.
   *
   * **Zero when the allowance is not due**, and an assignment that is not due is
   * left out of `totals`, so a sum of what is on screen is what the run pays.
   * Print `scheduleStatus.text` instead of a ₦0.00 that reads as an amount.
   */
  resolvedKobo: number;
  /** False when the window does not cover the period being asked about. */
  appliesInPeriod: boolean;
  /** Null for a deduction and for an allowance paid every month. */
  scheduleStatus?: ApiScheduleStatus | null;
};

export type ApiPayPerson = {
  id: string;
  employeeNo: string;
  name: string;
  /** Null where no pay is agreed. A preview cannot be computed without one. */
  grossMonthlyKobo: number | null;
};

export type ApiPeriod = { start: string; end: string };

export type ApiEmployeeAssignments = {
  employee: ApiPayPerson;
  period: ApiPeriod;
  assignments: ApiResolvedAssignment[];
  totals: {
    allowanceKobo: number;
    preTaxDeductionKobo: number;
    postTaxDeductionKobo: number;
  };
};

/** A payslip line, as it will print. */
export type ApiPayslipLine = {
  code: string;
  label: string;
  amountKobo: number;
};

/** The engine's answer for one person in one period. */
export type ApiComputedPayslip = {
  /**
   * Which statutory deductions this employer operates.
   *
   * Read this before reading `payeKobo`, `pensionEmployeeKobo` or `nhfKobo` —
   * `NOT_OPERATED` means the matching amount is not a figure, not a real zero.
   * See `wasDeducted` in `lib/api/payroll.ts`.
   */
  operates: StatutoryOperation;
  contractualKobo: number;
  grossKobo: number;
  basicKobo: number;
  housingKobo: number;
  transportKobo: number;
  allowances: ApiPayslipLine[];
  allowanceTotalKobo: number;
  taxableAllowanceKobo: number;
  pensionableAllowanceKobo: number;
  pensionableKobo: number;
  pensionEmployeeKobo: number;
  /** On top of gross. Never part of a deduction total. */
  pensionEmployerKobo: number;
  nhfBaseKobo: number;
  nhfKobo: number;
  preTaxDeductions: ApiPayslipLine[];
  preTaxDeductionKobo: number;
  taxableGrossKobo: number;
  taxableMonthlyKobo: number;
  consolidatedReliefMonthlyKobo: number;
  payeKobo: number;
  postTaxDeductions: ApiPayslipLine[];
  postTaxDeductionsKobo: number;
  /** Post-tax deductions that would not fit in the remaining net. */
  unrecoveredDeductionKobo: number;
  proratedDeductionKobo: number;
  unpaidDays: number;
  netKobo: number;
  effectiveRate: number;
};

/**
 * The five figures somebody actually looks at when weighing a change.
 *
 * Signed: negative means the figure falls. `netKobo` is the headline — it is
 * what lands in the account — and `employerCostKobo` is gross plus employer
 * pension, which is what the change costs the company.
 */
export type ApiPayChange = {
  grossKobo: number;
  payeKobo: number;
  pensionEmployeeKobo: number;
  nhfKobo: number;
  netKobo: number;
  employerCostKobo: number;
};

/** A spec exactly as it went into the engine, flags included. */
export type ApiAppliedSpec = {
  code: string;
  label: string;
  basis: PayComponentBasis;
  amountKobo?: number;
  rate?: number;
  taxable?: boolean;
  pensionable?: boolean;
  preTax?: boolean;
};

export type ApiPreview = {
  employee: ApiPayPerson;
  period: ApiPeriod;
  /**
   * The bands this was computed on.
   *
   * `stale` is true when nobody has confirmed the schedule covers this period —
   * true for every 2026 period until the Nigeria Tax Act 2025 bands are
   * entered. Shown, never hidden: a net figure computed on unconfirmed bands is
   * still the best answer available, but the reader should know.
   */
  taxSchedule: {
    effectiveFrom: string;
    citation: string;
    confirmedThrough: string;
    stale: boolean;
  };
  /** Non-empty means the payroll settings themselves need attention first. */
  settingsIssues: { field: string; message: string }[];
  applied: { allowances: ApiAppliedSpec[]; deductions: ApiAppliedSpec[] };
  /** The payslip with the proposed change applied. */
  payslip: ApiComputedPayslip;
  /** What they get today. Null unless the request proposed a change. */
  current: ApiComputedPayslip | null;
  change: ApiPayChange | null;
  /**
   * Allowances on a schedule that do not fall due in the previewed month, with
   * when they next do. Empty when nothing is on a schedule. The tried allowance
   * is assumed to start in the previewed month, so a long-service allowance
   * added "now" shows here with `change` at zero, which is not an error.
   */
  held?: ApiHeldAllowance[];
};

/* -------------------------------------------------------------------- input */

export type PayComponentListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  kind?: PayComponentKind;
  active?: boolean;
  includeArchived?: boolean;
  /** Allow-list: sortOrder | code | name | createdAt. */
  sort?: "sortOrder" | "code" | "name" | "createdAt";
  order?: "asc" | "desc";
};

/**
 * A new component.
 *
 * `code` is optional and derived from the name on the server (Car allowance →
 * CAR_ALLOWANCE), so no form has to ask a business owner to invent a machine
 * identifier.
 *
 * The API refuses two flag combinations rather than normalising them: `preTax`
 * on an allowance and `pensionable` on a deduction. Both would record a
 * statutory lie, so the form sends only the flags that belong to the kind.
 */
export type CreatePayComponentBody = {
  name: string;
  kind: PayComponentKind;
  code?: string;
  taxable?: boolean;
  pensionable?: boolean;
  preTax?: boolean;
  basis?: PayComponentBasis;
  defaultAmountKobo?: number;
  defaultRate?: number;
  sortOrder?: number;
  active?: boolean;
  applyMode?: PayComponentApplyMode;
  /** Allowances only; a deduction with one is refused. Omit for every month. */
  schedule?: PaySchedule;
};

/** `kind` and `code` are absent deliberately — the API will not change either. */
export type UpdatePayComponentBody = {
  name?: string;
  taxable?: boolean;
  pensionable?: boolean;
  preTax?: boolean;
  basis?: PayComponentBasis;
  defaultAmountKobo?: number | null;
  defaultRate?: number | null;
  sortOrder?: number;
  active?: boolean;
  applyMode?: PayComponentApplyMode;
  /** Replaces the stored schedule whole. Omit to leave it alone. */
  schedule?: PaySchedule;
};

/** An edit's answer: the component, plus what a schedule change reaches. */
export type ApiUpdatedPayComponent = ApiPayComponentDetail & {
  /** Null unless the schedule actually changed. */
  scheduleChange?: ApiScheduleChange | null;
};

/** What the form is typing, to be checked without saving anything. */
export type SchedulePreviewBody = {
  schedule: PaySchedule;
  kind?: PayComponentKind;
  /** The form's current value: an allowance nobody is assigned has no assignment date. */
  applyMode?: PayComponentApplyMode;
  /** The person the example is for. ISO date. */
  startDate?: string;
  /** Defaults to `startDate`. */
  assignedOn?: string;
  /** 1..12. */
  count?: number;
};

export type ApiSchedulePreview = {
  schedule: ApiSchedule;
  /** What the same body would be refused with on save, as data. Always a 200. */
  problems: { field: string; message: string }[];
  /** Null when there are problems or no `startDate` was given. */
  examples: {
    startDate: string;
    assignedOn: string;
    /** The first of each pay month it would fall due. */
    dueMonths: string[];
  } | null;
};

/** One allowance on a schedule, as the run wizard reads it. */
export type ApiScheduledAllowance = {
  componentId: string;
  assignmentId: string | null;
  code: string;
  name: string;
  schedule: ApiSchedule;
  status: ApiScheduleStatus;
  /** One payment, fixed. Null with `rate` set for a percentage allowance. */
  amountKobo: number | null;
  rate: number | null;
  basis: PayComponentBasis;
};

/**
 * What falls due on an open run, and what does not, per person.
 *
 * Only people with at least one allowance on a schedule appear, and an allowance
 * that has finished is left out. `open` is false, and `people` empty, for an
 * approved, paid or cancelled run: it is computed live from the schedule as it
 * stands, and an approved run's payslips are the record.
 */
export type ApiScheduledAllowances = {
  runId: string;
  period: string;
  sequence: number;
  status: string;
  open: boolean;
  people: { employeeId: string; allowances: ApiScheduledAllowance[] }[];
};

export type AssignBody = {
  payComponentId: string;
  /** Omit to fall back to the component's default. */
  amountKobo?: number;
  rate?: number;
  /** ISO date. Omit to start it this month. */
  effectiveFrom?: string;
  /** Omit for open-ended. A one-off — a leave allowance — sets it. */
  effectiveTo?: string | null;
  note?: string;
};

export type UpdateAssignmentBody = {
  amountKobo?: number | null;
  rate?: number | null;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  note?: string | null;
};

/**
 * One component onto several people — the other axis from `bulkAssign`
 * above, which is several components onto one person. One amount, one
 * rate, one window, for the whole list.
 */
export type AssignToManyBody = {
  employeeIds: string[];
  /** Omit to fall back to the component's default. Same for everyone. */
  amountKobo?: number;
  rate?: number;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  note?: string;
};

/**
 * Who was actually assigned, and who already had it.
 *
 * `alreadyAssigned` is not a failure list — the API skips rather than
 * refuses whoever already has an overlapping window, which is the ordinary
 * case for "assign this to the group" run a second time after somebody
 * new joins it.
 */
export type ApiAssignToManyResult = {
  componentId: string;
  componentName: string;
  assigned: number;
  assignmentIds: string[];
  alreadyAssigned: { employeeId: string; name: string }[];
};

/**
 * What to compute.
 *
 * With none of the change fields this is a report on what somebody gets today.
 * With `addComponentId` (and an amount or rate) or `dropAssignmentId` it is a
 * preview of an unsaved change, and the answer carries `current` and `change`.
 */
export type PreviewParams = {
  /** Any date inside the period. The API widens it to the calendar month. */
  period?: string;
  unpaidDays?: number;
  addComponentId?: string;
  addAmountKobo?: number;
  addRate?: number;
  dropAssignmentId?: string;
};

/* -------------------------------------------------------------------- calls */

export type ApiComponentPeople = {
  componentId: string;
  name: string;
  /** Charged to every active employee, with no list. */
  everyone: boolean;
  people: {
    employeeId: string;
    name: string;
    employeeNo: string;
    department: string | null;
    on: boolean;
  }[];
};

export const payComponentsApi = {
  list: (params: PayComponentListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiPayComponent>("/pay-components", {
      query: {
        page: params.page,
        pageSize: params.pageSize,
        q: params.q,
        kind: params.kind,
        /* The API reads these as the strings "true"/"false", not booleans. */
        active: params.active === undefined ? undefined : String(params.active),
        includeArchived: params.includeArchived ? "true" : undefined,
        sort: params.sort,
        order: params.order,
      },
      ...(signal ? { signal } : {}),
    }),

  get: (id: string, signal?: AbortSignal) =>
    request<ApiPayComponentDetail>(`/pay-components/${id}`, {
      ...(signal ? { signal } : {}),
    }),

  create: (body: CreatePayComponentBody) =>
    request<ApiPayComponent>("/pay-components", { method: "POST", body }),

  update: (id: string, body: UpdatePayComponentBody) =>
    request<ApiUpdatedPayComponent>(`/pay-components/${id}`, {
      method: "PATCH",
      body,
    }),

  /**
   * The sentence, the refusals and an example, for a schedule being typed.
   * Saves nothing. Needs MANAGE_PAY_STRUCTURE, the permission that defines one.
   */
  schedulePreview: (body: SchedulePreviewBody, signal?: AbortSignal) =>
    request<ApiSchedulePreview>("/pay-components/schedule-preview", {
      method: "POST",
      body,
      ...(signal ? { signal } : {}),
    }),

  /** What falls due on an open payroll run, per person. RUN_PAYROLL or VIEW_SALARIES. */
  scheduledForRun: (runId: string, signal?: AbortSignal) =>
    request<ApiScheduledAllowances>(
      `/payroll/runs/${runId}/scheduled-allowances`,
      { ...(signal ? { signal } : {}) },
    ),

  /** Archive, never delete. 409 while anyone is on it, and for a system row. */
  archive: (id: string) =>
    request<{ id: string; archived: boolean; note: string }>(
      `/pay-components/${id}`,
      { method: "DELETE" },
    ),

  /** One person's components, with what each comes to this period. */
  forEmployee: (
    employeeId: string,
    params: { period?: string; includeInactive?: boolean } = {},
    signal?: AbortSignal,
  ) =>
    request<ApiEmployeeAssignments>(`/pay-components/employees/${employeeId}`, {
      query: {
        period: params.period,
        includeInactive: params.includeInactive ? "true" : undefined,
      },
      ...(signal ? { signal } : {}),
    }),

  assign: (employeeId: string, body: AssignBody) =>
    request<ApiAssignment>(`/pay-components/employees/${employeeId}`, {
      method: "POST",
      body,
    }),

  /** A new starter's whole package. Validated as a batch before anything writes. */
  bulkAssign: (employeeId: string, assignments: AssignBody[]) =>
    request<{ employeeId: string; created: number; assignmentIds: string[] }>(
      `/pay-components/employees/${employeeId}/bulk`,
      { method: "POST", body: { assignments } },
    ),

  /** "Assign specific people" from the component's own screen, not theirs. */
  assignToMany: (componentId: string, body: AssignToManyBody) =>
    request<ApiAssignToManyResult>(`/pay-components/${componentId}/assign`, {
      method: "POST",
      body,
    }),

  /** Everybody who could have this component, ticked where they do this month. */
  people: (componentId: string) =>
    request<ApiComponentPeople>(`/pay-components/${componentId}/people`),

  /** Everyone, or exactly these people. Takes the others off. */
  setPeople: (
    componentId: string,
    body: { everyone: boolean; employeeIds?: string[] },
  ) =>
    request<{ everyone: boolean; added: number; removed: number }>(
      `/pay-components/${componentId}/people`,
      { method: "PUT", body },
    ),

  updateAssignment: (id: string, body: UpdateAssignmentBody) =>
    request<ApiAssignment>(`/pay-components/assignments/${id}`, {
      method: "PATCH",
      body,
    }),

  /**
   * Stop it.
   *
   * Ends the window at the day before this period rather than deleting the row,
   * so a payslip from inside it still explains itself. `deleted` is true only
   * when it had not started yet. The `note` is written for the person clicking.
   */
  removeAssignment: (id: string) =>
    request<{
      id: string;
      employeeId: string;
      componentId: string;
      name: string;
      deleted: boolean;
      effectiveTo: string | null;
      note: string;
    }>(`/pay-components/assignments/${id}`, { method: "DELETE" }),

  preview: (
    employeeId: string,
    params: PreviewParams = {},
    signal?: AbortSignal,
  ) =>
    request<ApiPreview>(`/pay-components/preview/${employeeId}`, {
      query: {
        period: params.period,
        unpaidDays: params.unpaidDays,
        addComponentId: params.addComponentId,
        addAmountKobo: params.addAmountKobo,
        addRate: params.addRate,
        dropAssignmentId: params.dropAssignmentId,
      },
      ...(signal ? { signal } : {}),
    }),
};

export type PagedPayComponents = Paged<ApiPayComponent>;

/* ---------------------------------------------------------------- the money */

/**
 * Kobo to naira, for the screen. The only division by 100 on this side.
 *
 * `Math.round` first because a kobo figure is an integer by contract, and a
 * fractional one means something upstream is already wrong — rounding here
 * keeps the display honest instead of rendering ₦1,234.5678.
 */
export const naira = (value: number): number => Math.round(value) / 100;

/** Naira to kobo, for a form. The only multiplication by 100 on this side. */
export const kobo = (amount: number): number => Math.round(amount * 100);

/** A fraction to the percentage a form shows. 0.075 → 7.5. */
export const ratePercent = (rate: number): number =>
  Math.round(rate * 1_000_000) / 10_000;

/** The percentage a form collected, back to the fraction the API wants. */
export const rateFraction = (percent: number): number =>
  Math.round((percent / 100) * 10_000) / 10_000;
