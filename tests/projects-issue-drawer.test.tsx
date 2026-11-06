import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProjectProvider,
  type ProjectContextValue,
} from "@/components/projects/project-context";
import {
  PRIORITY_LABEL,
  type Issue,
  type IssueThread,
  type ProjectData,
} from "@/lib/projects/types";
import { contextFor, fakeActions, sampleData } from "./projects-fixture";

/**
 * The issue drawer: every field it offers, and the call each one makes.
 *
 * The store hooks are stubbed — the thread (comments, history) is handed in directly — so what is proved is the drawer's own behaviour:
 * it saves as you go, it counts what a delete takes with it, Escape closes a
 * dropdown before it closes the panel, and a comment's @mention is stored as an
 * id.
 */

let thread: IssueThread = { comments: [], activity: [] };
const reloadThread = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/lib/api/projects", async (original) => ({
  ...(await original<typeof import("@/lib/api/projects")>()),
  projectsApi: {
    links: vi.fn().mockResolvedValue([]),
    removeLink: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/store/projects", () => ({
  useIssueThread: () => ({ thread, status: "ready", reload: reloadThread }),
}));

const actor = vi.hoisted(() => ({
  employeeId: "p-01" as string | null,
  editRecords: false,
  leadsPeople: true,
  headsDepartment: false,
}));

vi.mock("@/lib/store/project-session", () => ({
  useProjectActor: () => actor,
}));

/* Objectives are not what this file is about: a company with none to offer. */
vi.mock("@/lib/store/performance", () => ({
  useKpis: () => ({
    goals: [],
    cascade: [],
    loading: false,
    error: null,
    source: "api",
    reload: vi.fn(),
  }),
}));

const { IssueDrawer } = await import("@/components/projects/issue-drawer");

const find = (d: ProjectData, key: string): Issue =>
  d.issues.find((i) => i.key === key)!;

function renderDrawer(
  key = "CHK-10",
  overrides: Partial<ProjectContextValue> = {},
  data: ProjectData = sampleData(),
) {
  const ctx = contextFor(data, overrides);
  const actions = ctx.actions as unknown as ReturnType<typeof fakeActions>;
  const onClose = vi.fn();
  const issue = find(data, key);
  const view = render(
    <ProjectProvider value={ctx}>
      <IssueDrawer issue={issue} onClose={onClose} />
    </ProjectProvider>,
  );
  return { ctx, actions, onClose, issue, data, view };
}

const dialog = () => screen.getByRole("dialog");

/**
 * Leave the field being edited.
 *
 * Not \`userEvent.tab()\`: the drawer's focus trap decides what is tabbable from
 * \`offsetParent\`, which jsdom never sets, so every Tab is swallowed. Clicking
 * something that cannot take focus blurs the field the way a person's click does.
 */
const leave = () =>
  userEvent.click(screen.getByRole("heading", { name: "CHK-10" }));
const status = (d: ProjectData, name: string) =>
  d.project.statuses.find((s) => s.name === name)!;

beforeEach(() => {
  thread = { comments: [], activity: [] };
  actor.editRecords = false;
});

