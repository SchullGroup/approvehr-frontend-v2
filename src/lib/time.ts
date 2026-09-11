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
