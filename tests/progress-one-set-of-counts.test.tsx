import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiCycle, ApiCycleReport } from "@/lib/api/performance";

/**
 * One set of appraisal progress counts (UAT 23 Nov, U103 / CRAWL-2, PERF-29).
 *
 * The dashboard said "Self 9 of 29" and the period page "9 of 13" for the
 * same self-reviews: the card divided by everybody with any form. The API now
 * sends `progress` on the report, in people out of the people each applies to,
 * and the rail reads it.
 */

const state = vi.hoisted(() => ({ report: null as unknown }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/store/performance", () => ({
  useCycleReport: () => ({ report: state.report, loading: false }),
  useAppraiserMap: () => ({ map: null, loading: false }),
}));

const { PeriodStatus } = await import("@/app/(app)/performance/period-status");

const cycle = {
  id: "c-1",
  name: "H2 2026",
  stage: "SELF",
  dueDate: null,
} as unknown as ApiCycle;

const report = (over: Partial<ApiCycleReport> = {}) =>
  ({
    forms: {
      people: 29,
      selfIn: 9,
      selfOutstanding: 4,
      managerIn: 9,
      managerOutstanding: 4,
    },
    marks: { people: 62, finalised: 3, acknowledged: 1 },
    ...over,
  }) as unknown as ApiCycleReport;

beforeEach(() => {
  state.report = null;
});

describe("the period's progress rail", () => {
  it("reads the API's counts: self-reviews out of people with a self form", () => {
    state.report = report({
      progress: {
        self: { done: 10, of: 13 },
        manager: { done: 9, of: 13 },
        finalised: { done: 4, of: 29 },
        acknowledged: { done: 1, of: 4 },
      },
    });
    render(<PeriodStatus cycle={cycle} canSeeCompany />);
    expect(screen.getByText("10 of 13")).toBeInTheDocument();
    expect(screen.getByText("9 of 13")).toBeInTheDocument();
    expect(screen.getByText("4 of 29")).toBeInTheDocument();
    expect(screen.getByText("1 of 4")).toBeInTheDocument();
    expect(screen.queryByText(/of 62/)).toBeNull();
  });

  it("reads an older API the way it did", () => {
    state.report = report();
    render(<PeriodStatus cycle={cycle} canSeeCompany />);
    expect(screen.getByText("9 of 29")).toBeInTheDocument();
    expect(screen.getByText("3 of 62")).toBeInTheDocument();
  });

  it("says what a count of nothing means, never 0 of 0", () => {
    state.report = report({
      progress: {
        self: { done: 0, of: 13 },
        manager: { done: 0, of: 13 },
        finalised: { done: 0, of: 29 },
        acknowledged: { done: 0, of: 0 },
      },
    });
    render(<PeriodStatus cycle={cycle} canSeeCompany />);
    expect(screen.getByText("No score is final yet")).toBeInTheDocument();
    expect(screen.queryByText("0 of 0")).toBeNull();
  });
});
