import type { Point } from "@/components/ui";
import type {
  ApiSummary,
  ChallengeStatus,
  WellnessMetric,
} from "@/lib/api/wellness";
import { WELLNESS_LIMITS } from "@/lib/api/wellness";
import { addDays } from "@/lib/projects/dates";
import { shortDate } from "@/lib/today";
import { weekdayIn } from "@/lib/time";

/**
 * Wellness figures and days, as words.
 *
 * Pure, with no clock: "today" is always an argument, taken from the company's
 * own day (`useToday`), so a person in another zone reads the week the company
 * reads. Nothing here adds up rows. A day's value is whatever the API says it
 * counts as, because steps from a phone replace typed steps for the day and a
 * second implementation of that rule here would eventually disagree with it.
 */

/** `1,250 ml`, `8,000 steps`. */
export function amountText(metric: WellnessMetric, value: number): string {
  return `${value.toLocaleString("en-NG")} ${WELLNESS_LIMITS[metric].unit}`;
}

/** `12.3k` once a figure is too wide for the top of a narrow column. */
export function compactCount(value: number): string {
  if (value < 10_000) return value.toLocaleString("en-NG");
  return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}

/** The seven days ending today, oldest first. */
export function weekEndingOn(today: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
}

/** `Mon`, for a `YYYY-MM-DD`. The zone is fixed because a day has no clock. */
export function weekdayShort(day: string): string {
  return weekdayIn(`${day}T12:00:00.000Z`, "UTC").slice(0, 3);
}

/** `Today`, `Yesterday`, or `12 Oct`. */
export function dayWord(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  return shortDate(day);
}

/** What a day counts as for one metric, or null when nothing was logged. */
export function valueOn(
  summary: ApiSummary,
  metric: WellnessMetric,
  day: string,
): number | null {
  const row = summary.days.find(
    (entry) => entry.metric === metric && entry.day === day,
  );
  return row ? row.total : null;
}

/**
 * The week as columns. A day with nothing logged is `null`, which the chart
 * draws as an empty outline: nothing logged is not the same as zero, and a
 * column of no height would say the person did nothing.
 */
export function weekPoints(
  summary: ApiSummary,
  metric: WellnessMetric,
  days: readonly string[],
): Point[] {
  return days.map((day) => ({
    label: weekdayShort(day),
    value: valueOn(summary, metric, day),
  }));
}

/** The week's total and how many of its days have something in them. */
export function weekTotals(
  summary: ApiSummary,
  metric: WellnessMetric,
  days: readonly string[],
): { total: number; daysLogged: number } {
  let total = 0;
  let daysLogged = 0;
  for (const day of days) {
    const value = valueOn(summary, metric, day);
    if (value === null) continue;
    total += value;
    daysLogged += 1;
  }
  return { total, daysLogged };
}

/** The whole-number check the add form makes before it sends. */
export function entryProblem(
  metric: WellnessMetric,
  text: string,
): string | null {
  const limits = WELLNESS_LIMITS[metric];
  const trimmed = text.trim();
  if (trimmed === "") return `Enter how many ${limits.unit}.`;
  if (!/^\d+$/.test(trimmed)) return "Use a whole number.";
  const value = Number(trimmed);
  if (value < 1) return "Enter at least 1.";
  if (value > limits.entry) {
    return `One entry can be at most ${limits.entry.toLocaleString("en-NG")} ${limits.unit}.`;
  }
  return null;
}

export const STATUS_LABEL: Record<ChallengeStatus, string> = {
  UPCOMING: "Upcoming",
  ACTIVE: "Active",
  ENDED: "Ended",
  CANCELLED: "Cancelled",
};

/** `3 Nov to 17 Nov`. The year is left out: a challenge runs at most 90 days. */
export function windowText(startsOn: string, endsOn: string): string {
  return startsOn === endsOn
    ? shortDate(startsOn)
    : `${shortDate(startsOn)} to ${shortDate(endsOn)}`;
}

/** The last day a challenge starting on `startsOn` may end on. */
export function lastAllowedEnd(startsOn: string, maxDays: number): string {
  return addDays(startsOn, maxDays - 1);
}