describe("what the drawer shows", () => {
  it("names the issue, and shows its summary, description, fields and sub-tasks", () => {
    renderDrawer();
    expect(screen.getByRole("heading", { name: "CHK-10" })).toBeInTheDocument();
    expect(screen.getByLabelText("Summary")).toHaveValue(
      "3-D Secure challenge flow for EU cards",
    );
    expect(
      screen.getByDisplayValue(/Strong Customer Authentication/),
    ).toBeInTheDocument();
    const details = within(
      screen.getByRole("complementary", { name: "Details" }),
    );
    expect(details.getByLabelText("Stage")).toHaveValue(
      status(sampleData(), "In Progress").id,
    );
    expect(details.getByLabelText("Priority")).toHaveValue("HIGHEST");
    expect(details.getByLabelText("Effort")).toHaveValue(8);
    expect(screen.getByText("1 of 3 done")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Subtask progress" }),
    ).toHaveAttribute("aria-valuenow", "1");
  });

  it("places the issue under its epic in the breadcrumb", () => {
    renderDrawer();
    expect(
      screen.getByRole("navigation", { name: "Where this task sits" }),
    ).toHaveTextContent("CHK-1");
  });

  it("shows an epic's stories instead of sub-tasks, with dates and no points", () => {
    renderDrawer("CHK-1");
    expect(screen.getByText("Tasks in this initiative")).toBeInTheDocument();
    const details = within(
      screen.getByRole("complementary", { name: "Details" }),
    );
    expect(details.getByLabelText("Start")).toHaveValue("2026-09-11");
    expect(details.queryByLabelText("Effort")).not.toBeInTheDocument();
    expect(details.queryByLabelText("Cycle")).not.toBeInTheDocument();
  });

  it("makes a sub-task's sprint and epic the parent's, so it cannot change them", () => {
    renderDrawer("CHK-23");
    const details = within(
      screen.getByRole("complementary", { name: "Details" }),
    );
    expect(details.queryByLabelText("Cycle")).not.toBeInTheDocument();
    expect(details.queryByLabelText("Initiative")).not.toBeInTheDocument();
    expect(screen.queryByText("Subtasks")).not.toBeInTheDocument();
  });

  it("shows what the fields say, and no editor, to somebody who cannot work in the project", () => {
    const { issue } = renderDrawer("CHK-10", { canWork: false });
    const dialog = screen.getByRole("dialog");
    /* Not a switched-off control: none of the editors exists at all. */
    expect(dialog.querySelectorAll("input, select, textarea")).toHaveLength(0);
    expect(screen.queryByLabelText("Summary")).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("heading", {
        level: 3,
        name: issue.title,
      }),
    ).toBeInTheDocument();
    const details = within(
      screen.getByRole("complementary", { name: "Details" }),
    );
    expect(details.queryByLabelText("Stage")).not.toBeInTheDocument();
    expect(details.getByText("Stage")).toBeInTheDocument();
    expect(
      details.getByText(PRIORITY_LABEL[issue.priority]),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Delete this task")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Add a comment")).not.toBeInTheDocument();
  });
});

