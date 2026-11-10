/**
 * Day, week, month and quarter, as calendar days.
 *
 * The API works the same periods out for the Work record and the manager's
 * Completed view, in the company's time zone. The demo has no server, so this is
 * the same arithmetic on plain `YYYY-MM-DD` days (never through the browser's
 * zone): Monday first, a quarter is three calendar months, and every period is
 * `[start, end)` with `end` the first day after it.
 *
 * Labels are the API's own words ("Week of 3 Nov 2026", "November 2026",
 * "Q4 2026", "Mon 3 Nov 2026"), so the demo and the connected screen read alike.
 */

import { addDays } from "./dates";

export type WorkPeriodKind = "day" | "week" | "month" | "quarter";

export type WorkPeriod = {
  kind: WorkPeriodKind;
  /** First day, inclusive. */
  start: string;
  /** The first day after the period. */
  end: string;
  label: string;
};

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const parts = (day: string): [number, number, number] => {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return [y, m, d];
};

const iso = (y: number, m: number, d: number): string =>
  new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);

/** "3 Nov 2026". */
export function dayText(day: string): string {
  const [y, m, d] = parts(day);
  return `${String(d)} ${MONTHS_SHORT[m - 1] ?? ""} ${String(y)}`;
}

/** The period of this kind that holds `day`. */
export function periodAround(kind: WorkPeriodKind, day: string): WorkPeriod {
  const [y, m, d] = parts(day);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  switch (kind) {
    case "day":
      return {
        kind,
        start: day,
        end: addDays(day, 1),
        label: `${WEEKDAYS[weekday] ?? ""} ${dayText(day)}`,
      };
    case "week": {
      const start = addDays(day, -((weekday + 6) % 7));
      return {
        kind,
        start,
        end: addDays(start, 7),
        label: `Week of ${dayText(start)}`,
      };
    }
    case "month":
      return {
        kind,
        start: iso(y, m, 1),
        end: iso(y, m + 1, 1),
        label: `${MONTHS_LONG[m - 1] ?? ""} ${String(y)}`,
      };
    case "quarter": {
      const quarter = Math.floor((m - 1) / 3);
      return {
        kind,
        start: iso(y, quarter * 3 + 1, 1),
        end: iso(y, quarter * 3 + 4, 1),
        label: `Q${String(quarter + 1)} ${String(y)}`,
      };
    }
  }
}

/** The period before this one: the day before it starts, in the same kind. */
export const periodBefore = (period: WorkPeriod): WorkPeriod =>
  periodAround(period.kind, addDays(period.start, -1));

/** The period after this one. */
export const periodAfter = (period: WorkPeriod): WorkPeriod =>
  periodAround(period.kind, period.end);
