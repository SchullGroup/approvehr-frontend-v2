"use client";

import { request } from "./client";

/**
 * The payroll endpoints, and the money boundary for them.
 *
 * ## What the API actually sends, which is not what you would guess
 *
 * `HANDOVER.md` says "money crosses the API as integer kobo". That is true of
 * the *computed* shapes — `GET /preview` and the `discrepancies` on a prepare
 * both speak kobo, and their fields carry a `Kobo` suffix to say so. It is
 * **not** true of a stored run or a stored payslip: those are Prisma
 * `Decimal(_, 2)` columns holding **naira**, and Prisma's `Decimal.toJSON` is
 * its `toString`, so they arrive as decimal *strings* — `"1850000.00"`.
 *
 * Two representations of money in one response is exactly the situation that
 * produces a figure out by a factor of a hundred, so this file is the only
 * place either of them is read. Everything it returns is integer kobo, named
 * with a `Kobo` suffix, and `naira()` below is the single conversion back out
 * for rendering. Nothing downstream multiplies or divides money.
 *
 * ## Why the decimal string is parsed rather than multiplied
 *
 * `Number("1850000.00") * 100` is a float multiply, and float multiplies are
 * how `0.1 + 0.2 !== 0.3` gets into a payroll total. `koboFromDecimal` splits
 * the string on the point and works in integers, so the value never passes
 * through a float at all. The backend's own `toKobo(String(value))` seam takes
 * the same precaution for the same reason.
 *
 * ## The endpoints
 *
 * | Call | Meaning |
 * |---|---|
 * | `GET /payroll/runs` | list, newest period first |
 * | `GET /payroll/runs/:id` | one run with its payslips and open exceptions |
 * | `POST /payroll/runs` | **prepare** — re-runnable, settles nothing |
 * | `POST /payroll/runs/:id/approve` | the one-way door |
 * | `POST /payroll/runs/:id/cancel` | back out of a draft |
 * | `GET /payroll/preview` | one payslip computed live, saving nothing |
 *
 * `GET /runs` is **not** the paged envelope every other list endpoint uses — it
 * answers `{ runs, total }` inside the usual `{ data }` wrapper, so it goes
 * through `request` rather than `requestPaged`. Worth knowing before you reach
 * for `.meta`.
 */

/* ------------------------------------------------------------------- money */

/**
 * A Prisma `Decimal` in naira → integer kobo.
 *
 * Accepts the number form too, because a JSON body is not required to keep
 * Decimal a string and a future serialiser might not.
 */
export function koboFromDecimal(value: string | number): number {
  const text = typeof value === "number" ? value.toFixed(2) : value.trim();
  const negative = text.startsWith("-");
  const digits = negative ? text.slice(1) : text;
  const [whole = "0", fraction = ""] = digits.split(".");
  /* Pad rather than parse: `"5"` is fifty kobo, not five. */
  const kobo = Number(whole) * 100 + Number(`${fraction}00`.slice(0, 2));
  return negative ? -kobo : kobo;
}

/**
 * Kobo → naira, for a component that renders money.
 *
 * The only division by a hundred in the payroll surface. Screens call this;
 * they never write `/ 100`, because a stray `/ 100` is invisible in review and
 * a missing one is a hundredfold error on a payment file.
 */
export const naira = (kobo: number): number => Math.round(kobo) / 100;

/**
 * Kobo as a figure somebody can reconcile against a bank statement.
 *
 * Thousands separators and exactly two decimals, never abbreviated. `₦93.0m`
 * is fine on a marketing page and useless when the question is whether the
 * total matches the bank.
 */
