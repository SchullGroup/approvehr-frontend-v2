import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AfterHoursPanel } from "@/app/(app)/people/attendance/after-hours-panel";
import { attendanceViews } from "@/app/(app)/people/attendance/attendance-screen";

/**
 * After-hours door scans wait for a person to decide. Dismissing needs nothing;
 * counting is a change to somebody's pay and needs a reason.
 */

const row = (id: string, over = {}) => ({
  punchId: id,
  employeeId: "e1",
  employeeName: "Ada Obi",
  deviceLabel: "Front door",
  punchedAt: "2026-10-17T09:15:00.000Z",
  workDate: "2026-10-17",
  nonWorkingDay: true,
  review: "PENDING",
  reviewedAt: null,
  reviewedByName: null,
  reviewNote: null,
  ...over,
});

const state = vi.hoisted(() => ({ can: true }));
const api = vi.hoisted(() => ({
  afterHours: vi.fn(),
  dismissAfterHours: vi.fn(),
  countAfterHours: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  useCan: () => state.can,
  usePermissions: () => ({ can: () => state.can, loading: false }),
}));
vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
  useSession: () => ({ isConnected: true, isLoading: false }),
}));
vi.mock("@/lib/api/attendance", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/api/attendance")>();
  return { ...real, attendanceApi: { ...real.attendanceApi, ...api } };
});

beforeEach(() => {
  state.can = true;
  api.afterHours.mockReset().mockResolvedValue([row("p1"), row("p2")]);
  api.dismissAfterHours.mockReset().mockResolvedValue(row("p1"));
  api.countAfterHours.mockReset().mockResolvedValue(row("p1"));
});

describe("the after hours panel", () => {
  it("lists pending scans with who, when, where and the non-working day", async () => {
    render(<AfterHoursPanel />);
    expect((await screen.findAllByText("Ada Obi")).length).toBe(2);
    expect(screen.getAllByText("Front door").length).toBe(2);
    expect(screen.getAllByText("weekend/holiday").length).toBe(2);
    expect(api.afterHours).toHaveBeenCalledWith(
      expect.objectContaining({ status: "PENDING" }),
      expect.anything(),
    );
  });

  it("dismisses a pending scan", async () => {
    const user = userEvent.setup();
    render(<AfterHoursPanel />);
    const [first] = await screen.findAllByRole("button", { name: "Dismiss" });
    await user.click(first!);
    await waitFor(() =>
      expect(api.dismissAfterHours).toHaveBeenCalledWith("p1", {}),
    );
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Dismiss" }).length).toBe(1),
    );
  });

  it("requires a note to count one", async () => {
    const user = userEvent.setup();
    render(<AfterHoursPanel />);
    const [first] = await screen.findAllByRole("button", {
      name: "Count as extra hours",
    });
    await user.click(first!);

    const confirm = screen.getByRole("button", { name: "Count it" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);

    const note = screen.getByLabelText(/note/i);
    await user.type(note, "ab");
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    await user.type(note, "c");
    expect((confirm as HTMLButtonElement).disabled).toBe(false);

    await user.click(confirm);
    await waitFor(() =>
      expect(api.countAfterHours).toHaveBeenCalledWith("p1", { note: "abc" }),
    );
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: "Count as extra hours" }).length,
      ).toBe(1),
    );
  });

  it("is not offered without EDIT_RECORDS", () => {
    state.can = false;
    render(<AfterHoursPanel />);
    expect(screen.queryByText("Ada Obi")).toBeNull();
    expect(api.afterHours).not.toHaveBeenCalled();
    expect(attendanceViews(false).map((v) => v.value)).toEqual([
      "today",
      "timesheet",
    ]);
    expect(attendanceViews(true).map((v) => v.value)).toEqual([
      "today",
      "timesheet",
      "after-hours",
    ]);
  });
});
