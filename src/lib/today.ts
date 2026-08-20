/**
 * The day the demo dataset is "on".
 *
 * The seed data is a fixed snapshot — a payroll run mid-approval, leave booked
 * for September, interviews this week — so "now" has to be fixed too. Using the
 * real clock would make the whole dataset drift: the August run would fall
 * further into the past every day until the demo stopped making sense, and an
 * approval "waiting 2 days" would silently become "waiting 400 days".
 *
 * This was scattered as a literal `"2026-08-19"` across five files before it
 * lived here. Import it rather than re-typing the date; when the seed data is
 * eventually rolled forward, this is the one line that moves.
 */
export const TODAY = "2026-08-19";

export const todayDate = () => new Date(TODAY);

/** Whole days between an ISO date and TODAY. Negative means the date is ahead. */
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
