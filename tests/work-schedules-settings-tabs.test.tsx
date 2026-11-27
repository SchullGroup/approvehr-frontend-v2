import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AttendancePolicyForm } from "@/app/(app)/settings/attendance/form";
import { ToastProvider } from "@/components/ui";

/**
 * Settings → Attendance has three tabs connected, and is the one form it always
 * was offline.
 *
 * The company-hours form is not under test here (it has not changed); what is
 * pinned is where the other two sit, that they are absent rather than empty in
 * demo mode, and that a link can open on one of them.
 */

const policyState = vi.hoisted(() => ({
  source: "api" as "api" | "demo",
  loading: false,
}));

vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/lib/store/attendance", () => ({
  useAttendancePolicy: () => ({
    policy: {
      id: "p",
      shiftStart: "08:00",
      shiftEnd: "17:00",
      graceMinutes: 15,
      workingWeekdays: [1, 2, 3, 4, 5],
      selfServiceClockIn: true,
    },
    loading: policyState.loading,
    error: null,
    saving: false,
    editable: true,
    source: policyState.source,
    save: vi.fn(),
    reload: vi.fn(),
  }),
}));
vi.mock("@/lib/store/work-schedules", () => ({
  useWorkSchedules: () => ({
    schedules: [],
    loading: false,
    error: null,
    available: true,
    editable: true,
    reload: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
  useSpecialDays: () => ({
    days: [],
    loading: false,
    error: null,
    available: true,
    editable: true,
    reload: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
}));
vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
  useSession: () => ({ isConnected: true, isLoading: false }),
}));

beforeEach(() => {
  policyState.source = "api";
  policyState.loading = false;
});

const mount = (initialTab?: "hours" | "schedules" | "special-days") =>
  render(
    <ToastProvider>
      <AttendancePolicyForm {...(initialTab ? { initialTab } : {})} />
    </ToastProvider>,
  );

describe("Settings → Attendance, connected", () => {
  it("has Company hours, Schedules and Special days, opening on the first", () => {
    mount();
    const tabs = screen.getAllByRole("tab").map((tab) => tab.textContent);
    expect(tabs).toEqual(["Company hours", "Schedules", "Special days"]);
    expect(
      screen
        .getByRole("tab", { name: "Company hours" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    // The existing form, untouched.
    expect(screen.getByText("Shift")).toBeTruthy();
    expect(screen.getByText("Working days")).toBeTruthy();
  });

  it("moves between them", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("tab", { name: "Schedules" }));
    expect(screen.getByRole("button", { name: "Add schedule" })).toBeTruthy();
    expect(screen.queryByText("Working days")).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Special days" }));
    expect(
      screen.getByRole("button", { name: "Add a special day" }),
    ).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Company hours" }));
    expect(screen.getByText("Working days")).toBeTruthy();
  });

  it("opens on the tab a link asked for", () => {
    mount("special-days");
    expect(
      screen
        .getByRole("tab", { name: "Special days" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Add a special day" }),
    ).toBeTruthy();
  });

  it("waits for the company's hours before showing a tab that starts from them", () => {
    policyState.loading = true;
    mount("schedules");
    expect(screen.getAllByText("Loading").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Add schedule" })).toBeNull();
  });
});

describe("Settings → Attendance, offline", () => {
  it("offers no tabs at all: the form is the page", () => {
    policyState.source = "demo";
    mount("schedules");
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByText("Shift")).toBeTruthy();
    expect(screen.queryByText("Schedules")).toBeNull();
  });
});
