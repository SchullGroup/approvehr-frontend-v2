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
const mineArchive = vi.fn();
const pushToast = vi.fn();
const attachmentUploadUrl = vi.fn();
const recordAttachment = vi.fn();
const putToStorage = vi.fn();
const updateIssue = vi.fn();
const getProject = vi.fn();

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
      mineArchive: (...a: unknown[]) => mineArchive(...a),
      attachmentUploadUrl: (...a: unknown[]) => attachmentUploadUrl(...a),
      recordAttachment: (...a: unknown[]) => recordAttachment(...a),
      links: vi.fn().mockResolvedValue([]),
      updateIssue: (...a: unknown[]) => updateIssue(...a),
      get: (...a: unknown[]) => getProject(...a),
    },
  };
});

vi.mock("@/lib/api/uploads", async (original) => ({
  ...(await original<typeof import("@/lib/api/uploads")>()),
  putToStorage: (...a: unknown[]) => putToStorage(...a),
}));

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
    commentCount: 0,
    createdAt: "2026-10-15T09:00:00.000Z",
    updatedAt: "2026-10-15T09:00:00.000Z",
    statusName: status.name,
    statusCategory: category,
    setBy: null,
    sharedBy: null,
    project: {
      id: "p-mine",
      key: "MY",
      name: "Personal",
      departmentId: null,
      departmentName: null,
      personal: true,
    },
    assignees: [{ id: "p-01", name: "Ada Okafor" }],
    lostAccess: false,
    ...over,
    assigneeIds: over.assigneeIds ?? [over.assigneeId ?? "p-01"],
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
  mineArchive.mockReset();
  pushToast.mockClear();
  updateIssue.mockReset();
  getProject.mockReset();
  localStorage.clear();
  answer([]);
  createMineTask.mockResolvedValue(task());
});

