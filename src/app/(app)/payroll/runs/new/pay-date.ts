/**
 * A payroll's pay date (L1, PAY-32, NC-31).
 *
 * The default was the 28th whatever day that was, so November 2026 paid on
 * Saturday 28 November, a day banks do not settle. The default is now the 28th,
 * or the working day before it when the 28th falls on a weekend. Public holidays
 * are not counted here; the person can still pick any date.
 *
 * Dates are `YYYY-MM-DD` and worked in UTC, so no timezone can move a day.
 */

const DEFAULT_DAY = 28;

function lastDayOf(period: string): number {
  return new Date(
    Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0),
  ).getUTCDate();
}

function dateIn(period: string, day: number): string {
  return `${period}-${String(day).padStart(2, "0")}`;
}

/** The 28th of the month, or the Friday before it when that is a weekend. */
export function defaultPayDate(period: string): string {
  let day = Math.min(DEFAULT_DAY, lastDayOf(period));
  for (;;) {
    const weekday = new Date(`${dateIn(period, day)}T00:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) return dateIn(period, day);
    day -= 1;
  }
}

/**
 * The pay date after moving from one month to another.
 *
 * A date left at its default gets the new month's default, so stepping on from
 * November does not carry its Friday the 27th into December. A day somebody
 * chose is kept, clamped to the new month's length, so the 31st becomes the
 * 30th in September rather than rolling into October.
 */
export function payDateForMonth(
  payDate: string,
  fromPeriod: string,
  toPeriod: string,
): string {
  if (payDate === defaultPayDate(fromPeriod)) return defaultPayDate(toPeriod);
  const chosen = Number(payDate.slice(8, 10)) || DEFAULT_DAY;
  return dateIn(toPeriod, Math.min(chosen, lastDayOf(toPeriod)));
}
