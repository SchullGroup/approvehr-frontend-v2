/**
 * Checks the payroll engine against hand-worked examples. Money maths is the
 * one thing in this product that cannot be "probably right", so the expected
 * figures below were computed by hand from the Act and are asserted exactly.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  annualPaye,
  calculatePayslip,
  personalRelief,
  findExceptions,
  type PayrollEmployee,
  type Payslip,
} from "../src/lib/payroll/engine";
import {
  DEFAULT_SETTINGS,
  validateSettings,
  type PayrollSettings,
} from "../src/lib/payroll/settings";

type Check = { name: string; got: number; want: number; tolerance?: number };

const checks: Check[] = [];

/* --- Band arithmetic ---------------------------------------------------- */

/*
 * These four were hand-worked against the 2011 schedule and all four changed
 * under the Nigeria Tax Act 2025. Reworked from the new bands rather than
 * updated from the code's output — this file's whole premise is that an
 * expectation copied from the engine proves only self-consistency.
 */

// Inside the ₦800,000 exempt band, so nothing at all. Under the 2011 schedule
// this was ₦17,500, and the exempt band is what replaced the old 1% minimum tax.
checks.push({ name: "PAYE on ₦250,000 taxable", got: annualPaye(250_000), want: 0 });

// Still inside it. Was ₦54,000.
checks.push({ name: "PAYE on ₦600,000 taxable", got: annualPaye(600_000), want: 0 });

// 800,000 @ 0% = 0; 2,200,000 @ 15% = 330,000; the remaining 200,000 @ 18%
// = 36,000. Was ₦560,000.
checks.push({
  name: "PAYE on ₦3,200,000 taxable",
  got: annualPaye(3_200_000),
  want: 330_000 + 36_000,
});

// A further million falls entirely in the 18% band, not the top one — the top
// rate does not start until ₦50m. 330,000 + 1,200,000 @ 18% = 546,000.
checks.push({
  name: "PAYE on ₦4,200,000 taxable",
  got: annualPaye(4_200_000),
  want: 330_000 + 1_200_000 * 0.18,
});

// The top marginal rate is 25%, not the old 24%. Checked as a step so it does
// not depend on every band below it.
checks.push({
  name: "top marginal rate is 25%",
  got: annualPaye(60_000_000 + 1_000_000) - annualPaye(60_000_000),
  want: 250_000,
});

checks.push({ name: "PAYE on zero", got: annualPaye(0), want: 0 });
checks.push({ name: "PAYE on negative", got: annualPaye(-50_000), want: 0 });

/* --- Personal relief ----------------------------------------------------- */

/*
 * The Consolidated Relief Allowance was abolished on 1 January 2026 and its two
 * assertions went with it — `max(₦200,000, 1% of gross) + 20% of gross` no
 * longer exists in this file. The backend keeps it, because a run for a period
 * before 2026 must still compute on the law in force then.
 *
 * What replaced it does not look at income at all.
 */

// 20% of ₦1,200,000 = ₦240,000, under the cap.
checks.push({
  name: "rent relief on ₦1,200,000 of rent",
  got: personalRelief(1_200_000),
  want: 240_000,
});

// 20% of ₦4,000,000 = ₦800,000, so the ₦500,000 cap binds.
checks.push({
  name: "rent relief capped at ₦500,000",
  got: personalRelief(4_000_000),
  want: 500_000,
});

// Nothing declared, nothing granted. The statute puts the declaration on the
// individual, so this is the rule and not a fallback.
checks.push({
  name: "no relief when no rent is declared",
  got: personalRelief(0),
  want: 0,
});

