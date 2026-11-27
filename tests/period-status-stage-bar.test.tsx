import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiCycle } from "@/lib/api/performance";

/**
 * The period card on the Overview for somebody who is not shown figures (owner,
 * 27 Nov 2026): the stages as one bar cut into four with one word each, the
 * current one named, and the due date said once. A period that has not started
 * is about to be at Self.
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

const cycle = (over: Partial<ApiCycle> = {}) =>
  ({
    id: "c-1",
    name: "H2 2026 appraisal",
    stage: "DRAFT",
    dueDate: "2026-12-15",
    ...over,
  }) as unknown as ApiCycle;

beforeEach(() => {
  state.report = null;
});

describe("a reader with no figures", () => {
  it("sees the four stages as one word each, and the period is not started", () => {
    render(<PeriodStatus cycle={cycle()} canSeeCompany={false} />);
    for (const word of ["Self", "Manager", "Final", "Acknowledged"]) {
      expect(screen.getByText(word)).toBeInTheDocument();
    }
    expect(screen.queryByText("Scores final")).toBeNull();
    expect(screen.queryByText("Signed off")).toBeNull();
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "0");
    expect(bar).toHaveAttribute("aria-valuetext", "Not started");
  });

  it("moves the bar on with the period", () => {
    render(
      <PeriodStatus
        cycle={cycle({ stage: "CALIBRATION" })}
        canSeeCompany={false}
      />,
    );
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "3");
    expect(bar).toHaveAttribute("aria-valuetext", "Final, stage 3 of 4");
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("sees no 'Now' under a stage name, and no 'x of y'", () => {
    render(<PeriodStatus cycle={cycle()} canSeeCompany={false} />);
    expect(screen.queryByText("Now")).toBeNull();
    expect(screen.queryByText(/ of \d+/)).toBeNull();
  });
});

describe("a reader with the company's figures", () => {
  it("keeps the rail with its counts, under the same one-word labels", () => {
    state.report = {
      forms: {
        people: 4,
        selfIn: 1,
        selfOutstanding: 3,
        managerIn: 0,
        managerOutstanding: 4,
      },
      marks: { people: 4, finalised: 0, acknowledged: 0 },
    };
    render(<PeriodStatus cycle={cycle({ stage: "SELF" })} canSeeCompany />);
    expect(screen.getByText("Final")).toBeInTheDocument();
    expect(screen.getByText("Acknowledged")).toBeInTheDocument();
    expect(screen.getByText("1 of 4")).toBeInTheDocument();
    expect(
      screen.queryByRole("progressbar", { name: /H2 2026 appraisal progress/ }),
    ).toBeNull();
  });
});

describe("the due date", () => {
  it("is said under the stages by default", () => {
    render(<PeriodStatus cycle={cycle()} canSeeCompany={false} />);
    expect(screen.getByText(/Answers due/)).toBeInTheDocument();
  });

  it("is left out when the card above already says it", () => {
    render(
      <PeriodStatus cycle={cycle()} canSeeCompany={false} showDue={false} />,
    );
    expect(screen.queryByText(/Answers due/)).toBeNull();
  });
});
