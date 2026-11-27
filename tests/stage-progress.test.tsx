import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  StageProgress,
  stageShare,
  stagesReached,
} from "@/components/performance/stage-progress";

/**
 * One bar for every place a period appears (owner, 27 Nov 2026): "Progress", the
 * percentage, the line cut into four, one word under each.
 */

describe("how far along", () => {
  it("counts the stages reached, a draft having reached none", () => {
    expect(stagesReached("DRAFT")).toBe(0);
    expect(stagesReached("SELF")).toBe(1);
    expect(stagesReached("MANAGER")).toBe(2);
    expect(stagesReached("CALIBRATION")).toBe(3);
    expect(stagesReached("PUBLISHED")).toBe(4);
  });

  it("is a quarter at a time", () => {
    expect(stageShare("DRAFT")).toBe(0);
    expect(stageShare("MANAGER")).toBe(0.5);
    expect(stageShare("PUBLISHED")).toBe(1);
  });
});

describe("the bar", () => {
  it("says Progress and the percentage once the period has started", () => {
    render(<StageProgress stage="MANAGER" />);
    expect(screen.getByText("Progress")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "2");
    expect(bar).toHaveAttribute("aria-valuemax", "4");
    expect(bar).toHaveAttribute("aria-valuetext", "Manager, stage 2 of 4");
  });

  it("claims no percentage before it starts, and Self is the stage to come", () => {
    render(<StageProgress stage="DRAFT" />);
    expect(screen.queryByText(/%/)).toBeNull();
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "0");
    expect(bar).toHaveAttribute("aria-valuetext", "Not started");
    expect(screen.getByText("Self")).toHaveClass("font-semibold");
    expect(screen.getByText("Manager")).not.toHaveClass("font-semibold");
  });

  it("is full, and at Acknowledged, when the period is published", () => {
    render(<StageProgress stage="PUBLISHED" />);
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("Acknowledged")).toHaveClass("font-semibold");
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuetext",
      "Acknowledged, stage 4 of 4",
    );
  });

  it("names the period for a screen reader", () => {
    render(<StageProgress stage="SELF" label="H2 2026" />);
    expect(
      screen.getByRole("progressbar", { name: "H2 2026 progress" }),
    ).toBeInTheDocument();
  });

  it("has one word for each stage and none of the old two-word labels", () => {
    render(<StageProgress stage="SELF" />);
    for (const word of ["Self", "Manager", "Final", "Acknowledged"]) {
      expect(screen.getByText(word)).toBeInTheDocument();
    }
    expect(screen.queryByText("Scores final")).toBeNull();
    expect(screen.queryByText("Signed off")).toBeNull();
  });
});
