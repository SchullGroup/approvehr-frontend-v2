import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiGoal } from "@/lib/api/performance";

/**
 * "Your objectives", on the page somebody rates themselves from.
 *
 * They are about to put a number on their own period, so a "0% done" beside an
 * objective whose measures nobody has read is not a harmless default: it is the
 * figure they will mark themselves against. `goal.progress` is a number whether
 * or not anybody measured anything, so `tsc` cannot tell the two apart.
 */

const store = vi.hoisted(() => ({ goals: [] as unknown[] }));

vi.mock("@/lib/store/performance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/performance")>()),
  useKpis: () => ({ goals: store.goals, loading: false }),
  useMyTasks: () => ({ tasks: [], loading: false }),
}));

const { SelfEvidence } = await import("@/app/(app)/performance/self-evidence");

const goal = (
  title: string,
  progress: number,
  keyResults: { lastReadAt?: string | null }[],
): ApiGoal =>
  ({
    id: title,
    title,
    status: "ON_TRACK",
    companyWide: false,
    progress,
    keyResults,
  }) as unknown as ApiGoal;

const show = (...goals: ApiGoal[]) => {
  store.goals = goals;
  render(<SelfEvidence periodStart={null} periodEnd={null} />);
};

beforeEach(() => {
  store.goals = [];
});

describe("an objective in the list somebody rates themselves from", () => {
  it("does not say 0% done when nobody has read any of its measures", () => {
    show(
      goal("Grow the team", 0, [{ lastReadAt: null }, { lastReadAt: null }]),
    );
    expect(screen.getByText("Grow the team")).toBeInTheDocument();
    expect(
      screen.getByText(
        "No reading entered yet, so there is no figure to show.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("0% done")).not.toBeInTheDocument();
  });

  it("shows its figure once a measure has been read", () => {
    show(
      goal("Grow the team", 40, [
        { lastReadAt: "2026-10-22T09:00:00.000Z" },
        { lastReadAt: null },
      ]),
    );
    expect(screen.getByText("40% done")).toBeInTheDocument();
    expect(
      screen.queryByText(/No reading entered yet/),
    ).not.toBeInTheDocument();
  });

  it("shows the figure somebody entered by hand when it has no measures", () => {
    show(goal("Keep the books", 25, []));
    expect(screen.getByText("25% done")).toBeInTheDocument();
  });

  it("makes no claim about readings on a server that does not say", () => {
    show(goal("Grow the team", 0, [{}, {}]));
    expect(screen.getByText("0% done")).toBeInTheDocument();
    expect(
      screen.queryByText(/No reading entered yet/),
    ).not.toBeInTheDocument();
  });
});