describe("the list", () => {
  it("groups open tasks into To do and In progress, and closes the last 14 days' Done", async () => {
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

    /* The API decides what is Done (the last 14 company days); the screen
       shows every row it sends, with no week cut-off of its own. */
    const toggle = screen.getByRole("button", {
      name: /Done \(last 14 days\)/,
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("File the report")).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.getByText("File the report")).toBeInTheDocument();
    expect(screen.getByText("Old thing")).toBeInTheDocument();
  });

  it("leaves sub-tasks out of the groups", async () => {
    answer([
      task({ id: "t-parent", title: "Parent" }),
      task({ title: "Child", parentId: "t-parent" }),
    ]);
    render(<MyTasksScreen />);
    expect(await screen.findByText("Parent")).toBeInTheDocument();
    expect(screen.queryByText("Child")).not.toBeInTheDocument();
  });

  it("lists a sub-task shared without its parent, saying who shared it", async () => {
    answer([
      task({
        title: "Check the bands",
        parentId: "on-somebody-elses-list",
        sharedBy: { id: "p-09", name: "Emeka Anyanwu" },
      }),
    ]);
    render(<MyTasksScreen />);
    expect(await screen.findByText("Check the bands")).toBeInTheDocument();
    expect(screen.getByText("Shared by Emeka Anyanwu")).toBeInTheDocument();
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
  const detail = (
    t: PersonalTask,
    canEditDetails = true,
  ): PersonalTaskDetail => ({
    issue: t,
    statusName: t.statusName,
    statusCategory: t.statusCategory,
    statuses: STATUSES.map((s) => ({ ...s })),
    canEditDetails,
  });

  it("lets a reader the API allows fix the details, while status stays the owner's", async () => {
    /* p-01 reads a task p-02 owns and p-01 set. */
    const set = task({
      title: "Set for somebody",
      assigneeId: "p-02",
      reporterId: "p-01",
    });
    answer([set]);
    personalTask.mockResolvedValue(detail(set, true));
    render(<MyTasksScreen />);
    await userEvent.click(await screen.findByText("Set for somebody"));
    const drawer = await screen.findByRole("dialog");
    expect(within(drawer).getByLabelText("Summary")).toBeEnabled();
    expect(within(drawer).getByLabelText("Due")).toBeEnabled();
    /* Status is not theirs to change: it is read, not offered as a switched-off box. */
    expect(
      within(drawer).queryByRole("combobox", { name: "Stage" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the details read-only when the API says so", async () => {
    const theirs = task({
      title: "Not mine to fix",
      assigneeId: "p-02",
      reporterId: "p-02",
    });
    answer([theirs]);
    personalTask.mockResolvedValue(detail(theirs, false));
    render(<MyTasksScreen />);
    await userEvent.click(await screen.findByText("Not mine to fix"));
    const drawer = await screen.findByRole("dialog");
    /* Read, not offered: the title is a heading and the date is text, with no
       switched-off editor in their place. */
    expect(within(drawer).queryByLabelText("Summary")).not.toBeInTheDocument();
    expect(
      within(drawer).getByRole("heading", { name: "Not mine to fix" }),
    ).toBeInTheDocument();
    expect(within(drawer).queryByLabelText("Due")).not.toBeInTheDocument();
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
    const status = within(drawer).getByRole("combobox", { name: "Stage" });
    expect(
      within(status)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["To do", "In progress", "Done"]);
    expect(within(drawer).queryByLabelText("Initiative")).toBeNull();
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
      within(drawer).getByRole("combobox", { name: "Stage" }),
      "s-doing",
    );
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(mine.id, { statusId: "s-doing" }),
    );
    update.mockRestore();
  });
});

describe("attaching files while adding", () => {
  const pdf = (name: string) =>
    new File(["x"], name, { type: "application/pdf" });

  beforeEach(() => {
    attachmentUploadUrl.mockReset();
    recordAttachment.mockReset();
    putToStorage.mockReset();
    attachmentUploadUrl.mockImplementation(
      async (_id: string, input: { filename: string }) => ({
        storageKey: `org/issues/t/${input.filename}`,
        url: "https://bucket.test/put",
        headers: {},
        expiresAt: "2026-10-25T10:00:00.000Z",
      }),
    );
    putToStorage.mockResolvedValue(undefined);
    recordAttachment.mockImplementation(
      async (_id: string, ref: { filename: string }) => ({
        id: `a-${ref.filename}`,
        filename: ref.filename,
        contentType: "application/pdf",
        sizeBytes: 1,
        uploadedBy: "p-01",
        createdAt: "2026-10-21T09:00:00.000Z",
      }),
    );
  });

  it("adds the task, then uploads and records each file on it", async () => {
    createMineTask.mockResolvedValue(task({ id: "t-new", key: "MY-7" }));
    render(<MyTasksScreen />);
    const form = await screen.findByRole("form", { name: "Add a task" });
    await userEvent.type(
      within(form).getByRole("textbox", { name: "What needs doing?" }),
      "Send the contract",
    );
    await userEvent.upload(
      within(form).getByLabelText("Attach files", { selector: "input" }),
      [pdf("contract.pdf"), pdf("terms.pdf")],
    );
    expect(within(form).getByText("contract.pdf")).toBeInTheDocument();
    await userEvent.click(
      within(form).getByRole("button", { name: "Add task" }),
    );
    await waitFor(() => expect(recordAttachment).toHaveBeenCalledTimes(2));
    expect(recordAttachment).toHaveBeenCalledWith(
      "t-new",
      expect.objectContaining({ filename: "contract.pdf" }),
    );
    expect(createMineTask.mock.invocationCallOrder[0]!).toBeLessThan(
      attachmentUploadUrl.mock.invocationCallOrder[0]!,
    );
    await waitFor(() =>
      expect(within(form).queryByText("contract.pdf")).toBeNull(),
    );
    expect(pushToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Task added" }),
    );
  });

  it("keeps the task when a file fails, says which, and can try that file again", async () => {
    createMineTask.mockResolvedValue(task({ id: "t-new", key: "MY-7" }));
    putToStorage.mockImplementation(async (file: File) => {
      if (file.name === "terms.pdf") {
        throw new Error(
          "The upload did not finish. Check your connection and try again.",
        );
      }
    });
    render(<MyTasksScreen />);
    const form = await screen.findByRole("form", { name: "Add a task" });
    await userEvent.type(
      within(form).getByRole("textbox", { name: "What needs doing?" }),
      "Send the contract",
    );
    await userEvent.upload(
      within(form).getByLabelText("Attach files", { selector: "input" }),
      [pdf("contract.pdf"), pdf("terms.pdf")],
    );
    await userEvent.click(
      within(form).getByRole("button", { name: "Add task" }),
    );
    expect(
      await within(form).findByText(
        "The upload did not finish. Check your connection and try again.",
      ),
    ).toBeInTheDocument();
    expect(within(form).getByText(/MY-7 was added/)).toBeInTheDocument();
    expect(createMineTask).toHaveBeenCalledTimes(1);

    putToStorage.mockResolvedValue(undefined);
    await userEvent.click(
      within(form).getByRole("button", { name: /Try again/ }),
    );
    await waitFor(() =>
      expect(recordAttachment).toHaveBeenCalledWith(
        "t-new",
        expect.objectContaining({ filename: "terms.pdf" }),
      ),
    );
    expect(createMineTask).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(within(form).queryByText("terms.pdf")).toBeNull(),
    );
  });

  it("keeps the files that failed for each earlier task, not only the last", async () => {
    putToStorage.mockRejectedValue(new Error("The upload was stopped."));
    createMineTask
      .mockResolvedValueOnce(task({ id: "t-a", key: "MY-7" }))
      .mockResolvedValueOnce(task({ id: "t-b", key: "MY-8" }));
    render(<MyTasksScreen />);
    const form = await screen.findByRole("form", { name: "Add a task" });
    for (const [title, name, key] of [
      ["First", "one.pdf", "MY-7"],
      ["Second", "two.pdf", "MY-8"],
    ] as const) {
      await userEvent.type(
        within(form).getByRole("textbox", { name: "What needs doing?" }),
        title,
      );
      await userEvent.upload(
        within(form).getByLabelText("Attach files", { selector: "input" }),
        pdf(name),
      );
      await userEvent.click(
        within(form).getByRole("button", { name: "Add task" }),
      );
      await within(form).findByText(new RegExp(`${key} was added`));
    }
    expect(
      within(
        within(form).getByRole("list", {
          name: "Files that didn't attach to MY-7",
        }),
      ).getByText("one.pdf"),
    ).toBeInTheDocument();
    expect(
      within(
        within(form).getByRole("list", {
          name: "Files that didn't attach to MY-8",
        }),
      ).getByText("two.pdf"),
    ).toBeInTheDocument();
  });

  it("refuses a file over 10 MB before adding anything", async () => {
    render(<MyTasksScreen />);
    const form = await screen.findByRole("form", { name: "Add a task" });
    const big = pdf("huge.pdf");
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    await userEvent.upload(
      within(form).getByLabelText("Attach files", { selector: "input" }),
      big,
    );
    expect(
      within(form).getByText("That file is over 10 MB. Attach a smaller one."),
    ).toBeInTheDocument();
    expect(attachmentUploadUrl).not.toHaveBeenCalled();
  });
});

const board = (over: Partial<PersonalTask> = {}): PersonalTask =>
  task({
    projectId: "p-board",
    key: "PAY-7",
    project: {
      id: "p-board",
      key: "PAY",
      name: "Payroll Q4",
      departmentId: "d-fin",
      departmentName: "Finance",
      personal: false,
    },
    ...over,
  });

describe("tasks from boards", () => {
  it("names the board beside the title and opens it on the board, coming back here", async () => {
    answer([
      board({ id: "b-1", title: "Reconcile November" }),
      task({ title: "Own errand" }),
    ]);
    render(<MyTasksScreen />);
    const link = await screen.findByRole("link", {
      name: /Reconcile November/,
    });
    expect(link).toHaveAttribute("href", "/projects/tasks/b-1?from=my-tasks");
    expect(within(link).getByText("Payroll Q4")).toBeInTheDocument();
    const own = screen.getByRole("button", { name: /Own errand/ });
    expect(within(own).getByText("Personal")).toBeInTheDocument();
  });

  it("shows a finished task from a project I left without a link", async () => {
    answer(
      [],
      [
        board({
          title: "Finished before leaving",
          statusCategory: "DONE",
          doneAt: "2026-10-14T10:00:00.000Z",
          lostAccess: true,
          assignees: [],
        }),
      ],
    );
    render(<MyTasksScreen />);
    await userEvent.click(await screen.findByRole("radio", { name: "Done" }));
    expect(screen.getByText("Finished before leaving")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Finished before leaving/ }),
    ).toBeNull();
    expect(
      screen.getByText("You're no longer on this project"),
    ).toBeInTheDocument();
  });

  it("searches by title or key and filters by the project's department", async () => {
    answer([
      board({ title: "Reconcile November" }),
      board({
        title: "Ship the app",
        key: "MOB-3",
        project: {
          id: "p-mob",
          key: "MOB",
          name: "Mobile",
          departmentId: "d-eng",
          departmentName: "Engineering",
          personal: false,
        },
      }),
      task({ title: "Own errand" }),
    ]);
    render(<MyTasksScreen />);
    await screen.findByText("Ship the app");
    await userEvent.type(
      screen.getByLabelText("Search your tasks by title or key"),
      "mob-3",
    );
    expect(screen.getByText("Ship the app")).toBeInTheDocument();
    expect(screen.queryByText("Reconcile November")).not.toBeInTheDocument();
    await userEvent.clear(
      screen.getByLabelText("Search your tasks by title or key"),
    );
    await userEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    await userEvent.selectOptions(
      screen.getByLabelText("Project department"),
      "No department",
    );
    expect(screen.getByText("Own errand")).toBeInTheDocument();
    expect(screen.queryByText("Ship the app")).not.toBeInTheDocument();
  });
});

