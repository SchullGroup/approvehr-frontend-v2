import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PermissionKey } from "@/lib/permission-keys";
import type { LeaveRow } from "@/lib/api/leave";

/**
 * UAT 23 Nov, U64 (SELF-11): an employee's Leave page counted days its own way,
 * disagreed with the balance, and was full of the parts that are about deciding
 * other people's leave: an Approvals inbox button, their own name as a link on
 * every row, a Decision column of dashes, and the refusal reason only behind a
 * click.
 */

const state = vi.hoisted(() => ({
  held: new Set<string>(),
  manager: false,
}));

vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  useCan: (permission: PermissionKey) => state.held.has(permission),
  useIsManager: () => state.manager,
  usePermissions: () => ({
    permissions: state.held,
    loading: false,
    can: (p: PermissionKey) => state.held.has(p),
  }),
}));
vi.mock("@/lib/store/session", async (original) => {
  const actual = await original<typeof import("@/lib/store/session")>();
  return {
    ...actual,
    useSession: () => ({ ...actual.useSession(), employeeId: "emp-chidi" }),
  };
});
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({ action }: { action?: React.ReactNode }) => (
    <header>{action}</header>
  ),
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const declined: LeaveRow = {
  id: "r1",
  employeeId: "emp-chidi",
  employeeName: "Chidi Nwosu",
  employeeJobTitle: null,
  leaveTypeId: "type-annual",
  leaveType: "Annual",
  from: "2027-01-04",
  to: "2027-01-05",
  days: 2,
  status: "declined",
  reason: "Two days after New Year",
  approverId: null,
  approverName: "Adaeze Okonkwo",
  requestedAt: "2026-11-20",
  decidedAt: "2026-11-23",
  decidedById: null,
  decidedByName: "Adaeze Okonkwo",
  decidedByJobTitle: null,
  firstApprovedAt: null,
  firstApprovedByName: null,
  firstApprovedByJobTitle: null,
  decisionNote: "Two people are already off that week.",
  firstApprovalNote: null,
  attachmentCount: 0,
};

vi.mock("@/lib/store/leave-api", async (original) => {
  const actual = await original<typeof import("@/lib/store/leave-api")>();
  return {
    ...actual,
    useLeaveRequests: () => ({
      requests: [declined],
      total: 1,
      loading: false,
      error: null,
      connected: true,
      reload: () => {},
    }),
    useLeaveBalancesFor: () => ({
      of: (id: string) =>
        id === "emp-chidi"
          ? {
              leaveTypeId: "type-annual",
              leaveType: "Annual",
              year: 2026,
              entitled: 20,
              carriedIn: 3,
              taken: 12,
              pending: 1,
              remaining: 8,
            }
          : undefined,
      loading: false,
      connected: true,
      error: null,
      reload: () => {},
    }),
    useLeaveRequestDetail: () => ({ loading: false, detail: null }),
    useLeaveMutations: () => ({
      create: vi.fn(),
      decide: vi.fn(),
      reopen: vi.fn(),
      cancel: vi.fn(),
      connected: true,
    }),
  };
});

const { LeaveScreen } = await import("@/app/(app)/people/leave/leave-screen");

describe("an employee's own Leave page", () => {
  it("leads with the balance: days left, booked, waiting", () => {
    state.held = new Set();
    state.manager = false;
    render(<LeaveScreen />);
    const left = screen.getByText("Days left").parentElement!.parentElement!;
    expect(left).toHaveTextContent("8");
    expect(
      screen.getByText("Booked").parentElement!.parentElement!,
    ).toHaveTextContent("12");
    expect(screen.queryByText("Days taken this year")).toBeNull();
    expect(screen.queryByText("Annual leave used")).toBeNull();
  });

  it("has none of the parts about deciding other people's leave", () => {
    state.held = new Set();
    state.manager = false;
    render(<LeaveScreen />);
    expect(screen.queryByRole("link", { name: "Approvals inbox" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Employee" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Decision" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Chidi Nwosu" })).toBeNull();
  });

  it("says why a request was declined under the row, in the decider's words", () => {
    state.held = new Set();
    state.manager = false;
    render(<LeaveScreen />);
    expect(
      screen.getAllByText("Two people are already off that week.").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Declined").length).toBeGreaterThan(0);
  });

  it("keeps the Approvals inbox for a manager, who decides from there", () => {
    state.held = new Set();
    state.manager = true;
    render(<LeaveScreen />);
    expect(
      screen.getByRole("link", { name: "Approvals inbox" }),
    ).toBeInTheDocument();
  });
});
