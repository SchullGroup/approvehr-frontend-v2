import { formatDate, formatTime } from "@/lib/time";

/**
 * Dates, written out.
 *
 * A pay date is a promise to somebody, and `28/07/26` is ambiguous in a country
 * that reads both orders. Kept in its own module rather than on one of the
 * screens so the list, the detail and the ledger cannot drift into three
 * formats — and so no screen has to import another screen.
 *
 * `longDate` and `monthLabel` are always UTC, on purpose: every caller feeds
 * them a date-only value (`payDate`, `occurredAt`, a `YYYY-MM` period) with no
 * time-of-day, so there is no "moment" for the company's zone to relocate —
 * re-anchoring a calendar-only value to a zone would only risk landing on the
 * wrong day, for no benefit. `longDateTime` is the one function here that is
 * fed a real timestamp (`batch.createdAt`/`approvedAt`/`submittedAt`/
 * `completedAt`), so it is the one that takes the company's zone as a
 * parameter — this file cannot call `useOrgTimezone()` itself, since it is not
 * a component, so its caller supplies it.
 */

/** `2026-07-28` → `28 July 2026`. Date-only: always UTC, see header comment. */
export function longDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return formatDate(iso, "UTC");
}

/**
 * `2026-07-26T10:41:00.000Z` → `26 July 2026 at 10:41, in the company's zone`.
 *
 * Before this, the date half was hardcoded UTC and the time half had no zone
 * at all (browser-local) — a batch "built" near midnight could show one
 * calendar day next to a clock reading from a different one. Both halves now
 * come from the same zone, passed by the caller.
 */
export function longDateTime(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${formatDate(iso, timeZone)} at ${formatTime(iso, timeZone)}`;
}

/**
 * `2026-08-01` → `August 2026`. The pay period, as a person says it.
 * Date-only: always UTC, see header comment.
 */
export function monthLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const [, month, year] = formatDate(iso, "UTC").split(" ");
  return `${month} ${year}`;
}

/** `7` → `7 people`, `1` → `1 person`. Used in button labels, so it is exact. */
export function people(count: number): string {
  return `${count} ${count === 1 ? "person" : "people"}`;
}
