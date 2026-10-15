"use client";

import { useSession, useOrgTimezone } from "@/lib/store/session";
import { dayIn, todayIn } from "@/lib/time";
import { TODAY } from "@/lib/today";

/**
 * How long somebody has been where they are.
 *
 * Counted in whole calendar days in the company's own zone, never as elapsed
 * milliseconds: two colleagues in two places must read the same number, and
 * "yesterday evening" is one day however few hours ago it was.
 *
 * Both sides are reduced to a `YYYY-MM-DD` first and compared as UTC calendar
 * dates, so the browser's own zone never enters.
 */

const parts = (day: string): [number, number, number] | null => {
  const found = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return found ? [Number(found[1]), Number(found[2]), Number(found[3])] : null;
};

/** Whole days from one `YYYY-MM-DD` to another. Negative: the first is later. */
export function calendarDaysBetween(from: string, to: string): number {
  const a = parts(from);
  const b = parts(to);
  if (!a || !b) return 0;
  return Math.round(
    (Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) /
      86_400_000,
  );
}

/** Days since an instant, in the company's zone. Never below zero. */
export function daysSince(
  instant: string,
  today: string,
  timeZone: string,
): number {
  const day = dayIn(instant, timeZone);
  return day === null ? 0 : Math.max(0, calendarDaysBetween(day, today));
}

/** "Today" for the pipeline screens: the company's day, or the demo's fixed one. */
export function usePipelineToday(): { today: string; timeZone: string } {
  const { isConnected } = useSession();
  const timeZone = useOrgTimezone();
  return {
    today: isConnected ? todayIn(timeZone) : TODAY,
    timeZone,
  };
}

/** How the age reads on a card: "Today", "1 day", "9 days". */
export function ageWords(days: number): string {
  if (days <= 0) return "Today";
  return days === 1 ? "1 day" : `${String(days)} days`;
}

/** A week in one stage is worth a second look. Said by colour and by words. */
export const STALE_AFTER_DAYS = 7;
