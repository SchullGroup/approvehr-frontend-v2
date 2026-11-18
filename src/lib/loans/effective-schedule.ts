import type { ApiRepayment } from "@/lib/api/loans";
import { monthStart } from "@/lib/loans/schedule";

/**
 * One instalment as the loan screen shows it: the stored row, plus what the
 * table should print for it once shortfalls from earlier months are moved onto
 * the instalment payroll will take them with.
 *
 * `row` is the stored instalment, untouched. Every action (record a payment,
 * write off) is taken against it, never against the figures below, which exist
 * to be read.
 */
export type EffectiveRepayment = {
  row: ApiRepayment;
  /**
   * What the Amount column prints. The stored amount, except on the two kinds of
   * row a shortfall moves between: an instalment that has been left behind shows
   * only what was actually taken (it is settled at that), and the instalment
   * that picks the shortfall up shows its own amount plus everything it carries.
   */
  amountKobo: number;
  /** What was moved onto this instalment from earlier months. Zero on most rows. */
  carriedInKobo: number;
  /** The due months those amounts came from, oldest first (`YYYY-MM-01`). */
  carriedFrom: string[];
  /** What was moved off this instalment onto a later one. Zero on most rows. */
  movedOnKobo: number;
  /** The due month of the instalment that took it, or `null` when nothing moved. */
  movedTo: string | null;
  /**
   * What is still owing against this row once the move is made: its own
   * remainder plus anything it carries, and nothing on a row that has been moved
   * on, settled or written off.
   */
  owingKobo: number;
};

/** An instalment payroll would still try to take. */
const isOpen = (row: ApiRepayment): boolean =>
  (row.status === "SCHEDULED" || row.status === "PARTIAL") &&
  row.remainingKobo > 0;

const dueMonth = (row: ApiRepayment): string => monthStart(row.dueDate);

/**
 * The schedule as it will actually be taken, for display. No data changes.
 *
 * **This is a display port of `dueRepaymentsForMany` in
 * `approvehr-api/src/modules/loans/service.ts`, and it must stay in step with
 * it.** That function is the payroll rule: every instalment still open
 * (`SCHEDULED` or `PARTIAL`) whose due month is **before the end of the run's
 * month** is taken, oldest first, each as its own payslip line. Nothing on the
 * stored schedule is rewritten: a part-paid instalment stays `PARTIAL` with
 * its remainder, and the next run simply asks for it again alongside that
 * month's own instalment. So a table that printed the stored rows would show a
 * shortfall as a separate debt when, to the person paying it, it is part of the
 * next deduction. This moves it there for the reader, and nowhere else.
 *
 * ## The rule
 *
 * `today` is the company's day. An open instalment is **behind** when its due
 * month is before the current month, and it is **current** from the current
 * month on.
 *
 * - Every open instalment that is behind is a source: a part-paid one (the
 *   shortfall), or one nothing was recovered against (all of it). Its row is
 *   shown settled at what was taken, and what is left moves forward.
 * - Everything moved lands on **one** row: the first open instalment that is
 *   due in the current month, which is the one the current run takes the
 *   shortfalls alongside. Its Amount is its own plus everything it carries. A
 *   part-paid row that is itself that instalment (paid by hand before its run)
 *   is not moved: its remainder comes off this month's payroll, as stored.
 * - If the first open instalment from this month on is due **later** than this
 *   month, or there is none (the last instalment is the part-paid one), the
 *   current run still takes the shortfall as a line of its own with nothing to
 *   sit beside. Moving it onto a later month's row would show it a month late,
 *   or onto nothing, so nothing moves and the shortfall stays visible on the
 *   row it belongs to.
 * - Paid and written-off rows are never a source or a target. A part-paid row
 *   with a future due month (an overpayment spilled onto it) is not behind, so
 *   it is not a source, and it shows its own remainder.
 *
 * ## The invariant
 *
 * What is taken off one row is added to another, so the Amount column of the
 * result sums to the same figure as the stored schedule. A change here that
 * breaks that is double counting, and `tests/loan-effective-schedule.test.ts`
 * checks it on every shape.
 *
 * Rows come back ordered by due month then instalment number, the order
 * payroll walks them in.
 */
export function effectiveSchedule(
  schedule: readonly ApiRepayment[],
  today: string,
): EffectiveRepayment[] {
  const rows = [...schedule].sort(
    (a, b) => dueMonth(a).localeCompare(dueMonth(b)) || a.sequence - b.sequence,
  );
  const thisMonth = monthStart(today);

  const behind = (row: ApiRepayment) =>
    isOpen(row) && dueMonth(row) < thisMonth;
  const firstCurrent = rows.find(
    (row) => isOpen(row) && dueMonth(row) >= thisMonth,
  );
  const target =
    firstCurrent && dueMonth(firstCurrent) === thisMonth
      ? firstCurrent
      : undefined;
  const sources = target ? rows.filter(behind) : [];
  const carriedIn = sources.reduce((sum, row) => sum + row.remainingKobo, 0);

  return rows.map((row): EffectiveRepayment => {
    if (target && sources.includes(row)) {
      return {
        row,
        amountKobo: row.amountKobo - row.remainingKobo,
        carriedInKobo: 0,
        carriedFrom: [],
        movedOnKobo: row.remainingKobo,
        movedTo: dueMonth(target),
        owingKobo: 0,
      };
    }
    if (row === target) {
      return {
        row,
        amountKobo: row.amountKobo + carriedIn,
        carriedInKobo: carriedIn,
        carriedFrom: sources.map(dueMonth),
        movedOnKobo: 0,
        movedTo: null,
        owingKobo: row.remainingKobo + carriedIn,
      };
    }
    return {
      row,
      amountKobo: row.amountKobo,
      carriedInKobo: 0,
      carriedFrom: [],
      movedOnKobo: 0,
      movedTo: null,
      owingKobo: isOpen(row) ? row.remainingKobo : 0,
    };
  });
}
