/**
 * Checks the payroll figures this repo *ships* — it no longer checks an engine,
 * because this repo no longer has one.
 *
 * ## What changed and why
 *
 * `src/lib/payroll/engine.ts` was a second implementation of Nigerian PAYE,
 * pension and NHF, in floating-point naira, serving four preview screens. The
 * authoritative one lives in `approvehr-api/src/modules/payroll/engine.ts`, in
 * integer kobo, with dated tax schedules and 100-odd assertions. Two
 * implementations of statutory tax is one too many, and this was the copy that
 * went wrong: when the Nigeria Tax Act 2025 bands were entered in the backend it
 * was left on the 2011 figures, so four screens quoted ₦63,266.67 on ₦500,000 a
 * month where the answer was ₦63,950. It is deleted. Those screens now call
 * `POST /payroll/quote` and `GET /pay-components/preview/:id`.
 *
 * What is left in this repo that can still be wrong about money is:
 *
 * 1. **`src/lib/mock/demo-payslips.ts`** — fixed illustrative payslips, generated
 *    by the API's engine, which demo mode shows because a payroll product that
 *    cannot demonstrate payroll without a database cannot be demonstrated. Fixed
 *    output cannot drift the way a second implementation can, but it *can* go
 *    stale, and a stale figure presented as this year's is the same lie in a
 *    different wrapper.
 * 2. **`src/lib/payroll/settings.ts`** — the statutory floors a company may not
 *    undercut. Not arithmetic, but a refusal that has to hold.
 *
 * So this script asserts four things:
 *
 * - Every fixture row **reconciles**: the split sums to gross, and gross less
 *   every deduction is exactly net. The same integer identities
 *   `approvehr-api/src/modules/payroll/reconcile.ts` demands of a real run, with
 *   no tolerance, because a tolerance is a decision that being slightly wrong is
 *   acceptable.
 * - Every salary in the demo directory **has a row**. Add a demo employee on a
 *   new salary and this fails, naming the command that regenerates the fixture —
 *   rather than that person silently having no payslip.
 * - The fixture's recorded settings are still this repo's **defaults**.
 * - Cross-repo, when `approvehr-api` is checked out beside this one: the tax
 *   schedule the fixture was generated on is still the API's **newest**, band for
 *   band. This is the divergence guard, and it is the check that would have
 *   caught the original incident.
 *
 * The cross-repo check reads the backend as **text** rather than importing it —
 * this package cannot resolve the API's source tree, and restating the bands
 * here in order to compare them would defeat the point. It skips when the
 * sibling repo is absent, because the frontend's CI clones this repo alone and a
 * hard failure there would be a false one.
 */

/* `DEMO_ENABLED` before anything from `src/`: the app modules below reference
   it and the bundler that normally substitutes it is not here. */
import "./demo-global";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  DEMO_PAYSLIP_BASIS,
  DEMO_PAYSLIPS,
  payslipFiguresFor,
} from "../src/lib/mock/demo-payslips";
import { EMPLOYEES } from "../src/lib/mock/people";
import {
  DEFAULT_SETTINGS,
  validateSettings,
  type PayrollSettings,
} from "../src/lib/payroll/settings";

type Check = { name: string; got: number; want: number; tolerance?: number };

const checks: Check[] = [];
/** For assertions whose subject is a string rather than a figure. */
const same = (name: string, got: unknown, want: unknown) =>
  checks.push({
    name,
    got: JSON.stringify(got) === JSON.stringify(want) ? 1 : 0,
    want: 1,
  });

const naira = (kobo: number) =>
  (kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 });

/* --- The illustrative figures reconcile --------------------------------- *
 * Exact integer identities, no tolerance. These are the two `reconcile.ts`
 * checks that apply to a payslip with no allowances: the salary split adds back
 * to gross, and net plus every deduction is gross. An audit of the live
 * incumbent found a run whose net exceeded its gross by ₦1.47m rendered on
 * screen without complaint — the failure was not the arithmetic but that nothing
 * between it and the screen ever asked whether it added up.
 * ----------------------------------------------------------------------- */

if (DEMO_PAYSLIPS.length === 0) {
  console.error(
    "src/lib/mock/demo-payslips.ts holds no figures. Regenerate it — see its header.",
  );
  process.exit(1);
}

