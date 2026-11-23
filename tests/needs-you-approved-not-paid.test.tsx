import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WIDGET_COMPONENTS } from "@/app/(app)/dashboard/widgets";
import type { PermissionKey } from "@/lib/permission-keys";
import type { DashboardData } from "@/lib/api/insights";

/**
 * The "approved, not yet paid" row on the dashboard's Needs you card.
 *
 * It reads only what the dashboard already receives. A run reaches `PAID`
 * through a completed payment batch and nothing else, so `APPROVED` already
 * means nobody has confirmed the money went out, and it is as true of a company
 * paying from the wallet as of one paying from its own bank. The row is for the
 * people who can approve payroll, because the same permission is what confirms
 * a payment.
 */

let held = new Set<PermissionKey>();

vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  useCan: (permission: PermissionKey) => held.has(permission),
}));

const payroll = (
  over: Partial<NonNullable<DashboardData["payroll"]>> = {},
): NonNullable<DashboardData["payroll"]> => ({
  period: "2026-10",
  status: "APPROVED",
  employeeCount: 42,
  excludedCount: 0,
  grossKobo: 2_000_000_000,
  netKobo: 1_842_000_000,
  blockers: 0,
  warnings: 0,
  ...over,
});

function renderNeedsYou(block: DashboardData["payroll"]) {
  const Widget = WIDGET_COMPONENTS["needs-you"];
  if (!Widget) throw new Error("No component for needs-you");
  const dashboard: DashboardData = {
    asOf: "2026-10-28T09:00:00.000Z",
    announcements: { notices: [], total: 0 },
    headcount: {
      active: 42,
      startingThisMonth: 0,
      leavingThisMonth: 0,
      incomplete: 0,
    },
    approvals: { waiting: 0, overdue: 0, oldestWaitingDays: null },
    ...(block === undefined ? {} : { payroll: block }),
  };
  return render(
    <Widget dashboard={dashboard} reports={null} reportsLoading={false} />,
  );
}

beforeEach(() => {
  held = new Set<PermissionKey>(["APPROVE_PAYROLL"]);
});

describe("an approved payroll nobody has recorded as paid", () => {
  it("is a row with a way to its pay step, for somebody who can approve payroll", () => {
    renderNeedsYou(payroll());

    expect(
      screen.getByText(
        "October 2026 payroll is approved, waiting for payment to go out",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open the payment" }),
    ).toHaveAttribute("href", "/payroll/runs/new?period=2026-10&step=approve");
  });

  it("names a month, not the period key", () => {
    renderNeedsYou(payroll({ period: "2026-11" }));

    expect(
      screen.getByText(/November 2026 payroll is approved/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/2026-11/)).toBeNull();
  });

  it("is not there once the payroll is paid", () => {
    const { container } = renderNeedsYou(payroll({ status: "PAID" }));

    /* Nothing else needs this reader, so the whole card is withheld. */
    expect(container).toBeEmptyDOMElement();
  });

  it("is not there for a payroll that is not approved yet", () => {
    for (const status of ["DRAFT", "IN_REVIEW", "CANCELLED"]) {
      const { container, unmount } = renderNeedsYou(payroll({ status }));
      expect(screen.queryByText(/waiting for payment to go out/)).toBeNull();
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("is not there for somebody who cannot approve payroll", () => {
    held = new Set<PermissionKey>(["VIEW_SALARIES", "RUN_PAYROLL"]);
    const { container } = renderNeedsYou(payroll());

    expect(container).toBeEmptyDOMElement();
  });

  it("is not there when the dashboard has no payroll block, or no run this month", () => {
    for (const block of [undefined, null]) {
      const { container, unmount } = renderNeedsYou(block);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("sits beside the other rows without replacing them", () => {
    const Widget = WIDGET_COMPONENTS["needs-you"];
    if (!Widget) throw new Error("No component for needs-you");
    render(
      <Widget
        dashboard={{
          asOf: "2026-10-28T09:00:00.000Z",
          announcements: { notices: [], total: 0 },
          headcount: {
            active: 42,
            startingThisMonth: 0,
            leavingThisMonth: 0,
            incomplete: 3,
          },
          approvals: { waiting: 2, overdue: 0, oldestWaitingDays: 1 },
          payroll: payroll(),
        }}
        reports={null}
        reportsLoading={false}
      />,
    );

    expect(
      screen.getByText("2 requests waiting for a decision"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/3 records missing a bank account or pension PIN/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/payroll is approved, waiting for payment/),
    ).toBeInTheDocument();
  });
});
