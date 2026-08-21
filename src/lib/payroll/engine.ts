/**
 * Nigerian payroll calculation.
 *
 * Implemented against the Personal Income Tax Act as amended by the Finance
 * Acts, the Pension Reform Act 2014, and the National Housing Fund Act. The
 * order of operations matters and is the part most spreadsheets get wrong:
 * pension and NHF are deducted BEFORE consolidated relief is applied, and
 * consolidated relief itself is the greater of ₦200,000 or 1% of gross, plus
 * 20% of gross.
 *
 * Everything here is annualised, taxed, then divided by twelve. Taxing a
 * monthly figure directly produces a different — and wrong — answer, because
 * the bands are annual and progressive.
 */

import {
  DEFAULT_SETTINGS,
  type PayrollSettings,
} from "./settings";

/**
 * Annual PAYE bands, per the **Nigeria Tax Act 2025**, effective 1 January 2026.
 *
 * ## This file is a preview calculator, not the authority
 *
 * The authoritative engine is `approvehr-api/src/modules/payroll/engine.ts`,
 * which works in integer kobo, resolves a *dated* schedule so a run for a past
 * period computes on the law in force then, and carries 104 assertions. This one
 * exists only so four screens can show a preview without a round trip:
 * `/settings/payroll`, `/people/new`, `/people/[id]` and the loan application.
 *
 * It has no date. It always computes on the schedule in force now, which is
 * correct for a preview of what somebody will be paid next month and wrong for
 * anything historical. Do not use it for anything historical.
 *
 * **These bands diverged once and it shipped.** When the 2025 Act was entered in
 * the backend, this array was left on the 2011 figures, so all four screens
 * quoted last year's tax — ₦63,266.67 against the correct ₦63,950 on ₦500,000 a
 * month. `scripts/verify-payroll.ts` now asserts these figures against the
 * backend's own schedule, so the two cannot drift apart silently again. If that
 * check fails, this array is stale; do not edit the assertion to match it.
 *
 * The real fix is to delete this file and have those screens call
 * `GET /payroll/preview`, which already exists and is the same engine the run
 * uses. Two implementations of tax law is one too many. Until then, this one is
 * at least the current law.
 */
const PAYE_BANDS: [number, number][] = [
  [800_000, 0.0],
  [2_200_000, 0.15],
  [9_000_000, 0.18],
  [13_000_000, 0.21],
  [25_000_000, 0.23],
  [Infinity, 0.25],
];

/**
 * Rent relief: 20% of annual rent paid, capped at ₦500,000.
 *
 * Replaced the Consolidated Relief Allowance from 1 January 2026. Nothing
 * declared means nothing granted — that is the statute, and it means a
 * homeowner's only personal relief is the 0% band.
 */
const RENT_RELIEF_RATE = 0.2;
const RENT_RELIEF_CAP = 500_000;

export type Variation = {
  /** Added to gross before tax — bonus, overtime, allowance. */
  additions: number;
  /** Taken after tax — loan repayment, salary advance, damages. */
  postTaxDeductions: number;
  /** Annual rent the employee has declared, for rent relief. */
  annualRent?: number;
  /** Days of unpaid leave in the period. Reduces gross pro rata. */
  unpaidDays: number;
};

export const NO_VARIATION: Variation = {
  additions: 0,
  postTaxDeductions: 0,
  unpaidDays: 0,
};

export type Payslip = {
  employeeId: string;
  /** After unpaid-leave proration and additions. */
  grossMonthly: number;
  basic: number;
  housing: number;
  transport: number;
  pensionEmployee: number;
  pensionEmployer: number;
  nhf: number;
  payeMonthly: number;
  postTaxDeductions: number;
  netPay: number;
  /** Effective tax rate on gross, for the review table. */
  effectiveRate: number;
};

/** Progressive tax over the annual bands. */
export function annualPaye(taxableAnnual: number): number {
  if (taxableAnnual <= 0) return 0;

  let remaining = taxableAnnual;
  let tax = 0;

  for (const [width, rate] of PAYE_BANDS) {
    if (remaining <= 0) break;
    const slice = Math.min(remaining, width);
    tax += slice * rate;
    remaining -= slice;
  }

  return tax;
}