export const formatKobo = (kobo: number): string =>
  `₦${naira(kobo).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/* ------------------------------------------------------------------ periods */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** `2026-08-01T00:00:00.000Z` → `2026-08`. A pay period is a month. */
export const periodKey = (isoDate: string): string => isoDate.slice(0, 7);

/** `2026-08` → `August 2026`. */
export function periodLabel(key: string): string {
  const [year, month] = key.split("-");
  const name = MONTHS[Number(month) - 1];
  return name && year ? `${name} ${year}` : key;
}

/** `2026-08-28` → `28 August 2026`, for a payslip somebody keeps. */
export function longDate(isoDate: string): string {
  const day = isoDate.slice(8, 10);
  const name = MONTHS[Number(isoDate.slice(5, 7)) - 1];
  return name ? `${Number(day)} ${name} ${isoDate.slice(0, 4)}` : isoDate;
}

/* -------------------------------------------------------------------- types */

export type PayrollRunStatus =
  | "DRAFT"
  | "IN_REVIEW"
  | "APPROVED"
  | "PAID"
  | "CANCELLED";

export type ExceptionSeverity = "BLOCKER" | "WARNING";

export type PayslipLineKind = "EARNING" | "DEDUCTION" | "EMPLOYER_CONTRIBUTION";

/** One run's headline figures. Every amount is kobo. */
export type PayrollRun = {
  id: string;
  /** `YYYY-MM`. */
  period: string;
  /** `YYYY-MM-DD`. */
  payDate: string;
  status: PayrollRunStatus;
  label: string | null;
  employeeCount: number;
  grossKobo: number;
  netKobo: number;
  payeKobo: number;
  pensionEmployeeKobo: number;
  pensionEmployerKobo: number;
  nhfKobo: number;
  /** Gross plus employer pension. Employer pension is never inside gross. */
  totalCostKobo: number;
  preparedAt: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  /** True once the settings that computed it were frozen onto the record. */
  settingsFrozen: boolean;
};

/**
 * One itemised line on a payslip.
 *
 * `kind` and `taxable` together say which of the four columns it belongs in:
 * an `EARNING` is an allowance, a `DEDUCTION` with `taxable` true came off
 * before PAYE, a `DEDUCTION` with `taxable` false came off after, and an
 * `EMPLOYER_CONTRIBUTION` is a company cost that never touches net pay.
 */
export type PayslipLine = {
  id: string;
  kind: PayslipLineKind;
  label: string;
  amountKobo: number;
  taxable: boolean;
};

export type Payslip = {
  id: string;
  employeeId: string;
  employeeNo: string;
  name: string;
  grossKobo: number;
  basicKobo: number;
  housingKobo: number;
  transportKobo: number;
  pensionEmployeeKobo: number;
  /** On top of gross. Never part of a deduction total. */
  pensionEmployerKobo: number;
  nhfKobo: number;
  taxableIncomeKobo: number;
  consolidatedReliefKobo: number;
  payeKobo: number;
  /** Pre-tax plus post-tax, as one figure. `lines` is the itemised form. */
  otherDeductionsKobo: number;
  netKobo: number;
  unpaidDays: number;
  proratedDeductionKobo: number;
  publishedAt: string | null;
  emailedAt: string | null;
  viewedAt: string | null;
  lines: PayslipLine[];
};

/**
 * A reason a run should not go out.
 *
 * BLOCKER refuses approval; WARNING is allowed and recorded. The distinction is
 * whether the run would be *wrong* or merely *surprising* — a missing account
 * number blocks, an unconfirmed tax schedule warns.
 */
export type RunException = {
  id: string;
  employeeId: string | null;
  severity: ExceptionSeverity;
  code: string;
  message: string;
};

export type PayrollRunDetail = PayrollRun & {
  payslips: Payslip[];
  exceptions: RunException[];
};

/**
 * A figure that does not add up.
 *
 * Already kobo on the wire — this comes from `reconcile.ts`, which works in
 * whole kobo so that exact equality is a reasonable thing to demand.
 */
export type Discrepancy = {
  code: string;
  employeeId?: string;
  message: string;
  expectedKobo: number;
  actualKobo: number;
};

export type PreparedRun = {
  runId: string;
  headcount: number;
  /** Non-empty means the run does not reconcile and cannot be shown as fine. */
  discrepancies: Discrepancy[];
  blockers: number;
  warnings: number;
};

/** What approving settled. Loan instalments move on; claims are marked paid. */
export type ApprovedRun = {
  id: string;
  settled: { loans: number; claims: number; overtime: number };
};

/** `GET /preview`. Already kobo throughout — this is the engine's own shape. */
export type ComputedPayslip = {
  contractualKobo: number;
  grossKobo: number;
  basicKobo: number;
  housingKobo: number;
  transportKobo: number;
  allowances: { code: string; label: string; amountKobo: number }[];
  allowanceTotalKobo: number;
  taxableAllowanceKobo: number;
  pensionableAllowanceKobo: number;
  pensionableKobo: number;
  pensionEmployeeKobo: number;
  pensionEmployerKobo: number;
  nhfBaseKobo: number;
  nhfKobo: number;
  preTaxDeductions: { code: string; label: string; amountKobo: number }[];
  preTaxDeductionKobo: number;
  taxableGrossKobo: number;
  taxableMonthlyKobo: number;
  consolidatedReliefMonthlyKobo: number;
  payeKobo: number;
  postTaxDeductions: { code: string; label: string; amountKobo: number }[];
  postTaxDeductionsKobo: number;
  /** A deduction that would not fit in net pay and carries to next month. */
  unrecoveredDeductionKobo: number;
  proratedDeductionKobo: number;
  unpaidDays: number;
  netKobo: number;
  effectiveRate: number;
};

export type PayslipPreview = {
  slip: ComputedPayslip;
  assembled: {
    employeeId: string;
    employeeNo: string;
    name: string;
    contractGrossKobo: number;
    rosteredDays: number | null;
  };
};

/* ------------------------------------------------------------------ mapping */

type Decimalish = string | number;

type ApiRun = {
  id: string;
  period: string;
  payDate: string;
  status: PayrollRunStatus;
  label: string | null;
  employeeCount: number;
  totalGross: Decimalish;
  totalNet: Decimalish;
  totalPaye: Decimalish;
  totalPensionEmployee: Decimalish;
  totalPensionEmployer: Decimalish;
  totalNhf: Decimalish;
  settingsSnapshot: unknown;
  preparedAt: string | null;
  approvedAt: string | null;
  paidAt: string | null;
};

type ApiPayslip = {
  id: string;
  employeeId: string;
  employee: { employeeNo: string; firstName: string; lastName: string };
  gross: Decimalish;
  basic: Decimalish;
  housing: Decimalish;
  transport: Decimalish;
  pensionEmployee: Decimalish;
  pensionEmployer: Decimalish;
  nhf: Decimalish;
  taxableIncome: Decimalish;
  consolidatedRelief: Decimalish;
  paye: Decimalish;
  otherDeductions: Decimalish;
  net: Decimalish;
  unpaidDays: number;
  proratedDeduction: Decimalish;
  publishedAt: string | null;
  emailedAt: string | null;
  viewedAt: string | null;
  lines: {
    id: string;
    kind: PayslipLineKind;
    label: string;
    amount: Decimalish;
    taxable: boolean;
  }[];
};

type ApiRunDetail = ApiRun & {
  payslips: ApiPayslip[];
  exceptions: {
    id: string;
    employeeId: string | null;
    severity: ExceptionSeverity;
    code: string;
    message: string;
  }[];
};

function toRun(row: ApiRun): PayrollRun {
  const grossKobo = koboFromDecimal(row.totalGross);
  const pensionEmployerKobo = koboFromDecimal(row.totalPensionEmployer);
  return {
    id: row.id,
    period: periodKey(row.period),
    payDate: row.payDate.slice(0, 10),
    status: row.status,
    label: row.label,
    employeeCount: row.employeeCount,
    grossKobo,
    netKobo: koboFromDecimal(row.totalNet),
    payeKobo: koboFromDecimal(row.totalPaye),
    pensionEmployeeKobo: koboFromDecimal(row.totalPensionEmployee),
    pensionEmployerKobo,
    nhfKobo: koboFromDecimal(row.totalNhf),
    totalCostKobo: grossKobo + pensionEmployerKobo,
    preparedAt: row.preparedAt,
    approvedAt: row.approvedAt,
    paidAt: row.paidAt,
    settingsFrozen: row.settingsSnapshot !== null && row.settingsSnapshot !== undefined,
  };
}

function toPayslip(row: ApiPayslip): Payslip {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeNo: row.employee.employeeNo,
    name: `${row.employee.firstName} ${row.employee.lastName}`,
    grossKobo: koboFromDecimal(row.gross),
    basicKobo: koboFromDecimal(row.basic),
    housingKobo: koboFromDecimal(row.housing),
    transportKobo: koboFromDecimal(row.transport),
    pensionEmployeeKobo: koboFromDecimal(row.pensionEmployee),
    pensionEmployerKobo: koboFromDecimal(row.pensionEmployer),
    nhfKobo: koboFromDecimal(row.nhf),
    taxableIncomeKobo: koboFromDecimal(row.taxableIncome),
    consolidatedReliefKobo: koboFromDecimal(row.consolidatedRelief),
    payeKobo: koboFromDecimal(row.paye),
    otherDeductionsKobo: koboFromDecimal(row.otherDeductions),
    netKobo: koboFromDecimal(row.net),
    unpaidDays: row.unpaidDays,
    proratedDeductionKobo: koboFromDecimal(row.proratedDeduction),
    publishedAt: row.publishedAt,
    emailedAt: row.emailedAt,
    viewedAt: row.viewedAt,
    lines: row.lines.map((line) => ({
      id: line.id,
      kind: line.kind,
      label: line.label,
      amountKobo: koboFromDecimal(line.amount),
      taxable: line.taxable,
    })),
  };
}

/* ---------------------------------------------------------------- endpoints */

export const payrollApi = {
  runs: async (
    params: { take?: number; skip?: number } = {},
    signal?: AbortSignal,
  ): Promise<{ runs: PayrollRun[]; total: number }> => {
    const result = await request<{ runs: ApiRun[]; total: number }>(
      "/payroll/runs",
      {
        query: { take: params.take ?? 24, skip: params.skip ?? 0 },
        ...(signal ? { signal } : {}),
      },
    );
    return { runs: result.runs.map(toRun), total: result.total };
  },

  run: async (id: string, signal?: AbortSignal): Promise<PayrollRunDetail> => {
    const row = await request<ApiRunDetail>(`/payroll/runs/${id}`, {
      ...(signal ? { signal } : {}),
    });
    return {
      ...toRun(row),
      payslips: row.payslips.map(toPayslip),
      exceptions: row.exceptions,
    };
  },

  /**
   * Prepare, or re-prepare, a period.
   *
   * Safe to press twice. It replaces the payslips on a draft rather than adding
   * to them, and it settles nothing in any other module — that is what makes
   * "run it, read the exceptions, fix a bank account, run it again" the normal
   * loop rather than something to be nervous about.
   */
  prepare: (body: { period: string; payDate: string; label?: string }) =>
    request<PreparedRun>("/payroll/runs", { method: "POST", body }),

  /** The one-way door. Freezes the settings and settles loans and claims. */
  approve: (id: string) =>
    request<ApprovedRun>(`/payroll/runs/${id}/approve`, { method: "POST" }),

  cancel: (id: string) =>
    request<{ id: string }>(`/payroll/runs/${id}/cancel`, { method: "POST" }),

  preview: (employeeId: string, period: string, signal?: AbortSignal) =>
    request<PayslipPreview>("/payroll/preview", {
      query: { employeeId, period },
      ...(signal ? { signal } : {}),
    }),
};

/* ----------------------------------------------------------------- helpers */

export const STATUS_LABEL: Record<PayrollRunStatus, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "Ready to approve",
  APPROVED: "Approved",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

/**
 * Which exceptions have a screen that fixes them.
 *
 * A list of problems with nowhere to go is a list somebody reads twice and
 * acts on once. Where the fix is a field on a record, the row links straight
 * at it; where it is a judgement call, it does not pretend otherwise.
 */
export function fixFor(
  code: string,
  employeeId: string | null,
): { href: string; label: string } | null {
  if (!employeeId) return null;
  switch (code) {
    case "missing_bank_account":
      return { href: `/people/${employeeId}`, label: "Add account number" };
    case "missing_pension_pin":
      return { href: `/people/${employeeId}`, label: "Add pension PIN" };
    case "deduction_carried":
      return { href: `/payroll/loans`, label: "Open loans" };
    default:
      return { href: `/people/${employeeId}`, label: "Open record" };
  }
}