describe("saving as you go", () => {
  it("saves a status change at once", async () => {
    const { actions, data, issue } = renderDrawer();
    await userEvent.selectOptions(
      within(
        screen.getByRole("complementary", { name: "Details" }),
      ).getByLabelText("Stage"),
      "In Review",
    );
    expect(actions.patchIssue).toHaveBeenCalledWith(issue, {
      statusId: status(data, "In Review").id,
    });
  });

  it("saves a new summary when you leave the field, and ignores an empty one", async () => {
    const { actions, issue } = renderDrawer();
    const summary = screen.getByLabelText("Summary");
    await userEvent.clear(summary);
    await userEvent.type(summary, "Challenge flow for EU cards");
    await leave();
    expect(actions.patchIssue).toHaveBeenCalledWith(issue, {
      title: "Challenge flow for EU cards",
    });

    actions.patchIssue.mockClear();
    await userEvent.clear(summary);
    await leave();
    expect(actions.patchIssue).not.toHaveBeenCalled();
  });

  it("does not save when nothing changed", async () => {
    const { actions } = renderDrawer();
    await userEvent.click(screen.getByLabelText("Summary"));
    await leave();
    expect(actions.patchIssue).not.toHaveBeenCalled();
  });

  it("saves points as a whole number, or none", async () => {
    const { actions, issue } = renderDrawer();
    const points = within(
      screen.getByRole("complementary", { name: "Details" }),
    ).getByLabelText("Effort");
    await userEvent.clear(points);
    await userEvent.type(points, "13");
    await leave();
    expect(actions.patchIssue).toHaveBeenCalledWith(issue, { points: 13 });
    actions.patchIssue.mockClear();
    await userEvent.clear(points);
    await leave();
    expect(actions.patchIssue).toHaveBeenCalledWith(issue, { points: null });
  });

  it("saves labels as a clean list", async () => {
    const { actions, issue } = renderDrawer();
    const labels = within(
      screen.getByRole("complementary", { name: "Details" }),
    ).getByLabelText("Labels");
    await userEvent.clear(labels);
    await userEvent.type(labels, "api, , Web ,api");
    await leave();
    expect(actions.patchIssue).toHaveBeenCalledWith(issue, {
      labels: ["api", "Web"],
    });
  });

  it("assigns to me in one press, and only offers it when it would change something", async () => {
    const { actions, issue } = renderDrawer("CHK-14", { meId: "p-03" });
    await userEvent.click(screen.getByRole("button", { name: "Assign to me" }));
    /* Added alongside whoever is on it already, not in their place. */
    expect(actions.patchIssue).toHaveBeenCalledWith(issue, {
      assigneeIds: ["p-01", "p-03"],
    });
  });

  it("does not offer 'Assign to me' on an issue that is already mine", () => {
    renderDrawer("CHK-14", { meId: "p-01" });
    expect(
      screen.queryByRole("button", { name: "Assign to me" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer 'Assign to me' to somebody who is not a member", () => {
    renderDrawer("CHK-14", { meId: "p-06" });
    expect(
      screen.queryByRole("button", { name: "Assign to me" }),
    ).not.toBeInTheDocument();
  });

  it("offers only the project's members as assignees, adds them, and takes them off", async () => {
    const { actions, issue } = renderDrawer("CHK-14");
    await userEvent.click(
      screen.getByRole("combobox", { name: "Add an assignee" }),
    );
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options.some((o) => o?.includes("Amara"))).toBe(false);
    /* Whoever is on it already is not offered again. */
    expect(options.some((o) => o?.includes("Adaeze"))).toBe(false);
    await userEvent.click(screen.getByRole("option", { name: /Chidi/ }));
    expect(actions.patchIssue).toHaveBeenCalledWith(issue, {
      assigneeIds: ["p-01", "p-03"],
    });
    actions.patchIssue.mockClear();
    await userEvent.click(
      screen.getByRole("button", { name: "Take Adaeze Okonkwo off this task" }),
    );
    expect(actions.patchIssue).toHaveBeenCalledWith(issue, { assigneeIds: [] });
  });

  it("shows everybody on a shared task, the lead marked", () => {
    const data = sampleData();
    const shared = find(data, "CHK-14");
    data.issues = data.issues.map((i) =>
      i.id === shared.id ? { ...i, assigneeIds: ["p-01", "p-03"] } : i,
    );
    renderDrawer("CHK-14", {}, data);
    const list = screen.getByRole("list", { name: "Assignees" });
    expect(list).toHaveTextContent("Adaeze Okonkwo");
    expect(list).toHaveTextContent("Lead");
    expect(list).toHaveTextContent("Chidi Nwosu");
  });
});

describe("sub-tasks and an epic's stories", () => {
  it("ticks a sub-task into Done and back", async () => {
    const { actions, data } = renderDrawer();
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Mark done CHK-24" }),
    );
    expect(actions.patchIssue).toHaveBeenCalledWith(
      expect.objectContaining({ key: "CHK-24" }),
      { statusId: status(data, "Done").id },
    );
    actions.patchIssue.mockClear();
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Reopen CHK-23" }),
    );
    expect(actions.patchIssue).toHaveBeenCalledWith(
      expect.objectContaining({ key: "CHK-23" }),
      { statusId: status(data, "To Do").id },
    );
  });

  it("adds sub-tasks one after another, with people, a date and a priority", async () => {
    const { actions, issue } = renderDrawer();
    await userEvent.click(screen.getByRole("button", { name: "Add subtask" }));
    const name = screen.getByLabelText("Name of the new subtask");
    await userEvent.type(name, "Cover the timeout");
    await userEvent.click(
      screen.getByRole("button", { name: /Assignees for the new subtask/ }),
    );
    await userEvent.click(
      screen.getByRole("menuitemcheckbox", { name: /Chidi Nwosu/ }),
    );
    await userEvent.click(
      screen.getByRole("menuitemcheckbox", { name: /Emeka Anyanwu/ }),
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Priority for the new subtask"),
      "HIGH",
    );
    await userEvent.type(
      screen.getByLabelText("Due date for the new subtask"),
      "2026-11-14",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(actions.createIssue).toHaveBeenCalledWith({
      type: "SUBTASK",
      parentId: issue.id,
      title: "Cover the timeout",
      priority: "HIGH",
      assigneeIds: ["p-03", "p-09"],
      dueDate: "2026-11-14",
    });

    /* Still open, cleared, and ready for the next one with the same people. */
    await waitFor(() => expect(name).toHaveValue(""));
    await userEvent.type(name, "Retry once{Enter}");
    expect(actions.createIssue).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: "Retry once",
        assigneeIds: ["p-03", "p-09"],
      }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByLabelText("Name of the new subtask"),
    ).not.toBeInTheDocument();
  });

  it("adds a task to an initiative from the same row", async () => {
    const { actions, issue } = renderDrawer("CHK-1");
    await userEvent.click(screen.getByRole("button", { name: "Add task" }));
    await userEvent.type(
      screen.getByLabelText("Name of the new task"),
      "Refund flow{Enter}",
    );
    expect(actions.createIssue).toHaveBeenCalledWith({
      type: "TASK",
      epicId: issue.id,
      title: "Refund flow",
      priority: "MEDIUM",
      assigneeIds: [],
    });
  });

  it("keeps what was typed when the sub-task could not be created", async () => {
    const { actions } = renderDrawer();
    actions.createIssue.mockResolvedValueOnce({
      ok: false,
      message: "No",
      error: null,
    });
    await userEvent.click(screen.getByRole("button", { name: "Add subtask" }));
    const row = screen.getByLabelText("Name of the new subtask");
    await userEvent.type(row, "Cover the timeout{Enter}");
    await waitFor(() => expect(row).toHaveValue("Cover the timeout"));
  });

  it("changes who is on a sub-task from its own row", async () => {
    const { actions } = renderDrawer();
    const kid = screen.getAllByRole("button", { name: /^Assignees of / })[0]!;
    await userEvent.click(kid);
    await userEvent.click(
      screen.getByRole("menuitemcheckbox", { name: /Ngozi Eze/ }),
    );
    expect(actions.patchIssue).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SUBTASK" }),
      { assigneeIds: expect.arrayContaining(["p-04"]) },
    );
  });
});

