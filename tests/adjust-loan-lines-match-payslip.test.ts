/**
 * U8 (PAY-5), web part: the Adjust panel showed "Loan −₦200,000" while the
 * payslip deducted ₦600,000 for the loan (arrears included), so its lines did
 * not add up to net pay and ₦400,000 went unexplained. The loan lines are the
 * payslip's own, one per instalment line. The run's loan read adds the
 * balance note and the edit only where its figures agree with the payslip.
 */
import { describe, expect, it } from "vitest";
import { loanLinesFor } from "@/app/(app)/payroll/runs/new/loan-lines";
import type { PayslipLine, PayslipLoan } from "@/lib/api/payroll";

const line = (id: string, label: string, kobo: number): PayslipLine => ({
  id,
  kind: "DEDUCTION",
  label,
  amountKobo: kobo,
  taxable: false,
});
const loan: PayslipLoan = {
  loanId: "loan-1",
  accumulatedKobo: 120_000_000,
  balanceBeforeKobo: 120_000_000,
  deductionKobo: 20_000_000,
  balanceAfterKobo: 100_000_000,
};

describe("the Adjust panel's loan lines", () => {
  it("are the payslip's own, and add up to what was deducted", () => {
    const rows = loanLinesFor(
      [
        line("l1", "Staff loan, November instalment", 20_000_000),
        line("l2", "Staff loan, arrears", 40_000_000),
        line("l3", "Union dues", 500_000),
      ],
      [loan],
    );
    expect(rows.map((r) => r.amountKobo)).toEqual([20_000_000, 40_000_000]);
    expect(rows.reduce((sum, r) => sum + r.amountKobo, 0)).toBe(60_000_000);
  });

  it("drop the balance note when the run's loan figures disagree", () => {
    const rows = loanLinesFor([line("l1", "Staff loan", 60_000_000)], [loan]);
    expect(rows[0]!.loan).toBeNull();
  });

  it("keep the balance and the edit when they agree", () => {
    const rows = loanLinesFor([line("l1", "Staff loan", 20_000_000)], [loan]);
    expect(rows[0]!.loan?.loanId).toBe("loan-1");
  });

  it("fall back to the run's loans when the payslip has no loan lines", () => {
    const rows = loanLinesFor([], [loan]);
    expect(rows.map((r) => r.amountKobo)).toEqual([20_000_000]);
    expect(rows[0]!.loan?.loanId).toBe("loan-1");
  });
});
