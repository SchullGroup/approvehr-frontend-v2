import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskGradeDialog } from "@/app/(app)/performance/task-grade-dialog";
import type {
  ApiMyTask,
  ApiTaskForGrading,
  ApiTaskGrade,
} from "@/lib/api/performance";
import {
  GRADE_NOTE_MAX,
  TASK_GRADE_LABEL,
  TASK_GRADE_TONE,
  gradeNeedsNote,
  gradeNoteProblem,
} from "@/lib/performance/task-grade";

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
const { MyTasksPanel } = await import("@/app/(app)/performance/my-tasks");
const { SelfEvidence } = await import("@/app/(app)/performance/self-evidence");

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

const myTask = (id: string, extra: Partial<ApiMyTask> = {}): ApiMyTask => ({
  id,
  goalId: "g-1",
  goalTitle: "Ship the ingestion agent",
  keyResultId: null,
  description: `Task ${id}`,
  grade: null,
  gradeNote: null,
  gradedAt: null,
  weekStart: "2026-10-05T00:00:00.000Z",
  weekEnd: "2026-10-11T00:00:00.000Z",
  createdAt: "2026-10-08T09:00:00.000Z",
  ...extra,
});

beforeEach(() => {
  gradeTask.mockClear();
  gradeTask.mockImplementation(() => Promise.resolve({}));
  reload.mockClear();
  queue = [];
  mine = [];
});

describe("the grade and comment rules", () => {
  it("names the new grade, and shows it as a refusal", () => {
    expect(TASK_GRADE_LABEL.REJECTED).toBe("Rejected");
    expect(TASK_GRADE_TONE.REJECTED).toBe("danger");
  });

  it("asks for a reason on Partly done and Reject only", () => {
    expect(gradeNeedsNote("PARTIALLY_COMPLETED")).toBe(true);
    expect(gradeNeedsNote("REJECTED")).toBe(true);
    expect(gradeNeedsNote("COMPLETED")).toBe(false);
    expect(gradeNeedsNote("NOT_COMPLETED")).toBe(false);
  });

  it("counts the trimmed comment, three characters at least", () => {
    expect(gradeNoteProblem("REJECTED", "")).not.toBeNull();
    expect(gradeNoteProblem("REJECTED", "   ")).not.toBeNull();
    expect(gradeNoteProblem("REJECTED", "no")).not.toBeNull();
    expect(gradeNoteProblem("REJECTED", "  no ")).not.toBeNull();
    expect(gradeNoteProblem("REJECTED", "nah")).toBeNull();
    expect(gradeNoteProblem("PARTIALLY_COMPLETED", "half")).toBeNull();
  });

  it("lets Done and Not done go with no comment at all", () => {
    expect(gradeNoteProblem("COMPLETED", "")).toBeNull();
    expect(gradeNoteProblem("NOT_COMPLETED", "  ")).toBeNull();
    expect(gradeNoteProblem("COMPLETED", "Nice")).toBeNull();
  });

  it("refuses a comment over 500 characters on any grade", () => {
    expect(
      gradeNoteProblem("COMPLETED", "x".repeat(GRADE_NOTE_MAX)),
    ).toBeNull();
    expect(
      gradeNoteProblem("COMPLETED", "x".repeat(GRADE_NOTE_MAX + 1)),
    ).not.toBeNull();
    expect(
      gradeNoteProblem("REJECTED", "x".repeat(GRADE_NOTE_MAX + 1)),
    ).not.toBeNull();
  });
});

describe("the comment dialog", () => {
  const task = {
    id: "t-1",
    employeeName: "Chidi Nwosu",
    description: "Fixed a typo in the readme.",
  };

  it("will not reject without a reason, and sends it trimmed", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(() => Promise.resolve());
    render(
      <TaskGradeDialog
        request={{ task, grade: "REJECTED" }}
        open
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );

    const reject = screen.getByRole("button", { name: "Reject task" });
    expect(reject).toBeDisabled();

    await user.type(screen.getByRole("textbox"), "no");
    expect(reject).toBeDisabled();

    await user.type(screen.getByRole("textbox"), "t this objective  ");
    expect(reject).toBeEnabled();

    await user.click(reject);
    expect(onConfirm).toHaveBeenCalledWith("REJECTED", "not this objective");
  });

  it("asks for the grade first when the reviewer chose to add a comment", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(() => Promise.resolve());
    render(
      <TaskGradeDialog
        request={{ task, grade: null }}
        open
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );

    const save = screen.getByRole("button", { name: "Save grade" });
    expect(save).toBeDisabled();

    /* Done needs no comment, so picking it is enough. */
    await user.selectOptions(screen.getByRole("combobox"), "Done");
    expect(save).toBeEnabled();

    /* Partly done does. */
    await user.selectOptions(screen.getByRole("combobox"), "Partly done");
    expect(save).toBeDisabled();
    await user.type(screen.getByRole("textbox"), "Tests missing");
    expect(save).toBeEnabled();

    await user.click(save);
    expect(onConfirm).toHaveBeenCalledWith(
      "PARTIALLY_COMPLETED",
      "Tests missing",
    );
  });

  it("keeps a half-written comment from turning up on the next task", async () => {
    const user = userEvent.setup();
    const props = { onClose: () => {}, onConfirm: () => Promise.resolve() };
    const view = render(
      <TaskGradeDialog request={{ task, grade: "REJECTED" }} open {...props} />,
    );
    await user.type(screen.getByRole("textbox"), "Half a thought");
    expect(screen.getByRole("textbox")).toHaveValue("Half a thought");

    view.rerender(<TaskGradeDialog request={null} open={false} {...props} />);
    view.rerender(
      <TaskGradeDialog
        request={{
          task: { ...task, id: "t-2", description: "A different task." },
          grade: "REJECTED",
        }}
        open
        {...props}
      />,
    );
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.getByText("A different task.")).toBeInTheDocument();
  });

  it("shows why it failed and stays open", async () => {
    const user = userEvent.setup();
    const { ApiError } = await import("@/lib/api/client");
    const onConfirm = vi.fn(() =>
      Promise.reject(new ApiError(409, "conflict", "That week has closed.")),
    );
    render(
      <TaskGradeDialog
        request={{ task, grade: "PARTIALLY_COMPLETED" }}
        open
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    await user.type(screen.getByRole("textbox"), "Half of it");
    await user.click(screen.getByRole("button", { name: "Mark partly done" }));
    expect(
      await screen.findByText("That week has closed."),
    ).toBeInTheDocument();
  });
});

