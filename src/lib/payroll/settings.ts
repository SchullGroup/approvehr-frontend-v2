/**
 * Company payroll settings.
 *
 * Everything here varies by company and must never be a constant in the
 * calculation code. A logistics company running shifts has a different working
 * month to an office; a company that pays 12% employer pension is above the
 * statutory floor and entitled to; a company whose contracts define pension on
 * basic alone computes a different pensionable figure to one using the full
 * package.
 *
 * Statutory MINIMUMS are enforced in `validateSettings` rather than hardcoded
 * in the engine, so a company can exceed them but not fall below.
 */

export type PensionComponent = "basic" | "housing" | "transport";

export type PayrollSettings = {
  /** Divisor for unpaid-leave proration. Office default 22; shifts differ. */
  workingDaysPerMonth: number;

  /** Must sum to 1. How gross is split into taxable components. */
  salarySplit: Record<PensionComponent, number>;

  /**
   * Whether this employer deducts PAYE at all.
   *
   * Smaller Nigerian companies often have staff file their own returns. Off, the
   * engine computes no tax and the payslip shows **no PAYE line** — not a
   * ₦0.00 one. Those are different claims: a zero says tax was worked out and
   * came to nothing, which is true for anybody under the ₦800,000 annual
   * exemption; absent says this employer does not deduct it.
   *
   * On by default, and the only thing that reaches the engine is the API's
   * `PayrollSettings.payeEnabled` — this object is a draft for the settings
   * form's preview. See `useDeductionSwitches`.
   */
  paye: { enabled: boolean };

  pension: {
    enabled: boolean;
    employeeRate: number;
    employerRate: number;
    /** Which components pension is charged on, per the employment contract. */
    basis: PensionComponent[];
  };

  nhf: {
    enabled: boolean;
    rate: number;
    /** NHF Act says basic; some companies contract on gross. */
    basis: "basic" | "gross";
  };

  exceptions: {
    /**
     * Fractional month-on-month change in net pay that raises a warning.
     * 0.25 means "flag anything that moves by a quarter or more".
     */
    netSwingThreshold: number;
    requireBankAccount: boolean;
    requirePensionPin: boolean;
    /** Block the run if net pay is zero or negative. */
    blockNegativeNet: boolean;
  };
};

/* Statutory floors under the Pension Reform Act 2014 and the NHF Act. A
   company may pay more; the UI refuses less. */
export const STATUTORY = {
  pensionEmployeeMin: 0.08,
  pensionEmployerMin: 0.1,
  nhfRate: 0.025,
} as const;

export const DEFAULT_SETTINGS: PayrollSettings = {
  workingDaysPerMonth: 22,
  /* Deliberately NOT what a brand-new real company defaults to any more —
     `PayrollSettings.basicPercent` on the API defaults to 100% basic. This
     60/25/15 is pinned to `DEMO_PAYSLIP_BASIS`, the generated demo-payslip
     fixture every illustrative figure in demo mode was computed against;
     changing it here would make the demo's own settings screen disagree with
     the demo payslips sitting right next to it. */
  salarySplit: { basic: 0.6, housing: 0.25, transport: 0.15 },
  paye: { enabled: true },
  pension: {
    enabled: true,
    employeeRate: 0.08,
    employerRate: 0.1,
    basis: ["basic", "housing", "transport"],
  },
  nhf: { enabled: true, rate: 0.025, basis: "basic" },
  exceptions: {
    netSwingThreshold: 0.25,
    requireBankAccount: true,
    requirePensionPin: true,
    blockNegativeNet: true,
  },
};

export type SettingsIssue = { field: string; message: string };

/**
 * Validates a settings object. Returns problems rather than throwing, so the
 * settings screen can show all of them at once instead of one per save.
 */
export function validateSettings(s: PayrollSettings): SettingsIssue[] {
  const issues: SettingsIssue[] = [];

  if (s.workingDaysPerMonth < 1 || s.workingDaysPerMonth > 31) {
    issues.push({
      field: "workingDaysPerMonth",
      message: "Working days must be between 1 and 31.",
    });
  }

  const splitSum =
    s.salarySplit.basic + s.salarySplit.housing + s.salarySplit.transport;
  if (Math.abs(splitSum - 1) > 0.0001) {
    issues.push({
      field: "salarySplit",
      message: `Salary split must total 100%. It currently totals ${(splitSum * 100).toFixed(1)}%.`,
    });
  }

  for (const key of ["basic", "housing", "transport"] as const) {
    if (s.salarySplit[key] < 0) {
      issues.push({
        field: `salarySplit.${key}`,
        message: "Split components cannot be negative.",
      });
    }
  }

  if (s.pension.enabled) {
    if (s.pension.employeeRate < STATUTORY.pensionEmployeeMin) {
      issues.push({
        field: "pension.employeeRate",
        message: `Employee pension cannot be below the statutory ${STATUTORY.pensionEmployeeMin * 100}%.`,
      });
    }
    if (s.pension.employerRate < STATUTORY.pensionEmployerMin) {
      issues.push({
        field: "pension.employerRate",
        message: `Employer pension cannot be below the statutory ${STATUTORY.pensionEmployerMin * 100}%.`,
      });
    }
    if (s.pension.basis.length === 0) {
      issues.push({
        field: "pension.basis",
        message: "Pension must be charged on at least one component.",
      });
    }
  }

  if (s.nhf.enabled && s.nhf.rate < 0) {
    issues.push({ field: "nhf.rate", message: "NHF rate cannot be negative." });
  }

  if (s.exceptions.netSwingThreshold <= 0 || s.exceptions.netSwingThreshold > 5) {
    issues.push({
      field: "exceptions.netSwingThreshold",
      message: "Swing threshold must be between 1% and 500%.",
    });
  }

  return issues;
}
