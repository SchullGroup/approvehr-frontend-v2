import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The shell asks "do I lead anybody?" (`useLeadsTeam`) and hands the answer to the
 * sidebar as `rows["team-tasks"]`; this proves that wiring, with the sidebar
 * stubbed to list the rows it was given.
 */

const state = vi.hoisted(() => ({
  leads: false,
  projectsOn: true,
  asked: [] as boolean[],
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/lib/nav-history", () => ({ useCanGoBack: () => false }));
vi.mock("@/lib/permissions", () => ({
  hasAnyPermission: () => false,
  hasPermission: () => false,
  useIsManager: () => false,
  usePermissions: () => ({ permissions: new Set(), can: () => false }),
}));
vi.mock("@/lib/store/features", () => ({
  useFeatures: () => ({
    projects: state.projectsOn,
    earlyPay: false,
    earnedWage: null,
    loading: false,
  }),
}));
vi.mock("@/lib/store/ai", () => ({
  useAssistantAvailable: () => ({ available: false }),
}));
vi.mock("@/lib/store/notifications", () => ({ useUnreadCount: () => 0 }));
vi.mock("@/lib/store/approvals-api", () => ({
  useApprovalQueue: () => ({ items: [], rows: [], loading: false }),
}));
vi.mock("@/lib/store/leave-api", () => ({
  useLeaveRequests: () => ({ requests: [], rows: [], loading: false }),
}));
vi.mock("@/lib/store/attendance", () => ({
  useAttendanceRoster: () => ({ status: "idle", rows: [] }),
}));
vi.mock("@/lib/hiring/access/collaborator", () => ({
  useIsCollaborator: () => false,
}));
vi.mock("@/lib/hiring/pipeline/use-mine", () => ({
  useHaveInterviews: () => false,
}));
vi.mock("@/lib/store/team-tasks", () => ({
  useLeadsTeam: (enabled: boolean) => {
    state.asked.push(enabled);
    return enabled && state.leads;
  },
}));
vi.mock("@/lib/store/one-on-ones", () => ({ useAmIInAOneOnOne: () => false }));
vi.mock("@/lib/store/signatures", () => ({
  useHaveIAnySignatures: () => false,
}));
vi.mock("@/app/(app)/approvals/inbox", () => ({ APPROVE_PERMISSIONS: [] }));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({
    employeeId: "e-1",
    displayName: "Ada",
    employee: null,
    user: null,
    mode: "api",
    signOut: vi.fn(),
    isConnected: true,
  }),
}));
vi.mock("@/lib/store/company", () => ({ useCompanyLogo: () => null }));
vi.mock("@/lib/billing", () => ({
  useBilling: () => null,
  moduleLocked: () => false,
}));
vi.mock("@/components/portal/collaborator-gate", () => ({
  CollaboratorGate: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/portal/command-palette", () => ({
  CommandPalette: () => null,
}));
vi.mock("@/components/portal/tour/guided-tour", () => ({
  GuidedTour: () => null,
  openTour: () => {},
}));
vi.mock("@/components/portal/role-badge", () => ({
  SessionRoleBadge: () => null,
}));
vi.mock("@/components/portal/holiday-banner", () => ({
  HolidayBanner: () => null,
}));
vi.mock("@/components/portal/install-prompt", () => ({
  InstallPrompt: () => null,
}));
vi.mock("@/components/portal/verification-banner", () => ({
  VerificationBanner: () => null,
}));
vi.mock("@/components/portal/billing-banner", () => ({
  BillingBanner: () => null,
}));
vi.mock("@/components/portal/billing-gate", () => ({
  BillingGate: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/portal/sidebar", () => ({
  SidebarNav: ({ groups }: { groups: { items: { label: string }[] }[] }) => (
    <ul>
      {groups.flatMap((g) =>
        g.items.map((i) => <li key={i.label}>{i.label}</li>),
      )}
    </ul>
  ),
}));

const { AppShell } = await import("@/components/portal/shell");

beforeEach(() => {
  state.leads = false;
  state.projectsOn = true;
  state.asked = [];
});

describe("the shell's Team tasks wiring", () => {
  it("shows the row when the person leads people", () => {
    state.leads = true;
    render(<AppShell>page</AppShell>);
    expect(screen.getAllByText("Team tasks").length).toBeGreaterThan(0);
  });

  it("hides the row when they lead nobody", () => {
    render(<AppShell>page</AppShell>);
    expect(screen.queryByText("Team tasks")).not.toBeInTheDocument();
    expect(screen.getAllByText("My tasks").length).toBeGreaterThan(0);
  });

  it("asks only while Projects is on", () => {
    state.projectsOn = false;
    state.leads = true;
    render(<AppShell>page</AppShell>);
    expect(state.asked.every((enabled) => enabled === false)).toBe(true);
    expect(screen.queryByText("Team tasks")).not.toBeInTheDocument();
  });
});
