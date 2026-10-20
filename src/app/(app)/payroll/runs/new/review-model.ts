import {
  overtimeOn,
  wasDeducted,
  type LineSummaryByEmployee,
  type Payslip,
  type RunException,
} from "@/lib/api/payroll";
import type { OvertimeHourlyBasis } from "@/lib/overtime/derive";

/**
 * What the Review step knows about a payslip, worked out in one place.
 *
 * Everything in here is a decision about figures the API already sent. Nothing
 * computes tax, pension or pay: the engine owns that, and a second
 * implementation of a payslip figure is how two screens come to disagree about
 * one person. These functions only *read* a payslip: which parts of it somebody
 * typed, which parts are the deductions total, and who a filter keeps.
 *
 * No React and no `@/` alias beyond types, so `review-model.test.ts` can drive
 * it directly.
 */

/* ------------------------------------------------- what was entered by hand */

/** Both forms of the bonus line: a reason is optional, so the label has two. */
export function isBonusLine(label: string): boolean {
  return label === "Bonus" || label.startsWith("Bonus — ");
}

/**
 * The bonus on this run, if there is one.
 *
 * Matches `"Bonus"` as well as `"Bonus — why"`. The first version looked for
 * `"Bonus — "` alone, which was right while a reason was compulsory and
 * silently stopped finding anything the day it stopped being.
 */
export function bonusOn(
  slip: Payslip,
): { amountKobo: number; reason: string } | null {
  const line = slip.lines.find(
    (l) => l.kind === "EARNING" && isBonusLine(l.label),
  );
  if (!line) return null;
  return {
    amountKobo: line.amountKobo,
    reason: line.label === "Bonus" ? "" : line.label.replace(/^Bonus — /, ""),
  };
}

const MANUAL_OVERTIME = "Overtime, entered by hand";

/** Overtime somebody typed, as opposed to overtime the clock-ins produced. */
export function hasManualOvertime(slip: Payslip): boolean {
  return slip.lines.some((line) => line.label.startsWith(MANUAL_OVERTIME));
}

/**
 * The hours behind a hand-entered overtime line, read back out of its label
 * (`"Overtime, entered by hand (6.00h at 1.5x)"`).
 *
 * `Payslip` carries lines and money, not the minutes behind them. The same
 * fragility `sheetSources` documents, so the same rule: **fail to `null`
 * rather than to a guess.** A drawer that says "6 hours" when it was 8 is worse
 * than one that says nothing about hours.
 */
