import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ApiCycle, ReviewCycleStage } from "@/lib/api/performance";

/**
 * A period's card says which stage it is at (F8, F21).
 *
 * It used to draw "Progress 25%" for a period with nothing sent, "100%" for one
 * published with self-reviews still outstanding, and an empty bar and no label
 * for one that had not started, so a draft looked like an open period. None of
 * that is a type error.
 */

vi.mock("@/lib/store/performance", () => ({
  useAppraisals: () => ({ cycles: [], loading: false }),
}));

const { PeriodCard, stageOf } = await import("@/app/(app)/performance/periods");

const LABEL: Record<ReviewCycleStage, string> = {
  DRAFT: "not started",
  SELF: "self-review",
  MANAGER: "manager review",
  CALIBRATION: "calibration",
  PUBLISHED: "published",
};

const period = (stage: ReviewCycleStage): ApiCycle =>
  ({
    id: "p-1",
    name: "H2 2026 Appraisal",
    stage,
    stageLabel: LABEL[stage],
    dueDate: null,
    periodStart: null,
    periodEnd: null,
  }) as unknown as ApiCycle;

describe("where a period is", () => {
  it("is a step number for a period that has started, and none for a draft", () => {
    expect(stageOf(period("DRAFT")).step).toBeNull();
    expect(stageOf(period("SELF")).step).toBe(1);
    expect(stageOf(period("MANAGER")).step).toBe(2);
    expect(stageOf(period("CALIBRATION")).step).toBe(3);
    expect(stageOf(period("PUBLISHED")).step).toBe(4);
  });

  it("uses the API's own wording, with a capital", () => {
    expect(stageOf(period("MANAGER")).label).toBe("Manager review");
    expect(stageOf(period("DRAFT")).label).toBe("Not started");
  });
});

describe("the card", () => {
  it("says a draft has not started, and draws no steps or percentage", () => {
    render(<PeriodCard period={period("DRAFT")} />);
    expect(screen.getByText("Not started")).toBeInTheDocument();
    expect(screen.queryByText(/Step \d of/)).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("names the stage and its step for a running period", () => {
    render(<PeriodCard period={period("SELF")} />);
    expect(screen.getByText("Self-review")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
  });

  it("never prints a percentage or the word Progress, at any stage", () => {
    for (const stage of Object.keys(LABEL) as ReviewCycleStage[]) {
      const { container, unmount } = render(
        <PeriodCard period={period(stage)} />,
      );
      expect(container.textContent).not.toMatch(/%/);
      expect(container.textContent).not.toMatch(/Progress/);
      unmount();
    }
  });

  it("says a published period is published, not complete", () => {
    render(<PeriodCard period={period("PUBLISHED")} />);
    expect(screen.getByText("Published")).toBeInTheDocument();
    expect(screen.getByText("Step 4 of 4")).toBeInTheDocument();
  });
});
