import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ApiGoal } from "@/lib/api/performance";

/**
 * What an objective says about its own state (F12, F13, F14).
 *
 * `status` is a stored column that starts at ON_TRACK, so "On track" beside an
 * objective nothing had been read for, or one that had been declined, was the
 * default dressed as a claim. A declined objective also took a reading and
 * offered "Mark done". And only the latest decline was shown, with no name or
 * date, though the API keeps every one. None of that is a type error.
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
const { shownStatus, takesReadings, noReadingsWords } =
  await import("@/app/(app)/performance/goal-facts");

const STAMP = "2026-10-22T09:00:00.000Z";
const READ = "2026-11-02T09:00:00.000Z";

const goal = (
  keyResults: { lastReadAt?: string | null; currentValue?: string }[],
  over: Partial<ApiGoal> = {},
): ApiGoal =>
  ({
    id: "g-1",
    title: "Grow the team",
    level: "personal",
    status: "ON_TRACK",
    approval: "AGREED",
    approvalLabel: "Agreed",
    approvalNote: null,
    ownerId: "emp-1",
    ownerName: "Chidi Nwosu",
    companyWide: false,
    departmentName: null,
    dueQuarter: "2026-Q4",
    reviewCycleId: "cy-1",
    reviewCycleName: "Q4",
    progress: 0,
    measuredProgress: null,
    targetFrozen: true,
    childCount: 0,
    revisionCount: 0,
    keyResults: keyResults.map((measure, index) => ({
      id: `m-${String(index)}`,
      goalId: "g-1",
      label: `Target ${String(index + 1)}`,
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
  return screen.getByRole("dialog");
};

describe("the status beside an objective (F14)", () => {
  it("is not 'On track' when nothing has been read", () => {
    expect(shownStatus(goal([{ lastReadAt: null }]))).toBeNull();
  });

  it("is not 'On track' for an objective with no target and no progress", () => {
    expect(shownStatus(goal([]))).toBeNull();
  });

  it("is not 'On track' while the objective has not been agreed, even with a reading", () => {
    for (const approval of [
      "DRAFT",
      "AWAITING_APPROVAL",
      "NEEDS_REVISION",
    ] as const) {
      expect(
        shownStatus(
          goal([{ lastReadAt: READ, currentValue: "4" }], {
            approval,
            progress: 40,
          }),
        ),
      ).toBeNull();
    }
  });

  it("is 'On track' once it is agreed and something has been read", () => {
    expect(
      shownStatus(
        goal([{ lastReadAt: READ, currentValue: "4" }], { progress: 40 }),
      ),
    ).toBe("ON_TRACK");
  });

  it("is always shown when somebody set it, whatever has been read", () => {
    for (const status of ["AT_RISK", "OFF_TRACK", "DONE"] as const) {
      expect(
        shownStatus(
          goal([{ lastReadAt: null }], { status, approval: "DRAFT" }),
        ),
      ).toBe(status);
    }
  });

  it("is not drawn on the card for an objective nothing has been read for", () => {
    show(goal([{ lastReadAt: null }]));
    expect(screen.queryByText("On track")).not.toBeInTheDocument();
    expect(screen.getByText("Agreed")).toBeInTheDocument();
  });

  it("is drawn on the card once there is a reading", () => {
    show(goal([{ lastReadAt: READ, currentValue: "4" }], { progress: 40 }));
    expect(screen.getByText("On track")).toBeInTheDocument();
  });

  it("is drawn on the card when somebody marked it at risk, with nothing read", () => {
    show(goal([{ lastReadAt: null }], { status: "AT_RISK" }));
    expect(screen.getByText("At risk")).toBeInTheDocument();
  });
});

describe("an objective that was declined takes no readings (F13)", () => {
  const declined = (over: Partial<ApiGoal> = {}) =>
    goal([{ lastReadAt: READ, currentValue: "4" }], {
      approval: "NEEDS_REVISION",
      approvalLabel: "Sent back",
      approvalNote: "Make the target a number.",
      targetFrozen: false,
      progress: 40,
      ...over,
    });

  it("has the rule in one place", () => {
    expect(takesReadings({ approval: "NEEDS_REVISION" })).toBe(false);
    expect(takesReadings({ approval: "REJECTED" })).toBe(false);
    for (const approval of ["DRAFT", "AWAITING_APPROVAL", "AGREED"] as const) {
      expect(takesReadings({ approval })).toBe(true);
    }
    expect(noReadingsWords({ approval: "AGREED" })).toBeNull();
  });

  it("offers no box for a reading, and says why", async () => {
    const dialog = await open(declined());
    expect(
      within(dialog).queryByLabelText(/Latest number for|First reading for/),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByText(/declined, so it takes no readings/),
    ).toBeInTheDocument();
  });

  it("offers no Mark done", async () => {
    const dialog = await open(declined());
    expect(
      within(dialog).queryByRole("button", { name: "Mark done" }),
    ).not.toBeInTheDocument();
  });

  it("is not told 'On track' either", () => {
    show(declined());
    expect(screen.queryByText("On track")).not.toBeInTheDocument();
  });

  it("still takes a reading once it is agreed", async () => {
    const dialog = await open(
      goal([{ lastReadAt: READ, currentValue: "4" }], { progress: 40 }),
    );
    expect(
      within(dialog).getByLabelText(/Latest number for Target 1/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Mark done" }),
    ).toBeInTheDocument();
  });
});

describe("what a declined objective was told (F12)", () => {
  const declines = [
    {
      at: "2026-11-20T10:00:00.000Z",
      byName: "Fatima Bello",
      reason: "First: too vague to measure.",
    },
    {
      at: "2026-11-22T10:00:00.000Z",
      byName: "Amara Nwachukwu",
      reason: "Second: still no number.",
    },
  ];
  const declined = goal([], {
    approval: "NEEDS_REVISION",
    approvalLabel: "Sent back",
    approvalNote: "Second: still no number.",
    targetFrozen: false,
    declines,
  });

  it("names who declined it, and when, on the card", () => {
    show(declined);
    expect(
      screen.getByText("Amara Nwachukwu, 22 Nov 2026"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Second: still no number\./)).toBeInTheDocument();
  });

  it("keeps the earlier decline one press away on the card", async () => {
    const user = userEvent.setup();
    show(declined);
    expect(screen.getByText("1 earlier decline")).toBeInTheDocument();
    await user.click(screen.getByText("1 earlier decline"));
    expect(screen.getByText("Fatima Bello, 20 Nov 2026")).toBeInTheDocument();
    expect(
      screen.getByText(/First: too vague to measure\./),
    ).toBeInTheDocument();
  });

  it("shows every decline, newest first, in the objective's own window", async () => {
    const dialog = await open(declined);
    const text = dialog.textContent ?? "";
    expect(text).toContain("First: too vague to measure.");
    expect(text).toContain("Second: still no number.");
    expect(text.indexOf("Second: still no number.")).toBeLessThan(
      text.indexOf("First: too vague to measure."),
    );
    expect(text).toContain("Fatima Bello, 20 Nov 2026");
  });

  it("says nothing it does not know when the server sends only the note", () => {
    show(
      goal([], {
        approval: "NEEDS_REVISION",
        approvalNote: "Needs a number.",
        targetFrozen: false,
      }),
    );
    expect(screen.getByText(/Needs a number\./)).toBeInTheDocument();
    expect(screen.queryByText(/earlier decline/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Fatima|Amara/)).not.toBeInTheDocument();
  });

  it("says nothing about declines for an objective that was never declined", () => {
    show(goal([{ lastReadAt: READ, currentValue: "4" }], { progress: 40 }));
    expect(screen.queryByText(/earlier decline/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Feedback when it was declined/),
    ).not.toBeInTheDocument();
  });
});
