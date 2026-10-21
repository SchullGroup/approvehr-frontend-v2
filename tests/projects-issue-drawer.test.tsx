import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProjectProvider,
  type ProjectContextValue,
} from "@/components/projects/project-context";
import type { Issue, IssueThread, ProjectData } from "@/lib/projects/types";
import { contextFor, fakeActions, sampleData } from "./projects-fixture";

/**
 * The issue drawer: every field it offers, and the call each one makes.
 *
 * The store hooks are stubbed — the thread (comments, history, the bridge's
 * note) is handed in directly — so what is proved is the drawer's own behaviour:
 * it saves as you go, it counts what a delete takes with it, Escape closes a
 * dropdown before it closes the panel, and a comment's @mention is stored as an
 * id.
 */

let thread: IssueThread = { comments: [], activity: [] };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/lib/api/projects", async (original) => ({
  ...(await original<typeof import("@/lib/api/projects")>()),
  projectsApi: { links: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/lib/store/projects", () => ({
  useIssueThread: () => ({ thread, status: "ready", reload: vi.fn() }),
}));

vi.mock("@/lib/store/project-session", () => ({
  useProjectActor: () => ({
    employeeId: "p-01",
    editRecords: false,
    leadsPeople: true,
    headsDepartment: false,
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
    expect(details.getByLabelText("Status")).toHaveValue(
      status(sampleData(), "In Progress").id,
    );
    expect(details.getByLabelText("Priority")).toHaveValue("HIGHEST");
    expect(details.getByLabelText("Points")).toHaveValue(8);
    expect(screen.getByText("1 of 3 done")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Sub-task progress" }),
    ).toHaveAttribute("aria-valuenow", "1");
  });

  it("places the issue under its epic in the breadcrumb", () => {
    renderDrawer();
    expect(
      screen.getByRole("navigation", { name: "Where this issue sits" }),
    ).toHaveTextContent("CHK-1");
  });

  it("shows an epic's stories instead of sub-tasks, with dates and no points", () => {
    renderDrawer("CHK-1");
    expect(screen.getByText("Issues in this epic")).toBeInTheDocument();
    const details = within(
      screen.getByRole("complementary", { name: "Details" }),
    );
    expect(details.getByLabelText("Start")).toHaveValue("2026-09-11");
    expect(details.queryByLabelText("Points")).not.toBeInTheDocument();
    expect(details.queryByLabelText("Sprint")).not.toBeInTheDocument();
  });

  it("makes a sub-task's sprint and epic the parent's, so it cannot change them", () => {
    renderDrawer("CHK-23");
    const details = within(
      screen.getByRole("complementary", { name: "Details" }),
    );
    expect(details.queryByLabelText("Sprint")).not.toBeInTheDocument();
    expect(details.queryByLabelText("Epic")).not.toBeInTheDocument();
    expect(screen.queryByText("Sub-tasks")).not.toBeInTheDocument();
  });

  it("turns every field off for somebody who cannot work in the project", () => {
    renderDrawer("CHK-10", { canWork: false });
    expect(screen.getByLabelText("Summary")).toBeDisabled();
    const details = within(
      screen.getByRole("complementary", { name: "Details" }),
    );
    expect(details.getByLabelText("Status")).toBeDisabled();
    expect(
      screen.queryByLabelText("Delete this issue"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Add a comment")).not.toBeInTheDocument();
  });
});

describe("saving as you go", () => {
  it("saves a status change at once", async () => {
    const { actions, data, issue } = renderDrawer();
    await userEvent.selectOptions(
      within(
        screen.getByRole("complementary", { name: "Details" }),
      ).getByLabelText("Status"),
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
    ).getByLabelText("Points");
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
    expect(actions.patchIssue).toHaveBeenCalledWith(issue, {
      assigneeId: "p-03",
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

  it("offers only the project's members as assignees, and unassigning", async () => {
    const { actions, issue } = renderDrawer();
    await userEvent.click(screen.getByRole("combobox", { name: "Assignee" }));
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options.some((o) => o?.includes("Unassigned"))).toBe(true);
    expect(options.some((o) => o?.includes("Amara"))).toBe(false);
    await userEvent.click(screen.getByRole("option", { name: /Unassigned/ }));
    expect(actions.patchIssue).toHaveBeenCalledWith(issue, {
      assigneeId: null,
    });
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

  it("adds a sub-task from the quick row on Enter", async () => {
    const { actions, issue } = renderDrawer();
    const row = screen.getByLabelText("Add a sub-task");
    await userEvent.type(row, "Cover the timeout{Enter}");
    expect(actions.createIssue).toHaveBeenCalledWith({
      type: "SUBTASK",
      title: "Cover the timeout",
      parentId: issue.id,
    });
    await waitFor(() => expect(row).toHaveValue(""));
  });

  it("adds a story to an epic from the same row", async () => {
    const { actions, issue } = renderDrawer("CHK-1");
    await userEvent.type(
      screen.getByLabelText("Add a story to this epic"),
      "Refund flow{Enter}",
    );
    expect(actions.createIssue).toHaveBeenCalledWith({
      type: "STORY",
      title: "Refund flow",
      epicId: issue.id,
    });
  });

  it("keeps what was typed when the sub-task could not be created", async () => {
    const { actions } = renderDrawer();
    actions.createIssue.mockResolvedValueOnce({
      ok: false,
      message: "No",
      error: null,
    });
    const row = screen.getByLabelText("Add a sub-task");
    await userEvent.type(row, "Cover the timeout{Enter}");
    await waitFor(() => expect(row).toHaveValue("Cover the timeout"));
  });
});

describe("deleting", () => {
  it("says what goes with the issue before it goes, then deletes and closes", async () => {
    const { actions, onClose, issue } = renderDrawer();
    await userEvent.click(screen.getByLabelText("Delete this issue"));
    const confirm = screen.getByRole("alertdialog", { name: "Delete CHK-10" });
    expect(confirm).toHaveTextContent("and its 3 sub-tasks");
    expect(confirm).toHaveTextContent("cannot be undone");
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Delete" }),
    );
    expect(onClose).toHaveBeenCalled();
    expect(actions.deleteIssue).toHaveBeenCalledWith(issue);
  });

  it("can be called off", async () => {
    const { actions } = renderDrawer();
    await userEvent.click(screen.getByLabelText("Delete this issue"));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(actions.deleteIssue).not.toHaveBeenCalled();
  });

  it("says an epic's stories stay, rather than going with it", async () => {
    renderDrawer("CHK-1");
    await userEvent.click(screen.getByLabelText("Delete this issue"));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "issues stay, without an epic",
    );
  });

  it("does not mention sub-tasks when there are none", async () => {
    renderDrawer("CHK-14");
    await userEvent.click(screen.getByLabelText("Delete this issue"));
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
    const assignee = screen.getByRole("combobox", { name: "Assignee" });
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
    await userEvent.click(screen.getByRole("button", { name: "Comment" }));
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
    const created = text.findIndex((t) => t.includes("created the issue"));
    expect(changed).toBeGreaterThan(-1);
    expect(created).toBeGreaterThan(changed);
    expect(text[changed]).toContain("Chidi Nwosu");
    expect(text[changed]).toContain("High");
    expect(text[changed]).toContain("Highest");
  });
});

describe("the weekly-task note", () => {
  const withWeekly = (
    key: string,
    weeklyTask: Issue["weeklyTask"],
  ): ProjectData => {
    const data = sampleData();
    return {
      ...data,
      issues: data.issues.map((i) =>
        i.key === key ? { ...i, weeklyTask } : i,
      ),
    };
  };

  it("says nothing when the API has nothing to say, which is always so in the demo", () => {
    renderDrawer("CHK-13");
    expect(screen.queryByText(/weekly task/)).not.toBeInTheDocument();
  });

  it("says it in one plain line when the API says the issue is not counted", () => {
    const message =
      "Not counted toward a weekly task — link this issue or the project to an objective.";
    renderDrawer(
      "CHK-13",
      {},
      withWeekly("CHK-13", {
        state: "NOT_COUNTED",
        reason: "NO_OBJECTIVE",
        message,
      }),
    );
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it("shows the API's sentence as it is, whatever the reason", () => {
    renderDrawer(
      "CHK-13",
      {},
      withWeekly("CHK-13", {
        state: "NOT_COUNTED",
        reason: "WEEK_CLOSED",
        message:
          "Not counted toward a weekly task — it was finished in a week that has closed.",
      }),
    );
    expect(
      screen.getByText(/finished in a week that has closed/),
    ).toBeInTheDocument();
  });

  it("says a task was filed, and whether it has been graded", () => {
    renderDrawer(
      "CHK-13",
      {},
      withWeekly("CHK-13", { state: "FILED", taskId: "t1", graded: false }),
    );
    expect(screen.getByText("Filed as a weekly task")).toBeInTheDocument();
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