/* --- The divergence guard ------------------------------------------------ *
 * These bands diverged from the backend's once and it shipped: the 2025 Act was
 * entered there and this file was left on the 2011 figures, so four screens
 * quoted last year's tax. The two are compared here so that cannot recur
 * silently.
 *
 * Read as text rather than imported, because this package cannot import from the
 * API's source tree — and duplicating the numbers in order to compare them would
 * defeat the point.
 *
 * **It skips when the backend is not checked out.** The frontend's CI clones
 * this repo alone, so the sibling path does not exist there and a hard failure
 * would be a false one. That means the guard only bites for somebody working
 * with both repos — which is precisely who edits these bands, so it catches the
 * case it was written for. A cross-repo check that CI can run needs the two in
 * one place, or the constant published as a package.
 * ------------------------------------------------------------------------- */
const backendEnginePath = path.resolve(
  import.meta.dirname,
  "../../../approvehr-api/src/modules/payroll/engine.ts",
);

if (existsSync(backendEnginePath)) {
  const backendEngine = readFileSync(backendEnginePath, "utf8");

  /*
   * Scoped to the TAX_SCHEDULES array, not the whole file.
   *
   * The first version took the last `[Number.POSITIVE_INFINITY, …]` anywhere in
   * the source and read 0.24 — because `PAYE_BANDS`, the legacy default kept for
   * callers that do not care about a period, is declared *after* the schedules.
   * The guard failed, correctly, on the wrong number. Slicing to the array first
   * means the last match is the newest schedule's top band, which is what this
   * file is supposed to agree with.
   */
  const schedules = backendEngine.slice(
    backendEngine.indexOf("export const TAX_SCHEDULES"),
  );
  const arrayEnd = schedules.indexOf("\n];");
  const currentTopRate = [
    ...schedules
      .slice(0, arrayEnd === -1 ? undefined : arrayEnd)
      .matchAll(/\[Number\.POSITIVE_INFINITY, (0?\.\d+)\]/g),
  ].at(-1)?.[1];

  /*
   * Compared against this engine's *own* rate, derived empirically rather than
   * restated. A hardcoded 0.25 here would mean the next Finance Act needs three
   * numbers changed instead of two, and one of them would be in the assertion
   * that is supposed to catch the mistake.
   */
  const ownTopRate =
    (annualPaye(61_000_000) - annualPaye(60_000_000)) / 1_000_000;

  checks.push({
    name: "top marginal rate agrees with the backend's newest schedule",
    got: currentTopRate === undefined ? NaN : Number(currentTopRate),
    want: ownTopRate,
  });
} else {
  console.log(
    "  skip  top marginal rate vs the backend — approvehr-api is not checked " +
      "out beside this repo, so there is nothing to compare against.",
  );
}

/* --- Full payslip, worked by hand --------------------------------------- */

// ₦1,850,000/month.
//   annual gross      22,200,000
//   pension  8%        1,776,000
//   NHF 2.5% of basic    333,000   (basic = 60% of gross)
//   relief                     0   (rent relief: nothing declared, so nothing
//                                   granted — the CRA of 4,662,000 that used to
//                                   sit here was abolished on 2026-01-01)
//   taxable           20,091,000
//   PAYE               3,649,110  -> 304,092.50 monthly
//   net = 1,850,000 - 148,000 - 27,750 - 304,092.50 = 1,370,157.50
//
// Under the 2011 schedule this person paid 291,246.67 a month. Losing a
// 4,662,000 relief costs them 12,845.83 a month even with lower rates — the
// reform is a rise for anybody who does not declare rent.
const senior = calculatePayslip("t1", 1_850_000);
checks.push({ name: "Senior · pension", got: senior.pensionEmployee, want: 148_000 });
checks.push({ name: "Senior · NHF", got: senior.nhf, want: 27_750 });
checks.push({ name: "Senior · PAYE monthly", got: senior.payeMonthly, want: 3_649_110 / 12, tolerance: 0.01 });
checks.push({ name: "Senior · net", got: senior.netPay, want: 1_850_000 - 148_000 - 27_750 - 3_649_110 / 12, tolerance: 0.01 });

