import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { PersonalTask, PersonalTaskDetail } from "@/lib/api/projects";
import { people } from "./projects-fixture";

/**
 * My tasks: the quick add, the groups, the filters, and the drawer a row opens.
 *
 * The API client is stubbed, so each test says what the API would answer. What is
 * proved is the screen's own handling: Enter adds, "Add details" opens a
 * description, the groups follow the column a task is in, "Set by" is only for a
 * task somebody else put there, and a row opens the same drawer a board issue does.
 */

const mineTasks = vi.fn();
const createMineTask = vi.fn();
const personalTask = vi.fn();
const pushToast = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/projects/mine",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/ui", async (original) => ({
  ...(await original<typeof import("@/components/ui")>()),
  useToast: () => ({ push: pushToast }),
}));

vi.mock("@/lib/api/projects", async (original) => {
  const real = await original<typeof import("@/lib/api/projects")>();
  return {
    ...real,
    projectsApi: {
      ...real.projectsApi,
      mineTasks: (...a: unknown[]) => mineTasks(...a),
      createMineTask: (...a: unknown[]) => createMineTask(...a),
      personalTask: (...a: unknown[]) => personalTask(...a),
      links: vi.fn().mockResolvedValue([]),
    },
  };
});

let gate = { enabled: true, loading: false };
vi.mock("@/lib/store/project-session", () => ({
  useProjectsGate: () => gate,
  usePeople: () => people,
  useProjectActor: () => ({
    employeeId: "p-01",
    editRecords: false,
    leadsPeople: false,
    headsDepartment: false,
  }),
}));
vi.mock("@/lib/store/projects", () => ({
  useIssueThread: () => ({
    thread: { comments: [], activity: [] },
    status: "ready",
    reload: vi.fn(),
  }),
}));
vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
  useSession: () => ({ isConnected: true }),
}));
vi.mock("@/lib/permissions", () => ({
  useCan: () => false,
  usePermissions: () => ({ can: () => false }),
}));
vi.mock("@/lib/time", async (original) => ({
  ...(await original<typeof import("@/lib/time")>()),
  todayIn: () => "2026-10-21",
}));

const { MyTasksScreen } =
  await import("@/app/(app)/projects/mine/my-tasks-screen");

const STATUSES = [
  {
    id: "s-todo",
    name: "To do",
    category: "TODO",
    wipLimit: null,
    position: 0,
  },
  {
    id: "s-doing",
    name: "In progress",
    category: "IN_PROGRESS",
    wipLimit: null,
    position: 1,
  },
  { id: "s-done", name: "Done", category: "DONE", wipLimit: null, position: 2 },
] as const;

let n = 0;
const task = (over: Partial<PersonalTask> = {}): PersonalTask => {
  n += 1;
  const category = over.statusCategory ?? "TODO";
  const status = STATUSES.find((s) => s.category === category)!;
  return {
    id: `t-${n}`,
    projectId: "p-mine",
    number: n,
    key: `MY-${n}`,
    type: "TASK",
    title: `Task ${n}`,
    description: "",
    statusId: status.id,
    priority: "MEDIUM",
    assigneeId: "p-01",
    reporterId: "p-01",
    epicId: null,
    parentId: null,
    sprintId: null,
    points: null,
    labels: [],
    startDate: null,
    dueDate: null,
    rank: n,
    doneAt: null,
    goalId: null,
    weeklyTask: null,
    commentCount: 0,
    createdAt: "2026-10-15T09:00:00.000Z",
    updatedAt: "2026-10-15T09:00:00.000Z",
    statusName: status.name,
    statusCategory: category,
    setBy: null,
    ...over,
  };
};

function answer(open: PersonalTask[], done: PersonalTask[] = []) {
  mineTasks.mockImplementation((state: string) =>
    Promise.resolve(state === "done" ? done : open),
  );
}

beforeEach(() => {
  n = 0;
  gate = { enabled: true, loading: false };
  mineTasks.mockReset();
  createMineTask.mockReset();
  personalTask.mockReset();
  pushToast.mockClear();
  answer([]);
  createMineTask.mockResolvedValue(task());
});

