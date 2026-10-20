/**
 * When a panelist owes a scorecard.
 *
 * A scorecard is due once the interview is over: it took place, or it was booked and its
 * time, with its length, has passed. Said the same way on the list and on the
 * candidate's page, so the two cannot disagree. Nothing here says whether anybody has been
 * reminded: the API tells a panelist nothing of that, so no screen of theirs does.
 *
 * No React, no state.
 */
export function scorecardDue(
  interview: { status: string; scheduledFor: string; durationMins: number },
  /** The time now, in milliseconds. */
  now: number,
): boolean {
  return (
    interview.status === "COMPLETED" ||
    (interview.status === "SCHEDULED" &&
      Date.parse(interview.scheduledFor) + interview.durationMins * 60_000 <=
        now)
  );
}

/** One of the words a panelist's interview wears: a badge's label and tone. */
export type PanelistStatus = {
  label: string;
  tone: "info" | "success" | "neutral" | "danger";
};

/**
 * What to call an interview on a panelist's list. An interview the API still has as
 * booked is "Coming up" only until it starts: after that it is under way, and once its
 * time and length have passed it is "Time has passed", whatever staff have yet to mark it
 * as. Calling an interview from last week "Coming up" is how a panelist stops trusting
 * the page.
 */
export function panelistStatus(
  interview: { status: string; scheduledFor: string; durationMins: number },
  /** The time now, in milliseconds. */
  now: number,
): PanelistStatus {
  switch (interview.status) {
    case "COMPLETED":
      return { label: "Took place", tone: "success" };
    case "CANCELLED":
      return { label: "Cancelled", tone: "neutral" };
    case "NO_SHOW":
      return { label: "No show", tone: "danger" };
    default: {
      const start = Date.parse(interview.scheduledFor);
      if (now < start) return { label: "Coming up", tone: "info" };
      return scorecardDue(interview, now)
        ? { label: "Time has passed", tone: "neutral" }
        : { label: "Under way", tone: "info" };
    }
  }
}

/** Whether there is still something to join or to put in a calendar: it is booked and not yet over. */
export const stillToCome = (
  interview: { status: string; scheduledFor: string; durationMins: number },
  now: number,
): boolean => interview.status === "SCHEDULED" && !scorecardDue(interview, now);
