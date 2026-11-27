import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiGoal, ApiMyTask } from "@/lib/api/performance";

/**
 * "Your period, as recorded", now that weekly tasks cannot be logged.
 *
 * Logging and grading stopped on 24 November 2026: the work a period counts is
 * the work done in Projects, listed beside this card. So "Nothing logged for
 * this period." was a true sentence that tells nobody anything, and read as
 * though a log were still there to add to; "Not graded yet" promised a grade
 * that is not coming. What was logged earlier is still shown, as what it was.
 */

const store = vi.hoisted(() => ({
  goals: [] as unknown[],
  tasks: [] as unknown[],
}));

vi.mock("@/lib/store/performance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/performance")>()),
  useKpis: () => ({ goals: store.goals, loading: false }),
  useMyTasks: () => ({ tasks: store.tasks, loading: false }),
}));

const { SelfEvidence } = await import("@/app/(app)/performance/self-evidence");

const goal = (title: string): ApiGoal =>
  ({
    id: title,
    title,
    status: "ON_TRACK",
    companyWide: false,
    progress: 40,
    keyResults: [{ lastReadAt: "2026-10-22T09:00:00.000Z" }],
  }) as unknown as ApiGoal;

const logged = (
  id: string,
  grade: ApiMyTask["grade"],
  weekStart = "2026-10-05",
  weekEnd = "2026-10-11",
): ApiMyTask =>
  ({
    id,
    goalId: "g1",
    goalTitle: "Grow the team",
    keyResultId: null,
    description: `Task ${id}`,
    grade,
    gradeNote: null,
    gradedAt: null,
    weekStart,
    weekEnd,
    createdAt: "2026-10-05T09:00:00.000Z",
  }) as ApiMyTask;

const show = (props: Partial<React.ComponentProps<typeof SelfEvidence>> = {}) =>
  render(
    <SelfEvidence periodStart="2026-10-01" periodEnd="2026-12-31" {...props} />,
  );

beforeEach(() => {
  store.goals = [];
  store.tasks = [];
});

describe("a period with nothing logged in it", () => {
  it("draws no tasks section at all, and no sentence about nothing being logged", () => {
    store.goals = [goal("Grow the team")];
    show();
    expect(screen.getByText("Your objectives")).toBeInTheDocument();
    expect(screen.getByText("Grow the team")).toBeInTheDocument();
    expect(screen.queryByText("Tasks you logged")).toBeNull();
    expect(screen.queryByText(/Nothing logged/)).toBeNull();
    expect(screen.queryByText(/logged/i)).toBeNull();
  });

  it("does not count a log kept for another period", () => {
    store.goals = [goal("Grow the team")];
    store.tasks = [logged("t1", null, "2026-03-02", "2026-03-08")];
    show();
    expect(screen.queryByText("Tasks you logged")).toBeNull();
  });

  it("says what it holds when there are no dates: everything on file, not a logged record", () => {
    store.goals = [goal("Grow the team")];
    show({ periodStart: null, periodEnd: null });
    expect(
      screen.getByText(
        "This period carries no dates, so this is everything on file for you.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/logged record/)).toBeNull();
  });

  it("with no objectives either, hands the empty state to the caller and draws nothing of its own", () => {
    const { container } = show({
      whenNothing: <p>THE CALLER WORDS</p>,
    });
    expect(screen.getByText("THE CALLER WORDS")).toBeInTheDocument();
    expect(container.querySelector("section")).toBeNull();
  });

  it("with no objectives and no caller words, draws nothing", () => {
    const { container } = show();
    expect(container).toBeEmptyDOMElement();
  });
});

describe("a period with something logged in it", () => {
  it("shows what was logged, and the two sections side by side", () => {
    store.goals = [goal("Grow the team")];
    store.tasks = [logged("t1", "COMPLETED"), logged("t2", null)];
    const { container } = show();
    expect(screen.getByText("Tasks you logged")).toBeInTheDocument();
    expect(screen.getByText("Logged")).toBeInTheDocument();
    expect(container.querySelector(".sm\\:grid-cols-2")).not.toBeNull();
  });

  it("says Not graded, with no promise of a grade to come", () => {
    store.tasks = [logged("t1", "COMPLETED"), logged("t2", null)];
    show();
    expect(screen.getByText("Not graded")).toBeInTheDocument();
    expect(screen.queryByText("Not graded yet")).toBeNull();
  });

  it("keeps the graded counts, and no noughts when nothing was graded", () => {
    store.tasks = [logged("t1", null), logged("t2", null)];
    show();
    expect(screen.getByText("Logged")).toBeInTheDocument();
    expect(screen.queryByText("Completed")).toBeNull();
    expect(screen.queryByText("Not completed")).toBeNull();
  });

  it("is one column when only the objectives are there", () => {
    store.goals = [goal("Grow the team")];
    const { container } = show();
    expect(container.querySelector(".sm\\:grid-cols-2")).toBeNull();
  });
});
