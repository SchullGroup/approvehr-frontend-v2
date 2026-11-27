import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiCycle } from "@/lib/api/performance";

/**
 * The period card on the Overview for somebody who is not shown figures (owner,
 * 27 Nov 2026): the stages as one bar cut into four, the current one named, and
 * the due date said once. A period that has not started is about to be at Self.
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

const stages = () =>
  within(screen.getByRole("list", { name: "Stages of the period" }));

describe("a reader with no figures", () => {
  it("sees four stages, with Self as the current one while the period has not started", () => {
    render(<PeriodStatus cycle={cycle()} canSeeCompany={false} />);
    const items = stages().getAllByRole("listitem");
    expect(
      items.map((item) => item.textContent?.replace(/ — .*$/, "")),
    ).toEqual(["Self", "Manager", "Scores final", "Signed off"]);
    const current = items.filter(
      (item) => item.getAttribute("aria-current") === "step",
    );
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Self");
  });

  it("moves the current stage on with the period", () => {
    render(
      <PeriodStatus
        cycle={cycle({ stage: "CALIBRATION" })}
        canSeeCompany={false}
      />,
    );
    const current = stages()
      .getAllByRole("listitem")
      .find((item) => item.getAttribute("aria-current") === "step");
    expect(current).toHaveTextContent("Scores final");
  });

  it("is not told 'Now' under a stage name, and sees no 'x of y'", () => {
    render(<PeriodStatus cycle={cycle()} canSeeCompany={false} />);
    expect(screen.queryByText("Now")).toBeNull();
    expect(screen.queryByText(/ of \d+/)).toBeNull();
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
