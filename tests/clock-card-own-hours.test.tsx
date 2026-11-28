import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClockMenu } from "@/components/portal/clock-menu";
import { MyClockCard } from "@/components/portal/my-clock-card";
import { ToastProvider } from "@/components/ui";
import type { ApiAttendancePolicy, ApiRosterRow } from "@/lib/api/attendance";
import type { RosterState } from "@/lib/store/attendance";

/**
 * A person on a Saturday schedule, on a Saturday the company rests.
 *
 * The API now resolves their own schedule, so their row carries a working
 * status and their own hours. What is pinned here is that the clock card and the
 * clock menu believe it: the Clock in button is there, and the hours printed are
 * 07:30 to 14:00, not the company's 08:00 to 17:00. And that a row the server
 * still calls a rest day keeps saying there is nothing to clock.
 */

const company: ApiAttendancePolicy = {
  id: "p",
  shiftStart: "08:00",
  shiftEnd: "17:00",
  graceMinutes: 15,
  workingWeekdays: [1, 2, 3, 4, 5],
  selfServiceClockIn: true,
};

const row = (over: Partial<ApiRosterRow> = {}): ApiRosterRow => ({
  employeeId: "e1",
  employeeName: "Ada Obi",
  jobTitle: "Operator",
  status: "ABSENT",
  clockIn: null,
  clockOut: null,
  lateByMinutes: 0,
  earlyByMinutes: 0,
  workLocation: null,
  leave: null,
  anomaly: null,
  correctionNote: null,
  ...over,
});

const roster = (rows: ApiRosterRow[], over: Partial<RosterState> = {}) =>
  ({
    date: "2026-11-28",
    time: "07:10",
    policy: company,
    rows,
    recorded: 0,
    tracked: true,
    earlierOpen: null,
    loading: false,
    error: null,
    source: "api",
    reload: () => undefined,
    ...over,
  }) satisfies RosterState;

const current = vi.hoisted(() => ({ roster: null as unknown }));

vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
  useSession: () => ({
    isConnected: true,
    isLoading: false,
    employeeId: "e1",
    displayName: "Ada Obi",
  }),
}));
vi.mock("@/lib/permissions", () => ({
  useCan: () => false,
  usePermissions: () => ({ can: () => false, loading: false }),
}));
vi.mock("@/lib/store/attendance", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/store/attendance")>();
  return {
    ...real,
    useAttendanceRoster: () => current.roster,
    useWorkLocations: () => ({
      locations: [],
      loading: false,
      error: null,
      source: "api",
      create: vi.fn(),
    }),
    useAttendanceMutations: () => ({
      clockIn: vi.fn(),
      clockOut: vi.fn(),
      undoClockOut: vi.fn(),
    }),
    useLastClockLocation: () => null,
    useHomeLocationId: () => null,
    useMyCorrections: () => ({ requests: [], loading: false, error: null }),
  };
});

beforeEach(() => {
  current.roster = null;
});

const card = (hero = false) =>
  render(
    <ToastProvider>
      <MyClockCard hero={hero} />
    </ToastProvider>,
  );

describe("the clock card, on a Saturday the company rests", () => {
  it("offers Clock in and expects the person's own 07:30 to 14:00", () => {
    current.roster = roster([
      row({
        status: "ABSENT",
        expectedStart: "07:30",
        expectedEnd: "14:00",
        scheduleName: "Production",
      }),
    ]);
    card();
    expect(screen.getByRole("button", { name: "Clock in" })).toBeTruthy();
    expect(screen.getByText("Expected 07:30–14:00")).toBeTruthy();
    expect(screen.queryByText("Expected 08:00–17:00")).toBeNull();
    expect(screen.queryByText(/nothing to clock/i)).toBeNull();
  });

  it("says the same on the blue home card", () => {
    current.roster = roster([
      row({ expectedStart: "07:30", expectedEnd: "14:00" }),
    ]);
    card(true);
    expect(screen.getByRole("button", { name: "Clock in" })).toBeTruthy();
    expect(screen.getByText(/Expected 07:30–14:00/)).toBeTruthy();
  });

  it("still says nothing to clock when the server calls it a rest day", () => {
    current.roster = roster([
      row({ status: "REST_DAY", expectedStart: null, expectedEnd: null }),
    ]);
    card();
    expect(screen.queryByRole("button", { name: "Clock in" })).toBeNull();
    expect(screen.getByText(/Rest day today: nothing to clock/)).toBeTruthy();
    expect(screen.queryByText(/Expected/)).toBeNull();
  });

  it("falls back to the company's hours when the row carries none, as an older API sends it", () => {
    current.roster = roster([row({ status: "ABSENT" })]);
    card();
    expect(screen.getByText("Expected 08:00–17:00")).toBeTruthy();
  });
});

describe("the running timer", () => {
  it("measures a full day against the person's own hours, not the company's nine", () => {
    current.roster = roster(
      [
        row({
          status: "PRESENT",
          clockIn: "07:30",
          expectedStart: "07:30",
          expectedEnd: "14:00",
        }),
      ],
      { time: "09:00" },
    );
    card();
    // 07:30 plus a 6h30 Saturday is 14:00. Against 08:00-17:00 it would say 16:30.
    expect(screen.getByText(/a full day at 14:00/)).toBeTruthy();
    expect(screen.queryByText(/16:30/)).toBeNull();
  });
});

describe("the clock menu", () => {
  it("expects the person's own hours there too", async () => {
    current.roster = null;
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ClockMenu
          roster={roster([
            row({ expectedStart: "07:30", expectedEnd: "14:00" }),
          ])}
        />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Your clock" }));
    expect(screen.getByText("Expected 07:30–14:00")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clock in" })).toBeTruthy();
  });
});