for (const row of DEMO_PAYSLIPS) {
  const label = `₦${naira(row.grossKobo)}`;

  checks.push({
    name: `${label} · split sums to gross`,
    got: row.basicKobo + row.housingKobo + row.transportKobo,
    want: row.grossKobo,
    tolerance: 0,
  });

  checks.push({
    name: `${label} · net plus deductions is gross`,
    got: row.netKobo + row.pensionEmployeeKobo + row.nhfKobo + row.payeKobo,
    want: row.grossKobo,
    tolerance: 0,
  });

  /* Employer pension is a cost on top of gross, never a deduction from it — and
     the identity above is what proves it is outside net, because net plus the
     three employee deductions already accounts for the whole of gross. What that
     identity cannot see is a row where the employer side is simply *missing*,
     which would understate the run's total cost to the company by ten per cent
     of everybody's pension base. So it is asserted present. */
  checks.push({
    name: `${label} · employer pension is present`,
    got: row.pensionEmployerKobo > 0 ? 1 : 0,
    want: 1,
    tolerance: 0,
  });

  checks.push({
    name: `${label} · net is positive`,
    got: row.netKobo > 0 ? 1 : 0,
    want: 1,
    tolerance: 0,
  });
}

/* --- Every demo salary has figures -------------------------------------- */

/* Only the seeded figures. `grossMonthly` is nullable now — somebody can be on
   the staff list before their pay is agreed — and there is no illustrative
   payslip to demand for a salary that does not exist. */
const salaries = [
  ...new Set(EMPLOYEES.map((e) => e.grossMonthly).filter((v) => v !== null)),
].sort((a, b) => b - a);
const uncovered = salaries.filter(
  (value) => payslipFiguresFor(Math.round(value * 100)) === null,
);

checks.push({
  name: `every demo salary has illustrative figures (${salaries.length})`,
  got: uncovered.length,
  want: 0,
  tolerance: 0,
});

if (uncovered.length > 0) {
  console.error(
    `\nNo illustrative payslip for: ${uncovered
      .map((value) => `₦${value.toLocaleString("en-NG")}`)
      .join(", ")}\n` +
      `Regenerate the fixture from approvehr-api:\n\n` +
      `  npx tsx scripts/emit-demo-payslips.ts ${salaries.join(" ")} \\\n` +
      `    > ../ApproveHR/web/src/lib/mock/demo-payslips.ts\n`,
  );
}

/* --- The fixture's settings are still this repo's defaults --------------- *
 * Demo mode withholds the figures when the company's settings have moved away
 * from these (see `settingsMatchFixture` in `lib/store/payroll.ts`). If the
 * *defaults* move, every demo starts in the withholding state — which is a
 * broken demo rather than a wrong number, but still worth being told about.
 * ----------------------------------------------------------------------- */

const basis = DEMO_PAYSLIP_BASIS.settings;
same("fixture salary split matches the defaults", basis.salarySplit, {
  basic: DEFAULT_SETTINGS.salarySplit.basic,
  housing: DEFAULT_SETTINGS.salarySplit.housing,
  transport: DEFAULT_SETTINGS.salarySplit.transport,
});
/* The three deduction switches the fixture was generated on. A fixture built
   with PAYE off would be a completely different set of numbers wearing the same
   filename, so this is not cosmetic — it is the guard that catches a switch
   changing under a fixture nobody regenerated. */
same("fixture PAYE switch matches the defaults", basis.paye, {
  enabled: DEFAULT_SETTINGS.paye.enabled,
});
same("fixture pension matches the defaults", basis.pension, {
  enabled: DEFAULT_SETTINGS.pension.enabled,
  employeeRate: DEFAULT_SETTINGS.pension.employeeRate,
  employerRate: DEFAULT_SETTINGS.pension.employerRate,
  basis: DEFAULT_SETTINGS.pension.basis,
});
same("fixture NHF matches the defaults", basis.nhf, {
  enabled: DEFAULT_SETTINGS.nhf.enabled,
  rate: DEFAULT_SETTINGS.nhf.rate,
  basis: DEFAULT_SETTINGS.nhf.basis,
});

/* --- Validation still refuses sub-statutory settings -------------------- */

const settings = (patch: (s: PayrollSettings) => PayrollSettings) =>
  patch(structuredClone(DEFAULT_SETTINGS));

checks.push({
  name: "defaults validate clean",
  got: validateSettings(DEFAULT_SETTINGS).length,
  want: 0,
});

checks.push({
  name: "sub-statutory employee pension refused",
  got: validateSettings(
    settings((s) => ({ ...s, pension: { ...s.pension, employeeRate: 0.05 } })),
  ).length,
  want: 1,
});

checks.push({
  name: "sub-statutory employer pension refused",
  got: validateSettings(
    settings((s) => ({ ...s, pension: { ...s.pension, employerRate: 0.05 } })),
  ).length,
  want: 1,
});

