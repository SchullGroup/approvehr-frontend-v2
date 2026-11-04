/**
 * A task's deadline as people read it: the day, and the time on it when there
 * is one, in the company's time zone.
 *
 * - A day with no time is due by the end of that day, so it turns overdue at
 *   midnight, as it always has.
 * - A day with a time turns overdue at that minute, the same rule as the API's
 *   `dueAt <= now`.
 * - Labels are built from the date and time as typed, which are the company's
 *   wall clock.
 */

import { addDays } from "./dates";
import { wallClockIn } from "@/lib/time";

/** What a day with no time counts as. */
export const END_OF_DAY = "23:59";

/** `HH:MM` on the company's wall clock right now. */
export function nowHHMMIn(
  timeZone: string,
  now: Date = new Date(), // reads-the-clock: the current minute on the company clock, for a due time today
): string {
  return wallClockIn(now, timeZone)?.time ?? "00:00";
}

export type Deadline = { dueDate: string | null; dueTime?: string | null };

/** Past its deadline: an earlier day, or today at or after its time. */
export function isPastDue(
  deadline: Deadline,
  today: string,
  nowHHMM: string,
): boolean {
  if (!deadline.dueDate) return false;
  if (deadline.dueDate < today) return true;
  if (deadline.dueDate > today) return false;
  /* Due today: with no time, not until the day is over; with one, from that minute. */
  return deadline.dueTime ? deadline.dueTime <= nowHHMM : false;
}

const MONTHS = [
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

function dayText(day: string, today: string): string {
  const [y, m, d] = day.split("-");
  const base = `${String(Number(d))} ${MONTHS[Number(m) - 1] ?? ""}`;
  return y === today.slice(0, 4) ? base : `${base} ${y}`;
}

/**
 * - `row`: "Due today, 17:00", "Due tomorrow", "Due 12 Nov, 17:00", "Due 12 Nov 2027".
 * - `card`: "Today 17:00", "Tomorrow", "12 Nov 17:00", "12 Nov".
 */
export function dueLabel(
  deadline: Deadline,
  today: string,
  style: "row" | "card" = "row",
): string {
  if (!deadline.dueDate) return style === "row" ? "No date" : "";
  const time = deadline.dueTime ?? null;
  const relative =
    deadline.dueDate === today
      ? "today"
      : deadline.dueDate === addDays(today, 1)
        ? "tomorrow"
        : null;
  if (style === "card") {
    const day = relative
      ? relative[0]!.toUpperCase() + relative.slice(1)
      : dayText(deadline.dueDate, today);
    return time ? `${day} ${time}` : day;
  }
  const day = relative ?? dayText(deadline.dueDate, today);
  return time ? `Due ${day}, ${time}` : `Due ${day}`;
}
