import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ApiGoal } from "@/lib/api/performance";

/**
 * The face of an objective's card in the cascade.
 *
 * It is what somebody scanning the list reads for "how far along", so it is the
 * one place a 0% that is not a result does the most harm: an objective whose
 * measures nobody has read has no progress to report, and `progress: number` is
 * satisfied by the 0 it was created with. `tsc` cannot see that; this does.
 */

vi.mock("@/lib/store/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/ai")>()),
  useAssistantAvailable: () => ({ available: false, loading: false }),
  useTaskSummarySuggestion: () => ({
    loading: false,
    outcome: null,
    ask: vi.fn(),
    clear: vi.fn(),
  }),
}));

const { GoalCard } = await import("@/app/(app)/performance/kpis");

const STAMP = "2026-10-22T09:00:00.000Z";

const goal = (
  keyResults: { lastReadAt?: string | null }[],
  over: Partial<ApiGoal> = {},
): ApiGoal =>
  ({
    id: "g-1",
    title: "Grow the team",
    level: "personal",
    status: "ON_TRACK",
    approval: "DRAFT",
    approvalLabel: "Draft",
    approvalNote: null,
    ownerId: "emp-1",
    ownerName: "Chidi Nwosu",
    companyWide: false,
    departmentName: null,
    dueQuarter: "2026-Q4",
    reviewCycleId: null,
    reviewCycleName: null,
    progress: 0,
    measuredProgress: null,
    targetFrozen: false,
    childCount: 0,
    revisionCount: 0,
    keyResults: keyResults.map((measure, index) => ({
      id: `m-${String(index)}`,
      goalId: "g-1",
      label: `Measure ${String(index + 1)}`,
      kind: "NUMBER",
      unit: null,
      startValue: "0",
      targetValue: "10",
      currentValue: "0",
      lowerIsBetter: false,
      percent: 0,
      met: false,
      updatedAt: STAMP,
      ...measure,
    })),
    ...over,
  }) as unknown as ApiGoal;

function show(card: ApiGoal) {
  const noop = vi.fn();
  render(
    <GoalCard
      goal={card}
      depth={0}
      editable
      actingId="emp-1"
      onAddMeasure={noop}
      onAddChild={noop}
      onAssign={noop}
      onComplete={noop}
      onStop={noop}
      onEdit={noop}
      onDelete={noop}
      onShare={noop}
      onSubmit={noop}
      onReopen={noop}
      onRecord={vi.fn().mockResolvedValue(undefined)}
    />,
  );
}

const open = async (card: ApiGoal) => {
  const user = userEvent.setup();
  show(card);
  await user.click(
    screen.getByRole("button", { name: new RegExp(card.title) }),
  );
  return within(await screen.findByRole("dialog", { name: card.title }));
};

describe("the window an objective opens into", () => {
  it("labels a bar with nothing read for what it is, and draws no figure beside it", async () => {
    const dialog = await open(goal([{ lastReadAt: null }]));
    expect(dialog.getByText("Progress, nothing read yet")).toBeInTheDocument();
    /* A 0% beside "nothing read yet" would be the claim the label denies. */
    expect(dialog.queryByText("0%")).not.toBeInTheDocument();
    expect(
      dialog.getByText(
        "Its measure has not been read. Nothing is counted yet, so the figure above is not a result.",
      ),
    ).toBeInTheDocument();
  });

  it("says how much of a figure is a reading when some measures are read", async () => {
    const dialog = await open(
      goal(
        [{ lastReadAt: STAMP }, { lastReadAt: null }, { lastReadAt: null }],
        {
          measuredProgress: 40,
          progress: 40,
        },
      ),
    );
    expect(
      dialog.getByText("Progress, from the measures read so far"),
    ).toBeInTheDocument();
    expect(dialog.getByText("40%")).toBeInTheDocument();
    expect(
      dialog.getByText(
        "1 of 3 measures read. The others are left out of the figure above until somebody enters a reading.",
      ),
    ).toBeInTheDocument();
  });

  it("labels it as before, and says nothing more, when every measure is read", async () => {
    const dialog = await open(
      goal([{ lastReadAt: STAMP }, { lastReadAt: STAMP }], {
        measuredProgress: 40,
        progress: 40,
      }),
    );
    expect(dialog.getByText("Progress, from 2 measures")).toBeInTheDocument();
    expect(dialog.queryByText(/measures read\./)).not.toBeInTheDocument();
  });
});

describe("an objective whose measures nobody has read", () => {
  it("does not print the 0% it was made with", () => {
    show(goal([{ lastReadAt: null }, { lastReadAt: null }]));
    expect(screen.getByText("No reading yet")).toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });
});

describe("an objective with some measures read", () => {
  it("keeps its figure and says how much of it is a reading", () => {
    show(
      goal(
        [{ lastReadAt: STAMP }, { lastReadAt: null }, { lastReadAt: null }],
        {
          measuredProgress: 40,
          progress: 40,
        },
      ),
    );
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getByText("1 of 3 read")).toBeInTheDocument();
  });
});

describe("an objective that needs no such line", () => {
  it("says nothing when every measure is read", () => {
    show(
      goal([{ lastReadAt: STAMP }, { lastReadAt: STAMP }], {
        measuredProgress: 40,
        progress: 40,
      }),
    );
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.queryByText(/read$/)).not.toBeInTheDocument();
    expect(screen.queryByText("No reading yet")).not.toBeInTheDocument();
  });

  it("shows the figure somebody entered by hand when it has no measures", () => {
    show(goal([], { progress: 25 }));
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.queryByText("No reading yet")).not.toBeInTheDocument();
  });

  it("makes no claim about readings on a server that does not say", () => {
    show(goal([{}, {}], { measuredProgress: 0, progress: 0 }));
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.queryByText("No reading yet")).not.toBeInTheDocument();
  });
});
