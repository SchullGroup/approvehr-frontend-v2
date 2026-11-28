import { formatDay } from "@/lib/time";
import type {
  ApiSpecialDay,
  ApiWorkSchedule,
  ScheduleDay,
} from "@/lib/api/attendance";

/**
 * The words for schedules and special days, in one place.
 *
 * Pure functions with no React and no request in them, so the list on screen and
 * the tests read the same text. Nothing here decides whose hours apply: the
 * server resolves that, in the order a person's own schedule, their department's,
 * the company's hours, and a special day above all of them. This only says what a
 * stored row means, in a line.
 *
 * **Weekdays are ISO, 1 = Monday through 7 = Sunday**, exactly as the wire sends
 * them. Never `getUTCDay`, where Sunday is 0.
 */

export const WEEKDAYS = [
  { iso: 1, short: "Mon", long: "Monday" },
  { iso: 2, short: "Tue", long: "Tuesday" },
  { iso: 3, short: "Wed", long: "Wednesday" },
  { iso: 4, short: "Thu", long: "Thursday" },
  { iso: 5, short: "Fri", long: "Friday" },
  { iso: 6, short: "Sat", long: "Saturday" },
  { iso: 7, short: "Sun", long: "Sunday" },
] as const;

const SHORT = new Map<number, string>(WEEKDAYS.map((d) => [d.iso, d.short]));

/**
 * The one rule for whose hours apply, for an info icon. Said once, in these
 * words, wherever a schedule or a special day is edited.
 */
export const PRECEDENCE =
  "A person's schedule beats their department's, which beats the company hours. A special day beats all of them.";

/** `07:30–14:00`. An en dash, the way every other time range in the product is written. */
export function timeRange(start: string, end: string): string {
  return `${start}–${end}`;
}

/**
 * A week in a line: `Mon–Fri 08:00–17:00 · Sat 07:30–14:00`.
 *
 * Days that sit next to each other with the same hours are one range; a day on
 * its own, or with different hours, is its own part. A weekday the schedule
 * leaves out is a day off and is not mentioned.
 */
export function summariseDays(days: readonly ScheduleDay[]): string {
  const sorted = [...days].sort((a, b) => a.weekday - b.weekday);
  if (sorted.length === 0) return "No working days";

  const parts: string[] = [];
  let first = sorted[0]!;
  let last = first;
  const flush = () => {
    const from = SHORT.get(first.weekday) ?? String(first.weekday);
    const to = SHORT.get(last.weekday) ?? String(last.weekday);
    const label = first.weekday === last.weekday ? from : `${from}–${to}`;
    parts.push(`${label} ${timeRange(first.start, first.end)}`);
  };

  for (const day of sorted.slice(1)) {
    const continues =
      day.weekday === last.weekday + 1 &&
      day.start === first.start &&
      day.end === first.end;
    if (continues) {
      last = day;
    } else {
      flush();
      first = day;
      last = day;
    }
  }
  flush();
  return parts.join(" · ");
}

/**
 * Who a schedule is for, in a line: `Production · 2 people`.
 *
 * Departments by name while there are two or fewer, a count after that; people
 * are always a count, because a list of names is what the editor is for.
 */
export function scheduleAudience(
  schedule: Pick<ApiWorkSchedule, "departments" | "people">,
): string {
  const parts: string[] = [];
  const { departments, people } = schedule;
  if (departments.length > 0) {
    parts.push(
      departments.length <= 2
        ? departments.map((d) => d.name).join(", ")
        : `${departments.length} departments`,
    );
  }
  if (people.length > 0) {
    parts.push(`${people.length} ${people.length === 1 ? "person" : "people"}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Nobody yet";
}

/** Who a special day is for: `Everybody`, the department's name, or the person's. */
export function specialDayWho(
  day: Pick<
    ApiSpecialDay,
    "scope" | "departmentName" | "employeeName" | "departmentId" | "employeeId"
  >,
): string {
  if (day.scope === "DEPARTMENT") return day.departmentName ?? "A department";
  if (day.scope === "PERSON") return day.employeeName ?? "A person";
  return "Everybody";
}

/**
 * `Sat 5 Dec 2026`: the day of the week, then the date the way every screen
 * writes one. The weekday is worked out from the date itself in UTC, which has no
 * time zone to move it, and never from the clock.
 */
export function dayLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return formatDay(date);
  const iso = parsed.getUTCDay() === 0 ? 7 : parsed.getUTCDay();
  return `${SHORT.get(iso) ?? ""} ${formatDay(date)}`.trim();
}

/** `Off`, or `07:30–12:00`. */
export function specialDayHours(
  day: Pick<ApiSpecialDay, "working" | "start" | "end">,
): string {
  if (!day.working) return "Off";
  if (day.start && day.end) return timeRange(day.start, day.end);
  return "Off";
}

/**
 * Upcoming days first, soonest at the top; then the ones already gone, most
 * recent first. `today` is `YYYY-MM-DD` and is the caller's to say, in the
 * company's zone: this reads no clock.
 *
 * `YYYY-MM-DD` sorts as text, which is why nothing here makes a `Date`.
 */
export function orderSpecialDays(
  days: readonly ApiSpecialDay[],
  today: string,
): ApiSpecialDay[] {
  const byWho = (a: ApiSpecialDay, b: ApiSpecialDay) =>
    specialDayWho(a).localeCompare(specialDayWho(b));
  const upcoming = days
    .filter((day) => day.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || byWho(a, b));
  const earlier = days
    .filter((day) => day.date < today)
    .sort((a, b) => b.date.localeCompare(a.date) || byWho(a, b));
  return [...upcoming, ...earlier];
}

/** `HH:MM` to minutes since midnight, or null when it is not one. */
export function minutesOf(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Whether `end` is later in the day than `start`. False for anything that is not a time. */
export function endsAfterStart(start: string, end: string): boolean {
  const from = minutesOf(start);
  const to = minutesOf(end);
  return from !== null && to !== null && to > from;
}
