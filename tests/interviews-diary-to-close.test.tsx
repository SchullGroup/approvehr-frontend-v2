import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * The connected diary splits SCHEDULED interviews by the clock (UAT 23 Nov,
 * U91 / PERF-11): on 23 Nov, interviews from 23 and 24 Oct were under
 * "Upcoming".
 */
const iv = (id: string, name: string, scheduledFor: string) => ({
  id,
  applicationId: `app-${id}`,
  requisitionId: "req-1",
  requisitionReference: "REQ-2026-014",
  candidateName: name,
  kind: "PANEL",
  scheduledFor,
  durationMins: 60,
  location: null,
  joinUrl: null,
  status: "SCHEDULED",
  scorecardsSubmitted: 0,
});

vi.mock("@/lib/store/recruitment", () => ({
  useInterviews: ({ status }: { status: string }) => ({
    interviews:
      status === "SCHEDULED"
        ? [
            iv("a", "Uche Okafor", "2026-11-25T09:00:00.000Z"),
            iv("b", "Bola Ade", "2026-10-23T09:00:00.000Z"),
          ]
        : [],
    loading: false,
  }),
}));
vi.mock("@/lib/hiring/interviews/use-interviews", () => ({
  useInterviewsGateway: () => ({
    now: () => "2026-11-23T10:00:00.000Z",
    calendarFile: vi.fn(),
  }),
}));
vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
}));

const { RealDiary } = await import("@/app/(app)/hiring/interviews/real-diary");

describe("the interview diary", () => {
  it("lists an interview whose time has passed under Happened, needs closing", () => {
    render(<RealDiary />);
    const past = screen
      .getByText("Happened, needs closing")
      .closest<HTMLElement>("[class*='rounded']")!;
    expect(within(past).getByText("Bola Ade")).toBeInTheDocument();
    expect(within(past).queryByText("Uche Okafor")).toBeNull();
  });

  it("keeps only what is still to happen under Upcoming", () => {
    render(<RealDiary />);
    const upcoming = screen
      .getByText("Upcoming")
      .closest<HTMLElement>("[class*='rounded']")!;
    expect(within(upcoming).getByText("Uche Okafor")).toBeInTheDocument();
    expect(within(upcoming).queryByText("Bola Ade")).toBeNull();
  });
});
