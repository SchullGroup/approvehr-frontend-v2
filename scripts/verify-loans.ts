/**
 * Checks the loan schedule against hand-worked examples.
 *
 * `src/lib/loans/schedule.ts` is a **port** of `buildSchedule` in
 * `approvehr-api/src/modules/loans/service.ts`. It exists because the apply form
 * has to price a loan while somebody is typing, and because the demo has to show
 * a real schedule with no database behind it. A port is a copy, and a copy of
 * money arithmetic drifts unless something asserts that it has not — so this
 * runs in `npm run check` alongside the payroll engine's own script.
 *
 * The expected figures below were worked out by hand from the same three rules
 * the API's tests assert:
 *
 *   1. interest = round(principal x rate x months / 12), flat and annual
 *   2. every instalment but the last is floor(total / term)
 *   3. the last instalment is the balancing figure, so the lines sum exactly
 *
 * If the server's schedule maths ever changes, change it here in the same
 * commit and put the new assertion in both suites.
 */

import {
  addMonths,
  buildSchedule,
  isBeforeMonth,
  monthLabel,
  monthStart,
  priceLoan,
  shortMonthLabel,
} from "../src/lib/loans/schedule";

type Check = { name: string; got: unknown; want: unknown };

const checks: Check[] = [];
const push = (name: string, got: unknown, want: unknown) =>
  checks.push({ name, got, want });

const sum = (lines: { amountKobo: number }[]) =>
  lines.reduce((total, line) => total + line.amountKobo, 0);

/* --- The interest-free advance, which is the common case ---------------- */

// ₦600,000 over six months: ₦100,000 a month, April to September.
const a = buildSchedule({
  principalKobo: 60_000_000,
  termMonths: 6,
  interestRate: 0,
  startPeriod: "2026-04-01",
});
push("interest-free loan charges nothing", a.interestKobo, 0);
push("₦600,000 over 6 is ₦100,000 a month", a.instalmentKobo, 10_000_000);
push("six instalments", a.lines.length, 6);
push("first falls in the start month", a.lines[0]?.dueDate, "2026-04-01");
push("last is five months later", a.lines[5]?.dueDate, "2026-09-01");
push("the lines sum to the principal", sum(a.lines), 60_000_000);

/* --- Flat annual interest ---------------------------------------------- */

// ₦900,000 over twelve months at 5% a year: 900,000 x 0.05 x 12/12 = ₦45,000.
const b = buildSchedule({
  principalKobo: 90_000_000,
  termMonths: 12,
  interestRate: 0.05,
  startPeriod: "2026-09-01",
});
push("5% for a full year on ₦900,000", b.interestKobo, 4_500_000);
push("total repayable", b.totalKobo, 94_500_000);
push("₦945,000 over 12 divides exactly", b.instalmentKobo, 7_875_000);
push("so the last line is a regular one", b.finalInstalmentKobo, 7_875_000);

// The figure the apply form's own help text quotes: 5% on ₦300,000 over six
// months is ₦7,500. Half a year, so half the annual rate.
const c = buildSchedule({
  principalKobo: 30_000_000,
  termMonths: 6,
  interestRate: 0.05,
  startPeriod: "2026-09-01",
});
push("5% on ₦300,000 over six months", c.interestKobo, 750_000);

/* --- The balancing figure ---------------------------------------------- */

// ₦300,000 over seven months does not divide: 42,857.14 x 6 then the rest.
const d = buildSchedule({
  principalKobo: 30_000_000,
  termMonths: 7,
  interestRate: 0,
  startPeriod: "2026-09-01",
});
push("the regular instalment floors", d.instalmentKobo, 4_285_714);
push("the last one balances", d.finalInstalmentKobo, 30_000_000 - 4_285_714 * 6);
push("and it still sums exactly", sum(d.lines), 30_000_000);
push(
  "only the last line differs",
  new Set(d.lines.slice(0, 6).map((l) => l.amountKobo)).size,
  1,
);

/* --- Reconciliation across a grid, as the API's property test does ------ */

let combinations = 0;
let mismatched = 0;
let fractional = 0;
let wrongLength = 0;
for (const principalKobo of [1_000, 12_345, 5_000_000, 60_000_000, 9_000_000_000]) {
  for (let termMonths = 1; termMonths <= 24; termMonths += 1) {
    for (const interestRate of [0, 0.01, 0.05, 0.125, 0.3]) {
      const priced = priceLoan({
        principalKobo,
        termMonths,
        interestRate,
        startPeriod: "2026-09-01",
      });
      if (!priced) continue;
      combinations += 1;
      if (sum(priced.lines) !== priced.totalKobo) mismatched += 1;
      if (priced.lines.some((l) => !Number.isInteger(l.amountKobo))) fractional += 1;
      if (priced.lines.length !== termMonths) wrongLength += 1;
    }
  }
}
push(`every line is whole kobo (${combinations} combinations)`, fractional, 0);
push("every schedule reconciles to principal plus interest", mismatched, 0);
push("every schedule has one line per month", wrongLength, 0);

/* --- The period calendar ----------------------------------------------- */

push("due dates pin to the first of the month", monthStart("2026-11-17"), "2026-11-01");
push("months cross the year boundary", addMonths("2026-11-01", 3), "2027-02-01");
push("a mid-month start normalises", addMonths("2026-11-17", 0), "2026-11-01");
push("months read as words", monthLabel("2027-02-01"), "February 2027");
push("and shorten for a table", shortMonthLabel("2027-02-01"), "Feb 2027");
push("an earlier month is before", isBeforeMonth("2026-07-01", "2026-08-19"), true);
push("the same month is not", isBeforeMonth("2026-08-01", "2026-08-19"), false);

/* --- Not-yet-a-loan inputs price to null rather than throwing ----------- */

push(
  "no amount is not a loan",
  priceLoan({ principalKobo: 0, termMonths: 6, startPeriod: "2026-09-01" }),
  null,
);
push(
  "a fractional term is not a loan",
  priceLoan({ principalKobo: 100, termMonths: 1.5, startPeriod: "2026-09-01" }),
  null,
);
push(
  "less than a kobo a month is a term to shorten",
  priceLoan({ principalKobo: 5, termMonths: 12, startPeriod: "2026-09-01" }),
  null,
);

/* --- Report ------------------------------------------------------------ */

const failures: string[] = [];
const rows = checks.map((check) => {
  const pass = JSON.stringify(check.got) === JSON.stringify(check.want);
  if (!pass) {
    failures.push(
      `${check.name}: got ${JSON.stringify(check.got)}, want ${JSON.stringify(check.want)}`,
    );
  }
  return `  ${pass ? "pass" : "FAIL"}  ${check.name.padEnd(52)} ${JSON.stringify(check.got)}`;
});

console.log(rows.join("\n"));

if (failures.length) {
  console.error(`\nLoan check failed:\n${failures.map((f) => "  " + f).join("\n")}`);
  process.exit(1);
}
console.log(
  `\nLoan check passed. ${checks.length} assertions, including ${combinations} reconciled schedules.`,
);
