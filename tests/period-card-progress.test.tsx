import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ApiCycle } from "@/lib/api/performance";

/** The period card shows the sectioned bar, the one the Overview shows (owner, 27 Nov 2026). */

const { PeriodCard } = await import("@/app/(app)/performance/periods");

const period = (stage: string): ApiCycle =>
  ({
    id: "c-1",
    name: "H2 2026 review",
    stage,
    periodStart: "2026-07-01",
    periodEnd: "2026-12-31",
    dueDate: "2026-12-15",
  }) as unknown as ApiCycle;

describe("a period card", () => {
  it("draws Progress, the percentage and four sections, with the due date under them", () => {
    render(<PeriodCard period={period("CALIBRATION")} />);
    expect(screen.getByText("Progress")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "H2 2026 review progress" }),
    ).toHaveAttribute("aria-valuenow", "3");
    expect(screen.getByText(/Due/)).toBeInTheDocument();
  });

  it("shows no percentage for a period that has not started", () => {
    render(<PeriodCard period={period("DRAFT")} />);
    expect(screen.queryByText(/%/)).toBeNull();
  });
});