describe("the Archive", () => {
  it("lists older finished work with its project, date and people, and loads more", async () => {
    answer([]);
    mineArchive.mockImplementation(({ page }: { page: number }) =>
      Promise.resolve(
        page === 1
          ? {
              rows: [
                board({
                  title: "October close",
                  statusCategory: "DONE",
                  doneAt: "2026-09-20T10:00:00.000Z",
                  assignees: [
                    { id: "p-01", name: "Ada Okafor" },
                    { id: "p-02", name: "Bola Ade" },
                    { id: "p-03", name: "Chidi Eze" },
                  ],
                }),
              ],
              total: 2,
              hasMore: true,
            }
          : {
              rows: [
                task({
                  title: "Old errand",
                  statusCategory: "DONE",
                  doneAt: "2026-09-01T10:00:00.000Z",
                }),
              ],
              total: 2,
              hasMore: false,
            },
      ),
    );
    render(<MyTasksScreen />);
    await userEvent.click(
      await screen.findByRole("radio", { name: "Archive" }),
    );
    expect(await screen.findByText("October close")).toBeInTheDocument();
    expect(screen.getByText("Payroll Q4")).toBeInTheDocument();
    expect(screen.getByText("Ada Okafor, Bola Ade +1")).toBeInTheDocument();
    expect(screen.getByText("2 archived tasks")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Old errand")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(mineArchive).toHaveBeenLastCalledWith({ page: 2, q: "" });
  });

  it("says so when nothing is archived yet", async () => {
    answer([]);
    mineArchive.mockResolvedValue({ rows: [], total: 0, hasMore: false });
    render(<MyTasksScreen />);
    await userEvent.click(
      await screen.findByRole("radio", { name: "Archive" }),
    );
    expect(await screen.findByText("Nothing archived yet")).toBeInTheDocument();
  });

  it("keeps what loaded when Load more fails, and offers to try again", async () => {
    answer([]);
    mineArchive
      .mockResolvedValueOnce({
        rows: [task({ title: "First page", statusCategory: "DONE" })],
        total: 2,
        hasMore: true,
      })
      .mockRejectedValueOnce(new Error("offline"));
    render(<MyTasksScreen />);
    await userEvent.click(
      await screen.findByRole("radio", { name: "Archive" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Load more" }),
    );
    expect(await screen.findByText(/Couldn't load more/)).toBeInTheDocument();
    expect(screen.getByText("First page")).toBeInTheDocument();
  });
});

describe("the board", () => {
  const detail = (issue: PersonalTask): PersonalTaskDetail => ({
    issue,
    statusName: issue.statusName,
    statusCategory: issue.statusCategory,
    statuses: [...STATUSES],
    canEditDetails: true,
  });
  const boardTask = (over: Partial<PersonalTask> = {}) =>
    task({
      projectId: "p-web",
      key: "WEB-4",
      title: "Ship the page",
      project: {
        id: "p-web",
        key: "WEB",
        name: "Website",
        departmentId: null,
        departmentName: null,
        personal: false,
      },
      ...over,
    });

  it("shows To do, In progress and Done as columns, and remembers the choice", async () => {
    answer(
      [
        task({ title: "Send the contract" }),
        task({
          title: "Check the copy",
          statusCategory: "IN_PROGRESS",
          statusName: "In review",
        }),
      ],
      [task({ title: "File the report", statusCategory: "DONE" })],
    );
    const user = userEvent.setup();
    const { unmount } = render(<MyTasksScreen />);
    await screen.findByText("Send the contract");
    await user.click(screen.getByRole("radio", { name: "Board" }));
    const doing = screen.getByRole("list", { name: "In progress column" });
    expect(within(doing).getByText("Check the copy")).toBeInTheDocument();
    expect(within(doing).getByText("In review")).toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: "Done column" })).getByText(
        "File the report",
      ),
    ).toBeInTheDocument();
    expect(localStorage.getItem("approvehr.my-tasks.layout")).toBe("board");
    unmount();
    render(<MyTasksScreen />);
    expect(
      await screen.findByRole("list", { name: "To do column" }),
    ).toBeInTheDocument();
  });

  it("moves a personal task to its list's first stage in that column", async () => {
    const t = task({ title: "Send the contract" });
    answer([t]);
    personalTask.mockResolvedValue(detail(t));
    updateIssue.mockResolvedValue({ ...t, statusId: "s-doing" });
    localStorage.setItem("approvehr.my-tasks.layout", "board");
    const user = userEvent.setup();
    render(<MyTasksScreen />);
    await screen.findByText("Send the contract");
    await user.selectOptions(
      screen.getByRole("combobox", { name: `Move ${t.key} to…` }),
      "IN_PROGRESS",
    );
    await waitFor(() =>
      expect(updateIssue).toHaveBeenCalledWith(t.id, { statusId: "s-doing" }),
    );
    await waitFor(() => expect(mineTasks).toHaveBeenCalledTimes(4));
  });

  it("puts a board task back and says why when the project is read-only", async () => {
    const t = boardTask();
    answer([t]);
    getProject.mockResolvedValue({ statuses: [...STATUSES], access: "READ" });
    localStorage.setItem("approvehr.my-tasks.layout", "board");
    const user = userEvent.setup();
    render(<MyTasksScreen />);
    await screen.findByText("Ship the page");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Move WEB-4 to…" }),
      "DONE",
    );
    await waitFor(() =>
      expect(pushToast).toHaveBeenCalledWith(
        expect.objectContaining({
          tone: "danger",
          title: "Could not move WEB-4",
        }),
      ),
    );
    expect(updateIssue).not.toHaveBeenCalled();
    expect(
      within(screen.getByRole("list", { name: "To do column" })).getByText(
        "Ship the page",
      ),
    ).toBeInTheDocument();
  });

  it("puts the card back when the server refuses the move", async () => {
    const t = boardTask();
    answer([t]);
    getProject.mockResolvedValue({ statuses: [...STATUSES], access: "WRITE" });
    updateIssue.mockRejectedValue(
      new ApiError(403, "FORBIDDEN", "Only its assignees can move it."),
    );
    localStorage.setItem("approvehr.my-tasks.layout", "board");
    const user = userEvent.setup();
    render(<MyTasksScreen />);
    await screen.findByText("Ship the page");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Move WEB-4 to…" }),
      "IN_PROGRESS",
    );
    await waitFor(() =>
      expect(updateIssue).toHaveBeenCalledWith(t.id, { statusId: "s-doing" }),
    );
    await waitFor(() =>
      expect(pushToast).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: expect.stringContaining("Only its assignees can move it."),
        }),
      ),
    );
    expect(
      within(screen.getByRole("list", { name: "To do column" })).getByText(
        "Ship the page",
      ),
    ).toBeInTheDocument();
  });

  it("keeps Overdue a list, with no layout switch", async () => {
    answer([task({ title: "Late one", dueDate: "2026-10-01" })]);
    localStorage.setItem("approvehr.my-tasks.layout", "board");
    const user = userEvent.setup();
    render(<MyTasksScreen />);
    await screen.findByText("Late one");
    await user.click(screen.getByRole("radio", { name: "Overdue" }));
    expect(screen.queryByRole("radiogroup", { name: "Layout" })).toBeNull();
    expect(screen.getByRole("region", { name: "Overdue" })).toBeInTheDocument();
  });
});

