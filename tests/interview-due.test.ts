import { describe, expect, it } from "vitest";
import {
  panelistStatus,
  scorecardDue,
  stillToCome,
} from "@/lib/hiring/interviews/due";

/**
 * When a panelist owes a scorecard, and what an interview on their list is called. An
 * interview the API still has as booked is "Coming up" only until it starts.
 */

const START = "2026-10-20T09:00:00.000Z";
const interview = (status: string) => ({
  status,
  scheduledFor: START,
  durationMins: 60,
});
const at = (iso: string) => Date.parse(iso);

describe("when a scorecard is due", () => {
  it("is due once the interview took place", () => {
    expect(
      scorecardDue(interview("COMPLETED"), at("2026-10-01T00:00:00Z")),
    ).toBe(true);
  });

  it("is due once a booked interview's time, with its length, has passed", () => {
    expect(
      scorecardDue(interview("SCHEDULED"), at("2026-10-20T09:59:59Z")),
    ).toBe(false);
    expect(
      scorecardDue(interview("SCHEDULED"), at("2026-10-20T10:00:00Z")),
    ).toBe(true);
  });

  it("is not due for an interview that was cancelled or that nobody came to", () => {
    for (const status of ["CANCELLED", "NO_SHOW"])
      expect(
        scorecardDue(interview(status), at("2027-01-01T00:00:00Z")),
        status,
      ).toBe(false);
  });
});

describe("what an interview is called on a panelist's list", () => {
  it("is 'Coming up' until it starts, 'Under way' while it runs, 'Time has passed' after", () => {
    expect(
      panelistStatus(interview("SCHEDULED"), at("2026-10-19T09:00:00Z")),
    ).toEqual({
      label: "Coming up",
      tone: "info",
    });
    expect(
      panelistStatus(interview("SCHEDULED"), at("2026-10-20T09:30:00Z")),
    ).toEqual({
      label: "Under way",
      tone: "info",
    });
    expect(
      panelistStatus(interview("SCHEDULED"), at("2026-10-22T09:00:00Z")),
    ).toEqual({
      label: "Time has passed",
      tone: "neutral",
    });
  });

  it("uses the API's word for one that was settled", () => {
    const now = at("2026-10-22T09:00:00Z");
    expect(panelistStatus(interview("COMPLETED"), now).label).toBe(
      "Took place",
    );
    expect(panelistStatus(interview("CANCELLED"), now).label).toBe("Cancelled");
    expect(panelistStatus(interview("NO_SHOW"), now)).toEqual({
      label: "No show",
      tone: "danger",
    });
  });

  it("has something to join or to put in a calendar only while it is booked and not over", () => {
    expect(
      stillToCome(interview("SCHEDULED"), at("2026-10-19T09:00:00Z")),
    ).toBe(true);
    expect(
      stillToCome(interview("SCHEDULED"), at("2026-10-20T09:30:00Z")),
    ).toBe(true);
    expect(
      stillToCome(interview("SCHEDULED"), at("2026-10-20T10:00:00Z")),
    ).toBe(false);
    expect(
      stillToCome(interview("COMPLETED"), at("2026-10-19T09:00:00Z")),
    ).toBe(false);
    expect(
      stillToCome(interview("CANCELLED"), at("2026-10-19T09:00:00Z")),
    ).toBe(false);
  });
});
