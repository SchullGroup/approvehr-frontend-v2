import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ApiComponentScore } from "@/lib/api/performance";

const weights = {
  source: "company",
  rows: [
    {
      component: "OBJECTIVES",
      label: "Delivery against objectives",
      weightBp: 5000,
    },
    { component: "TASKS", label: "Weekly tasks", weightBp: 1000 },
  ],
  totalBp: 10000,
  selfAssessmentNote: null,
};

vi.mock("@/lib/store/performance", () => ({
  useScoringWeights: () => ({
    weights,
    loading: false,
    error: null,
    source: "api",
  }),
  useFramework: () => ({ loading: false, error: null, groups: [] }),
}));

const { breakdownSentence } =
  await import("@/app/(app)/performance/periods/[id]/period-screen");
const { HowItWorksBody } = await import("@/app/(app)/performance/how-it-works");
const { weightsFromNote } = await import("@/lib/api/performance");

const tasks: ApiComponentScore = {
  component: "TASKS",
  label: "Weekly tasks",
  scoreBp: 7500,
  weightBp: 1000,
  effectiveWeightBp: 1000,
  included: true,
  excludedBecause: null,
  excludedNote: null,
  evidenceCount: 4,
};

describe("a Weekly tasks row in a mark's breakdown", () => {
  it("is named by the API's label with its score", () => {
    expect(breakdownSentence([tasks])).toBe("Weekly tasks 75%.");
  });

  it("says why it was left out, in the API's own words", () => {
    const left: ApiComponentScore = {
      ...tasks,
      scoreBp: null,
      included: false,
      excludedBecause: "NO_GRADED_TASKS",
      excludedNote: "No graded weekly tasks against this period's objectives.",
      evidenceCount: 0,
    };
    expect(breakdownSentence([left])).toContain(
      "Weekly tasks: No graded weekly tasks against this period's objectives.",
    );
  });
});

describe("weightsFromNote", () => {
  it("has copy for a draft previewing its own weights", () => {
    expect(weightsFromNote("period")).toBe(
      "Previewed with the weights set for this period.",
    );
  });
});

describe("How it works", () => {
  it("explains Weekly tasks and how they are graded", () => {
    render(<HowItWorksBody />);
    expect(
      screen.getByText(/Weekly tasks count toward the mark/i),
    ).toBeTruthy();
    expect(screen.getByText(/Partly completed counts half/i)).toBeTruthy();
  });
});