describe("saving the description", () => {
  it("offers Save while editing, and says when it saved", async () => {
    const { actions, issue } = renderDrawer();
    const box = screen.getByRole("textbox", { name: "Description" });
    await userEvent.clear(box);
    await userEvent.type(box, "New notes");
    await userEvent.click(screen.getAllByRole("button", { name: "Save" })[0]!);
    expect(actions.patchIssue).toHaveBeenCalledWith(issue, {
      description: "New notes",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
  });

  it("puts the old text back on Cancel and sends nothing", async () => {
    const { actions, issue } = renderDrawer();
    const box = screen.getByRole("textbox", { name: "Description" });
    await userEvent.clear(box);
    await userEvent.type(box, "Throw this away");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(box).toHaveValue(issue.description);
    expect(actions.patchIssue).not.toHaveBeenCalled();
  });
});

describe("deleting", () => {
  it("says what goes with the issue before it goes, then deletes and closes", async () => {
    const { actions, onClose, issue } = renderDrawer();
    await userEvent.click(screen.getByLabelText("Delete this task"));
    const confirm = screen.getByRole("alertdialog", { name: "Delete CHK-10" });
    expect(confirm).toHaveTextContent("and its 3 subtasks");
    expect(confirm).toHaveTextContent("cannot be undone");
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Delete" }),
    );
    expect(onClose).toHaveBeenCalled();
    expect(actions.deleteIssue).toHaveBeenCalledWith(issue);
  });

  it("can be called off", async () => {
    const { actions } = renderDrawer();
    await userEvent.click(screen.getByLabelText("Delete this task"));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(actions.deleteIssue).not.toHaveBeenCalled();
  });

  it("says an epic's stories stay, rather than going with it", async () => {
    renderDrawer("CHK-1");
    await userEvent.click(screen.getByLabelText("Delete this task"));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "tasks stay, without an initiative",
    );
  });

  it("does not mention sub-tasks when there are none", async () => {
    renderDrawer("CHK-14");
    await userEvent.click(screen.getByLabelText("Delete this task"));
    expect(screen.getByRole("alertdialog")).not.toHaveTextContent("sub-task");
  });
});

