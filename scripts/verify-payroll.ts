/**
 * Checks the payroll engine against hand-worked examples. Money maths is the
 * one thing in this product that cannot be "probably right", so the expected
 * figures below were computed by hand from the Act and are asserted exactly.
 */

import {
  annualPaye,
  calculatePayslip,
  consolidatedRelief,
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

// Entirely within the first band.
checks.push({ name: "PAYE on ₦250,000 taxable", got: annualPaye(250_000), want: 17_500 });

// Exactly fills the first two bands: 300k@7% + 300k@11% = 21,000 + 33,000.
checks.push({ name: "PAYE on ₦600,000 taxable", got: annualPaye(600_000), want: 54_000 });

// Fills every band below the top, then spills into 24%.
// 21,000 + 33,000 + 75,000 + 95,000 + 336,000 = 560,000 at ₦3.2m
checks.push({ name: "PAYE on ₦3,200,000 taxable", got: annualPaye(3_200_000), want: 560_000 });

// One naira above the top threshold pays the top rate on the excess only.
checks.push({
  name: "PAYE on ₦4,200,000 taxable",
  got: annualPaye(4_200_000),
  want: 560_000 + 1_000_000 * 0.24,
});

checks.push({ name: "PAYE on zero", got: annualPaye(0), want: 0 });
checks.push({ name: "PAYE on negative", got: annualPaye(-50_000), want: 0 });

/* --- Consolidated relief ------------------------------------------------ */

// Below ₦20m gross the ₦200,000 floor beats 1%.
checks.push({
  name: "CRA at ₦6,000,000 gross",
  got: consolidatedRelief(6_000_000),
  want: 200_000 + 1_200_000,
});

// Above ₦20m gross, 1% of gross takes over from the floor.
checks.push({
  name: "CRA at ₦22,200,000 gross",
  got: consolidatedRelief(22_200_000),
  want: 222_000 + 4_440_000,
});

/* --- Full payslip, worked by hand --------------------------------------- */

// ₦1,850,000/month.
//   annual gross      22,200,000
//   pension  8%        1,776,000
//   NHF 2.5% of basic    333,000   (basic = 60% of gross)
//   CRA                4,662,000
//   taxable           15,429,000
//   PAYE               3,494,960  -> 291,246.67 monthly
//   net = 1,850,000 - 148,000 - 27,750 - 291,246.67
const senior = calculatePayslip("t1", 1_850_000);
checks.push({ name: "Senior · pension", got: senior.pensionEmployee, want: 148_000 });
checks.push({ name: "Senior · NHF", got: senior.nhf, want: 27_750 });
checks.push({ name: "Senior · PAYE monthly", got: senior.payeMonthly, want: 3_494_960 / 12, tolerance: 0.01 });
checks.push({ name: "Senior · net", got: senior.netPay, want: 1_850_000 - 148_000 - 27_750 - 3_494_960 / 12, tolerance: 0.01 });

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
