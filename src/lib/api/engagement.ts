"use client";

import { ApiError, request } from "@/lib/api/client";
import { kindOf } from "@/lib/api/failure";

/**
 * How the team uses the app, for HR — `/api/v1/engagement`.
 *
 * One route and one company-wide aggregate. The pilot is judged on weekly active
 * employees, and the API measures it from one mark per person per day (see
 * `meApi.appOpen`). What comes back is **a team total and nothing finer**: no
 * department cut, no list of people, no day-by-day. A route that took an employee
 * id would be how a withheld group is recovered by subtraction, so there is none,
 * and this client cannot ask for one.
 *
 * ## `withheld` is not a zero
 *
 * Below the privacy floor the body carries the fact that it was withheld and no
 * figure at all. "1 of 2 active" says what both people did, so the API sends no
 * count, no share and no median. A screen must branch on `withheld` before it
 * reads a number, and draw nothing numeric for the withheld case.
 *
 * ## Two readings of "three or more days"
 *
 * The owner has not chosen between *every person met three days* and *the team's
 * median is three*, so both are sent: `threeOrMoreDays` (how many, and what share)
 * and `medianDaysPerPerson`. Neither should be judged on a week that is not
 * `complete`: three days cannot have happened by a Tuesday.
 *
 * `share` is a fraction from 0 to 1 to four places, not a rounded percentage. 79.6
 * per cent rounds to 80 and would pass a bar it missed, so show one decimal and
 * keep `people` beside it.
 */

/* ------------------------------------------------------------------- shapes */

export type ApiActivityWeek = {
  /** `YYYY-MM-DD`, a Monday. */
  start: string;
  /** `YYYY-MM-DD`, the Sunday. */
  end: string;
  /** The week is over. The current week never is, even on its Sunday. */
  complete: boolean;
  /** Days of the week that have begun, 1 to 7. */
  daysElapsed: number;
};

export type ApiWeeklyActive =
  | {
      week: ApiActivityWeek;
      floor: number;
      withheld: false;
      /** Active employees in post that week: the denominator for the rest. */
      peopleCounted: number;
      /** At least one open in the week. */
      weeklyActive: { people: number; share: number };
      /** Three or more distinct days. */
      threeOrMoreDays: { people: number; share: number };
      /** Days opened per person; the lower middle value for an even count. */
      medianDaysPerPerson: number;
    }
  | {
      week: ApiActivityWeek;
      floor: number;
      withheld: true;
      reason: "below_floor";
      note: string;
    };

/* -------------------------------------------------------------------- calls */

export const engagementApi = {
  /**
   * One week of team activity. Needs `MANAGE_SETTINGS`.
   *
   * `week` is any `YYYY-MM-DD` in the week wanted (Monday to Sunday, the
   * company's calendar); absent is the current week. A week that has not started
   * is a 422, and so is asking while the company has tracking off.
   */
  weeklyActive(week?: string, signal?: AbortSignal): Promise<ApiWeeklyActive> {
    return request<ApiWeeklyActive>("/engagement/weekly-active", {
      ...(week ? { query: { week } } : {}),
      ...(signal ? { signal } : {}),
    });
  },
};

/* ------------------------------------------------------------------ helpers */

/**
 * The API said tracking is switched off for this company.
 *
 * A 422 with `details.reason: "module_off"`. That is the company's own choice and
 * not a failure, so the card draws nothing for it rather than an error.
 */
export function trackingIsOff(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 422) return false;
  const details = error.details;
  return (
    details !== undefined &&
    !Array.isArray(details) &&
    details["reason"] === "module_off"
  );
}

/**
 * This card has nothing to say, and says nothing.
 *
 * Tracking is off for the company (`trackingIsOff`), or the caller may not read
 * it (403), or the API behind this build does not have the route yet (404). None
 * of those is a failure to announce on the dashboard: the first is the company's
 * own choice, and the other two are a deploy or a permission the person already
 * lives with. Anything else (a network failure, a 5xx) is a real failure and
 * still reaches `LoadFailure`.
 */
export function weeklyActiveAbsent(error: unknown): boolean {
  const kind = kindOf(error);
  if (kind === "missing") return true;
  if (error instanceof ApiError && error.status === 403) return true;
  return trackingIsOff(error);
}

/**
 * A fraction as a percentage to one decimal, **rounded down**.
 *
 * `0.7996` is `79.9%`, not `80.0%`. This is the figure held against an 80 per cent
 * bar, and rounding up is how a team that missed it reads as having passed. The
 * API sends four places, so the fraction is made whole first: multiplying a float
 * by a hundred and flooring is how 29 per cent comes out as 28.
 */
export function sharePercent(share: number): string {
  const tenths = Math.floor(Math.round(share * 10_000) / 10);
  return `${(tenths / 10).toFixed(1)}%`;
}
