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
  | "FIXED"
  | "PERCENT_OF_GROSS"
  | "PERCENT_OF_BASIC";

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
  /** Assignments ever made, live or ended. What makes archiving refuse. */
  assignmentCount: number;
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
};

export type ApiResolvedAssignment = ApiAssignment & {
  /** What it comes to this period, in kobo, as the engine resolved it. */
  resolvedKobo: number;
  /** False when the window does not cover the period being asked about. */
  appliesInPeriod: boolean;
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
export type ApiPayslipLine = { code: string; label: string; amountKobo: number };

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
    request<ApiPayComponentDetail>(`/pay-components/${id}`, {
      method: "PATCH",
      body,
    }),

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

  preview: (employeeId: string, params: PreviewParams = {}, signal?: AbortSignal) =>
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