describe("a task closed as won't do", () => {
  const WONT_DO = {
    at: "2026-10-20T09:00:00.000Z",
    byId: "p-01",
    byName: "Ada Okafor",
    reason: "The customer changed their mind",
  };
  const finished = (title: string, over: Partial<PersonalTask> = {}) =>
    task({
      title,
      statusCategory: "DONE",
      doneAt: "2026-10-20T10:00:00.000Z",
      ...over,
    });

  it("is said to be one beside its title, and is not counted as finished in the Done group", async () => {
    answer(
      [task({ title: "Send the contract" })],
      [
        finished("File the report"),
        finished("Drop the survey", { wontDo: WONT_DO }),
      ],
    );
    render(<MyTasksScreen />);
    const toggle = await screen.findByRole("button", {
      name: /Done \(last 14 days\)/,
    });
    /* One finished and one that was not: never a bare 2, which reads as work done. */
    expect(toggle).toHaveTextContent("1 finished, 1 won't do");
    await userEvent.click(toggle);
    const row = screen.getByText("Drop the survey").closest("li")!;
    expect(within(row).getByText("Won't do")).toBeInTheDocument();
    const other = screen.getByText("File the report").closest("li")!;
    expect(within(other).queryByText("Won't do")).toBeNull();
  });

  it("leaves the count a plain number when nothing in the group was closed as won't do", async () => {
    answer([], [finished("File the report"), finished("Send the invoice")]);
    render(<MyTasksScreen />);
    const toggle = await screen.findByRole("button", {
      name: /Done \(last 14 days\)/,
    });
    expect(toggle).toHaveTextContent("2");
    expect(toggle).not.toHaveTextContent(/won't do/);
  });

  it("is counted the same way in the Done view", async () => {
    answer(
      [],
      [
        finished("File the report"),
        finished("Drop the survey", { wontDo: WONT_DO }),
      ],
    );
    render(<MyTasksScreen />);
    await userEvent.click(await screen.findByRole("radio", { name: "Done" }));
    const group = await screen.findByRole("region", {
      name: "Done (last 14 days)",
    });
    expect(within(group).getByRole("heading", { level: 2 })).toHaveTextContent(
      "(1 finished, 1 won't do)",
    );
    expect(within(group).getByText("Won't do")).toBeInTheDocument();
  });

  it("says the day it was closed in the company's zone, as the drawer does: a mark at 00:30 in Lagos is that day, not the one before", async () => {
    answer([]);
    mineArchive.mockResolvedValue({
      rows: [
        finished("Drop the survey", {
          /* 23:30 UTC on the 9th is 00:30 on the 10th in Lagos. */
          wontDo: { ...WONT_DO, at: "2026-11-09T23:30:00.000Z" },
        }),
      ],
      total: 1,
      hasMore: false,
    });
    render(<MyTasksScreen />);
    await userEvent.click(
      await screen.findByRole("radio", { name: "Archive" }),
    );
    const dropped = (await screen.findByText("Drop the survey")).closest("li")!;
    expect(
      within(dropped).getByText("Won't do 10 Nov 2026"),
    ).toBeInTheDocument();
  });

  it("is not called completed in the Archive: it says it was closed as won't do, with the day", async () => {
    answer([]);
    mineArchive.mockResolvedValue({
      rows: [
        finished("Drop the survey", { wontDo: WONT_DO }),
        finished("File the report"),
      ],
      total: 2,
      hasMore: false,
    });
    render(<MyTasksScreen />);
    await userEvent.click(
      await screen.findByRole("radio", { name: "Archive" }),
    );
    const dropped = (await screen.findByText("Drop the survey")).closest("li")!;
    expect(within(dropped).getByText(/^Won't do \d/)).toBeInTheDocument();
    expect(within(dropped).getByText("Won't do")).toBeInTheDocument();
    const done = screen.getByText("File the report").closest("li")!;
    expect(within(done).queryByText(/Won't do/)).toBeNull();
  });
});
