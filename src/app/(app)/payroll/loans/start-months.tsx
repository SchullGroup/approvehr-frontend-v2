"use client";

import { useMemo } from "react";
import { Select } from "@/components/ui";
import type { ApiLoan } from "@/lib/api/loans";
import { addMonths, monthLabel, monthStart } from "@/lib/loans/schedule";
import { useLoans, type LoanScope } from "@/lib/store/loans";

/**
 * How many months ahead of this one a first deduction may be set, at the least. Six reaches the end of the half-year
 * (from November, as far as May): the three the form used to offer stopped at January, which is not far enough when
 * somebody is still repaying one loan and the next has to start after it.
 */
export const START_MONTHS_AHEAD = 6;

/** Whole months from `from`'s month to `to`'s month; negative when `to` is earlier. */
export function monthsBetween(from: string, to: string): number {
  const a = new Date(monthStart(from));
  const b = new Date(monthStart(to));
  return (
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    (b.getUTCMonth() - a.getUTCMonth())
  );
}

/**
 * The month the last of a person's loans in repayment comes off, as the first of that month; `null` when they have none
 * (or the last has already finished, which a loan still marked as being repaid can briefly be).
 *
 * A loan that has not been decided has no month yet and is not counted: nobody has agreed to when it starts.
 */
export function currentLoanEnds(
  loans: readonly ApiLoan[],
  today: string,
  excludeLoanId?: string,
): string | null {
  let latest: string | null = null;
  for (const loan of loans) {
    if (loan.id === excludeLoanId) continue;
    if (loan.status !== "ACTIVE" || !loan.startPeriod) continue;
    const end = addMonths(loan.startPeriod, loan.termMonths - 1);
    if (monthsBetween(today, end) < 0) continue;
    if (latest === null || end > latest) latest = end;
  }
  return latest;
}

export type StartMonths = {
  options: { value: string; label: string }[];
  /** When the person's current loan finishes ("February 2027"), or null. */
  endsLabel: string | null;
};

/**
 * The months a loan's first deduction can be set to, for one person.
 *
 * Counted from `today` (the company's own month, see `useLoanToday`), this month first. Where the person is still
 * repaying a loan, the month it finishes carries "(current loan ends)" so the one choosing can see where a new loan
 * would sit after it, and the list always runs to at least the month after that.
 *
 * Their loans are read through the same list the Loans screen uses. If that read is refused (an approver who may not
 * see salaries) or has not arrived, nothing is marked and the months are simply the months.
 */
export function useStartMonths({
  today,
  employeeId,
  scope,
  excludeLoanId,
  labelThisMonth = false,
}: {
  today: string;
  employeeId: string | null;
  scope: LoanScope;
  /** The loan being decided or moved, which is not "their other loan". */
  excludeLoanId?: string;
  /** Say "(this month's payroll)" beside the first month. The apply form does; the dialogs that move a date do not. */
  labelThisMonth?: boolean;
}): StartMonths {
  const { loans } = useLoans({
    scope,
    status: "ACTIVE",
    pageSize: 50,
    ...(employeeId ? { employeeId } : {}),
  });
  const ends = useMemo(
    () => (employeeId ? currentLoanEnds(loans, today, excludeLoanId) : null),
    [loans, today, employeeId, excludeLoanId],
  );
  return useMemo(() => {
    const reach = ends
      ? Math.max(START_MONTHS_AHEAD, monthsBetween(today, ends) + 1)
      : START_MONTHS_AHEAD;
    const options = Array.from({ length: reach + 1 }, (_, i) => {
      const month = addMonths(today, i);
      const notes = [
        i === 0 && labelThisMonth ? "this month’s payroll" : null,
        ends && month === ends ? "current loan ends" : null,
      ].filter((note): note is string => note !== null);
      return {
        value: String(i),
        label: `${monthLabel(month)}${notes.length > 0 ? ` (${notes.join(", ")})` : ""}`,
      };
    });
    return { options, endsLabel: ends ? monthLabel(ends) : null };
  }, [today, ends, labelThisMonth]);
}

/** The picker itself. `value` is how many months ahead of this one, as text, because a `<select>` holds text. */
export function StartMonthSelect({
  value,
  onChange,
  months,
}: {
  value: string;
  onChange: (value: string) => void;
  months: StartMonths;
}) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value)}>
      {months.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}
