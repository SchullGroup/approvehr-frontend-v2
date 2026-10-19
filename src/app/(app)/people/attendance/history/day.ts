/**
 * A `?date=` the history screen can open on, or null.
 *
 * In one plain module for the reason `shifts/tabs.ts` gives: `page.tsx` is a
 * server component and `history-screen.tsx` a client one, and a function
 * exported from a `"use client"` file throws when a server component calls it —
 * at request time, past `tsc` and lint.
 *
 * Round-tripped through a real date, because `2026-02-31` is shaped like a day
 * and is not one. Whether it is in the future is the screen's to say: only it
 * knows the company's today.
 */
export function asIsoDay(value: string | undefined): string | null {
  if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === value ? value : null;
}
