import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";

const mocks = vi.hoisted(() => ({
  types: vi.fn(),
  createType: vi.fn(),
  limits: null as unknown,
  connected: true,
  rollover: null as unknown,
}));

vi.mock("@/lib/api/leave", async (original) => ({
  ...(await original<typeof import("@/lib/api/leave")>()),
  leaveApi: {
    types: (...args: unknown[]) => mocks.types(...args),
    createType: (...args: unknown[]) => mocks.createType(...args),
  },
}));
vi.mock("@/lib/store/leave-rollover", () => ({
  useLeaveRollover: () => mocks.rollover,
}));
vi.mock("@/lib/store/leave-files", () => ({
  useLeaveFileLimits: () => ({ limits: mocks.limits, storage: null }),
}));
vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  usePermissions: () => ({ can: () => true, loading: false, permissions: [] }),
}));
vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({
    can: () => true,
    isConnected: mocks.connected,
    user: null,
    employeeId: null,
  }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/settings/leave",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/components/portal/shell", () => ({
  PageHeader: () => null,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/app/(app)/settings/leave/holidays-panel", () => ({
  HolidaysPanel: () => null,
}));

/**
 * Whether carry-over has been applied, on the leave types tab.
 *
 * The figures are edited here and acted on by a job nobody watches, so the card
 * says what the job recorded. Absent is not "not yet": an unknown status, no
 * type that carries days, and the demo (which has no job) all say nothing.
 */
const { LeavePolicyForm } = await import("@/app/(app)/settings/leave/form");

const Screen = () => (
  <ToastProvider>
    <LeavePolicyForm initialTab="types" />
  </ToastProvider>
);

const status = (over: Record<string, unknown> = {}) => ({
  year: 2026,
  carryingTypes: 1,
  ranThisYear: null,
  ...over,
});

beforeEach(() => {
  mocks.types.mockResolvedValue({ rows: [] });
  mocks.connected = true;
  mocks.rollover = null;
});
afterEach(() => vi.clearAllMocks());

describe("Carry-over status", () => {
  it("says a run has not been applied yet", async () => {
    mocks.rollover = status();
    render(<Screen />);
    expect(
      await screen.findByText(/Carry-over for 2026 has not been applied yet/),
    ).toBeTruthy();
  });

  it("reports a recorded run in the company's own figures", async () => {
    mocks.rollover = status({
      ranThisYear: {
        ranAt: "2026-01-03T04:00:00.000Z",
        employeesProcessed: 12,
        daysCarried: 41,
        baseline: false,
        note: null,
      },
    });
    render(<Screen />);
    const line = await screen.findByText(/was applied on 3 January 2026/);
    expect(line.textContent).toContain("41 days carried");
    expect(line.textContent).toContain("12 people checked");
  });

  it("says nothing while the status is unknown", async () => {
    mocks.rollover = null;
    render(<Screen />);
    await screen.findByText(/Balances move as soon as a change saves/);
    expect(screen.queryByText(/Carry-over for 2026/)).toBeNull();
  });

  it("says nothing when no leave type carries days over", async () => {
    mocks.rollover = status({ carryingTypes: 0 });
    render(<Screen />);
    await screen.findByText(/Balances move as soon as a change saves/);
    expect(screen.queryByText(/Carry-over for 2026/)).toBeNull();
  });

  it("says nothing in the demo, which has no job to report on", async () => {
    mocks.connected = false;
    mocks.rollover = status();
    render(<Screen />);
    await screen.findByText(/Adding a leave type writes to the company/);
    expect(screen.queryByText(/Carry-over for 2026/)).toBeNull();
  });
});