describe("the list", () => {
  it("groups open tasks into To do and In progress, and closes Done this week", async () => {
    answer(
      [
        task({ title: "Send the contract" }),
        task({ title: "Book the room", statusCategory: "IN_PROGRESS" }),
      ],
      [
        task({
          title: "File the report",
          statusCategory: "DONE",
          doneAt: "2026-10-20T10:00:00.000Z",
        }),
        task({
          title: "Old thing",
          statusCategory: "DONE",
          doneAt: "2026-10-01T10:00:00.000Z",
        }),
      ],
    );
    render(<MyTasksScreen />);
    const todo = await screen.findByRole("region", { name: "To do" });
    expect(within(todo).getByText("Send the contract")).toBeInTheDocument();
    const doing = screen.getByRole("region", { name: "In progress" });
    expect(within(doing).getByText("Book the room")).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: /Done this week/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("File the report")).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.getByText("File the report")).toBeInTheDocument();
    expect(screen.queryByText("Old thing")).not.toBeInTheDocument();
  });

  it("leaves sub-tasks out of the groups", async () => {
    answer([
      task({ title: "Parent" }),
      task({ title: "Child", parentId: "t-1" }),
    ]);
    render(<MyTasksScreen />);
    expect(await screen.findByText("Parent")).toBeInTheDocument();
    expect(screen.queryByText("Child")).not.toBeInTheDocument();
  });

  it("says Set by only when somebody else put the task there", async () => {
    answer([
      task({ title: "Mine" }),
      task({
        title: "Given",
        setBy: { id: "p-03", name: "Chidi Nwosu" },
      }),
    ]);
    render(<MyTasksScreen />);
    await screen.findByText("Given");
    expect(screen.getAllByText(/Set by/)).toHaveLength(1);
    expect(screen.getByText("Set by Chidi Nwosu")).toBeInTheDocument();
  });

  it("shows the due date, or No date, and Overdue for a past one", async () => {
    answer([
      task({ title: "Late", dueDate: "2026-10-19" }),
      task({ title: "Undated" }),
    ]);
    render(<MyTasksScreen />);
    await screen.findByText("Late");
    /* The filter is also called Overdue: the badge is the one that is not a radio. */
    expect(screen.getAllByText("Overdue")).toHaveLength(2);
    expect(screen.getByText("No date")).toBeInTheDocument();
  });

  it("Done shows everything finished, Overdue only what is late", async () => {
    answer(
      [
        task({ title: "Late", dueDate: "2026-10-19" }),
        task({ title: "On time", dueDate: "2026-10-30" }),
      ],
      [
        task({
          title: "Long ago",
          statusCategory: "DONE",
          doneAt: "2026-09-01T10:00:00.000Z",
        }),
      ],
    );
    render(<MyTasksScreen />);
    await screen.findByText("Late");

    await userEvent.click(screen.getByRole("radio", { name: "Overdue" }));
    expect(screen.getByText("Late")).toBeInTheDocument();
    expect(screen.queryByText("On time")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Done" }));
    expect(screen.getByText("Long ago")).toBeInTheDocument();
    expect(screen.queryByText("Late")).not.toBeInTheDocument();
  });

  it("says so when there is nothing on the list", async () => {
    render(<MyTasksScreen />);
    expect(await screen.findByText("Nothing on your list")).toBeInTheDocument();
    expect(
      screen.getByText("Add the first thing you need to do above."),
    ).toBeInTheDocument();
  });

  it("says what happened when the list cannot be read, and offers a retry", async () => {
    mineTasks.mockRejectedValue(new ApiError(500, "internal", "boom"));
    render(<MyTasksScreen />);
    expect(
      await screen.findByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Nothing on your list")).not.toBeInTheDocument();
  });

  it("says Projects is off when the module is", async () => {
    gate = { enabled: false, loading: false };
    render(<MyTasksScreen />);
    expect(screen.getByText("Projects is not switched on")).toBeInTheDocument();
  });
});

