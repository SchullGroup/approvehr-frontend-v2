/**
 * The one place this module reads the clock.
 *
 * Everything else in `lib/projects` takes `now` and `today` as arguments, so it
 * stays pure and testable. The store calls this at the moment a person acts —
 * an instant to stamp on a row — and nothing here derives a calendar day from
 * it: a day is always `todayIn(timeZone)` from `lib/time.ts`.
 */
export function nowIso(): string {
  return new Date().toISOString(); // reads-the-clock: an instant to stamp on a row at the moment of the action, never reduced to a day
}
