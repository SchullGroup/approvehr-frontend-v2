"use client";

import { request, requestPaged } from "./client";

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
  "DRAFT" | "IN_REVIEW" | "APPROVED" | "PAID" | "CANCELLED";

export type ExceptionSeverity = "BLOCKER" | "WARNING";

export type PayslipLineKind = "EARNING" | "DEDUCTION" | "EMPLOYER_CONTRIBUTION";

/**
 * How a period's tax schedule granted personal relief.
 *
 * Statute, keyed by date, and therefore **not** something this repo decides.
 * `ReliefRegime` in `approvehr-api/src/modules/payroll/engine.ts` is the
 * definition; the API resolves it from the run's period and sends it with each
 * payslip so a renderer never has to guess from a date. A guess here would be a
 * second copy of the 2026 cutover living in the browser, which is the shape of
 * mistake that once had four screens quoting last year's tax.
 *
 * The Consolidated Relief Allowance was a function of income and was abolished
 * on 1 January 2026. Rent relief is a function of *rent*, which somebody has to
 * declare — so it can lawfully be nil, and nil is worth saying out loud rather
 * than printing as a zero under the old regime's name.
 */
export type ReliefRegime =
  | { kind: "CONSOLIDATED_RELIEF" }
  | { kind: "RENT_RELIEF"; rateOfRent: number; capKobo: number };

/**
 * Whether a statutory deduction was worked out at all.
 *
 * `Operated` in `approvehr-api/src/modules/payroll/engine.ts` is the definition,
 * and the distinction it carries is the project's rule 3 in a type:
 *
 * - **`DEDUCTED`, and an amount of ₦0.00** — it was computed and came to
 *   nothing. Lawful and common: the first ₦800,000 a year is exempt from PAYE,
 *   so somebody on ₦60,000 a month pays none. The figure is the answer.
 * - **`NOT_OPERATED`** — there is no figure. This employer does not deduct it,
 *   so there is nothing to print, nothing to remit and no schedule to file. The
 *   amount is `0` only because net pay has to subtract something.
 *
 * Read this before rendering `payeKobo`, `pensionEmployeeKobo` or `nhfKobo`. A
 * "PAYE ₦0.00" line under a payroll that deducts no PAYE is a wrong claim, and
 * it is the same shape as the abolished-relief line that printed ₦0.00 under a
 * statute that no longer existed.
 */
export type Operated = "DEDUCTED" | "NOT_OPERATED";

/** Which of the three statutory deductions an employer operates. */
export type StatutoryOperation = {
  paye: Operated;
  pension: Operated;
  nhf: Operated;
};

/** True where the deduction was computed. Absent operation reads as computed. */
export const wasDeducted = (
  operates: StatutoryOperation | undefined,
  which: keyof StatutoryOperation,
): boolean => operates === undefined || operates[which] === "DEDUCTED";

