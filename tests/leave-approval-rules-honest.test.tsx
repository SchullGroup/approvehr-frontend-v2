import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { ToastProvider } from "@/components/ui";

const mocks = vi.hoisted(() => ({
  types: vi.fn(),
  createType: vi.fn(),
  limits: null as unknown,
  connected: true,
}));

vi.mock("@/lib/api/leave", async (original) => ({
  ...(await original<typeof import("@/lib/api/leave")>()),
  leaveApi: {
    types: (...args: unknown[]) => mocks.types(...args),
    createType: (...args: unknown[]) => mocks.createType(...args),
  },
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
 * The Approval rules card says only what is true of where it is.
 *
 * Connected, the API has no policy to save "negative balance" or "hold pending
 * days" into: it never blocks an overdraw (it warns) and always holds pending
 * days back, the same for everybody. A switch there would look saved and change
 * nothing, so each is a statement. Offline the demo store reads both, so there
 * they stay switches.
 */
const { LeavePolicyForm } = await import("@/app/(app)/settings/leave/form");

const Screen = () => (
  <ToastProvider>
    <LeavePolicyForm initialTab="approval" />
  </ToastProvider>
);

beforeEach(() => {
  mocks.types.mockResolvedValue({ rows: [] });
  mocks.connected = true;
});
afterEach(() => vi.clearAllMocks());

describe("Approval rules", () => {
  it("connected: states what the server does and offers no switch for it", async () => {
    render(<Screen />);
    expect(await screen.findByText("Going over an entitlement")).toBeTruthy();
    expect(screen.getByText(/Never blocks\./)).toBeTruthy();
    expect(screen.getByText("Pending days")).toBeTruthy();
    expect(screen.getByText(/Always held back\./)).toBeTruthy();
    expect(
      screen.queryByRole("switch", {
        name: /Allowed|Blocked|Held back|Not held back/,
      }),
    ).toBeNull();
    expect(
      screen.queryByText("Allow approval into a negative balance"),
    ).toBeNull();
  });

  it("offline: the two stay switches, because the demo store reads them", async () => {
    mocks.connected = false;
    render(<Screen />);
    expect(
      await screen.findByText("Allow approval into a negative balance"),
    ).toBeTruthy();
    expect(
      screen.getByText("Hold pending days against the remaining figure"),
    ).toBeTruthy();
    expect(screen.queryByText(/Never blocks\./)).toBeNull();
  });
});
