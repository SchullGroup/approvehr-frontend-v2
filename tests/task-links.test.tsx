import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApiMyTask,
  ApiTask,
  ApiTaskForGrading,
} from "@/lib/api/performance";

/**
 * A link somebody typed into a task, or a reviewer typed into a comment on one,
 * is a link you can click — wherever it is printed.
 *
 * What people write is *"shipped the retry, PR at https://…/412, notes in the
 * doc"*, and the person grading it should not have to select a URL out of a
 * sentence and paste it into a bar. That was fixed once, and the fix reached the
 * phone list and the employee's own weeks but not the desktop grading table,
 * which printed `{task.description}` as plain text — so on a laptop, the one
 * place a manager actually reads a task, the link was dead. A reviewer's comment
 * is the same kind of text and was printed plain in two places.
 *
 * The table and the phone list are both in the document at once and CSS hides
 * one, which jsdom does not apply, so the queries below are scoped to one.
 */

let queue: ApiTaskForGrading[] = [];
let mine: ApiMyTask[] = [];
let logged: ApiTask[] = [];

vi.mock("@/lib/store/performance", () => ({
  useTasksForGrading: () => ({
    tasks: queue,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  useMyTasks: () => ({
    tasks: mine,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  useGoalTasks: () => ({
    tasks: logged,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  useKpis: () => ({ goals: [], loading: false }),
  useTaskActions: () => ({
    editable: true,
    submitTask: vi.fn(),
    gradeTask: vi.fn(),
  }),
}));

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ actingId: "e1", isConnected: true }),
}));

const { ReviewTasksTab } = await import("@/app/(app)/performance/review-tasks");
const { MyTasksPanel } = await import("@/app/(app)/performance/my-tasks");
const { TaskLogPanel } = await import("@/app/(app)/performance/task-log");

const LINK = "https://example.com/pr/412";

beforeEach(() => {
  queue = [];
  mine = [];
  logged = [];
});

describe("the desktop grading table", () => {
  it("makes a link in the middle of a task clickable", () => {
    queue = [
      {
        id: "t1",
        employeeId: "e2",
        employeeName: "Chidi Nwosu",
        goalId: "g1",
        goalTitle: "Ship the ingestion agent",
        description: `Shipped the retry, PR at ${LINK}, notes in the doc`,
        createdAt: "2026-10-08T09:00:00.000Z",
      },
    ];
    render(<ReviewTasksTab />);

    const link = within(screen.getByRole("table")).getByRole("link", {
      name: LINK,
    });
    expect(link).toHaveAttribute("href", LINK);
    /* The comma that ends the clause is the sentence's, not the address's. */
    expect(link).not.toHaveTextContent(",");
  });
});

describe("a reviewer's comment on a grade", () => {
  it("is clickable on the employee's own weeks", () => {
    mine = [
      {
        id: "t1",
        goalId: "g1",
        goalTitle: "Ship the ingestion agent",
        keyResultId: null,
        description: "Wrote the runbook",
        grade: "PARTIALLY_COMPLETED",
        gradeNote: `Add the rollback section, see ${LINK} for the template.`,
        gradedAt: "2026-10-09T09:00:00.000Z",
        weekStart: "2026-10-05T00:00:00.000Z",
        weekEnd: "2026-10-11T00:00:00.000Z",
        createdAt: "2026-10-08T09:00:00.000Z",
      },
    ];
    render(<MyTasksPanel />);

    expect(screen.getByRole("link", { name: LINK })).toHaveAttribute(
      "href",
      LINK,
    );
  });

  it("is clickable in an objective's task log too", () => {
    logged = [
      {
        id: "t1",
        periodId: "p1",
        goalId: "g1",
        keyResultId: null,
        employeeId: "e1",
        description: "Wrote the runbook",
        grade: "REJECTED",
        gradeNote: `Not part of this objective: ${LINK}`,
        gradedById: "u1",
        gradedAt: "2026-10-09T09:00:00.000Z",
        createdAt: "2026-10-08T09:00:00.000Z",
      },
    ];
    render(<TaskLogPanel goalId="g1" keyResults={[]} />);

    expect(screen.getByRole("link", { name: LINK })).toHaveAttribute(
      "href",
      LINK,
    );
  });
});
