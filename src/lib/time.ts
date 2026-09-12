/**
 * Every date and time on every screen, in the company's zone.
 *
 * ## Why one module
 *
 * There were 45 formatting call sites and they disagreed. Some passed
 * `timeZone: "UTC"`; the rest passed no zone at all, which formats in the
 * *viewer's browser* — so two colleagues in different countries read
 * different dates off the same payslip. Neither showed the company's own day.
 *
 * The zone is a parameter rather than something read from a store inside
 * here, so these stay pure and testable, and so a later per-location zone is
 * a change of caller rather than a rewrite of this file.
 */

const DATE = new Map<string, Intl.DateTimeFormat>();
const TIME = new Map<string, Intl.DateTimeFormat>();
const DAY = new Map<string, Intl.DateTimeFormat>();
const SHORT_DATE = new Map<string, Intl.DateTimeFormat>();
const WEEKDAY = new Map<string, Intl.DateTimeFormat>();
const HOUR = new Map<string, Intl.DateTimeFormat>();

function dateFormat(timeZone: string): Intl.DateTimeFormat {
  const cached = DATE.get(timeZone);
  if (cached) return cached;
  const made = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  DATE.set(timeZone, made);
  return made;
}

function timeFormat(timeZone: string): Intl.DateTimeFormat {
  const cached = TIME.get(timeZone);
  if (cached) return cached;
  const made = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  TIME.set(timeZone, made);
  return made;
}

/** `en-CA` is the locale whose default output shape is `YYYY-MM-DD`. */
function dayFormat(timeZone: string): Intl.DateTimeFormat {
  const cached = DAY.get(timeZone);
  if (cached) return cached;
  const made = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  DAY.set(timeZone, made);
  return made;
}

function shortDateFormat(timeZone: string): Intl.DateTimeFormat {
  const cached = SHORT_DATE.get(timeZone);
  if (cached) return cached;
  const made = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  SHORT_DATE.set(timeZone, made);
  return made;
}

function weekdayFormat(timeZone: string): Intl.DateTimeFormat {
  const cached = WEEKDAY.get(timeZone);
  if (cached) return cached;
  const made = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
  });
  WEEKDAY.set(timeZone, made);
  return made;
}

/** Matches `timeFormat`'s `hour12: false`, so midnight reads `0`, not `24`. */
function hourFormat(timeZone: string): Intl.DateTimeFormat {
  const cached = HOUR.get(timeZone);
  if (cached) return cached;
  const made = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "numeric",
    hour12: false,
  });
  HOUR.set(timeZone, made);
  return made;
}

/** Null, empty and unparseable all render as an em dash, never "Invalid Date". */
function parse(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(
  value: string | Date | null | undefined,
  timeZone: string,
): string {
  const date = parse(value);
  return date ? dateFormat(timeZone).format(date) : "—";
}

export function formatTime(
  value: string | Date | null | undefined,
  timeZone: string,
): string {
  const date = parse(value);
  return date ? timeFormat(timeZone).format(date) : "—";
}

export function formatDateTime(
  value: string | Date | null | undefined,
  timeZone: string,
): string {
  const date = parse(value);
  if (!date) return "—";
  return `${dateFormat(timeZone).format(date)}, ${timeFormat(timeZone).format(date)}`;
}

/** `19 Aug 2026` — the short form, for dense logs. `"—"` when unparseable. */
export function formatDateShort(
  value: string | Date | null | undefined,
  timeZone: string,
): string {
  const date = parse(value);
  return date ? shortDateFormat(timeZone).format(date) : "—";
}

/** `19 Aug 2026, 14:30`. `"—"` when unparseable. */
export function formatDateTimeShort(
  value: string | Date | null | undefined,
  timeZone: string,
): string {
  const date = parse(value);
  if (!date) return "—";
  return `${shortDateFormat(timeZone).format(date)}, ${timeFormat(timeZone).format(date)}`;
}

/** `YYYY-MM-DD` for an instant, in the given zone. `null` when unparseable. */
export function dayIn(
  value: string | Date | null | undefined,
  timeZone: string,
): string | null {
  const date = parse(value);
  return date ? dayFormat(timeZone).format(date) : null;
}

/** `YYYY-MM-DD` for right now, in the given zone. */
export function todayIn(timeZone: string): string {
  return dayFormat(timeZone).format(new Date());
}

/**
 * Whole calendar days from `from` to `to`, counted in the given zone.
 *
 * Each side is reduced to its `YYYY-MM-DD` in the zone first, then the two
 * are compared as UTC calendar dates — never as elapsed milliseconds, and
 * never through a local `new Date(y, m, d)` constructor, which would read the
 * parts back out in the *browser's* zone and reintroduce the exact bug this
 * function exists to close.
 */
export function daysBetweenIn(
  from: string | Date,
  to: string | Date,
  timeZone: string,
): number {
  const fromDay = dayIn(from, timeZone);
  const toDay = dayIn(to, timeZone);
  if (!fromDay || !toDay) return 0;

  const [fy, fm, fd] = fromDay.split("-").map(Number);
  const [ty, tm, td] = toDay.split("-").map(Number);
  const fromMs = Date.UTC(fy, fm - 1, fd);
  const toMs = Date.UTC(ty, tm - 1, td);
  return Math.round((toMs - fromMs) / 86_400_000);
}

/** "Monday". The weekday an instant falls on, in the given zone. */
export function weekdayIn(
  value: string | Date | null | undefined,
  timeZone: string,
): string {
  const date = parse(value);
  return date ? weekdayFormat(timeZone).format(date) : "—";
}

/** Whether a value is a real instant. Lets callers branch without matching "—". */
export function isValidInstant(
  value: string | Date | null | undefined,
): boolean {
  return parse(value) !== null;
}

/**
 * The hour (0–23) an instant falls in, in the given zone.
 *
 * For the dashboard greeting, which has to pick "Good morning" against the
 * company's clock rather than the reader's — see `dashboard/header.tsx`.
 */
export function hourIn(value: string | Date, timeZone: string): number {
  const date = parse(value);
  return date ? Number(hourFormat(timeZone).format(date)) : 0;
}
