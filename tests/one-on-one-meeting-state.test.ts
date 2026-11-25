/**
 * U109 (SELF-17): a one-to-one dated 27 October, never marked held, said
 * "Coming up" with "Cancel it" while the list said "26 days overdue". A past
 * meeting not marked held says so; only a meeting still ahead is "Coming up".
 * And the page was titled with the employee's own name when they opened it;
 * it is titled with the other person.
 */
import { describe, expect, it } from "vitest";
import {
  meetingState,
  oneOnOneTitle,
  type ApiOneOnOne,
  type ApiOneOnOneMeeting,
} from "@/lib/api/one-on-ones";

const meeting = (
  scheduledFor: string,
  heldAt: string | null = null,
): ApiOneOnOneMeeting => ({
  id: "m1",
  seriesId: "s1",
  scheduledFor,
  heldAt,
  notes: null,
  items: [],
});

describe("a meeting's state", () => {
  const today = "2026-11-23";
  it("is held once marked held", () => {
    expect(
      meetingState(meeting("2026-10-27", "2026-10-27T10:00:00Z"), today),
    ).toBe("held");
  });
  it("is not marked as held when its day has passed", () => {
    expect(meetingState(meeting("2026-10-27"), today)).toBe("missed");
  });
  it("is coming up today or later", () => {
    expect(meetingState(meeting("2026-11-23"), today)).toBe("upcoming");
    expect(meetingState(meeting("2026-12-01"), today)).toBe("upcoming");
  });
});

describe("the page title", () => {
  const series = {
    managerId: "adaeze",
    managerName: "Adaeze Okonkwo",
    employeeId: "chidi",
    employeeName: "Chidi Nwosu",
  } as ApiOneOnOne;
  it("names the manager for the employee", () => {
    expect(oneOnOneTitle(series, "chidi")).toBe("With Adaeze Okonkwo");
  });
  it("names the employee for the manager and for anybody else", () => {
    expect(oneOnOneTitle(series, "adaeze")).toBe("With Chidi Nwosu");
    expect(oneOnOneTitle(series, null)).toBe("With Chidi Nwosu");
  });
});