describe("Escape", () => {
  it("closes the drawer", async () => {
    const { onClose } = renderDrawer();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes an open dropdown first, and the drawer only on the next press", async () => {
    const { onClose } = renderDrawer();
    const assignee = screen.getByRole("combobox", { name: "Add an assignee" });
    await userEvent.click(assignee);
    expect(assignee).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(assignee).toHaveAttribute("aria-expanded", "false");
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("comments", () => {
  it("stores an @mention as the person's id and posts on Ctrl+Enter", async () => {
    const { actions } = renderDrawer();
    const box = screen.getByLabelText("Add a comment");
    await userEvent.type(box, "ping @Chi");
    const list = await screen.findByRole("listbox", {
      name: "People to mention",
    });
    expect(
      within(list).getByRole("option", { name: /Chidi Nwosu/ }),
    ).toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    expect(box).toHaveValue("ping @Chidi Nwosu ");
    /* The caret is put back after the mention on the next frame; wait for it. */
    await act(
      () => new Promise((done) => requestAnimationFrame(() => done(null))),
    );
    await userEvent.type(box, "can you look?", {
      initialSelectionStart: 18,
      initialSelectionEnd: 18,
    });
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(actions.addComment).toHaveBeenCalledWith(
      expect.any(String),
      "ping <@p-03> can you look?",
    );
    await waitFor(() => expect(box).toHaveValue(""));
  });

  it("offers only members of the project to mention", async () => {
    renderDrawer();
    await userEvent.type(screen.getByLabelText("Add a comment"), "@");
    const list = await screen.findByRole("listbox", {
      name: "People to mention",
    });
    const names = within(list)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(names).toHaveLength(4);
    expect(names.join(" ")).not.toMatch(/Amara|Fatima/);
  });

  it("keeps the text when posting fails", async () => {
    const { actions } = renderDrawer();
    actions.addComment.mockResolvedValueOnce({
      ok: false,
      message: "No",
      error: null,
    });
    const box = screen.getByLabelText("Add a comment");
    await userEvent.type(box, "hello");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(actions.addComment).toHaveBeenCalled());
    expect(box).toHaveValue("hello");
  });

  it("shows a stored mention as a name, and the comment's author", () => {
    thread = {
      comments: [
        {
          id: "c1",
          issueId: "x",
          authorId: "p-03",
          body: "Over to <@p-01> now",
          editedAt: null,
          createdAt: "2026-10-15T08:00:00.000Z",
        },
      ],
      activity: [],
    };
    renderDrawer();
    expect(screen.getByText("@Adaeze Okonkwo")).toBeInTheDocument();
    expect(screen.getByText("Chidi Nwosu")).toBeInTheDocument();
  });

  it("asks twice before deleting a comment, and lets the author do it", async () => {
    thread = {
      comments: [
        {
          id: "c1",
          issueId: "x",
          authorId: "p-01",
          body: "Mine",
          editedAt: null,
          createdAt: "2026-10-15T08:00:00.000Z",
        },
      ],
      activity: [],
    };
    const { actions } = renderDrawer();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(actions.deleteComment).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Delete this comment" }),
    );
    expect(actions.deleteComment).toHaveBeenCalledWith(
      expect.any(String),
      "c1",
    );
  });
});

describe("history", () => {
  it("reads each change as a sentence, newest first", async () => {
    thread = {
      comments: [],
      activity: [
        {
          id: "a1",
          issueId: "x",
          actorId: "p-01",
          field: "created",
          from: undefined,
          to: undefined,
          at: "2026-09-19T11:00:00.000Z",
        },
        {
          id: "a2",
          issueId: "x",
          actorId: "p-03",
          field: "priority",
          from: "HIGH",
          to: "HIGHEST",
          at: "2026-10-14T09:00:00.000Z",
        },
      ],
    };
    renderDrawer();
    await userEvent.click(screen.getByRole("tab", { name: "History" }));
    const items = within(dialog()).getAllByRole("listitem");
    const text = items.map((li) => li.textContent ?? "");
    const changed = text.findIndex((t) => t.includes("changed priority"));
    const created = text.findIndex((t) => t.includes("created the task"));
    expect(changed).toBeGreaterThan(-1);
    expect(created).toBeGreaterThan(changed);
    expect(text[changed]).toContain("Chidi Nwosu");
    expect(text[changed]).toContain("High");
    expect(text[changed]).toContain("Highest");
  });
});

describe("links and history", () => {
  it("reloads the history after a link is removed", async () => {
    const { projectsApi } = await import("@/lib/api/projects");
    (projectsApi.links as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: "l1",
        type: "BLOCKS",
        direction: "outgoing",
        label: "blocks",
        note: null,
        createdAt: "2026-10-20T09:00:00Z",
        createdBy: null,
        other: {
          id: "i2",
          key: "PAY-120",
          title: "Payslip",
          projectId: "p2",
          projectName: "Payroll",
          statusName: "To Do",
          statusCategory: "TODO",
          assigneeName: null,
        },
      },
    ]);
    reloadThread.mockClear();
    renderDrawer();
    await userEvent.click(
      await screen.findByRole("button", { name: "Remove link to PAY-120" }),
    );
    await waitFor(() => expect(reloadThread).toHaveBeenCalledTimes(1));
  });

  it("reads a link entry with no actor as Someone", async () => {
    thread = {
      comments: [],
      activity: [
        {
          id: "a1",
          issueId: "x",
          actorId: null,
          field: "link",
          from: null,
          to: {
            action: "linked",
            label: "back end for",
            other: { hidden: true },
          },
          at: "2026-10-20T09:00:00.000Z",
        },
      ],
    };
    renderDrawer();
    await userEvent.click(screen.getByRole("tab", { name: "History" }));
    const row = within(dialog())
      .getAllByRole("listitem")
      .find((li) => li.textContent?.includes("linked this task"))!;
    expect(row.textContent).toContain(
      "Someone linked this task: back end for a task you can't open",
    );
    expect(row.textContent).not.toMatch(/undefined|Unassigned/);
  });
});

