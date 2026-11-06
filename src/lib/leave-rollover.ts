import type { RolloverStatus } from "@/lib/api/leave";
import { formatDate } from "@/lib/time";

/**
 * The one sentence the leave settings say about carry-over, from what the job
 * recorded.
 *
 * Returns **null when there is nothing true to add**: no leave type carries
 * days over, so whether a job ran is not something the reader can act on, and a
 * line saying so would only be noise under a setting they did not use.
 *
 * Pure, so each state is a test and the screen only renders what it is given.
 */
export function carryOverLine(
  status: RolloverStatus,
  timeZone: string,
): string | null {
  if (status.carryingTypes === 0) return null;
  const { year, ranThisYear: ran } = status;

  if (!ran)
    return `Carry-over for ${year} has not been applied yet. It is applied automatically, so there is nothing to do here.`;

  if (ran.baseline)
    return `Carry-over for ${year}: nothing was carried, because this is the first year recorded. Days carry from the next year turn.`;

  const days = `${ran.daysCarried} ${ran.daysCarried === 1 ? "day" : "days"}`;
  const people = `${ran.employeesProcessed} ${ran.employeesProcessed === 1 ? "person" : "people"}`;
  const when = formatDate(ran.ranAt, timeZone);
  /* A note on a real run says why it did nothing ("No leave type allows
     carry-over"), and is the API's own words. */
  const why = ran.note ? ` ${ran.note}` : "";
  return `Carry-over for ${year} was applied on ${when}: ${days} carried, ${people} checked.${why} Changing the maximum now does not change what was already carried.`;
}
