import { todayIn } from "@/lib/time";

/**
 * What "today" is, and which clock answers it.
 *
 * ## Two clocks, and only one of them is a product
 *
 * The demo dataset is a fixed snapshot — a payroll run mid-approval, leave
 * booked for September, interviews this week — so the demo needs a fixed "now".
 * Using the real clock there would make the whole dataset drift: the August run
 * would fall further into the past every day until the demo stopped making
 * sense, and an approval "waiting 2 days" would silently become "waiting 400
 * days". **That date is `DEMO_TODAY` and it belongs to demo mode alone.**
 *
 * A connected company is not on that snapshot. It has a real calendar, and this
 * file used to hand it the demo's: `TODAY` was the literal `"2026-08-19"` in
 * every build, so in October the payroll wizard opened on August, the overtime
 * screen defaulted to August, and the exit form told somebody "Today is
 * 2026-08-19". Nothing on any of those screens looked wrong — a month is a
 * month — which is why a visual audit had to find it rather than a type.
 *
 * ## What each export is for
 *
 * | Export | Use it when |
 * |---|---|
 * | `useToday()` (`lib/use-today.ts`) | a component needs the day. **The default.** Real when connected, the demo's when not |
 * | `workingToday(connected, zone)` | the same answer outside a hook, where the caller already holds both facts |
 * | `DEMO_TODAY` | seed data and the demo branches of stores, which are built around it |
 * | `TODAY` | a module-level constant that has no component to ask — a snapshot, taken at load |
 *
 * ## `TODAY` is the demo's day in a build with a demo, and the real one without
 *
 * In a build with no demo (every production build but the opt-in public demo)
 * nothing may print a date that belongs to a dataset which is not there, so
 * `TODAY` is the real day. That is the net under every importer that has not
 * been moved to `useToday()`, and it is why this file can be fixed without
 * editing the sixty-odd files that import it.
 *
 * It is a net and not the answer. **A module-level constant is read once, at
 * load**: a tab left open over midnight keeps yesterday's, and the company's
 * zone is not known that early, so it is taken in the product's default zone.
 * Anything that decides which month a payroll opens on, or what a deadline is
 * measured against, asks `useToday()` per render instead.
 */

/** The day the demo dataset is "on". Demo mode only. */
export const DEMO_TODAY = "2026-08-19";

/**
 * The zone a day is read in when none is known yet — the same fallback
 * `useOrgTimezone` answers before the company profile arrives.
 */
const DEFAULT_ZONE = "Africa/Lagos";

/**
 * Which day to call "today". Pure, so the one guarantee this file exists to
 * give — a build with no demo never answers with the demo's date — can be
 * asserted rather than believed.
 *
 * - **Connected**: the company's own day, in the company's zone.
 * - **Not connected, demo build**: the demo dataset's day.
 * - **Not connected, no demo**: still the real day. There is no dataset to
 *   keep coherent, and the only moments this happens are before sign-in and
 *   while the session loads, when nothing dated is on screen to disagree.
 */
export function todayFor(options: {
  connected: boolean;
  demo: boolean;
  timeZone: string;
}): string {
  return !options.connected && options.demo
    ? DEMO_TODAY
    : todayIn(options.timeZone);
}

/** `todayFor` with this build's own `DEMO_ENABLED`. */
export function workingToday(connected: boolean, timeZone: string): string {
  return todayFor({ connected, demo: DEMO_ENABLED, timeZone });
}

/**
 * A snapshot of the day, taken when this module loads. See the header for what
 * that does and does not make it good for.
 */
export const TODAY: string = DEMO_ENABLED ? DEMO_TODAY : todayIn(DEFAULT_ZONE);

/** The day right now, for a caller with nothing to ask: live, not a snapshot. */
const liveDay = (): string =>
  DEMO_ENABLED ? DEMO_TODAY : todayIn(DEFAULT_ZONE);

export const todayDate = () => new Date(liveDay());

/** Whole days between an ISO date and today. Negative means the date is ahead. */
export function daysSince(isoDate: string): number {
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.round((todayDate().getTime() - then) / 86_400_000);
}

/** `2026-09-12` → `12 Sep`. The format the rest of the app displays. */
export function shortDate(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  return `${d.getUTCDate()} ${
    [
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
    ][d.getUTCMonth()]
  }`;
}