export function manualOvertimeHours(slip: Payslip): number | null {
  const line = slip.lines.find((l) => l.label.startsWith(MANUAL_OVERTIME));
  if (!line) return null;
  const hours = /\(([\d.]+)h/.exec(line.label)?.[1];
  if (hours === undefined) return null;
  const value = Number(hours);
  return Number.isFinite(value) ? value : null;
}

/** What each hand-entered figure is called in a sentence. */
export type AdjustmentKind =
  "overtime" | "bonus" | "paye" | "statutory" | "deductions";

export const ADJUSTMENT_LABEL: Record<AdjustmentKind, string> = {
  overtime: "overtime",
  bonus: "bonus",
  paye: "PAYE",
  statutory: "pension or housing fund",
  deductions: "deductions",
};

/**
 * Which figures on this payslip a person typed.
 *
 * `typedDeductions` is `null` until the run's line summary has been read, and
 * **null is not "none"**. A deduction somebody typed is indistinguishable from
 * a loan instalment in the payslip's own lines (the label *is* the reason), so
 * the only honest source is the API's line summary. Until it answers, those
 * are simply not counted, and the toolbar says so rather than presenting a
 * count that may be short.
 */
export function adjustmentsOf(
  slip: Payslip,
  typedDeductions: LineSummaryByEmployee | null,
): AdjustmentKind[] {
  const found: AdjustmentKind[] = [];
  if (hasManualOvertime(slip)) found.push("overtime");
  if ((bonusOn(slip)?.amountKobo ?? 0) > 0) found.push("bonus");
  if (slip.payeOverridden) found.push("paye");
  if ((slip.overriddenDeductions ?? []).length > 0) found.push("statutory");
  const typed = typedDeductions?.[slip.employeeId];
  if (typed && typed.state !== "none") found.push("deductions");
  return found;
}

/* ------------------------------------------------------------- deductions */

/**
 * Everything taken off besides PAYE, as one figure.
 *
 * Employer pension is never in it. A deduction this employer does not operate is
 * not counted and not named: `wasDeducted` reads an unknown operation as
 * deducted, which is what every payslip written before the switches existed
 * actually was.
 */
export function deductionTotal(slip: Payslip): number {
  return (
    (wasDeducted(slip.operates, "pension") ? slip.pensionEmployeeKobo : 0) +
    (wasDeducted(slip.operates, "nhf") ? slip.nhfKobo : 0) +
    slip.otherDeductionsKobo
  );
}

/**
 * What the deductions total is made of, by name and without amounts.
 *
 * The amounts are in the drawer. In the table the names are what answers "why is
 * this person's figure bigger than the others".
 */
export function deductionLabels(slip: Payslip): string[] {
  const labels: string[] = [];
  if (wasDeducted(slip.operates, "pension")) labels.push("Pension");
  if (wasDeducted(slip.operates, "nhf")) labels.push("Housing fund");
  if (slip.otherDeductionsKobo > 0) {
    const lines = slip.lines.filter((line) => line.kind === "DEDUCTION");
    labels.push(lines.length === 1 ? (lines[0]?.label ?? "Other") : "Other");
  }
  return labels;
}

/* ------------------------------------------------------------ the toolbar */

export type ReviewFilter = "all" | "adjusted" | "warnings";

export type SortColumn =
  | "name"
  | "unpaid"
  | "gross"
  | "overtime"
  | "bonus"
  | "paye"
  | "deductions"
  | "net";

export type SortOrder = "asc" | "desc";

export type ReviewView = {
  filter: ReviewFilter;
  query: string;
  sort: { column: SortColumn; order: SortOrder } | null;
};

export const DEFAULT_REVIEW_VIEW: ReviewView = {
  filter: "all",
  query: "",
  sort: null,
};

/** Exceptions that name a person, grouped by who. Run-wide ones have no key. */
export function warningsByPerson(
  exceptions: readonly RunException[],
): Map<string, RunException[]> {
  const byPerson = new Map<string, RunException[]>();
  for (const exception of exceptions) {
    if (!exception.employeeId) continue;
    const list = byPerson.get(exception.employeeId) ?? [];
    list.push(exception);
    byPerson.set(exception.employeeId, list);
  }
  return byPerson;
}

const SORT_VALUE: Record<
  Exclude<SortColumn, "name">,
  (slip: Payslip) => number
> = {
  unpaid: (slip) => slip.unpaidDays,
  gross: (slip) => slip.grossKobo,
  overtime: (slip) => overtimeOn(slip),
  bonus: (slip) => bonusOn(slip)?.amountKobo ?? 0,
  /* A payroll that does not operate PAYE has no figure to sort on. Putting those
     below every real one keeps "highest first" meaning highest, rather than
     mixing a missing figure in as though it were a zero. */
  paye: (slip) => (wasDeducted(slip.operates, "paye") ? slip.payeKobo : -1),
  deductions: (slip) => deductionTotal(slip),
  net: (slip) => slip.netKobo,
};

/**
 * Who the toolbar shows.
 *
 * The whole run is always loaded, so this narrows and orders a complete list. It
 * is **not** a page of somebody else's: sorting 25 of 300 in the browser and
 * calling the result the order of the list is the defect `SortableTH` warns
 * about, and does not apply here because nothing was paged away.
 *
 * Ties break on staff number, so two people with one net pay do not swap places
 * between renders.
 */
export function visiblePayslips(
  payslips: readonly Payslip[],
  view: ReviewView,
  typedDeductions: LineSummaryByEmployee | null,
  warnings: ReadonlyMap<string, readonly RunException[]>,
): Payslip[] {
  const query = view.query.trim().toLowerCase();
  const kept = payslips.filter((slip) => {
    if (
      query &&
      !slip.name.toLowerCase().includes(query) &&
      !slip.employeeNo.toLowerCase().includes(query)
    ) {
      return false;
    }
    if (
      view.filter === "adjusted" &&
      adjustmentsOf(slip, typedDeductions).length === 0
    ) {
      return false;
    }
    if (view.filter === "warnings" && !warnings.has(slip.employeeId)) {
      return false;
    }
    return true;
  });

  const sort = view.sort;
  if (!sort) return kept;
  const direction = sort.order === "asc" ? 1 : -1;
  return [...kept].sort((a, b) => {
    const compared =
      sort.column === "name"
        ? a.name.localeCompare(b.name, "en")
        : SORT_VALUE[sort.column](a) - SORT_VALUE[sort.column](b);
    return compared !== 0
      ? compared * direction
      : a.employeeNo.localeCompare(b.employeeNo, "en");
  });
}

/* -------------------------------------------------------- overtime working */

/**
 * What this person is paid a month, in kobo.
 *
 * From the **directory**, not from the payslip. A payslip prorated for unpaid
 * days carries the prorated contract, while the API values overtime on the
 * whole month, so deriving it from `grossKobo` would show somebody with a docked
 * day an hourly rate lower than the one they are actually paid.
 *
 * `Employee.grossMonthly` is in naira, the one money field on that type that is
 * not kobo. Returns 0 when the directory has not answered or the person has no
 * agreed figure; the overtime form shows its working with a zero rate rather
 * than a wrong one.
 */
export function monthlyOf(
  slip: Payslip,
  employees: readonly { id: string; grossMonthly?: number | null }[],
): number {
  const person = employees.find((row) => row.id === slip.employeeId);
  return person?.grossMonthly ? Math.round(person.grossMonthly * 100) : 0;
}

/**
 * What an hour of this person's time is worth, for the live preview.
 *
 * `monthly x 12 / 365 / hoursPerDay` on the calendar-day basis, and
 * `monthly / workingDays / hoursPerDay` on the other. It **renders the
 * working**; the server computes what is actually paid, and if the two ever
 * disagree the server is right.
 */
export function hourlyFor(
  monthlyKobo: number,
  hoursPerDay: number,
  workingDaysPerMonth: number,
  basis: OvertimeHourlyBasis,
): number {
  const hours = Math.max(1, hoursPerDay);
  return basis === "CALENDAR_DAYS"
    ? Math.round((monthlyKobo * 12) / 365 / hours)
    : Math.round(monthlyKobo / Math.max(1, workingDaysPerMonth) / hours);
}

/** A figure typed in naira, to integer kobo. Null when it is not a figure. */
export function nairaToKobo(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}