describe("the objective line", () => {
  const linked = (key: string, extra: Partial<Issue>): ProjectData => {
    const data = sampleData();
    return {
      ...data,
      issues: data.issues.map((i) => (i.key === key ? { ...i, ...extra } : i)),
    };
  };

  it("says nothing at all about a task that is not linked", () => {
    renderDrawer("CHK-13");
    expect(
      screen.queryByText(/^Linked (to|objective)/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/not counted|weekly task/i),
    ).not.toBeInTheDocument();
  });

  it("never mentions a weekly task, whatever the old API sent", () => {
    renderDrawer(
      "CHK-13",
      {},
      linked("CHK-13", {
        weeklyTask: {
          state: "NOT_COUNTED",
          reason: "NO_OBJECTIVE",
          message: "Not counted toward a weekly task",
        },
      } as unknown as Partial<Issue>),
    );
    expect(screen.queryByText(/weekly task/i)).not.toBeInTheDocument();
  });

  it("reads one neutral line when the task is linked", () => {
    renderDrawer(
      "CHK-13",
      {},
      linked("CHK-13", {
        goalId: "g1",
        objective: {
          goalId: "g1",
          title: "Cut support tickets",
          keyResultId: null,
          keyResultTitle: null,
          closed: false,
        },
      }),
    );
    expect(
      screen.getByText("Linked to Cut support tickets"),
    ).toBeInTheDocument();
  });

  it("says the objective is closed in plain words when it has", () => {
    renderDrawer(
      "CHK-13",
      {},
      linked("CHK-13", {
        goalId: "g1",
        objective: {
          goalId: "g1",
          title: "Cut support tickets",
          keyResultId: null,
          keyResultTitle: null,
          closed: true,
        },
      }),
    );
    expect(screen.getByText("Linked objective is closed")).toBeInTheDocument();
  });
});

