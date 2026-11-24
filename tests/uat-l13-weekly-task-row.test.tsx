import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApiMyTask,
  ApiTaskForGrading,
  ApiTaskGrade,
} from "@/lib/api/performance";

/**
 * Rejecting a weekly task, and the reviewer's comment.
 *
 * A reviewer can mark a task Not done, Partly done, Reject or Done. Partly done
 * and Reject need a reason (3–500 characters, the API's own rule), Done and Not
 * done may carry one, and a task whose week has closed offers nothing. The
 * employee reads the grade and the comment back.
 */

const gradeTask = vi.fn<
  (id: string, grade: ApiTaskGrade, note?: string) => Promise<unknown>
>(() => Promise.resolve({}));
const reload = vi.fn();

let queue: ApiTaskForGrading[] = [];
let mine: ApiMyTask[] = [];

vi.mock("@/lib/store/performance", () => ({
  useTasksForGrading: () => ({
    tasks: queue,
    loading: false,
    error: null,
    reload,
  }),
  useMyTasks: () => ({ tasks: mine, loading: false, error: null, reload }),
  useKpis: () => ({ goals: [], loading: false }),
  GOAL_STATUS_LABEL: {},
  GOAL_STATUS_TONE: {},
  useTaskActions: () => ({
    editable: true,
    submitTask: vi.fn(),
    gradeTask,
  }),
}));

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ actingId: "emp-1", isConnected: true }),
}));

const { ReviewTasksTab } = await import("@/app/(app)/performance/review-tasks");

const forGrading = (
  id: string,
  extra: Partial<ApiTaskForGrading> = {},
): ApiTaskForGrading => ({
  id,
  employeeId: "emp-2",
  employeeName: "Chidi Nwosu",
  goalId: "g-1",
  goalTitle: "Ship the ingestion agent",
  description: `Task ${id}`,
  createdAt: "2026-10-08T09:00:00.000Z",
  ...extra,
});

beforeEach(() => {
  gradeTask.mockClear();
  reload.mockClear();
  queue = [];
  mine = [];
});

/**
 * UAT 23 Nov, L13 (PERF-38): a weekly task waiting for a grade carried four
 * buttons and a link, which ran the row to three lines. In the table it is
 * Done, the common mark, and a menu with the rest. The phone list keeps its
 * buttons, which have the room.
 */
describe("a weekly task in the grading table", () => {
  it("has Done and one menu, not four buttons and a link", () => {
    queue = [forGrading("t-1")];
    render(<ReviewTasksTab />);
    const table = screen.getByRole("table");
    expect(within(table).getByRole("button", { name: "Done" })).toBeVisible();
    for (const name of [
      "Not done",
      "Partly done",
      "Reject",
      "Grade with a comment",
    ]) {
      expect(within(table).queryByRole("button", { name })).toBeNull();
    }
    expect(
      within(table).getByRole("button", { name: "More for Chidi Nwosu" }),
    ).toBeInTheDocument();
  });

  it("lists the other marks in the menu, and Reject still asks why", async () => {
    const user = userEvent.setup();
    queue = [forGrading("t-1")];
    render(<ReviewTasksTab />);
    await user.click(
      within(screen.getByRole("table")).getByRole("button", {
        name: "More for Chidi Nwosu",
      }),
    );
    const items = screen
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    expect(items).toEqual([
      "Not done",
      "Partly done…",
      "Reject…",
      "Grade with a comment…",
    ]);
    await user.click(screen.getByRole("menuitem", { name: "Reject…" }));
    expect(gradeTask).not.toHaveBeenCalled();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
