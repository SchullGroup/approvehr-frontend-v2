/**
 * Illustrative payslip figures for demo mode. **Generated — do not edit.**
 *
 * Demo mode has no API and therefore no authoritative payroll engine. Rather
 * than keep a second implementation of Nigerian statutory tax in the browser —
 * which is what used to be here, and which drifted onto the 2011 PAYE bands
 * after the Nigeria Tax Act 2025 went into the API, so four screens quoted
 * ₦63,266.67 where the answer was ₦63,950 — the demo shows these fixed figures
 * and says on every screen that they are illustrative.
 *
 * They were produced by the authoritative engine,
 * `approvehr-api/src/modules/payroll/engine.ts`, for 2026-08 on the settings
 * and the tax schedule recorded below, with no allowances, no deductions, no
 * unpaid days and no declared rent.
 *
 * ## What may and may not use them
 *
 * Only where the demo would otherwise show nothing: the demo payroll run and
 * the record page's compensation card. **A figure for anything not in this
 * table is not available offline and must be omitted, never estimated** —
 * `payslipFiguresFor` returns null and the caller says so.
 *
 * ## Regenerating
 *
 * From `approvehr-api`, with this repo checked out beside it:
 *
 *     npx tsx scripts/emit-demo-payslips.ts \
 *       2100000 1850000 1650000 1420000 1300000 980000 890000 850000 760000 700000 \
 *       > ../ApproveHR/web/src/lib/mock/demo-payslips.ts
 *
 * `npm run verify-payroll` refuses this file if the schedule below is no longer
 * the API's newest, if the settings below are no longer the frontend's defaults,
 * or if a demo salary has no row — so it cannot go stale quietly.
 */

/** One payslip's figures, in integer kobo. No variation of any kind applied. */
export type DemoPayslipFigures = {
  grossKobo: number;
  basicKobo: number;
  housingKobo: number;
  transportKobo: number;
  pensionEmployeeKobo: number;
  pensionEmployerKobo: number;
  nhfKobo: number;
  /** Monthly taxable pay after pension, NHF and relief. */
  taxableMonthlyKobo: number;
  /** Personal relief, monthly. Zero under rent relief with nothing declared. */
  reliefMonthlyKobo: number;
  payeKobo: number;
  /** Before any post-tax deduction. The demo applies those itself. */
  netKobo: number;
};

/** What these were generated from. Checked by `scripts/verify-payroll.ts`. */
export const DEMO_PAYSLIP_BASIS = {
  period: "2026-08",
  periodEnd: "2026-08-31",
  schedule: {
    effectiveFrom: "2026-01-01",
    confirmedThrough: "2026-12-31",
    bands: [
    [80000000, 0],
    [220000000, 0.15],
    [900000000, 0.18],
    [1300000000, 0.21],
    [2500000000, 0.23],
    [Number.POSITIVE_INFINITY, 0.25],
  ] as [number, number][],
    relief: {
    kind: "RENT_RELIEF",
    rateOfRent: 0.2,
    capKobo: 50000000,
  },
  },
  settings: {
    workingDaysPerMonth: 22,
    salarySplit: {
      basic: 0.6,
      housing: 0.25,
      transport: 0.15,
    },
    pension: {
      enabled: true,
      employeeRate: 0.08,
      employerRate: 0.1,
      basis: ["basic", "housing", "transport"],
    },
    nhf: {
      enabled: true,
      rate: 0.025,
      basis: "basic",
    },
  },
} as const;

