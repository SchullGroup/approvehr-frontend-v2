import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PermissionKey } from "@/lib/permission-keys";
import { asIsoDay } from "@/app/(app)/people/attendance/history/day";
import { correctionProblems } from "@/app/(app)/people/attendance/correction-dialog";

/**
 * HR can put a past attendance day right from the calendar.
 *
 * Until now the only way to change a day that was over was to wait for the
 * employee to raise a request and approve it: HR's own dialog opened from
 * today's roster and nowhere else. The API never cared which date — `correct()`
 * is the same function both paths call — so the gap was a screen, and `tsc`
 * cannot see a screen with no button on it.
 *
 * Rendered in demo mode (no session, the demo's own "today" of 2026-08-19), the
 * way `holiday-banner.test.tsx` and its neighbours do: what is under test is
 * which people are offered the control and what the form says, not the API,
 * which `tests/attendance-corrections.test.ts` on that side covers.
 */

let held = new Set<PermissionKey>();
let manager = false;

vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  useCan: (permission: PermissionKey) => held.has(permission),
  useIsManager: () => manager,
}));

/* The page chrome reads the router, which a component test has none of, and is
   not what is under test. */
vi.mock("@/components/portal/shell", () => ({
  PageHeader: () => null,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const { HistoryScreen } =
  await import("@/app/(app)/people/attendance/history/history-screen");

/** A past working day the demo has clock-ins on. */
const PAST_DAY = "2026-08-18";

beforeEach(() => {
  held = new Set();
  manager = false;
  window.localStorage?.clear?.();
});

describe("who is offered the button", () => {
  it("shows a correction control on each row of a past day to somebody with EDIT_RECORDS", async () => {
    held = new Set<PermissionKey>(["EDIT_RECORDS"]);
    render(<HistoryScreen initialDate={PAST_DAY} />);

    await screen.findByText(/^Roster ·/);
    const buttons = screen.getAllByRole("button", {
      name: /^(Correct|Record) .+'s day$/,
    });
    expect(buttons.length).toBeGreaterThan(5);
  });

  it("shows nothing at all to a manager who cannot edit records", async () => {
    /* Absent, not disabled: the API refuses this person, so a button would be
       a form whose only outcome is the refusal. */
    manager = true;
    render(<HistoryScreen initialDate={PAST_DAY} />);

    await screen.findByText(/^Roster ·/);
    expect(
      screen.queryByRole("button", { name: /^(Correct|Record) .+'s day$/ }),
    ).toBeNull();
    expect(screen.queryByText("Actions")).toBeNull();
  });
});

describe("correcting the day", () => {
  it("opens the shared form for that day, refuses a clock-out before the clock-in, then saves", async () => {
    held = new Set<PermissionKey>(["EDIT_RECORDS"]);
    render(<HistoryScreen initialDate={PAST_DAY} />);
    await screen.findByText(/^Roster ·/);

    /* Somebody who has a clock-in that day. */
    const [first] = screen.getAllByRole("button", {
      name: /^Correct .+'s day$/,
    });
    expect(first).toBeDefined();
    fireEvent.click(first!);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/18 Aug/);
    /* A day that is over says what a payroll that is already settled does. */
    expect(dialog).toHaveTextContent(/already approved or paid/);

    const [clockIn, clockOut] = Array.from(
      dialog.querySelectorAll<HTMLInputElement>('input[type="time"]'),
    );
    fireEvent.change(clockIn!, { target: { value: "10:00" } });
    fireEvent.change(clockOut!, { target: { value: "09:00" } });
    fireEvent.change(screen.getByPlaceholderText(/forgot to clock out/i), {
      target: { value: "Fixed after checking the door log" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save correction" }));

    expect(
      await screen.findByText("The clock-out is before the clock-in."),
    ).toBeInTheDocument();

    fireEvent.change(clockOut!, { target: { value: "18:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save correction" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    /* Twice: the table and the narrow-screen list both draw the row. */
    expect(
      (
        await screen.findAllByText(
          /Corrected: Fixed after checking the door log/,
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe("what the form checks before it asks the server", () => {
  it("wants a clock-in for a clock-out", () => {
    expect(
      correctionProblems({ clockIn: "", clockOut: "17:00", note: "why" }),
    ).toEqual({ clockOut: "Add a clock-in as well, or clear this." });
  });

  it("refuses a clock-out before the clock-in, as the API does", () => {
    expect(
      correctionProblems({
        clockIn: "09:00",
        clockOut: "08:59",
        note: "late bus",
      }),
    ).toEqual({ clockOut: "The clock-out is before the clock-in." });
    /* Equal is allowed, again as the API does. */
    expect(
      correctionProblems({
        clockIn: "09:00",
        clockOut: "09:00",
        note: "late bus",
      }),
    ).toEqual({});
  });

  it("wants a reason, and more than a character or two of one", () => {
    expect(
      correctionProblems({ clockIn: "", clockOut: "", note: "  " }),
    ).toEqual({ note: "A reason is required." });
    expect(
      correctionProblems({ clockIn: "", clockOut: "", note: "ab" }),
    ).toEqual({ note: "Say why this changed." });
  });

  it("lets an absence through: both times empty, with a reason", () => {
    expect(
      correctionProblems({
        clockIn: "",
        clockOut: "",
        note: "Was on site visit",
      }),
    ).toEqual({});
  });
});

describe("?date= on the history page", () => {
  it("accepts a real day and nothing else", () => {
    expect(asIsoDay("2026-10-05")).toBe("2026-10-05");
    expect(asIsoDay("2026-02-31")).toBeNull();
    expect(asIsoDay("2026-10-5")).toBeNull();
    expect(asIsoDay("yesterday")).toBeNull();
    expect(asIsoDay(undefined)).toBeNull();
  });
});