// A low earner should still pay some tax but at a far lower effective rate.
const junior = calculatePayslip("t2", 250_000);
checks.push({ name: "Junior · pension", got: junior.pensionEmployee, want: 20_000 });

/* --- Variations --------------------------------------------------------- */

// Half a month of unpaid leave halves gross.
const half = calculatePayslip("t3", 1_000_000, {
  additions: 0,
  postTaxDeductions: 0,
  unpaidDays: 11,
});
checks.push({ name: "11 unpaid days of 22 halves gross", got: half.grossMonthly, want: 500_000 });

// A post-tax deduction reduces net one-for-one and does not change PAYE.
const plain = calculatePayslip("t4", 900_000);
const withLoan = calculatePayslip("t4", 900_000, {
  additions: 0,
  postTaxDeductions: 75_000,
  unpaidDays: 0,
});
checks.push({ name: "Loan does not change PAYE", got: withLoan.payeMonthly, want: plain.payeMonthly, tolerance: 0.01 });
checks.push({ name: "Loan reduces net one-for-one", got: plain.netPay - withLoan.netPay, want: 75_000, tolerance: 0.01 });

// A bonus is fully taxable, so net rises by less than the bonus.
const withBonus = calculatePayslip("t4", 900_000, {
  additions: 500_000,
  postTaxDeductions: 0,
  unpaidDays: 0,
});
const netGain = withBonus.netPay - plain.netPay;
if (netGain >= 500_000 || netGain <= 0) {
  checks.push({ name: "Bonus is taxed (net gain < bonus)", got: netGain, want: -1 });
} else {
  checks.push({ name: "Bonus is taxed (net gain < bonus)", got: 1, want: 1 });
}

/* --- Company settings actually drive the maths -------------------------- */

const settings = (patch: (s: PayrollSettings) => PayrollSettings) =>
  patch(structuredClone(DEFAULT_SETTINGS));

// A shift company on a 20-day month prorates unpaid leave differently.
const shift = settings((s) => ({ ...s, workingDaysPerMonth: 20 }));
const shiftSlip = calculatePayslip("s1", 1_000_000, { additions: 0, postTaxDeductions: 0, unpaidDays: 5 }, shift);
checks.push({ name: "20-day month · 5 unpaid days = 75% gross", got: shiftSlip.grossMonthly, want: 750_000 });

// The same absence on the default 22-day month gives a different figure —
// proving the setting is read rather than ignored.
const officeSlip = calculatePayslip("s1", 1_000_000, { additions: 0, postTaxDeductions: 0, unpaidDays: 5 });
checks.push({ name: "22-day month · same absence differs", got: officeSlip.grossMonthly, want: 1_000_000 * (17 / 22), tolerance: 0.01 });

// Pension on basic only, rather than the whole package.
const basicOnly = settings((s) => ({ ...s, pension: { ...s.pension, basis: ["basic"] } }));
const basicSlip = calculatePayslip("s2", 1_000_000, undefined, basicOnly);
checks.push({ name: "Pension on basic only", got: basicSlip.pensionEmployee, want: 1_000_000 * 0.6 * 0.08 });

// A generous employer above the statutory floor.
const generous = settings((s) => ({ ...s, pension: { ...s.pension, employerRate: 0.15 } }));
const generousSlip = calculatePayslip("s3", 1_000_000, undefined, generous);
checks.push({ name: "Employer pension at 15%", got: generousSlip.pensionEmployer, want: 150_000 });

// Pension switched off entirely removes both sides and raises taxable income.
const noPension = settings((s) => ({ ...s, pension: { ...s.pension, enabled: false } }));
const noPensionSlip = calculatePayslip("s4", 1_000_000, undefined, noPension);
checks.push({ name: "Pension disabled · employee side zero", got: noPensionSlip.pensionEmployee, want: 0 });
checks.push({ name: "Pension disabled · employer side zero", got: noPensionSlip.pensionEmployer, want: 0 });
const withPensionSlip = calculatePayslip("s4", 1_000_000);
checks.push({
  name: "Pension disabled raises PAYE",
  got: noPensionSlip.payeMonthly > withPensionSlip.payeMonthly ? 1 : 0,
  want: 1,
});