export const DEMO_PAYSLIPS: readonly DemoPayslipFigures[] = [
  {
    grossKobo: 210000000,
    basicKobo: 126000000,
    housingKobo: 52500000,
    transportKobo: 31500000,
    pensionEmployeeKobo: 16800000,
    pensionEmployerKobo: 21000000,
    nhfKobo: 3150000,
    taxableMonthlyKobo: 190050000,
    reliefMonthlyKobo: 0,
    payeKobo: 35160500,
    netKobo: 154889500,
  },
  {
    grossKobo: 185000000,
    basicKobo: 111000000,
    housingKobo: 46250000,
    transportKobo: 27750000,
    pensionEmployeeKobo: 14800000,
    pensionEmployerKobo: 18500000,
    nhfKobo: 2775000,
    taxableMonthlyKobo: 167425000,
    reliefMonthlyKobo: 0,
    payeKobo: 30409250,
    netKobo: 137015750,
  },
  {
    grossKobo: 165000000,
    basicKobo: 99000000,
    housingKobo: 41250000,
    transportKobo: 24750000,
    pensionEmployeeKobo: 13200000,
    pensionEmployerKobo: 16500000,
    nhfKobo: 2475000,
    taxableMonthlyKobo: 149325000,
    reliefMonthlyKobo: 0,
    payeKobo: 26608250,
    netKobo: 122716750,
  },
  {
    grossKobo: 142000000,
    basicKobo: 85200000,
    housingKobo: 35500000,
    transportKobo: 21300000,
    pensionEmployeeKobo: 11360000,
    pensionEmployerKobo: 14200000,
    nhfKobo: 2130000,
    taxableMonthlyKobo: 128510000,
    reliefMonthlyKobo: 0,
    payeKobo: 22237100,
    netKobo: 106272900,
  },
  {
    grossKobo: 130000000,
    basicKobo: 78000000,
    housingKobo: 32500000,
    transportKobo: 19500000,
    pensionEmployeeKobo: 10400000,
    pensionEmployerKobo: 13000000,
    nhfKobo: 1950000,
    taxableMonthlyKobo: 117650000,
    reliefMonthlyKobo: 0,
    payeKobo: 19956500,
    netKobo: 97693500,
  },
  {
    grossKobo: 98000000,
    basicKobo: 58800000,
    housingKobo: 24500000,
    transportKobo: 14700000,
    pensionEmployeeKobo: 7840000,
    pensionEmployerKobo: 9800000,
    nhfKobo: 1470000,
    taxableMonthlyKobo: 88690000,
    reliefMonthlyKobo: 0,
    payeKobo: 14214200,
    netKobo: 74475800,
  },
  {
    grossKobo: 89000000,
    basicKobo: 53400000,
    housingKobo: 22250000,
    transportKobo: 13350000,
    pensionEmployeeKobo: 7120000,
    pensionEmployerKobo: 8900000,
    nhfKobo: 1335000,
    taxableMonthlyKobo: 80545000,
    reliefMonthlyKobo: 0,
    payeKobo: 12748100,
    netKobo: 67796900,
  },
  {
    grossKobo: 85000000,
    basicKobo: 51000000,
    housingKobo: 21250000,
    transportKobo: 12750000,
    pensionEmployeeKobo: 6800000,
    pensionEmployerKobo: 8500000,
    nhfKobo: 1275000,
    taxableMonthlyKobo: 76925000,
    reliefMonthlyKobo: 0,
    payeKobo: 12096500,
    netKobo: 64828500,
  },
  {
    grossKobo: 76000000,
    basicKobo: 45600000,
    housingKobo: 19000000,
    transportKobo: 11400000,
    pensionEmployeeKobo: 6080000,
    pensionEmployerKobo: 7600000,
    nhfKobo: 1140000,
    taxableMonthlyKobo: 68780000,
    reliefMonthlyKobo: 0,
    payeKobo: 10630400,
    netKobo: 58149600,
  },
  {
    grossKobo: 70000000,
    basicKobo: 42000000,
    housingKobo: 17500000,
    transportKobo: 10500000,
    pensionEmployeeKobo: 5600000,
    pensionEmployerKobo: 7000000,
    nhfKobo: 1050000,
    taxableMonthlyKobo: 63350000,
    reliefMonthlyKobo: 0,
    payeKobo: 9653000,
    netKobo: 53697000,
  },
];

/**
 * The illustrative figures for a monthly gross, or null.
 *
 * Null is the important half. A salary edited in demo mode, or a person created
 * there, has no row — and the honest answer is that the figure needs the API,
 * not a plausible one worked out in the browser.
 */
export function payslipFiguresFor(grossKobo: number): DemoPayslipFigures | null {
  return DEMO_PAYSLIPS.find((row) => row.grossKobo === grossKobo) ?? null;
}
