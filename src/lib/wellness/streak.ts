import type { ApiSummary, WellnessMetric } from "@/lib/api/wellness";
import { addDays, dayToMs, daysBetween } from "@/lib/projects/dates";

/**
 * Streaks, the week's dots, the heat map and a personal best, from a person's
 * own summary and nothing else.
 *
 * Pure, with no clock: "today" is always an argument. Nothing here is kept
 * anywhere. A streak is a fact about the person's own log, derived each time
 * from the answer the screen asked for, so there is no counter to drift, to
 * store in the browser or to show to anybody else.
 *
 * ## A streak is never a debt
 *
 * A run counts days on which the person logged something, ending today or, while
 * today is still open, yesterday. Today having nothing in it yet does not break
 * a run: the day is not over. When a run has ended the figure is 0 and the
 * screen's job is to say a new one can start today, never what was lost.
 */

/** The days with anything logged, either metric. */
export function loggedDays(
  summary: ApiSummary,
  metric?: WellnessMetric,
): Set<string> {
  const days = new Set<string>();
  for (const row of summary.days) {
    if (metric === undefined || row.metric === metric) days.add(row.day);
  }
  return days;
}

export type Streak = {
  /** Consecutive days with something logged, ending today or yesterday. */
  days: number;
  /** Today is already in the run. False while today is still open. */
  includesToday: boolean;
  /** The run reaches back to the first day asked for, so it may be longer. */
  capped: boolean;
};

export function streakOf(
  logged: ReadonlySet<string>,
  today: string,
  windowStart: string,
): Streak {
  const includesToday = logged.has(today);
  let cursor = includesToday ? today : addDays(today, -1);
  let days = 0;
  while (logged.has(cursor)) {
    days += 1;
    cursor = addDays(cursor, -1);
    if (cursor < windowStart) {
      return { days, includesToday, capped: true };
    }
  }
  return { days, includesToday, capped: false };
}

/**
 * The most recent run that has ended: how long it was and when it stopped. For
 * somebody with no current run, so the screen can say what they did, not what
 * they stopped doing.
 */
export function lastRun(
  logged: ReadonlySet<string>,
  today: string,
  windowStart: string,
): { days: number; endedOn: string } | null {
  let cursor = addDays(today, -1);
  while (cursor >= windowStart && !logged.has(cursor)) {
    cursor = addDays(cursor, -1);
  }
  if (cursor < windowStart) return null;
  const endedOn = cursor;
  let days = 0;
  while (cursor >= windowStart && logged.has(cursor)) {
    days += 1;
    cursor = addDays(cursor, -1);
  }
  return { days, endedOn };
}

/** The Monday of the week a day falls in. */
export function mondayOf(day: string): string {
  const ms = dayToMs(day);
  if (ms === null) return day;
  const weekday = new Date(ms).getUTCDay(); // 0 is Sunday
  return addDays(day, -((weekday + 6) % 7));
}

export const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"] as const;
export const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type WeekDot = {
  day: string;
  initial: string;
  name: string;
  logged: boolean;
  isToday: boolean;
  /** After today. Not logged yet is not the same as not going to. */
  upcoming: boolean;
};

/** Monday to Sunday of the week containing `today`. */
export function weekDots(
  logged: ReadonlySet<string>,
  today: string,
): WeekDot[] {
  const monday = mondayOf(today);
  return WEEKDAY_INITIALS.map((initial, index) => {
    const day = addDays(monday, index);
    return {
      day,
      initial,
      name: WEEKDAY_NAMES[index] ?? initial,
      logged: logged.has(day),
      isToday: day === today,
      upcoming: day > today,
    };
  });
}

export type HeatCell = {
  day: string;
  /** What the day counted as, or null when nothing was logged. */
  value: number | null;
  /** 0 for nothing logged, then 1 to 4 against the person's own busiest day. */
  level: 0 | 1 | 2 | 3 | 4;
  upcoming: boolean;
};

/**
 * `weeks` columns of seven days, Monday at the top, the last column the current
 * week. Levels are relative to the person's own best day in the window, so the
 * map is about their own shape and says nothing about what is enough.
 */
export function heatGrid(
  summary: ApiSummary,
  metric: WellnessMetric,
  today: string,
  weeks: number,
): { columns: HeatCell[][]; max: number; loggedCount: number; from: string } {
  const lastMonday = mondayOf(today);
  const firstMonday = addDays(lastMonday, -7 * (weeks - 1));
  const values = new Map<string, number>();
  for (const row of summary.days) {
    if (row.metric === metric) values.set(row.day, row.total);
  }
  let max = 0;
  let loggedCount = 0;
  for (const [day, value] of values) {
    if (day >= firstMonday && day <= today) {
      loggedCount += 1;
      if (value > max) max = value;
    }
  }
  const columns = Array.from({ length: weeks }, (_, week) =>
    Array.from({ length: 7 }, (_, row): HeatCell => {
      const day = addDays(firstMonday, week * 7 + row);
      const value = values.get(day) ?? null;
      const upcoming = day > today;
      const level =
        value === null || upcoming || max === 0
          ? 0
          : (Math.min(4, Math.max(1, Math.ceil((value / max) * 4))) as
              1 | 2 | 3 | 4);
      return { day, value: upcoming ? null : value, level, upcoming };
    }),
  );
  return { columns, max, loggedCount, from: firstMonday };
}

/**
 * The person's own best day for a metric in `[from, before)`: the mark an arc
 * is drawn against. Not a target, not advice, and null when there is no earlier
 * day to compare with.
 */
export function bestDay(
  summary: ApiSummary,
  metric: WellnessMetric,
  from: string,
  before: string,
): { day: string; value: number } | null {
  let best: { day: string; value: number } | null = null;
  for (const row of summary.days) {
    if (row.metric !== metric || row.day < from || row.day >= before) continue;
    if (best === null || row.total > best.value) {
      best = { day: row.day, value: row.total };
    }
  }
  return best;
}

/** `3 weeks ago`-style distance, kind about it. */
export function daysAgoText(day: string, today: string): string {
  const gap = daysBetween(day, today);
  if (gap === null || gap <= 0) return "today";
  if (gap === 1) return "yesterday";
  if (gap < 14) return `${String(gap)} days ago`;
  return `${String(Math.round(gap / 7))} weeks ago`;
}