// NHF charged on gross rather than basic.
const nhfGross = settings((s) => ({ ...s, nhf: { ...s.nhf, basis: "gross" as const } }));
checks.push({ name: "NHF on gross", got: calculatePayslip("s5", 1_000_000, undefined, nhfGross).nhf, want: 25_000 });
checks.push({ name: "NHF on basic (default)", got: calculatePayslip("s5", 1_000_000).nhf, want: 15_000 });

/* --- Exception rules are configurable ----------------------------------- */

const people: PayrollEmployee[] = [
  { id: "e1", name: "Steady Sam", jobTitle: "Analyst", department: "Finance", grossMonthly: 500_000, bankAccount: "GTB ····1", pensionPin: "PEN1", taxState: "Lagos" },
];
const slipMap = new Map<string, Payslip>([["e1", calculatePayslip("e1", 500_000)]]);
const prevNet = new Map<string, number>([["e1", calculatePayslip("e1", 500_000).netPay * 0.85]]);

// A 17% swing is under the default 25% threshold, so nothing is raised.
checks.push({
  name: "17% swing under default threshold",
  got: findExceptions(people, slipMap, prevNet).length,
  want: 0,
});

// Tighten the threshold to 10% and the same data now warns.
const strict = settings((s) => ({ ...s, exceptions: { ...s.exceptions, netSwingThreshold: 0.1 } }));
checks.push({
  name: "Same swing warns at a 10% threshold",
  got: findExceptions(people, slipMap, prevNet, strict).length,
  want: 1,
});

// Turning the bank-account rule off stops it blocking.
const noBank: PayrollEmployee[] = [{ ...people[0], bankAccount: null }];
checks.push({
  name: "Missing bank blocks by default",
  got: findExceptions(noBank, slipMap, null).filter((e) => e.code === "NO_BANK").length,
  want: 1,
});
const lenient = settings((s) => ({ ...s, exceptions: { ...s.exceptions, requireBankAccount: false } }));
checks.push({
  name: "Bank rule can be switched off",
  got: findExceptions(noBank, slipMap, null, lenient).filter((e) => e.code === "NO_BANK").length,
  want: 0,
});

/* --- Validation refuses sub-statutory settings -------------------------- */

checks.push({ name: "Defaults validate clean", got: validateSettings(DEFAULT_SETTINGS).length, want: 0 });

const belowFloor = settings((s) => ({ ...s, pension: { ...s.pension, employeeRate: 0.05 } }));
checks.push({ name: "Sub-statutory employee pension rejected", got: validateSettings(belowFloor).length, want: 1 });

const badSplit = settings((s) => ({ ...s, salarySplit: { basic: 0.5, housing: 0.25, transport: 0.15 } }));
checks.push({ name: "Salary split must total 100%", got: validateSettings(badSplit).length, want: 1 });

/* --- Report ------------------------------------------------------------- */

const rows: string[] = [];
const failures: string[] = [];

for (const c of checks) {
  const tol = c.tolerance ?? 0.005;
  const pass = Math.abs(c.got - c.want) <= tol;
  rows.push(
    `  ${pass ? "pass" : "FAIL"}  ${c.name.padEnd(42)} got ${c.got.toFixed(2).padStart(14)}  want ${c.want.toFixed(2).padStart(14)}`,
  );
  if (!pass) failures.push(`${c.name}: got ${c.got}, want ${c.want}`);
}

console.log(rows.join("\n"));

if (failures.length) {
  console.error(`\nPayroll check failed:\n${failures.map((f) => "  " + f).join("\n")}`);
  process.exit(1);
}
console.log(`\nPayroll check passed. ${checks.length} assertions.`);
