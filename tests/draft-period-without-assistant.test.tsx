import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * "Draft a period" with no assistant opens on the form by hand (UAT 23 Nov, L8 /
 * PERF-27). It used to open on a full-page "No assistant is connected" with a
 * button to go and find the form somewhere else.
 */
vi.mock("@/lib/permissions", () => ({ useCan: () => true }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/lib/store/ai", () => ({
  useAssistantAvailable: () => ({
    loading: false,
    available: false,
    reason: "No assistant is set up for this company.",
  }),
  usePeriodGoalDraft: () => ({
    loading: false,
    error: null,
    outcome: null,
    ask: vi.fn(),
  }),
  usePeriodQuestionDraft: () => ({
    loading: false,
    error: null,
    outcome: null,
    ask: vi.fn(),
  }),
}));
vi.mock("@/lib/store/performance", () => ({
  useScoringWeights: () => ({ weights: null, loading: false, error: null }),
  useCycleMutations: () => ({}),
  useKpiMutations: () => ({}),
}));
vi.mock("@/app/(app)/performance/start-period", () => ({
  StartPeriodDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Start an appraisal period" /> : null,
}));

const { DraftPeriodWizard } =
  await import("@/app/(app)/performance/periods/new/draft-wizard");

describe("drafting a period with no assistant", () => {
  it("opens the form by hand at once, with one line saying why", () => {
    render(<DraftPeriodWizard />);
    expect(
      screen.getByRole("dialog", { name: "Start an appraisal period" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /No assistant is connected, so the period is set up by hand/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Start one by hand" }),
    ).toBeNull();
  });
});