describe("the reviewer's queue", () => {
  it("offers Not done, Partly done, Reject and Done, and a way to comment", () => {
    queue = [forGrading("t-1")];
    render(<ReviewTasksTab />);

    // Desktop table and mobile list both render in jsdom.
    for (const name of ["Not done", "Partly done", "Reject", "Done"]) {
      expect(screen.getAllByRole("button", { name }).length).toBeGreaterThan(0);
    }
    expect(
      screen.getAllByRole("button", { name: "Grade with a comment" }).length,
    ).toBeGreaterThan(0);
  });

  it("grades Done at once, with no comment", async () => {
    const user = userEvent.setup();
    queue = [forGrading("t-1")];
    render(<ReviewTasksTab />);

    await user.click(screen.getAllByRole("button", { name: "Done" })[0]!);
    await waitFor(() => expect(gradeTask).toHaveBeenCalledTimes(1));
    expect(gradeTask).toHaveBeenCalledWith("t-1", "COMPLETED", undefined);
  });

  it("opens the reason dialog for Reject, and grades only once it has one", async () => {
    const user = userEvent.setup();
    queue = [forGrading("t-1")];
    render(<ReviewTasksTab />);

    await user.click(screen.getAllByRole("button", { name: "Reject" })[0]!);
    expect(gradeTask).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Reject task" });
    expect(confirm).toBeDisabled();

    await user.type(
      within(dialog).getByRole("textbox"),
      "Not part of this objective.",
    );
    await user.click(confirm);

    await waitFor(() => expect(gradeTask).toHaveBeenCalledTimes(1));
    expect(gradeTask).toHaveBeenCalledWith(
      "t-1",
      "REJECTED",
      "Not part of this objective.",
    );
    expect(reload).toHaveBeenCalled();
  });

  it("says Week closed and offers no marks for a closed week", () => {
    queue = [forGrading("t-1", { weekClosed: true })];
    render(<ReviewTasksTab />);

    expect(screen.getAllByText("Week closed").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Grade with a comment" }),
    ).toBeNull();
  });

  it("treats an API with no weekClosed field as open", () => {
    queue = [forGrading("t-1")];
    render(<ReviewTasksTab />);
    expect(screen.queryByText("Week closed")).toBeNull();
  });
});

describe("what the employee reads back", () => {
  it("shows Rejected and the comment", () => {
    mine = [
      myTask("t-1", {
        grade: "REJECTED",
        gradeNote: "Not part of this objective.",
        gradedAt: "2026-10-09T09:00:00.000Z",
      }),
    ];
    render(<MyTasksPanel />);

    expect(screen.getByText("Rejected")).toBeInTheDocument();
    expect(
      screen.getByText(/Not part of this objective\./),
    ).toBeInTheDocument();
    expect(screen.getByText("Comment:")).toBeInTheDocument();
  });

  it("shows no comment line when there is none", () => {
    mine = [myTask("t-1", { grade: "COMPLETED", gradedAt: "2026-10-09" })];
    render(<MyTasksPanel />);
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.queryByText("Comment:")).toBeNull();
  });
});

describe("a self-review's weekly task evidence", () => {
  it("counts a rejected task as graded, and as not done", () => {
    mine = [
      myTask("a", { grade: "COMPLETED", gradedAt: "2026-10-09" }),
      myTask("b", { grade: "REJECTED", gradedAt: "2026-10-09" }),
      myTask("c"),
    ];
    render(<SelfEvidence periodStart={null} periodEnd={null} />);

    expect(screen.getByText("Rejected")).toBeInTheDocument();
    /* One of two graded tasks was done: the rejected one is in the
       denominator, and the ungraded one is not. */
    expect(screen.getByText(/of 2 graded/)).toBeInTheDocument();
    expect(screen.getByText("Not graded yet")).toBeInTheDocument();
  });

  it("shows no Rejected line when nothing was rejected", () => {
    mine = [myTask("a", { grade: "COMPLETED", gradedAt: "2026-10-09" })];
    render(<SelfEvidence periodStart={null} periodEnd={null} />);
    expect(screen.queryByText("Rejected")).toBeNull();
  });
});