checks.push({
  name: "salary split must total 100%",
  got: validateSettings(
    settings((s) => ({
      ...s,
      salarySplit: { basic: 0.5, housing: 0.25, transport: 0.15 },
    })),
  ).length,
  want: 1,
});

/* --- The divergence guard ----------------------------------------------- *
 * The bands the fixture was generated on, against the bands the API would use
 * today. This is the check the original incident needed: a schedule entered in
 * the backend and not reflected here is exactly how four screens ended up
 * quoting last year's tax.
 *
 * Scoped to the newest entry in `TAX_SCHEDULES`. Slicing to that array first
 * matters — `PAYE_BANDS`, the legacy default kept for callers that do not care
 * about a period, is declared after it, and an earlier version of this guard
 * read its top rate and failed on the wrong number.
 * ----------------------------------------------------------------------- */

const backendEnginePath = path.resolve(
  import.meta.dirname,
  "../../../approvehr-api/src/modules/payroll/engine.ts",
);

if (existsSync(backendEnginePath)) {
  const source = readFileSync(backendEnginePath, "utf8");
  const schedules = source.slice(source.indexOf("export const TAX_SCHEDULES"));
  const arrayEnd = schedules.indexOf("\n];");
  const array = schedules.slice(0, arrayEnd === -1 ? undefined : arrayEnd);

  /* Schedules are held in ascending order of `effectiveFrom`, so the newest is
     the last one declared. */
  const newest = array.slice(array.lastIndexOf('effectiveFrom: "'));

  /** `800_000_00` and `Number.POSITIVE_INFINITY` both read back as numbers. */
  const value = (text: string): number =>
    text.includes("POSITIVE_INFINITY")
      ? Number.POSITIVE_INFINITY
      : Number(text.replaceAll("_", ""));

  const effectiveFrom = /effectiveFrom: "(\d{4}-\d{2}-\d{2})"/.exec(newest)?.[1];
  const bands = [
    ...newest
      .slice(newest.indexOf("bands: ["))
      .matchAll(/\[\s*([\w.]+)\s*,\s*([\d.]+)\s*\]/g),
  ].map(([, width, rate]) => [value(width ?? ""), Number(rate)]);

  const relief = newest.slice(newest.indexOf("relief: {"));
  const reliefKind = /kind: "(\w+)"/.exec(relief)?.[1];
  const rateOfRent = /rateOfRent: ([\d.]+)/.exec(relief)?.[1];
  const capKobo = /capKobo: ([\d_]+)/.exec(relief)?.[1];

  same(
    "fixture was generated on the API's newest schedule",
    effectiveFrom,
    DEMO_PAYSLIP_BASIS.schedule.effectiveFrom,
  );
  same(
    "fixture bands match the API's newest schedule",
    bands,
    DEMO_PAYSLIP_BASIS.schedule.bands.map(([width, rate]) => [width, rate]),
  );
  same(
    "fixture relief regime matches the API's newest schedule",
    {
      kind: reliefKind,
      ...(rateOfRent === undefined ? {} : { rateOfRent: Number(rateOfRent) }),
      ...(capKobo === undefined ? {} : { capKobo: value(capKobo) }),
    },
    DEMO_PAYSLIP_BASIS.schedule.relief,
  );
} else {
  console.log(
    "  skip  fixture vs the API's tax schedules — approvehr-api is not checked " +
      "out beside this repo, so there is nothing to compare against.",
  );
}

/* --- Report ------------------------------------------------------------- */

const rows: string[] = [];
const failures: string[] = [];

for (const c of checks) {
  const tol = c.tolerance ?? 0.005;
  const pass = Math.abs(c.got - c.want) <= tol;
  rows.push(
    `  ${pass ? "pass" : "FAIL"}  ${c.name.padEnd(48)} got ${String(c.got).padStart(14)}  want ${String(c.want).padStart(14)}`,
  );
  if (!pass) failures.push(`${c.name}: got ${c.got}, want ${c.want}`);
}

console.log(rows.join("\n"));

if (failures.length) {
  console.error(
    `\nPayroll check failed:\n${failures.map((f) => "  " + f).join("\n")}\n\n` +
      `The illustrative figures in src/lib/mock/demo-payslips.ts are generated. ` +
      `Do not hand-edit them to make this pass — regenerate them from ` +
      `approvehr-api, which is where the payroll engine lives. The command is in ` +
      `that file's header.`,
  );
  process.exit(1);
}
console.log(`\nPayroll check passed. ${checks.length} assertions.`);