describe("editing a comment", () => {
  const mine = {
    id: "c1",
    issueId: "x",
    authorId: "p-01",
    body: "Over to <@p-03> now",
    editedAt: null,
    createdAt: "2026-10-15T08:00:00.000Z",
  };

  it("offers Edit to the author only", () => {
    thread = {
      comments: [mine, { ...mine, id: "c2", authorId: "p-03", body: "Theirs" }],
      activity: [],
    };
    renderDrawer();
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(1);
  });

  it("starts from the text with mentions shown as names, and stores them as ids again", async () => {
    thread = { comments: [mine], activity: [] };
    const { actions } = renderDrawer();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const box = screen.getByLabelText("Edit your comment");
    expect(box).toHaveValue("Over to @Chidi Nwosu now");
    await userEvent.type(box, " please");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(actions.editComment).toHaveBeenCalledWith(
      expect.any(String),
      "c1",
      "Over to <@p-03> now please",
    );
  });

  it("can be cancelled without changing anything", async () => {
    thread = { comments: [mine], activity: [] };
    const { actions } = renderDrawer();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByLabelText("Edit your comment"),
    ).not.toBeInTheDocument();
    expect(actions.editComment).not.toHaveBeenCalled();
  });

  it("says a comment was edited", () => {
    thread = {
      comments: [{ ...mine, editedAt: "2026-10-15T09:00:00.000Z" }],
      activity: [],
    };
    renderDrawer();
    expect(screen.getByText("edited")).toBeInTheDocument();
  });
});

describe("a personal task", () => {
  it("shows its type without a select: it can never become an epic", () => {
    renderDrawer("CHK-10", { personal: { setByName: null } });
    const details = within(
      screen.getByRole("complementary", { name: "Details" }),
    );
    expect(details.queryByRole("combobox", { name: "Type" })).toBeNull();
    /* CHK-10 is stored as a STORY, which people know as a Task. */
    expect(details.getByText("Task")).toBeInTheDocument();
  });
});

describe("somebody's personal task", () => {
  /* p-02 owns the task; p-01 (the reader) is the leader who set it. */
  const personalData = () => {
    const d = sampleData();
    const issue = find(d, "CHK-10");
    issue.assigneeId = "p-02";
    issue.reporterId = "p-01";
    d.project.leadId = "p-02";
    return d;
  };
  const personalCtx = (over: Partial<ProjectContextValue> = {}) => ({
    personal: { setByName: "Adaeze Okonkwo" },
    canWork: false,
    canManage: false,
    canComment: true,
    ...over,
  });

  it("lets the leader who set it fix the title, description and due date, and nothing else", async () => {
    const { actions, issue } = renderDrawer(
      "CHK-10",
      personalCtx({ canEditDetails: true }),
      personalData(),
    );
    expect(screen.getByLabelText("Summary")).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "Description" })).toBeEnabled();
    const details = within(
      screen.getByRole("complementary", { name: "Details" }),
    );
    expect(details.getByLabelText("Due")).toBeEnabled();
    /* The rest is read, not offered: no stage or priority editor to switch off. */
    expect(details.queryByLabelText("Stage")).not.toBeInTheDocument();
    expect(details.queryByLabelText("Priority")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Delete this task")).not.toBeInTheDocument();

    const summary = screen.getByLabelText("Summary");
    await userEvent.clear(summary);
    await userEvent.type(summary, "Fixed by the manager");
    await leave();
    expect(actions.patchIssue).toHaveBeenCalledWith(issue, {
      title: "Fixed by the manager",
    });
  });

  it("keeps them read-only for anybody else who can see it", () => {
    renderDrawer(
      "CHK-10",
      personalCtx({ canEditDetails: false }),
      personalData(),
    );
    expect(screen.queryByLabelText("Summary")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Description" }),
    ).not.toBeInTheDocument();
    expect(
      within(
        screen.getByRole("complementary", { name: "Details" }),
      ).queryByLabelText("Due"),
    ).not.toBeInTheDocument();
  });

  const theirComment = {
    id: "c9",
    issueId: "x",
    authorId: "p-03",
    body: "Theirs",
    editedAt: null,
    createdAt: "2026-10-15T08:00:00.000Z",
  };

  it("offers deleting a comment to its author and the task's owner, not HR or a leader", () => {
    thread = { comments: [theirComment], activity: [] };
    actor.editRecords = true;
    const { view } = renderDrawer("CHK-10", personalCtx(), personalData());
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
    view.unmount();

    /* The owner may. */
    actor.editRecords = false;
    renderDrawer("CHK-10", personalCtx({ meId: "p-02" }), personalData());
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });
});
