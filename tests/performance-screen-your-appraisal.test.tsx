import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * An administrator is somebody's employee too (F22). Their page showed the period
 * cards and no way to their own form, though they had one and were counted in "6
 * of 9". "Your appraisal" is drawn for everybody who is appraised.
 */

let can: Record<string, boolean>;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/permissions", () => ({
  useCan: (permission: string) => can[permission] === true,
  useIsManager: () => false,
}));
vi.mock("@/lib/store/performance", () => ({
  useAppraisals: () => ({ cycles: [{ id: "p" }], loading: false, error: null }),
  useScoringWeights: () => ({
    weights: { source: "saved" },
    loading: false,
    reload: vi.fn(),
  }),
}));
vi.mock("@/components/portal/shell", () => ({
  PageHeader: () => null,
  PageBody: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/performance/your-appraisal", () => ({
  YourAppraisal: () => <p>Your appraisal card</p>,
}));
vi.mock("@/app/(app)/performance/now", () => ({
  WhatNeedsYouTab: () => <p>Work list</p>,
}));
vi.mock("@/app/(app)/performance/periods", () => ({
  PeriodsTab: () => <p>Period cards</p>,
}));
vi.mock("@/app/(app)/performance/setup/setup-wizard", () => ({
  SetupWizard: () => null,
}));
vi.mock("@/app/(app)/performance/start-period", () => ({
  StartPeriodButton: () => null,
  StartPeriodDialog: () => null,
}));

const { PerformanceScreen } =
  await import("@/app/(app)/performance/performance-screen");

beforeEach(() => {
  can = {};
});

describe("Your appraisal on the Performance page", () => {
  it("is there for an administrator, under the period cards", () => {
    can = { MANAGE_SETTINGS: true, EDIT_RECORDS: true };
    const { container } = render(<PerformanceScreen />);
    expect(screen.getByText("Your appraisal card")).toBeInTheDocument();
    const text = container.textContent ?? "";
    expect(text.indexOf("Period cards")).toBeLessThan(
      text.indexOf("Your appraisal card"),
    );
  });

  it("is not drawn twice for HR: it is in their work list", () => {
    can = { EDIT_RECORDS: true };
    render(<PerformanceScreen />);
    expect(screen.getAllByText("Work list")).toHaveLength(1);
    expect(screen.queryByText("Your appraisal card")).not.toBeInTheDocument();
  });

  it("is in the work list for everybody else, as before", () => {
    render(<PerformanceScreen />);
    expect(screen.getByText("Work list")).toBeInTheDocument();
  });
});
