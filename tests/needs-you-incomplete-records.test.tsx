import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WIDGET_COMPONENTS } from "@/app/(app)/dashboard/widgets";
import type { PermissionKey } from "@/lib/permission-keys";
import type { DashboardData } from "@/lib/api/insights";

/**
 * U83 (NC-20): the dashboard's Needs you said "4 people cannot be paid yet"
 * when two could not, because the figure counts a missing pension PIN as well
 * as a missing bank account, and the product itself says a missing PIN does not
 * stop pay. "Fix records" then opened the whole staff list.
 *
 * The row now says what the figure counts, and opens the incomplete records.
 */

let held = new Set<PermissionKey>();

vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  useCan: (permission: PermissionKey) => held.has(permission),
}));

function renderNeedsYou(incomplete: number) {
  const Widget = WIDGET_COMPONENTS["needs-you"];
  if (!Widget) throw new Error("No component for needs-you");
  const dashboard: DashboardData = {
    asOf: "2026-11-23T09:00:00.000Z",
    announcements: { notices: [], total: 0 },
    headcount: {
      active: 12,
      startingThisMonth: 0,
      leavingThisMonth: 0,
      incomplete,
    },
    approvals: { waiting: 0, overdue: 0, oldestWaitingDays: null },
  };
  return render(
    <Widget dashboard={dashboard} reports={null} reportsLoading={false} />,
  );
}

beforeEach(() => {
  held = new Set<PermissionKey>(["EDIT_RECORDS"]);
});

describe("records missing a bank account or pension PIN", () => {
  it("does not claim the whole figure cannot be paid", () => {
    renderNeedsYou(4);
    expect(screen.queryByText(/cannot be paid yet/)).toBeNull();
    expect(
      screen.getByText("4 records missing a bank account or pension PIN"),
    ).toBeInTheDocument();
  });

  it("opens the incomplete records, not the whole staff list", () => {
    renderNeedsYou(1);
    expect(
      screen.getByText("1 record missing a bank account or pension PIN"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Fix records" })).toHaveAttribute(
      "href",
      "/people/incomplete",
    );
  });

  it("is not a link somebody cannot open", () => {
    held = new Set<PermissionKey>(["VIEW_SALARIES"]);
    renderNeedsYou(2);
    expect(
      screen.getByText("2 records missing a bank account or pension PIN"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Fix records" })).toBeNull();
  });
});
