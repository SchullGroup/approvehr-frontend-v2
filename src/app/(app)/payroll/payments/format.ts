/**
 * Dates, written out.
 *
 * A pay date is a promise to somebody, and `28/07/26` is ambiguous in a country
 * that reads both orders. Kept in its own module rather than on one of the
 * screens so the list, the detail and the ledger cannot drift into three
 * formats — and so no screen has to import another screen.
 */

/** `2026-07-28` → `28 July 2026`. */
export function longDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** `2026-07-26T10:41:00.000Z` → `26 July 2026 at 10:41`. */
export function longDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${longDate(iso)} at ${date.toLocaleTimeString("en-NG", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;
}

/** `2026-08-01` → `August 2026`. The pay period, as a person says it. */
export function monthLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-NG", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** `7` → `7 people`, `1` → `1 person`. Used in button labels, so it is exact. */
export function people(count: number): string {
  return `${count} ${count === 1 ? "person" : "people"}`;
}
