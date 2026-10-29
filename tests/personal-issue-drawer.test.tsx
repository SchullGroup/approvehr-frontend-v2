import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useCallback, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Issue } from "@/lib/projects/types";
import { people, sampleData } from "./projects-fixture";

/**
 * The drawer for a task on somebody's own list: what it shows after a save.
 *
 * Found in a browser, not by a test: after any save the drawer put the value
 * from before it back in the field (the row behind it was right), and kept it
 * there until the drawer was closed and opened again. The drawer builds a task
 * from the caller's list, then from the copy it loaded when it opened, then from
 * an overlay of what it has saved; the overlay is dropped when the caller's list
 * changes, and the copy loaded at open time is older than the save.
 *
 * Both shapes of caller are here, because they get there differently: My tasks
 * hands in a list that reloads after a save, and Team tasks and the task page
 * hand in a new empty list every time they render.
 *
 * Every other test of this drawer's callers mocks the drawer away, so none of
 * them could see this.
 */

const server = vi.hoisted(() => ({ row: null as unknown }));
const reloadThread = vi.hoisted(() => vi.fn());
const api = vi.hoisted(() => ({
  personalTask: vi.fn(),
  updateIssue: vi.fn(),
}));
const actor = vi.hoisted(() => ({
  employeeId: "p-01" as string | null,
  editRecords: false,
  leadsPeople: false,
  headsDepartment: false,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/ui", async (original) => ({
  ...(await original<typeof import("@/components/ui")>()),
  useToast: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/api/projects", async (original) => ({
  ...(await original<typeof import("@/lib/api/projects")>()),
  projectsApi: {
    links: vi.fn().mockResolvedValue([]),
    attachmentUrl: vi.fn().mockResolvedValue({ url: "blob:x", expiresAt: "" }),
    ...api,
  },
}));

vi.mock("@/lib/store/projects", () => ({
  useIssueThread: () => ({
    thread: { comments: [], activity: [] },
    status: "ready",
    reload: reloadThread,
  }),
}));

vi.mock("@/lib/store/project-session", () => ({
  useProjectActor: () => actor,
  usePeople: () => people,
}));

const { PersonalIssueDrawer } =
  await import("@/components/projects/personal-issue-drawer");

const board = sampleData();
const statuses = board.project.statuses;
const todo = statuses.find((s) => s.category === "TODO")!;
const doing = statuses.find((s) => s.category === "IN_PROGRESS")!;

/** A task on p-01's own list, as the server holds it. */
const task = (): Issue => ({
  ...board.issues.find((i) => i.key === "CHK-10")!,
  id: "t-1",
  key: "MY-4",
  title: "Book the dentist",
  description: "",
  statusId: todo.id,
  priority: "MEDIUM",
  labels: [],
  assigneeId: "p-01",
  reporterId: "p-01",
  parentId: null,
  epicId: null,
  sprintId: null,
});

const server_ = () => server.row as Issue;

beforeEach(() => {
  vi.clearAllMocks();
  actor.employeeId = "p-01";
  server.row = task();
  api.personalTask.mockImplementation(async () => ({
    issue: server_(),
    statusName: "To do",
    statusCategory: "TODO",
    statuses,
    canEditDetails: true,
  }));
  api.updateIssue.mockImplementation(async (_id: string, patch: object) => {
    server.row = { ...server_(), ...patch };
    return server_();
  });
});

/** My tasks: a list that is read again after a save, so its rows are new objects. */
function MyTasks() {
  const [list, setList] = useState<Issue[]>([server_()]);
  const reload = useCallback(() => setList([server_()]), []);
  return (
    <PersonalIssueDrawer
      issueId="t-1"
      issues={list}
      onClose={vi.fn()}
      onChanged={reload}
    />
  );
}

/** Team tasks and the task page: no list, so a new empty one on every render. */
function NoList() {
  const [, setCount] = useState(0);
  const reload = useCallback(() => setCount((n) => n + 1), []);
  return (
    <PersonalIssueDrawer
      issueId="t-1"
      issues={[]}
      onClose={vi.fn()}
      onChanged={reload}
    />
  );
}

/**
 * Change a field and leave it, the way the drawer saves: on blur.
 *
 * Not \`userEvent.type\`: the drawer's focus trap sometimes refuses the focus
 * that typing asks for in jsdom (it decides what is tabbable from \`offsetParent\`,
 * which jsdom never sets), which made this test fail one run in three.
 */
function edit(field: HTMLElement, value: string) {
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}

describe.each([
  ["from My tasks, whose list reloads after a save", MyTasks],
  ["from Team tasks or the task page, which hand in a new empty list", NoList],
])("a personal task opened %s", (_name, Screen) => {
  it("shows the title that was saved, not the one it opened with", async () => {
    render(<Screen />);
    edit(
      await screen.findByLabelText("Summary"),
      "Book the dentist for Tuesday",
    );
    await waitFor(() => expect(api.updateIssue).toHaveBeenCalledTimes(1));
    expect(api.updateIssue).toHaveBeenCalledWith("t-1", {
      title: "Book the dentist for Tuesday",
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Summary")).toHaveValue(
        "Book the dentist for Tuesday",
      ),
    );
    /* Give a late re-render the chance to put the old one back. */
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByLabelText("Summary")).toHaveValue(
      "Book the dentist for Tuesday",
    );
  });

  it("shows the status that was chosen, not the one it opened with", async () => {
    render(<Screen />);
    const details = within(
      await screen.findByRole("complementary", { name: "Details" }),
    );
    await userEvent.selectOptions(details.getByLabelText("Status"), doing.id);
    await waitFor(() => expect(api.updateIssue).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(
      within(
        screen.getByRole("complementary", { name: "Details" }),
      ).getByLabelText("Status"),
    ).toHaveValue(doing.id);
  });

  it("keeps showing each of two saves in a row", async () => {
    render(<Screen />);
    edit(await screen.findByLabelText("Summary"), "First title");
    await waitFor(() => expect(api.updateIssue).toHaveBeenCalledTimes(1));
    const description = screen.getByPlaceholderText(
      "Add context, acceptance criteria, links",
    );
    edit(description, "Ask about Thursday.");
    await waitFor(() => expect(api.updateIssue).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByLabelText("Summary")).toHaveValue("First title");
    expect(description).toHaveValue("Ask about Thursday.");
  });
});
