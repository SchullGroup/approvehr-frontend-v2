import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Somebody invited to help hire has no day to look at. If they land on the dashboard
 * (a bookmark, the logo, the back button) they are sent to the one room that is theirs,
 * and are shown none of the company's figures on the way.
 */

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, back: vi.fn() }),
  usePathname: () => "/dashboard",
}));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ displayName: "Folasade Ige" }),
  useOrgTimezone: () => "Africa/Lagos",
}));

const state = vi.hoisted(() => ({ collaborator: true }));
vi.mock("@/lib/hiring/access/collaborator", async (original) => ({
  ...(await original<typeof import("@/lib/hiring/access/collaborator")>()),
  useIsCollaborator: () => state.collaborator,
}));
vi.mock("@/lib/permissions", () => ({
  useCan: () => false,
  usePermissions: () => ({ permissions: new Set(), loading: false }),
}));
vi.mock("@/lib/store/features", () => ({ useFeatures: () => ({}) }));
vi.mock("@/lib/roles", () => ({
  useSessionRoles: () => ({ loading: false }),
  roleTier: () => "staff",
}));
vi.mock("@/lib/store/insights", () => ({
  useDashboard: () => ({
    data: null,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  useReports: () => ({ data: null, loading: false, error: null }),
}));
vi.mock("@/lib/store/dashboard-layout", () => ({
  useDashboardLayout: () => ({ loading: false, widgets: [] }),
}));
vi.mock("@/lib/store/setup-checklist", () => ({
  useSetupChecklist: () => ({ facts: null, loading: false }),
}));

const { DashboardScreen } =
  await import("@/app/(app)/dashboard/dashboard-screen");

beforeEach(() => {
  replace.mockReset();
});

describe("the dashboard, for a collaborator", () => {
  it("sends them to My interviews and shows nothing of the company meanwhile", () => {
    state.collaborator = true;
    render(<DashboardScreen />);
    expect(replace).toHaveBeenCalledWith("/hiring/my-interviews");
    expect(screen.getByText("Loading your day…")).toBeInTheDocument();
    expect(screen.queryByText(/did not load/)).not.toBeInTheDocument();
  });

  it("does not send anybody else anywhere", () => {
    state.collaborator = false;
    render(<DashboardScreen />);
    expect(replace).not.toHaveBeenCalled();
  });
});
