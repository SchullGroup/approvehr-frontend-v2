/**
 * Date-only arithmetic, with no clock and no zone.
 *
 * Sprint dates, start dates and due dates are calendar days (`YYYY-MM-DD`), so
 * they are counted as UTC calendar days from the string alone. "Today" is always
 * an argument — the caller asks `todayIn(timeZone)` from `lib/time.ts` — which is
 * what keeps these pure and keeps the no-raw-clock guard satisfied.
 */

export const DAY_MS = 86_400_000;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** UTC milliseconds for a `YYYY-MM-DD`, or null for anything else. */
export function dayToMs(day: string | null | undefined): number | null {
  if (!day) return null;
  const match = DAY_RE.exec(day);
  if (!match) return null;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(ms) ? null : ms;
}

/** `YYYY-MM-DD` for UTC milliseconds. */
export function msToDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  const ms = dayToMs(day);
  if (ms === null) return day;
  return msToDay(ms + days * DAY_MS);
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. Null when either is not a day. */
export function daysBetween(from: string, to: string): number | null {
  const a = dayToMs(from);
  const b = dayToMs(to);
  if (a === null || b === null) return null;
  return Math.round((b - a) / DAY_MS);
}

/** True when `due` is strictly before `today`. A missing date is never overdue. */
export function isBefore(
  day: string | null | undefined,
  today: string,
): boolean {
  if (!day) return false;
  return day < today;
}

/**
 * Days left in a sprint, counted from `today` to its end date.
 * Negative once it has run over; null when it has no end date.
 */
export function daysLeft(
  endDate: string | null | undefined,
  today: string,
): number | null {
  if (!endDate) return null;
  return daysBetween(today, endDate);
}
