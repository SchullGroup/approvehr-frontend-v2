import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * One headcount base on Reports (UAT 23 Nov, U95 / PERF-15).
 *
 * The page showed "On the payroll 62", "Employed now 63" and "Employment mix 61
 * people", and nothing said why. The API now counts every list on one base, the
 * people employed on the report's day, and sends it as `headcount.base`; the
 * page leads with that figure and says what it counts once.
 */

const state = vi.hoisted(() => ({ base: undefined as unknown }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/reports",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/permissions", () => ({
  usePermissions: () => ({ can: () => true, loading: false }),
  useCan: () => true,
}));
vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/lib/store/insights", () => ({
  useReports: () => ({
    loading: false,
    error: null,
    reload: vi.fn(),
    data: {
      payrollByDepartment: null,
      grossBreakdown: null,
      headcount: {
        byDepartment: [
          { name: "Finance", count: 40 },
          { name: "Sales", count: 22 },
          { name: "No department", count: 1 },
        ],
        byEmploymentType: [
          { type: "FULL_TIME", count: 60 },
          { type: "CONTRACT", count: 3 },
        ],
        ...(state.base === undefined ? {} : { base: state.base }),
      },
      operationalLoad: {
        leaveRequests: 0,
        ticketsOpen: 0,
        approvalsPending: 0,
        attendanceCorrections: 0,
      },
      workforce: {
        trend: [],
        headcountNow: 63,
        turnoverBp: null,
        turnoverWindowMonths: 12,
        averageTenureMonths: null,
      },
    },
  }),
}));

const { ReportsScreen } = await import("@/app/(app)/reports/reports-screen");

beforeEach(() => {
  state.base = undefined;
});

describe("the headcount on Reports", () => {
  it("leads with the API's one figure and its day, and says what it counts", () => {
    state.base = {
      asOf: "2026-11-30",
      total: 63,
      rule: "Employed on this day: started by then, not left by then, not archived.",
    };
    render(<ReportsScreen />);
    expect(screen.getByText("Employed")).toBeInTheDocument();
    expect(screen.getByText("On 30 Nov 2026")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Every headcount on this page counts the same 63 people\. Employed on this day: started by then, not left by then, not archived\./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("On the payroll")).toBeNull();
  });

  it("reads an older API without a base by adding up the departments, with no footnote", () => {
    render(<ReportsScreen />);
    expect(screen.getByText("Employed")).toBeInTheDocument();
    expect(screen.queryByText(/Every headcount on this page/)).toBeNull();
  });
});