describe("quick add", () => {
  it("adds on Enter with just a title, then clears and reloads", async () => {
    render(<MyTasksScreen />);
    await screen.findByText("Nothing on your list");
    const box = screen.getByRole("textbox", { name: "What needs doing?" });
    await userEvent.type(box, "Call the bank{Enter}");
    await waitFor(() =>
      expect(createMineTask).toHaveBeenCalledWith({ title: "Call the bank" }),
    );
    expect(pushToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Task added" }),
    );
    await waitFor(() => expect(box).toHaveValue(""));
    expect(mineTasks.mock.calls.length).toBeGreaterThan(2);
  });

  it("sends the due date when one is picked", async () => {
    render(<MyTasksScreen />);
    await screen.findByText("Nothing on your list");
    await userEvent.type(
      screen.getByRole("textbox", { name: "What needs doing?" }),
      "Pay the vendor",
    );
    await userEvent.type(screen.getByLabelText("Due date"), "2026-10-30");
    await userEvent.click(screen.getByRole("button", { name: "Add task" }));
    await waitFor(() =>
      expect(createMineTask).toHaveBeenCalledWith({
        title: "Pay the vendor",
        dueDate: "2026-10-30",
      }),
    );
  });

  it("does not add an empty title", async () => {
    render(<MyTasksScreen />);
    await screen.findByText("Nothing on your list");
    expect(screen.getByRole("button", { name: "Add task" })).toBeDisabled();
    await userEvent.type(
      screen.getByRole("textbox", { name: "What needs doing?" }),
      "   {Enter}",
    );
    expect(createMineTask).not.toHaveBeenCalled();
  });

  it("opens a description box under Add details, and sends it", async () => {
    render(<MyTasksScreen />);
    await screen.findByText("Nothing on your list");
    expect(screen.queryByRole("textbox", { name: "Description" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Add details" }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Description" }),
      "Needs the signed copy",
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "What needs doing?" }),
      "Send contract{Enter}",
    );
    await waitFor(() =>
      expect(createMineTask).toHaveBeenCalledWith({
        title: "Send contract",
        description: "Needs the signed copy",
      }),
    );
  });

  it("keeps what was typed and says why when the API refuses", async () => {
    createMineTask.mockRejectedValue(
      new ApiError(422, "unprocessable", "You have no staff record."),
    );
    render(<MyTasksScreen />);
    await screen.findByText("Nothing on your list");
    const box = screen.getByRole("textbox", { name: "What needs doing?" });
    await userEvent.type(box, "Try this{Enter}");
    await waitFor(() =>
      expect(pushToast).toHaveBeenCalledWith(
        expect.objectContaining({
          tone: "danger",
          detail: "You have no staff record.",
        }),
      ),
    );
    expect(box).toHaveValue("Try this");
  });
});

describe("opening a task", () => {
  const detail = (t: PersonalTask): PersonalTaskDetail => ({
    issue: t,
    statusName: t.statusName,
    statusCategory: t.statusCategory,
    statuses: STATUSES.map((s) => ({ ...s })),
  });

  it("opens the issue drawer, which says Personal and who set it, without a board", async () => {
    const given = task({
      title: "Prepare the budget",
      setBy: { id: "p-03", name: "Chidi Nwosu" },
      reporterId: "p-03",
    });
    answer([given]);
    personalTask.mockResolvedValue(detail(given));
    render(<MyTasksScreen />);
    await userEvent.click(await screen.findByText("Prepare the budget"));

    const drawer = await screen.findByRole("dialog");
    expect(personalTask).toHaveBeenCalledWith(given.id, expect.anything());
    expect(within(drawer).getByText("Personal")).toBeInTheDocument();
    expect(within(drawer).getByText("Set by")).toBeInTheDocument();
    expect(within(drawer).getByText("Chidi Nwosu")).toBeInTheDocument();
    /* The columns of the personal list are the status choices. */
    const status = within(drawer).getByRole("combobox", { name: "Status" });
    expect(
      within(status)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["To do", "In progress", "Done"]);
    expect(within(drawer).queryByLabelText("Epic")).toBeNull();
    expect(within(drawer).queryByRole("link")).toBeNull();
  });

  it("says nothing about who set a task its owner made", async () => {
    const mine = task({ title: "Own task" });
    answer([mine]);
    personalTask.mockResolvedValue(detail(mine));
    render(<MyTasksScreen />);
    await userEvent.click(await screen.findByText("Own task"));
    const drawer = await screen.findByRole("dialog");
    expect(within(drawer).queryByText("Set by")).toBeNull();
  });

  it("changes status with the list's own columns", async () => {
    const mine = task({ title: "Move me" });
    answer([mine]);
    personalTask.mockResolvedValue(detail(mine));
    const { projectsApi } = await import("@/lib/api/projects");
    const update = vi
      .spyOn(projectsApi, "updateIssue")
      .mockResolvedValue({ ...mine, statusId: "s-doing" });
    render(<MyTasksScreen />);
    await userEvent.click(await screen.findByText("Move me"));
    const drawer = await screen.findByRole("dialog");
    await userEvent.selectOptions(
      within(drawer).getByRole("combobox", { name: "Status" }),
      "s-doing",
    );
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(mine.id, { statusId: "s-doing" }),
    );
  });
});
