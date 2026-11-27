import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ApiGoal } from "@/lib/api/performance";

/**
 * An objective in the table with nothing read (owner, 27 Nov 2026): its progress
 * cell is empty. "No reading yet" printed on every such row said one fact over
 * and over. The card's own face still says it (see `goal-card-face.test.tsx`).
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

const goal = (readAt: string | null, progress: number): ApiGoal =>
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
    progress,
    measuredProgress: progress,
    targetFrozen: false,
    childCount: 0,
    revisionCount: 0,
    keyResults: [
      {
        id: "m-0",
        goalId: "g-1",
        label: "Target 1",
        kind: "NUMBER",
        unit: null,
        startValue: "0",
        targetValue: "10",
        currentValue: "0",
        lowerIsBetter: false,
        percent: 0,
        met: false,
        updatedAt: STAMP,
        lastReadAt: readAt,
      },
    ],
  }) as unknown as ApiGoal;

function row(card: ApiGoal) {
  const noop = vi.fn();
  render(
    <table>
      <tbody>
        <GoalCard
          goal={card}
          depth={0}
          asRow
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
        />
      </tbody>
    </table>,
  );
}

describe("an objective in the table", () => {
  it("with nothing read has an empty progress cell, not the words", () => {
    row(goal(null, 0));
    expect(screen.getByText("Grow the team")).toBeInTheDocument();
    expect(screen.queryByText("No reading yet")).not.toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("with a reading shows its figure", () => {
    row(goal(STAMP, 40));
    expect(screen.getByText("40%")).toBeInTheDocument();
  });
});