/** One run's headline figures. Every amount is kobo. */
export type PayrollRun = {
  id: string;
  /** `YYYY-MM`. */
  period: string;
  /** `YYYY-MM-DD`. */
  payDate: string;
  status: PayrollRunStatus;
  label: string | null;
  /** People with a payslip. Not the headcount — see `excludedCount`. */
  employeeCount: number;
  /**
   * People in the period deliberately left off it, with a reason recorded.
   *
   * Never folded into `employeeCount`, so a screen can say "9 of 10 — 1
   * excluded" rather than a bare 9. Use `headcountLabel` below rather than
   * writing that sentence again; a figure that quietly omits somebody is the
   * class of wrong claim this product exists to refuse.
   */
  excludedCount: number;
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
  /**
   * Which statutory deductions this run operated, recorded when it was prepared.
   *
   * Not read from today's settings: the switches can move, and an approved
   * payslip has to keep saying what was true when it was computed. `totalPaye`
   * of zero under `paye: "NOT_OPERATED"` is not a tax computation.
   */
  operates: StatutoryOperation;
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
  /**
   * The personal relief applied, monthly.
   *
   * Named for what it is rather than for the CRA, because from January 2026 it
   * is rent relief. The database column is still `consolidatedRelief` — renaming
   * a column on a legal record is a migration for cosmetics — but nothing above
   * this line has to inherit that name, and a field called
   * `consolidatedReliefKobo` holding rent relief is how a payslip ends up
   * labelled with an allowance that no longer exists.
   */
  reliefKobo: number;
  /**
   * Which regime produced `reliefKobo`.
   *
   * **Absent means unknown, not "the old one".** A caller that cannot say which
   * regime ran must not have its silence read as the CRA — the label is the
   * whole point of the field.
   */
  relief?: ReliefRegime;
  payeKobo: number;
  /**
   * Whether `payeKobo` above is a figure a human entered by hand for this one
   * period, in place of the engine's own bands. Every other figure on this
   * payslip — pension, NHF, the relief and taxable-income lines — is still the
   * engine's own, unaffected; only this one line and `netKobo`, which is
   * derived from it, take the override instead.
   */
  payeOverridden: boolean;
  /** Why it does not come from the bands. Null when `payeOverridden` is false. */
  payeOverrideReason: string | null;
  /**
   * Which statutory deductions the run that produced this payslip operated.
   *
   * Attached by the API to every payslip, for the same reason `relief` is: a
   * stored row cannot say on its own whether a zero is a computation or an
   * absence, and a renderer must not have to guess. **Absent means unknown**,
   * and `wasDeducted` reads an unknown as deducted — which is what every payslip
   * written before the switches existed actually was.
   */
  operates?: StatutoryOperation;
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

/**
 * Somebody deliberately left off this payroll.
 *
 * The run carries these as records as well as raising a WARNING for each, so a
 * screen can render who, why, who decided and when without parsing a sentence —
 * and can offer to put them back. A year from now this row is the whole answer
 * to "why was Grace not paid in August?", which is why the reason is required
 * and why an exclusion is never a client-side filter.
 */
export type RunExclusion = {
  id: string;
  employeeId: string;
  employeeNo: string;
  name: string;
  reason: string;
  /** Who decided. Null only where the deciding user has no employee record. */
  decidedBy: string | null;
  /** ISO instant. */
  excludedAt: string;
};

/**
 * A hand-entered PAYE figure standing in for the engine's own bands, for one
 * person on one payroll.
 *
 * Same shape as `RunExclusion`, structured rather than left for a screen to
 * parse out of the `payroll_tax_overridden` warning's message — "who set
 * this and when" belongs to an editable review row.
 */
export type OvertimeOverrideKind = "WEEKDAY" | "WEEKEND" | "PUBLIC_HOLIDAY";

/** What each kind is called on screen, and nowhere else. */
export const OVERTIME_KIND_LABEL: Record<OvertimeOverrideKind, string> = {
  WEEKDAY: "Weekday",
  WEEKEND: "Weekend",
  PUBLIC_HOLIDAY: "Public holiday",
};

export type OvertimeOverrideChange = {
  employeeId: string;
  name: string;
  minutes: number;
  kind: OvertimeOverrideKind;
  /** The multiplier the policy priced these at. Reported, never sent. */
  rate: number;
  amountKobo: number;
  /** Approved records this displaced, so a screen can say so. */
  setAsideCount: number;
  setAsideMinutes: number;
  reason: string;
  setAt: string;
  run: PreparedRun;
};

export type BonusChange = {
  employeeId: string;
  name: string;
  amountKobo: number;
  reason: string | null;
  awardedAt: string;
  run: PreparedRun;
};

/**
 * One row of an uploaded payroll sheet.
 *
 * **A key is present only when the file carried that column**, and holds `null`
 * only when it carried the column with the cell empty. Absent means the sheet
 * said nothing about that figure and the run keeps what it has; `null` means
 * somebody emptied a cell that arrived with a number in it, which is the only
 * way to take a figure off. See `SHEET_BLANK_RULE`.
 *
 * The optional properties are therefore load-bearing rather than convenience:
 * do not give this type defaults, and do not build one by spreading an object
 * with `undefined`s in it.
 */
export type AdjustmentUploadRow = {
  /** 1-based, header excluded — the number the spreadsheet shows. */
  row: number;
  employeeNo: string;
  payeKobo?: number | null;
  overtimeHours?: number | null;
  bonusKobo?: number | null;
  monthlyKobo?: number | null;
};

export type AdjustmentUpload = {
  rows: readonly AdjustmentUploadRow[];
  reason?: string;
};

/** What one row actually changed, by the sheet's own column headings. */
export type AppliedSheetRow = {
  row: number;
  employeeId: string;
  name: string;
  changed: readonly string[];
};

export type SheetOutcome = {
  applied: readonly AppliedSheetRow[];
  /** Rows carrying no figure at all. Not a problem; simply nothing to do. */
  untouched: number;
  run: PreparedRun;
};

/**
 * What the API says is wrong with an uploaded sheet.
 *
 * Arrives on a 422's `details`, and the whole sheet is refused when there is
 * one of these — so every problem in the file is named at once rather than
 * one per attempt. `ApiError.details` is `unknown`; `sheetProblems` below is
 * the one place that shape is asserted.
 */
export type SheetProblem = { row: number; column: string; problem: string };

export function sheetProblems(details: unknown): readonly SheetProblem[] {
  if (typeof details !== "object" || details === null) return [];
  const problems = (details as { problems?: unknown }).problems;
  if (!Array.isArray(problems)) return [];
  return problems.filter(
    (problem): problem is SheetProblem =>
      typeof problem === "object" &&
      problem !== null &&
      typeof (problem as SheetProblem).row === "number" &&
      typeof (problem as SheetProblem).column === "string" &&
      typeof (problem as SheetProblem).problem === "string",
  );
}

export type MonthlyPayChange = {
  employeeId: string;
  name: string;
  /** Null where nobody had ever set one — see the `missing_pay` blocker. */
  fromKobo: number | null;
  toKobo: number;
  reason: string;
  changedAt: string;
  run: PreparedRun;
};

/**
 * What changing somebody's pay from a payroll actually does, in one sentence.
 *
 * Written once and rendered wherever the control appears, for the same reason
 * `HOLIDAY_DELETE_EFFECTS` and `membershipEffect` exist: a consequence
 * described in two places drifts, and this one is the difference between an
 * adjustment and a change to somebody's contract.
 */
export const MONTHLY_PAY_EFFECT =
  "This changes their record from now on, not just this payroll. Payslips " +
  "already approved keep the figures they were approved with.";

export type RunTaxOverride = {
  id: string;
  employeeId: string;
  employeeNo: string;
  name: string;
  payeKobo: number;
  reason: string;
  /** Who entered it. Null only where the deciding user has no employee record. */
  setBy: string | null;
  /** ISO instant. */
  setAt: string;
};

export type PayrollRunDetail = PayrollRun & {
  payslips: Payslip[];
  exceptions: RunException[];
  exclusions: RunExclusion[];
  taxOverrides: RunTaxOverride[];
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
  /** People with a payslip on the run. */
  headcount: number;
  /** People in the period left off it. `headcount + excluded` is everybody. */
  excluded: number;
  /** Non-empty means the run does not reconcile and cannot be shown as fine. */
  discrepancies: Discrepancy[];
  blockers: number;
  warnings: number;
};

/**
 * What an exclusion (or a withdrawal) changed.
 *
 * `run` is the period rebuilt, because a run is a function of the directory and
 * this run's exclusions — the totals and both counts move the moment somebody is
 * left off, and a screen that kept the old ones would show a payslip for
 * somebody it says is not being paid.
 */
export type ExclusionChange = {
  employeeId: string;
  name: string;
  reason?: string;
  excludedAt?: string;
  run: PreparedRun;
};

/**
 * What entering (or clearing) a tax override changed.
 *
 * `run` is the period rebuilt with the figure applied, same reasoning as
 * `ExclusionChange`: net pay moves the moment the figure does, and a screen
 * that kept the old totals would show a payslip disagreeing with itself.
 */
export type TaxOverrideChange = {
  employeeId: string;
  name: string;
  payeKobo?: number;
  reason?: string;
  setAt?: string;
  run: PreparedRun;
};

/** What approving settled. Loan instalments move on; claims are marked paid. */
export type ApprovedRun = {
  id: string;
  settled: { loans: number; claims: number; overtime: number };
};

/** `GET /preview`. Already kobo throughout — this is the engine's own shape. */
export type ComputedPayslip = {
  /**
   * Which statutory deductions the employer these settings belong to operates.
   *
   * Read before `payeKobo`, `pensionEmployeeKobo` or `nhfKobo`. Required here,
   * unlike on a stored `Payslip`, because a quote is computed now by an API that
   * always sends it.
   */
  operates: StatutoryOperation;
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
  /** Which regime granted it. `RENT_RELIEF` from 2026; the CRA before. */
  reliefKind: "CONSOLIDATED_RELIEF" | "RENT_RELIEF";
  /** Rent relief applies and nothing was declared, so none was granted. */
  reliefUnclaimed: boolean;
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

/* ------------------------------------------------------- company settings */

/**
 * What switching a statutory deduction off commits a company to.
 *
 * The API's own sentence, from `statutoryNotices` in
 * `approvehr-api/src/modules/payroll/engine.ts`, rendered verbatim. PAYE
 * deduction is an employer obligation under the Personal Income Tax Act and a
 * pension scheme is compulsory at fifteen employees under the Pension Reform Act
 * 2014, so the consequence is a legal statement and a locally reworded version
 * of one is how the two stop agreeing.
 *
 * `field` says which switch it belongs beside, so a settings form can put it
 * there without a lookup table of its own.
 */
export type StatutoryNotice = {
  code: "paye_not_deducted" | "pension_not_operated" | "nhf_not_deducted";
  field: "payeEnabled" | "pensionEnabled" | "nhfEnabled";
  message: string;
};

/** The stored payroll settings row. Rates are decimal strings from Postgres. */
export type PayrollSettingsRow = {
  workingDaysPerMonth: number;
  basicPercent: Decimalish;
  housingPercent: Decimalish;
  transportPercent: Decimalish;
  payeEnabled: boolean;
  pensionEnabled: boolean;
  pensionEmployeeRate: Decimalish;
  pensionEmployerRate: Decimalish;
  pensionOnBasic: boolean;
  pensionOnHousing: boolean;
  pensionOnTransport: boolean;
  nhfEnabled: boolean;
  nhfRate: Decimalish;
  nhfOnGross: boolean;
  netSwingThreshold: Decimalish;
  requireBankAccount: boolean;
  requirePensionPin: boolean;
  blockNegativeNet: boolean;
};

/**
 * `GET /payroll/settings`.
 *
 * `settings` is **null** when this company has never saved a row — it has not
 * finished setup, so it has not chosen anything, and `defaults: true` says the
 * figures a screen shows come from the engine rather than from a decision
 * somebody made. Absent is not the same as "the defaults were chosen".
 */
export type ApiPayrollSettings = {
  settings: PayrollSettingsRow | null;
  defaults: boolean;
  /** People on the payroll. The pension notice names it against the threshold. */
  headcount: number;
  /** Non-empty means the stored settings could not produce a lawful payslip. */
  issues: { field: string; message: string }[];
  notices: StatutoryNotice[];
};

/** Every field optional; at least one required. Absent means "leave it alone". */
export type PayrollSettingsPatch = Partial<{
  workingDaysPerMonth: number;
  basicPercent: number;
  housingPercent: number;
  transportPercent: number;
  payeEnabled: boolean;
  pensionEnabled: boolean;
  pensionEmployeeRate: number;
  pensionEmployerRate: number;
  pensionOnBasic: boolean;
  pensionOnHousing: boolean;
  pensionOnTransport: boolean;
  nhfEnabled: boolean;
  nhfRate: number;
  nhfOnGross: boolean;
  netSwingThreshold: number;
  requireBankAccount: boolean;
  requirePensionPin: boolean;
  blockNegativeNet: boolean;
}>;

/* ------------------------------------------------------------------- quotes */

/**
 * `POST /payroll/quote` — a payslip for a salary figure, attached to nobody.
 *
 * The endpoint three screens need and `/preview` cannot serve, because none of
 * them has an employee id: the settings form previewing an **unsaved** rate
 * change, and the add-an-employee form previewing a salary as it is typed.
 *
 * Until this existed those screens ran a second copy of the payroll engine in
 * the browser. That copy sat on the 2011 PAYE bands for a while after the
 * Nigeria Tax Act 2025 went into the API, so they quoted ₦63,266.67 on ₦500,000
 * a month where the answer was ₦63,950. It is deleted; this is the replacement.
 *
 * ## What you may send
 *
 * `settings` omitted means "this company's saved settings", which is what the
 * add-an-employee form wants — the figures a real run would produce. Supplying
 * it overrides them for the one call, which is what makes an unsaved change
 * previewable. **Bands are not part of it**: they are resolved from `period`,
 * because a company cannot choose its own tax brackets. Supplying settings that
 * could not produce a lawful payslip is refused with the reason, not computed.
 */
export type QuoteSettings = {
  workingDaysPerMonth: number;
  basicPercent: number;
  housingPercent: number;
  transportPercent: number;
  /** Whether this employer deducts PAYE at all. Off, the quote has no tax on it. */
  payeEnabled: boolean;
  pensionEnabled: boolean;
  pensionEmployeeRate: number;
  pensionEmployerRate: number;
  pensionOnBasic: boolean;
  pensionOnHousing: boolean;
  pensionOnTransport: boolean;
  nhfEnabled: boolean;
  nhfRate: number;
  nhfOnGross: boolean;
};

export type QuoteVariation = {
  /** One taxable, non-pensionable addition. A bonus, or overtime. */
  additionsKobo?: number;
  /** A loan instalment or an advance recovery. Never tax-deductible. */
  postTaxDeductionsKobo?: number;
  unpaidDays?: number;
  /** Declared annual rent. Absent means undeclared, which means no relief. */
  annualRentKobo?: number;
};

export type QuoteBody = {
  /** Contractual monthly gross, integer kobo. */
  grossMonthlyKobo: number;
  /** `YYYY-MM`. Omit for this month. The period picks the statute. */
  period?: string;
  settings?: QuoteSettings;
  variation?: QuoteVariation;
};

export type PayslipQuote = {
  slip: ComputedPayslip;
  period: { start: string; end: string };
  /** Which settings answered: the ones sent, or the company's saved ones. */
  settingsSource: "supplied" | "company";
  taxSchedule: {
    effectiveFrom: string;
    citation: string;
    confirmedThrough: string;
    /** Nobody has confirmed this schedule covers the period. Shown, not hidden. */
    stale: boolean;
  };
  /** Non-empty means the company's stored settings need attention first. */
  settingsIssues: { field: string; message: string }[];
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
  excludedCount: number;
  totalGross: Decimalish;
  totalNet: Decimalish;
  totalPaye: Decimalish;
  totalPensionEmployee: Decimalish;
  totalPensionEmployer: Decimalish;
  totalNhf: Decimalish;
  /* Written at prepare. Older runs answer without them, and true is what they
     were — every run that existed before the switches deducted all three. */
  deductsPaye?: boolean;
  deductsPension?: boolean;
  deductsNhf?: boolean;
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
  /**
   * Which relief regime the run's period granted.
   *
   * Optional on the wire because it is derived rather than stored, so an older
   * API answers without it. That absence has to survive as an absence — see
   * `Payslip.relief`.
   */
  relief?: ReliefRegime;
  /** Derived from the run, not stored on the payslip. See `Payslip.operates`. */
  operates?: StatutoryOperation;
  paye: Decimalish;
  /** Set once, at prepare time, from whichever `PayrollTaxOverride` existed
   *  for this person on this run. See `Payslip.payeOverridden`. */
  payeOverridden?: boolean;
  payeOverrideReason?: string | null;
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
  exclusions: {
    id: string;
    employeeId: string;
    reason: string;
    excludedAt: string;
    employee: { employeeNo: string; firstName: string; lastName: string };
    excludedBy: { firstName: string; lastName: string } | null;
  }[];
  taxOverrides: {
    id: string;
    employeeId: string;
    paye: Decimalish;
    reason: string;
    setAt: string;
    employee: { employeeNo: string; firstName: string; lastName: string };
    setBy: { firstName: string; lastName: string } | null;
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
    excludedCount: row.excludedCount,
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
    settingsFrozen:
      row.settingsSnapshot !== null && row.settingsSnapshot !== undefined,
    /* Defaulted to deducted, which is what a run written before these columns
       existed actually did. This is the one place a missing value is read as a
       positive: the alternative is telling somebody a historical payroll
       deducted no tax, which would be the wrong claim in every case. */
    operates: {
      paye: row.deductsPaye === false ? "NOT_OPERATED" : "DEDUCTED",
      pension: row.deductsPension === false ? "NOT_OPERATED" : "DEDUCTED",
      nhf: row.deductsNhf === false ? "NOT_OPERATED" : "DEDUCTED",
    },
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
    reliefKobo: koboFromDecimal(row.consolidatedRelief),
    /* Spread rather than defaulted: no regime on the wire means the payslip
       cannot say which relief it granted, and inventing one here would put the
       old label back on a 2026 figure. */
    ...(row.relief ? { relief: row.relief } : {}),
    /* Same rule. An API that does not send it cannot say which deductions were
       operated, and `wasDeducted` treats that silence as "computed" rather than
       claiming an absence nobody reported. */
    ...(row.operates ? { operates: row.operates } : {}),
    payeKobo: koboFromDecimal(row.paye),
    payeOverridden: row.payeOverridden ?? false,
    payeOverrideReason: row.payeOverrideReason ?? null,
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

/* ------------------------------------------------------- paged payslip list */

export type PayslipDelivery = "not_sent" | "sent" | "opened";

/**
 * What `GET /payroll/runs/:id/payslips` accepts.
 *
 * Two parameters, not a generic three, because a payslip list is asked two
 * questions: **which month** — which is the run id in the path — and **who has
 * not got theirs**. There is no status filter, because a payslip has no status of
 * its own, and no date range, because the period *is* the run.
 */
export type PayslipListParams = {
  page?: number;
  pageSize?: number;
  /** A name or a staff number. */
  q?: string;
  delivery?: PayslipDelivery;
  sort?:
    "name" | "employeeNo" | "gross" | "net" | "paye" | "emailedAt" | "viewedAt";
  order?: "asc" | "desc";
};

/** How many payslips are in each delivery state, across the whole run. */
export type PayslipCounts = { notSent: number; sent: number; opened: number };

type PayslipMetaExtra = { counts: PayslipCounts };

export type PayslipPage = {
  payslips: Payslip[];
  /** The server's total under this filter. Never the length of `payslips`. */
  total: number;
  counts: PayslipCounts;
};

/**
 * Just enough of a run to place a payslip in time — the period it paid, when,
 * and whether it is still a draft. Not the full `PayrollRun`: a single payslip
 * has no business computing the run's totals to answer "when was this paid".
 */
export type PayslipRunSummary = {
  id: string;
  period: string;
  payDate: string;
  status: PayrollRunStatus;
};

/** One of an employee's own payslips, with the run it belongs to attached —
 *  their own history has no "which month" picker to hang the period on. */
export type OwnPayslip = Payslip & { run: PayslipRunSummary };

type ApiPayslipWithRun = ApiPayslip & { run: PayslipRunSummary };

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
      exclusions: row.exclusions.map((row) => ({
        id: row.id,
        employeeId: row.employeeId,
        employeeNo: row.employee.employeeNo,
        name: `${row.employee.firstName} ${row.employee.lastName}`,
        reason: row.reason,
        decidedBy: row.excludedBy
          ? `${row.excludedBy.firstName} ${row.excludedBy.lastName}`
          : null,
        excludedAt: row.excludedAt,
      })),
      taxOverrides: row.taxOverrides.map((row) => ({
        id: row.id,
        employeeId: row.employeeId,
        employeeNo: row.employee.employeeNo,
        name: `${row.employee.firstName} ${row.employee.lastName}`,
        payeKobo: koboFromDecimal(row.paye),
        reason: row.reason,
        setBy: row.setBy
          ? `${row.setBy.firstName} ${row.setBy.lastName}`
          : null,
        setAt: row.setAt,
      })),
    };
  },

  /**
   * One run's payslips, filtered, sorted and paged **by the API**.
   *
   * Not the same read as `run(id)`, and the difference matters. `run` nests every
   * payslip with every line — right for the wizard, which needs the whole period
   * at once, and a multi-megabyte response for a company of two thousand. This is
   * the read a *table* makes.
   *
   * `counts` rides on `meta` and is the server's count of each delivery state
   * across the whole run under the current search. That is the only honest source
   * for the three figures above the distribution table: counting the array in
   * hand made "Not sent: 0" mean "none on this page".
   */
  payslips: async (
    runId: string,
    params: PayslipListParams = {},
    signal?: AbortSignal,
  ): Promise<PayslipPage> => {
    const result = await requestPaged<ApiPayslip, PayslipMetaExtra>(
      `/payroll/runs/${runId}/payslips`,
      {
        query: { ...params },
        ...(signal ? { signal } : {}),
      },
    );
    return {
      payslips: result.data.map(toPayslip),
      total: result.meta.total,
      counts: result.meta.counts,
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

  /**
   * Leaves somebody off this payroll, with the reason on the record.
   *
   * `RUN_PAYROLL`, same as preparing, because it is part of working a period up
   * rather than releasing it. It **rebuilds the period** — the response carries
   * the new `PreparedRun`, so a screen reloads from that rather than guessing
   * what the totals became.
   */
  exclude: (id: string, body: { employeeId: string; reason: string }) =>
    request<ExclusionChange>(`/payroll/runs/${id}/exclusions`, {
      method: "POST",
      body,
    }),

  /** Puts them back. Whatever blocked them returns with them. */
  putBack: (id: string, employeeId: string) =>
    request<ExclusionChange>(`/payroll/runs/${id}/exclusions/${employeeId}`, {
      method: "DELETE",
    }),

  /**
   * Enters somebody's PAYE by hand for this one payroll, in place of the
   * engine's own bands. Upserts — entering a second figure while one already
   * exists corrects it rather than refusing. `alsoStanding` also opens this
   * person's PAYE editable by default on future runs.
   */
  setTaxOverride: (
    id: string,
    body: {
      employeeId: string;
      payeKobo: number;
      reason?: string;
      alsoStanding?: boolean;
    },
  ) =>
    request<TaxOverrideChange>(`/payroll/runs/${id}/tax-overrides`, {
      method: "POST",
      body,
    }),

  /** Clears this period's hand-entered PAYE. The next figure comes from the
   *  bands again. Does not touch the standing preference. */
  clearTaxOverride: (id: string, employeeId: string) =>
    request<TaxOverrideChange>(
      `/payroll/runs/${id}/tax-overrides/${employeeId}`,
      {
        method: "DELETE",
      },
    ),

  /**
   * Overtime hours entered by hand for one person on this run.
   *
   * **Hours and a kind, never a rate.** The multiplier is the company's own
   * overtime policy, applied server-side — so a typed Saturday hour and a
   * clocked one are worth the same. There is deliberately no field to send one.
   *
   * Replaces whatever the clock produced for that person in that period. The
   * displaced records stay approved and unpaid, and the rebuilt run carries a
   * warning naming them.
   */
  setOvertimeOverride: (
    id: string,
    body: {
      employeeId: string;
      hours: number;
      kind: OvertimeOverrideKind;
      /** Optional — see `PayrollTaxOverride.reason` on the API. */
      reason?: string;
    },
  ) =>
    request<OvertimeOverrideChange>(`/payroll/runs/${id}/overtime-overrides`, {
      method: "POST",
      body,
    }),

  /** Takes the typed hours off, so the clock's records pay again. */
  clearOvertimeOverride: (id: string, employeeId: string) =>
    request<PreparedRun>(
      `/payroll/runs/${id}/overtime-overrides/${employeeId}`,
      { method: "DELETE" },
    ),

  /**
   * A one-off payment for one person on this run.
   *
   * Per run: a bonus belongs to one month, so next month starts with none. A
   * standing arrangement is a pay component, not this.
   */
  setBonus: (
    id: string,
    body: { employeeId: string; amountKobo: number; reason?: string },
  ) =>
    request<BonusChange>(`/payroll/runs/${id}/bonuses`, { method: "POST", body }),

  clearBonus: (id: string, employeeId: string) =>
    request<PreparedRun>(`/payroll/runs/${id}/bonuses/${employeeId}`, {
      method: "DELETE",
    }),

  /**
   * A whole payroll's figures, from one uploaded spreadsheet.
   *
   * **Not a loop over the four routes above.** Each of those rebuilds every
   * payslip on the run when it returns, so three hundred rows would be six
   * hundred requests and six hundred rebuilds of the whole payroll. This writes
   * them all and rebuilds once, which is the only reason it exists.
   *
   * A row key is present only when the file carried that column, and `null`
   * only when it carried it blank. `parseSheet` builds the rows that way, and
   * nothing between here and the server may spread an `undefined` into one —
   * the API reads which columns a sheet carried with `in`, so a stray key would
   * clear a figure nobody mentioned.
   */
  uploadAdjustments: (id: string, body: AdjustmentUpload) =>
    request<SheetOutcome>(`/payroll/runs/${id}/adjustments`, {
      method: "POST",
      body,
    }),

  /**
   * Somebody's contractual monthly pay, changed from the payroll table.
   *
   * **Not an override.** The two above are figures for one run and expire with
   * the period; this writes the employment record, so it changes every future
   * payroll too. Any control that calls this has to say so — see
   * `MONTHLY_PAY_EFFECT`.
   */
  setMonthlyPay: (
    id: string,
    body: { employeeId: string; grossMonthlyKobo: number; reason: string },
  ) =>
    request<MonthlyPayChange>(`/payroll/runs/${id}/monthly-pay`, {
      method: "PATCH",
      body,
    }),

  preview: (employeeId: string, period: string, signal?: AbortSignal) =>
    request<PayslipPreview>("/payroll/preview", {
      query: { employeeId, period },
      ...(signal ? { signal } : {}),
    }),

  /**
   * A payslip for a salary figure. POST, and it still writes nothing — the body
   * is a nested object with a settings block in it, which is the only reason it
   * is not a GET.
   */
  quote: (body: QuoteBody, signal?: AbortSignal) =>
    request<PayslipQuote>("/payroll/quote", {
      method: "POST",
      body,
      ...(signal ? { signal } : {}),
    }),

  /**
   * One employee's own payslip history, across every run.
   *
   * The self-service read: the API accepts this without `VIEW_SALARIES` when
   * the id is the caller's own. See `payslips` above for the company register.
   */
  employeePayslips: async (
    employeeId: string,
    params: { page?: number; pageSize?: number } = {},
    signal?: AbortSignal,
  ): Promise<{ payslips: OwnPayslip[]; total: number }> => {
    const result = await requestPaged<ApiPayslipWithRun>(
      `/payroll/employees/${employeeId}/payslips`,
      { query: { ...params }, ...(signal ? { signal } : {}) },
    );
    return {
      payslips: result.data.map((row) => ({ ...toPayslip(row), run: row.run })),
      total: result.meta.total,
    };
  },

  /**
   * One payslip, by its own id.
   *
   * The owner reads this without `VIEW_SALARIES`; anybody else needs it. A 403
   * here means it exists and is somebody else's; a 404 means it does not.
   */
  payslip: async (
    id: string,
    signal?: AbortSignal,
  ): Promise<{ payslip: Payslip; run: PayslipRunSummary }> => {
    const row = await request<ApiPayslipWithRun>(`/payroll/payslips/${id}`, {
      ...(signal ? { signal } : {}),
    });
    const { run, ...slip } = row;
    return { payslip: toPayslip(slip), run };
  },

  /** The company's payroll policy, and what switching a deduction off means. */
  settings: (signal?: AbortSignal) =>
    request<ApiPayrollSettings>("/payroll/settings", {
      ...(signal ? { signal } : {}),
    }),

  /** Changes policy for the next run. Nothing before it moves — see the type. */
  updateSettings: (body: PayrollSettingsPatch) =>
    request<ApiPayrollSettings>("/payroll/settings", { method: "PATCH", body }),
};

/* ----------------------------------------------------------------- helpers */

/**
 * The run's state, as a word.
 *
 * `IN_REVIEW` reads "In review" and not "Ready to approve", which is what it
 * used to say. A run in this state is frequently NOT ready: the wizard renders
 * this badge at the top of the Check step while the exception list 900px below
 * it says "2 stop the run", and the API refuses approval on a blocker. Two
 * mutually exclusive claims on one screen is the defect this product is sold
 * against, and the badge is the half that was wrong — a status label describes
 * where a thing IS, never what may be done to it next.
 *
 * It also reaches people who cannot approve anything: an employee's own payslip
 * carries this word (`payroll/payslips/my-payslip-index.tsx`), where "Ready to
 * approve" was a sentence about somebody else's inbox.
 */
export const STATUS_LABEL: Record<PayrollRunStatus, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  APPROVED: "Approved",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

/* ----------------------------------------------------------- honest counts */

/**
 * The headcount on a run, said once so three screens cannot say it differently.
 *
 * `employeeCount` is payslips. It is the right figure for "how many people were
 * paid" and the wrong figure for "how many people work here", and rendering it
 * under a label like **People** is a wrong claim the moment anybody has been
 * excluded: nine, where ten people work and one was deliberately left off, is
 * the same class of statement as a zero standing in for an absent figure.
 *
 * So: `"9 of 10 — 1 excluded"` when somebody was, and a bare `"9"` when nobody
 * was. Never a bare 9 in the first case, and never the noise of "9 of 9 — 0
 * excluded" in the second.
 */
export function headcountLabel(run: {
  employeeCount: number;
  excludedCount: number;
}): string {
  if (run.excludedCount === 0) return String(run.employeeCount);
  return (
    `${run.employeeCount} of ${run.employeeCount + run.excludedCount}` +
    ` — ${run.excludedCount} excluded`
  );
}

/**
 * The same fact with the noun in it, for prose rather than a labelled figure.
 *
 * `headcountLabel` is for a `Stat` or a `Badge`, where the label already says
 * what is being counted. In a sentence the noun has to sit next to its number —
 * "9 of 10 payslips — 1 excluded", never "9 of 10 — 1 excluded payslips", which
 * is what appending a noun to the other helper produces and which reads as
 * though one payslip was excluded.
 */
export function payslipCountLabel(run: {
  employeeCount: number;
  excludedCount: number;
}): string {
  const noun = run.employeeCount === 1 ? "payslip" : "payslips";
  if (run.excludedCount === 0) return `${run.employeeCount} ${noun}`;
  return (
    `${run.employeeCount} of ${run.employeeCount + run.excludedCount} ${noun}` +
    ` — ${run.excludedCount} excluded`
  );
}

/**
 * The same fact as a sentence, for beside a figure rather than under a label.
 *
 * Null when nobody was excluded, so a caller renders nothing at all rather than
 * "0 people excluded" — which is a line that makes a reader look for a list.
 */
export function excludedNote(run: { excludedCount: number }): string | null {
  if (run.excludedCount === 0) return null;
  return run.excludedCount === 1
    ? "1 person is on the payroll for this period and was deliberately left off it, with a reason recorded."
    : `${run.excludedCount} people are on the payroll for this period and were deliberately left off it, each with a reason recorded.`;
}

/**
 * Which exceptions have a screen that fixes them.
 *
 * A list of problems with nowhere to go is a list somebody reads twice and
 * acts on once. Where the fix is a field on a record, the row links straight
 * at it; where it is a judgement call, it does not pretend otherwise.
 *
 * `tab` and `field` are read by the record screen and have to name a real
 * one: `field` only opens its section pre-focused when `tab` is the section
 * that field actually lives on — `grossMonthly` is on `employment`, not
 * `pay`, and a mismatched pair silently opens nothing. A code with no field
 * worth naming — a judgement call, or a fact about the whole run rather than
 * one record — links at the record, or the screen the fact is actually
 * about, and does not pretend otherwise.
 */
/** The noun a statutory-switch WARNING is about, for `shortNoticeFor`. */
const STATUTORY_NOTICE_NOUN: Readonly<Record<string, string>> = {
  paye_not_deducted: "PAYE",
  pension_not_operated: "Pension",
  nhf_not_deducted: "National Housing Fund",
};

/**
 * A short, factual stand-in for the three statutory-switch WARNINGs'
 * `exception.message`, which is the engine's own multi-sentence paragraph —
 * the Act it names, what a scheme becoming compulsory at fifteen people
 * means today. That paragraph is right for a reader deciding whether to
 * switch a deduction back on (`/settings/payroll` links to it rather than
 * repeating it); it is not what somebody approving a period that already
 * reflects the decision needs to read again. Null for every other code —
 * their message is exactly what a reader needs, at whatever length.
 */
export function shortNoticeFor(code: string): string | null {
  const noun = STATUTORY_NOTICE_NOUN[code];
  return noun ? `${noun} is switched off for this payroll.` : null;
}

export function fixFor(
  code: string,
  employeeId: string | null,
): { href: string; label: string } | null {
  /* Not employee-scoped: a count of pending overtime across the run, not one
     person's record. The only code here answered before the `employeeId`
     gate, because it does not need one. */
  if (code === "overtime_awaiting_approval") {
    return { href: `/people/overtime`, label: "Review overtime" };
  }
  if (!employeeId) return null;
  switch (code) {
    case "missing_bank_account":
      return {
        href: `/people/${employeeId}?tab=pay&field=bankAccount`,
        label: "Add account number",
      };
    case "missing_pension_pin":
      return {
        href: `/people/${employeeId}?tab=pay&field=pensionPin`,
        label: "Add pension PIN",
      };
    case "missing_tax_state":
      return {
        href: `/people/${employeeId}?tab=pay&field=taxState`,
        label: "Add PAYE state",
      };
    /* `employment`, not `pay` — this is the tab `grossMonthly` actually
       renders on, beside job title and department. */
    case "missing_pay":
      return {
        href: `/people/${employeeId}?tab=employment&field=grossMonthly`,
        label: "Set their pay",
      };
    case "deduction_carried":
      return { href: `/payroll/loans`, label: "Open loans" };
    /* Deliberately the record and not a fix. The fix for an exclusion is
       putting the person back on the run, which is a write rather than a screen
       — the wizard offers it inline beside the row. */
    case "excluded_from_payroll":
      return { href: `/people/${employeeId}`, label: "Open record" };
    default:
      return { href: `/people/${employeeId}`, label: "Open record" };
  }
}
