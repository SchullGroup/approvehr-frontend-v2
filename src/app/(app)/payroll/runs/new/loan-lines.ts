import type { PayslipLine, PayslipLoan } from "@/lib/api/payroll";

/** A staff-loan instalment on a payslip, by the label the engine writes. */
export const isLoanLine = (line: PayslipLine): boolean =>
  line.kind === "DEDUCTION" && line.label.startsWith("Staff loan");

export type LoanRow = {
  key: string;
  label: string;
  amountKobo: number;
  /** The run's own read of the loan, for its balance and its edit. Null when
   *  its figures do not agree with what the payslip deducted. */
  loan: PayslipLoan | null;
};

/**
 * The loan lines the Adjust panel shows (U8).
 *
 * The payslip's own instalment lines are what was deducted, arrears included.
 * The run's loan read is used when its total agrees with them, because it
 * carries the balance and the edit; when it does not (it said ₦200,000 while
 * ₦600,000 was taken), the payslip's lines are shown as they are, so the
 * panel adds up to net pay, and no balance is quoted that the payslip
 * contradicts.
 */
export function loanLinesFor(
  lines: readonly PayslipLine[],
  loans: readonly PayslipLoan[],
): LoanRow[] {
  const fromLoans = (): LoanRow[] =>
    loans.map((loan) => ({
      key: loan.loanId,
      label: "Loan",
      amountKobo: loan.deductionKobo,
      loan,
    }));
  const onSlip = lines.filter(isLoanLine);
  if (onSlip.length === 0) return fromLoans();
  const slipTotal = onSlip.reduce((sum, line) => sum + line.amountKobo, 0);
  const loanTotal = loans.reduce((sum, loan) => sum + loan.deductionKobo, 0);
  if (loans.length > 0 && slipTotal === loanTotal) return fromLoans();
  return onSlip.map((line) => ({
    key: line.id,
    label: line.label,
    amountKobo: line.amountKobo,
    loan: null,
  }));
}
