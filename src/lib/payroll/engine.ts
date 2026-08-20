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
 * Annual PAYE bands. These are statute, not company policy, so they stay in
 * the engine — a company cannot choose its own tax rates. When the Finance Act
 * changes them, it changes here, once.
 */
const PAYE_BANDS: [number, number][] = [
  [300_000, 0.07],
  [300_000, 0.11],
  [500_000, 0.15],
  [500_000, 0.19],
  [1_600_000, 0.21],
  [Infinity, 0.24],
];

export type Variation = {
  /** Added to gross before tax — bonus, overtime, allowance. */
  additions: number;
  /** Taken after tax — loan repayment, salary advance, damages. */
  postTaxDeductions: number;
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
 * Consolidated Relief Allowance: the greater of ₦200,000 or 1% of gross,
 * plus 20% of gross. Applied to gross after pension and NHF are removed.
 */
export function consolidatedRelief(grossAnnual: number): number {
  return Math.max(200_000, grossAnnual * 0.01) + grossAnnual * 0.2;
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
  const craAnnual = consolidatedRelief(grossAnnual);

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
