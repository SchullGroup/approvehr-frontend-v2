import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";

/**
 * U46 (HR-12): a switched-off leave type could only be turned back on in the
 * same visit, because the API could not list them, and its name stayed taken
 * for good. The API now lists them (`includeArchived`), so every switched-off
 * type is listed with "Turn it back on".
 */

const mocks = vi.hoisted(() => ({
  types: vi.fn(),
  archivedTypes: vi.fn(),
  restoreType: vi.fn(),
}));

vi.mock("@/lib/api/leave", async (original) => ({
  ...(await original<typeof import("@/lib/api/leave")>()),
  leaveApi: {
    types: (...args: unknown[]) => mocks.types(...args),
    archivedTypes: (...args: unknown[]) => mocks.archivedTypes(...args),
    restoreType: (...args: unknown[]) => mocks.restoreType(...args),
  },
}));
vi.mock("@/lib/store/leave-files", () => ({
  useLeaveFileLimits: () => ({ limits: null, storage: null }),
}));
vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  usePermissions: () => ({ can: () => true, loading: false, permissions: [] }),
}));
vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({ isConnected: true, user: null, employeeId: null }),
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

const { LeavePolicyForm } = await import("@/app/(app)/settings/leave/form");

beforeEach(() => {
  mocks.types.mockReset().mockResolvedValue([]);
  mocks.archivedTypes
    .mockReset()
    .mockResolvedValue([{ id: "t-study", name: "Study leave" }]);
  mocks.restoreType.mockReset().mockResolvedValue({ name: "Study leave" });
});

describe("switched-off leave types", () => {
  it("are listed from the server, each with a way back on", async () => {
    render(
      <ToastProvider>
        <LeavePolicyForm />
      </ToastProvider>,
    );
    const card = (await screen.findByText("Study leave")).closest(
      "[class*='rounded']",
    ) as HTMLElement;
    fireEvent.click(
      within(card).getByRole("button", { name: /Turn it back on/ }),
    );
    expect(mocks.restoreType).toHaveBeenCalledWith("t-study");
    expect(
      screen.queryByText(/This list lasts as long as this page/),
    ).toBeNull();
  });

  it("falls back to this visit's list on a server that cannot list them", async () => {
    mocks.archivedTypes.mockResolvedValue(null);
    render(
      <ToastProvider>
        <LeavePolicyForm />
      </ToastProvider>,
    );
    await screen.findByRole("button", { name: "Add leave type" });
    expect(screen.queryByText("Study leave")).toBeNull();
  });
});