/**
 * Personal relief, under the regime in force now.
 *
 * The Consolidated Relief Allowance — `max(₦200,000, 1% of gross) + 20% of
 * gross` — was abolished on 1 January 2026 and is not implemented here, because
 * this file only ever previews the current month. The backend keeps it for
 * periods before 2026; see `ReliefRegime` there.
 *
 * `annualRent` is what the employee has declared. Zero means undeclared, which
 * means no relief and a higher bill — which is why the record screen should ask.
 */
export function personalRelief(annualRent: number): number {
  if (annualRent <= 0) return 0;
  return Math.min(RENT_RELIEF_CAP, annualRent * RENT_RELIEF_RATE);
}

export function calculatePayslip(
  employeeId: string,
  contractGrossMonthly: number,
  variation: Variation = NO_VARIATION,
  settings: PayrollSettings = DEFAULT_SETTINGS,
): Payslip {
  const { workingDaysPerMonth, salarySplit, pension, nhf: nhfConfig } = settings;

  /* Unpaid leave reduces the contractual gross pro rata, before anything
     else. Additions land on top and are fully taxable. */
  const prorated =
    contractGrossMonthly *
    Math.max(
      0,
      (workingDaysPerMonth - variation.unpaidDays) / workingDaysPerMonth,
    );
  const grossMonthly = prorated + variation.additions;

  const components = {
    basic: grossMonthly * salarySplit.basic,
    housing: grossMonthly * salarySplit.housing,
    transport: grossMonthly * salarySplit.transport,
  };

  /* Pension is charged only on the components the company's contracts define
     as pensionable — often the full package, but basic-only is common. */
  const pensionable = pension.enabled
    ? pension.basis.reduce((sum, key) => sum + components[key], 0)
    : 0;
  const pensionEmployee = pensionable * pension.employeeRate;
  const pensionEmployer = pensionable * pension.employerRate;

  const nhfBase =
    nhfConfig.basis === "gross" ? grossMonthly : components.basic;
  const nhf = nhfConfig.enabled ? nhfBase * nhfConfig.rate : 0;

  const { basic, housing, transport } = components;

  const grossAnnual = grossMonthly * 12;
  const reliefsAnnual = (pensionEmployee + nhf) * 12;
  /* Rent relief, not the CRA — see `personalRelief`. Undeclared rent means no
     relief, which is the statute rather than a fallback. */
  const craAnnual = personalRelief(variation.annualRent ?? 0);

  const taxableAnnual = Math.max(0, grossAnnual - reliefsAnnual - craAnnual);
  const payeMonthly = annualPaye(taxableAnnual) / 12;

  const netPay =
    grossMonthly -
    pensionEmployee -
    nhf -
    payeMonthly -
    variation.postTaxDeductions;

  return {
    employeeId,
    grossMonthly,
    basic,
    housing,
    transport,
    pensionEmployee,
    pensionEmployer,
    nhf,
    payeMonthly,
    postTaxDeductions: variation.postTaxDeductions,
    netPay,
    effectiveRate: grossMonthly > 0 ? payeMonthly / grossMonthly : 0,
  };
}

/* ------------------------------------------------------------------- YTD */

export type YearToDate = {
  monthsElapsed: number;
  gross: number;
  paye: number;
  pensionEmployee: number;
  pensionEmployer: number;
  nhf: number;
  net: number;
};

/**
 * Year-to-date totals. Nigerian payslips are expected to carry these so an
 * employee can reconcile against their own tax position at year end.
 *
 * This projects from the current slip, which is exact only where pay has not
 * changed during the year. The real implementation sums posted runs; the
 * signature is the same so swapping it is a change of body, not of callers.
 */
export function yearToDate(slip: Payslip, monthsElapsed: number): YearToDate {
  const m = Math.max(1, Math.min(12, monthsElapsed));
  return {
    monthsElapsed: m,
    gross: slip.grossMonthly * m,
    paye: slip.payeMonthly * m,
    pensionEmployee: slip.pensionEmployee * m,
    pensionEmployer: slip.pensionEmployer * m,
    nhf: slip.nhf * m,
    net: slip.netPay * m,
  };
}

/* ------------------------------------------------------------- Exceptions */

export type ExceptionSeverity = "blocking" | "warning";

export type RunException = {
  employeeId: string;
  employeeName: string;
  severity: ExceptionSeverity;
  code: string;
  message: string;
  /** What the user should do about it. Never just state the problem. */
  fix: string;
};

export type PayrollEmployee = {
  id: string;
  name: string;
  jobTitle: string;
  department: string;
  grossMonthly: number;
  bankAccount: string | null;
  pensionPin: string | null;
  taxState: string;
  /** Set when the person joined or left mid-period. */
  joinedThisPeriod?: boolean;
  leftThisPeriod?: boolean;
};

/**
 * Everything that should stop or slow a run. Blocking exceptions cannot be
 * approved past; warnings can, but must be seen first.
 *
 * The threshold check is what catches a fat-fingered bonus before it becomes
 * a payment file.
 */
export function findExceptions(
  people: PayrollEmployee[],
  slips: Map<string, Payslip>,
  previous: Map<string, number> | null,
  settings: PayrollSettings = DEFAULT_SETTINGS,
): RunException[] {
  const out: RunException[] = [];
  const rules = settings.exceptions;

  for (const person of people) {
    const slip = slips.get(person.id);
    if (!slip) continue;

    if (rules.requireBankAccount && !person.bankAccount) {
      out.push({
        employeeId: person.id,
        employeeName: person.name,
        severity: "blocking",
        code: "NO_BANK",
        message: "No bank account on record",
        fix: "Add an account on their record before this run can be approved.",
      });
    }

    if (rules.requirePensionPin && settings.pension.enabled && !person.pensionPin) {
      out.push({
        employeeId: person.id,
        employeeName: person.name,
        severity: "blocking",
        code: "NO_PFA",
        message: "No pension PIN",
        fix: "Pension cannot be remitted without a PIN. Add it or exempt them from pension.",
      });
    }

    if (rules.blockNegativeNet && slip.netPay <= 0) {
      out.push({
        employeeId: person.id,
        employeeName: person.name,
        severity: "blocking",
        code: "NEGATIVE_NET",
        message: "Net pay is zero or negative",
        fix: "Post-tax deductions exceed pay. Reduce the deduction or spread it over more months.",
      });
    }

    const before = previous?.get(person.id);
    if (before && before > 0) {
      const change = (slip.netPay - before) / before;
      if (
        Math.abs(change) >= rules.netSwingThreshold &&
        !person.joinedThisPeriod
      ) {
        out.push({
          employeeId: person.id,
          employeeName: person.name,
          severity: "warning",
          code: "LARGE_CHANGE",
          message: `Net pay ${change > 0 ? "up" : "down"} ${Math.abs(Math.round(change * 100))}% on last month`,
          fix: "Confirm this is intended — a bonus, a raise, or unpaid leave.",
        });
      }
    }

    if (person.leftThisPeriod) {
      out.push({
        employeeId: person.id,
        employeeName: person.name,
        severity: "warning",
        code: "LEAVER",
        message: "Leaving this period",
        fix: "Check final settlement, outstanding loan balance and unused leave.",
      });
    }
  }

  return out;
}

/* ----------------------------------------------------------------- Totals */

export type RunTotals = {
  headcount: number;
  gross: number;
  paye: number;
  pensionEmployee: number;
  pensionEmployer: number;
  nhf: number;
  postTaxDeductions: number;
  net: number;
  /** What actually leaves the bank: net pay plus everything remitted. */
  totalCost: number;
};

export function totalsFor(slips: Payslip[]): RunTotals {
  const t = slips.reduce<RunTotals>(
    (acc, s) => ({
      headcount: acc.headcount + 1,
      gross: acc.gross + s.grossMonthly,
      paye: acc.paye + s.payeMonthly,
      pensionEmployee: acc.pensionEmployee + s.pensionEmployee,
      pensionEmployer: acc.pensionEmployer + s.pensionEmployer,
      nhf: acc.nhf + s.nhf,
      postTaxDeductions: acc.postTaxDeductions + s.postTaxDeductions,
      net: acc.net + s.netPay,
      totalCost: 0,
    }),
    {
      headcount: 0,
      gross: 0,
      paye: 0,
      pensionEmployee: 0,
      pensionEmployer: 0,
      nhf: 0,
      postTaxDeductions: 0,
      net: 0,
      totalCost: 0,
    },
  );

  /* Employer pension is a cost on top of gross, not a deduction from it. */
  t.totalCost = t.gross + t.pensionEmployer;
  return t;
}
