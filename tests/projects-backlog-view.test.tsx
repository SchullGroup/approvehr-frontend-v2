import { act, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import {
  ProjectProvider,
  type ProjectContextValue,
} from "@/components/projects/project-context";
import { EMPTY_FILTER } from "@/lib/projects/filters";
import { completeSprint as completeInData } from "@/lib/projects/sprints";
import type { Issue, ProjectData } from "@/lib/projects/types";
import { contextFor, fakeActions, sampleData } from "./projects-fixture";

/**
 * The backlog, as a person meets it: lists with their figures, a drag, a menu, a
 * quick row, the four sprint dialogs, and what each of them asks the store to do.
 *
 * The rules behind a move are in `projects-backlog.test.ts`; what is proved here is
 * that the screen sends them, shows the reasons for a refusal, and leaves a viewer
 * with nothing to press. The drag is the product's own pointer-event drag, driven
 * the way the board's test drives it — `elementFromPoint` is the one thing jsdom
 * cannot do, so it is stubbed to return the list the test means to be over.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/projects/pj-chk",
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));

const { BacklogView } = await import("@/app/(app)/projects/[id]/backlog-view");
const { BoardView } = await import("@/app/(app)/projects/[id]/board-view");

type Fake = ReturnType<typeof fakeActions>;

function renderView(
  data: ProjectData = sampleData(),
  overrides: Partial<ProjectContextValue> = {},
  View: () => React.ReactNode = BacklogView,
) {
  const ctx = contextFor(data, overrides);
  const actions = ctx.actions as unknown as Fake;
  actions.createSprint.mockImplementation(() =>
    Promise.resolve({ ok: true, value: { name: "Cycle 5" } }),
  );
  render(
    <ToastProvider>
      <ProjectProvider value={ctx}>
        <View />
      </ProjectProvider>
    </ToastProvider>,
  );
  return { ctx, actions };
}

const list = (name: string) => screen.getByRole("region", { name });
const sprintOf = (d: ProjectData, name: string) =>
  d.sprints.find((s) => s.name === name)!;
const issueOf = (d: ProjectData, key: string) =>
  d.issues.find((i) => i.key === key)!;

/** The sample with nothing running, so a planned sprint can be started. */
function nothingRunning(): ProjectData {
  const d = sampleData();
  return {
    ...d,
    sprints: d.sprints.map((s) =>
      s.state === "ACTIVE" ? { ...s, state: "CLOSED" as const } : s,
    ),
  };
}

beforeEach(() => {
  push.mockClear();
});

describe("the lists", () => {
  it("draws a list per sprint, then the backlog, each with its real figures", () => {
    renderView();
    const active = list("Cycle 3");
    expect(within(active).getByText("Active")).toBeInTheDocument();
    expect(within(active).getByText("7 tasks")).toBeInTheDocument();
    expect(within(active).getByText("27 effort")).toBeInTheDocument();
    expect(within(active).getByText("3 done")).toBeInTheDocument();
    expect(
      within(active).getByText(
        "Goal: Ship 3-D Secure and cut payment errors in half",
      ),
    ).toBeInTheDocument();

    const planned = list("Cycle 4");
    expect(within(planned).getByText("Planned")).toBeInTheDocument();
    expect(within(planned).getByText("2 tasks")).toBeInTheDocument();
    expect(within(planned).getByText("11 effort")).toBeInTheDocument();

    const backlog = list("Later");
    expect(within(backlog).getByText("4 tasks")).toBeInTheDocument();
    expect(within(backlog).getByText("17 effort")).toBeInTheDocument();
  });

  it("lists issues as rows and leaves epics and sub-tasks out", () => {
    renderView();
    const active = list("Cycle 3");
    expect(
      within(active).getByRole("button", {
        name: /Instrument payment error rates/,
      }),
    ).toBeInTheDocument();
    /* An epic is a container, not a row (its title only shows as a chip), and a
       sub-task travels with its parent. */
    expect(screen.queryAllByRole("img", { name: "Epic" })).toHaveLength(0);
    expect(screen.queryAllByRole("img", { name: "Sub-task" })).toHaveLength(0);
    expect(
      screen.queryByText("Handle challenge timeout and abandon"),
    ).not.toBeInTheDocument();
    /* A row carries its epic and its status. */
    const row = within(active)
      .getByRole("button", { name: /Instrument payment error rates/ })
      .closest("li")!;
    expect(within(row).getByText("Payments API v2")).toBeInTheDocument();
    expect(within(row).getByText("To Do")).toBeInTheDocument();
  });

  it("opens the drawer from a row's title", async () => {
    const { ctx } = renderView();
    await userEvent.click(
      screen.getByRole("button", { name: /Instrument payment error rates/ }),
    );
    expect(ctx.openIssue).toHaveBeenCalledWith(
      expect.objectContaining({ key: "CHK-14" }),
    );
  });

  it("narrows the rows with the shared filter, not the sprint's figures", () => {
    renderView(sampleData(), {
      filter: { ...EMPTY_FILTER, type: "BUG" },
    });
    const active = list("Cycle 3");
    expect(within(active).getAllByRole("listitem")).toHaveLength(2);
    expect(within(active).getByText("7 tasks")).toBeInTheDocument();
    expect(within(active).getByText("2 shown")).toBeInTheDocument();
    expect(
      within(list("Cycle 4")).getByText("No tasks here match these filters."),
    ).toBeInTheDocument();
  });

  it("is one ordered queue on a Kanban project, with no sprint controls", () => {
    const d = sampleData();
    renderView({
      project: { ...d.project, type: "KANBAN" },
      sprints: [],
      issues: d.issues.map((i) => ({ ...i, sprintId: null })),
    });
    expect(
      screen.getByText(/The top of the list gets picked up first/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New cycle" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Start cycle/ })).toBeNull();
    expect(screen.getAllByRole("region")).toHaveLength(1);
    /* Finished more than a fortnight ago: not in the queue. */
    expect(
      screen.queryByText(
        "Charge endpoint accepts provider-agnostic payment intents",
      ),
    ).not.toBeInTheDocument();
  });
});

describe("empty states", () => {
  it("offers to create the first sprint when there are none", async () => {
    const d = sampleData();
    const { actions } = renderView({
      ...d,
      sprints: [],
      issues: d.issues.map((i) => ({ ...i, sprintId: null })),
    });
    expect(screen.getByText("No cycles yet")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Create your first cycle" }),
    );
    expect(actions.createSprint).toHaveBeenCalledTimes(1);
    const draft = actions.createSprint.mock.calls[0]![0] as {
      name: string;
      startDate: string;
      endDate: string;
    };
    expect(draft.name).toBe("Cycle 1");
    expect(draft.startDate).toBe("2026-10-15");
    expect(draft.endDate).toBe("2026-10-28");
    expect(await screen.findByText("Cycle 5 created")).toBeInTheDocument();
  });

  it("says the backlog is empty and points at the row below", () => {
    const d = sampleData();
    renderView({ ...d, issues: d.issues.filter((i) => i.sprintId) });
    expect(
      screen.getByText("Later is empty. Add a task below."),
    ).toBeInTheDocument();
  });

  it("tells a planned sprint with nothing in it how to fill it", () => {
    const d = sampleData();
    renderView({
      ...d,
      issues: d.issues.map((i) =>
        i.sprintId === "sp-chk-4" ? { ...i, sprintId: null } : i,
      ),
    });
    expect(
      within(list("Cycle 4")).getByText(
        "Drag tasks here from Later to plan this cycle.",
      ),
    ).toBeInTheDocument();
  });
});

describe("planning with the menu", () => {
  it("moves an issue into a sprint from its Move to menu", async () => {
    const d = sampleData();
    const { actions } = renderView(d);
    await userEvent.selectOptions(
      screen.getByLabelText("Move CHK-19 to…"),
      "Cycle 4",
    );
    expect(actions.patchIssue).toHaveBeenCalledTimes(1);
    const [issue, patch] = actions.patchIssue.mock.calls[0] as [Issue, object];
    expect(issue.key).toBe("CHK-19");
    expect(patch).toEqual({
      sprintId: sprintOf(d, "Cycle 4").id,
      rank: 19,
    });
    expect(
      await screen.findByText("CHK-19 moved to Cycle 4"),
    ).toBeInTheDocument();
  });

  it("returns an issue to the backlog, and moves one to the top of its list", async () => {
    const { actions } = renderView();
    await userEvent.selectOptions(
      screen.getByLabelText("Move CHK-17 to…"),
      "Later",
    );
    expect(actions.patchIssue.mock.calls[0]![1]).toMatchObject({
      sprintId: null,
    });
    await userEvent.selectOptions(
      screen.getByLabelText("Move CHK-21 to…"),
      "Top of this list",
    );
    expect(actions.patchIssue.mock.calls[1]![1]).toEqual({ rank: 18 });
  });

  it("does not offer the list an issue is already in", () => {
    renderView();
    const menu = screen.getByLabelText("Move CHK-19 to…");
    expect(within(menu).getByRole("option", { name: "Later" })).toBeDisabled();
    expect(
      within(menu).getByRole("option", { name: "Cycle 4" }),
    ).not.toBeDisabled();
    expect(
      within(menu).getByRole("option", { name: "Top of this list" }),
    ).toBeDisabled();
  });
});

describe("dragging a row", () => {
  function drag(key: string, target: HTMLElement, y = 300) {
    const grip = screen.getByLabelText(new RegExp(`^Move ${key}\\.`));
    (
      grip as HTMLElement & { setPointerCapture: () => void }
    ).setPointerCapture = () => undefined;
    act(() => {
      grip.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
      );
    });
    const doc = document as unknown as Record<string, unknown>;
    doc["elementFromPoint"] = () => target;
    act(() => {
      window.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 400,
          clientY: y,
        }),
      );
    });
    act(() => {
      window.dispatchEvent(
        new MouseEvent("pointerup", {
          bubbles: true,
          clientX: 400,
          clientY: y,
        }),
      );
    });
    Reflect.deleteProperty(doc, "elementFromPoint");
  }

  it("plans a backlog issue into a sprint by dropping it on the list", () => {
    const d = sampleData();
    const { actions } = renderView(d);
    drag("CHK-19", list("Cycle 4"));
    expect(actions.patchIssue).toHaveBeenCalledTimes(1);
    const [issue, patch] = actions.patchIssue.mock.calls[0] as [Issue, object];
    expect(issue.key).toBe("CHK-19");
    expect(patch).toEqual({
      sprintId: sprintOf(d, "Cycle 4").id,
      rank: 19,
    });
  });

  it("drops in front of the row the pointer is above", () => {
    const d = sampleData();
    const { actions } = renderView(d);
    const planned = list("Cycle 4");
    /* jsdom lays nothing out; give the target row a box the pointer is above. */
    const row = planned.querySelector<HTMLElement>(
      `[data-row-id="${issueOf(d, "CHK-18").id}"]`,
    )!;
    row.getBoundingClientRect = () =>
      ({ top: 400, height: 40, bottom: 440 }) as DOMRect;
    drag("CHK-19", planned, 410);
    expect(actions.patchIssue.mock.calls[0]![1]).toEqual({
      sprintId: sprintOf(d, "Cycle 4").id,
      rank: 17.5,
    });
  });

  it("writes nothing when the pointer is released over nothing", () => {
    const { actions } = renderView();
    drag("CHK-19", document.body);
    expect(actions.patchIssue).not.toHaveBeenCalled();
  });

  it("writes nothing for a drop where the issue already is", () => {
    const { actions } = renderView();
    drag("CHK-22", list("Later"));
    expect(actions.patchIssue).not.toHaveBeenCalled();
  });
});

describe("the quick row", () => {
  it("adds a story to the backlog on Enter, and says so", async () => {
    const { actions } = renderView();
    const box = screen.getByLabelText("Add a task to Later");
    await userEvent.type(box, "Offer Apple Pay on mobile{Enter}");
    expect(actions.createIssue).toHaveBeenCalledWith({
      type: "TASK",
      title: "Offer Apple Pay on mobile",
      sprintId: null,
    });
    expect(box).toHaveValue("");
    expect(box).toHaveFocus();
    expect(await screen.findByText("CHK-99 created")).toBeInTheDocument();
  });

  it("adds the chosen type into the sprint whose row it is", async () => {
    const d = sampleData();
    const { actions } = renderView(d);
    const planned = list("Cycle 4");
    await userEvent.selectOptions(
      within(planned).getByLabelText(/^Type of the task to add/),
      "Problem",
    );
    await userEvent.type(
      within(planned).getByLabelText("Add a task to Cycle 4"),
      "Refund button does nothing{Enter}",
    );
    expect(actions.createIssue).toHaveBeenCalledWith({
      type: "BUG",
      title: "Refund button does nothing",
      sprintId: sprintOf(d, "Cycle 4").id,
    });
  });

  it("ignores an empty line, and keeps the words when the store refuses", async () => {
    const { actions } = renderView();
    const box = screen.getByLabelText("Add a task to Later");
    await userEvent.type(box, "   {Enter}");
    expect(actions.createIssue).not.toHaveBeenCalled();

    actions.createIssue.mockImplementationOnce(() =>
      Promise.resolve({ ok: false, message: "No.", error: new Error("No.") }),
    );
    await userEvent.clear(box);
    await userEvent.type(box, "Keep me{Enter}");
    await waitFor(() => expect(box).toHaveValue("Keep me"));
  });

  it("sends no sprint on a Kanban project", async () => {
    const d = sampleData();
    const { actions } = renderView({
      project: { ...d.project, type: "KANBAN" },
      sprints: [],
      issues: d.issues.map((i) => ({ ...i, sprintId: null })),
    });
    await userEvent.type(
      screen.getByLabelText("Add a task to Later"),
      "Queue me{Enter}",
    );
    expect(actions.createIssue).toHaveBeenCalledWith({
      type: "TASK",
      title: "Queue me",
      sprintId: null,
    });
  });
});

describe("starting a sprint", () => {
  it("disables Start cycle with the reason while another sprint is running", () => {
    renderView();
    const start = within(list("Cycle 4")).getByRole("button", {
      name: "Start cycle",
    });
    expect(start).toBeDisabled();
    expect(
      within(list("Cycle 4")).getByText("Complete the active cycle first."),
    ).toBeInTheDocument();
    expect(start).toHaveAccessibleDescription(
      "Complete the active cycle first.",
    );
  });

  it("disables it for a sprint with nothing in it", () => {
    const d = nothingRunning();
    renderView({
      ...d,
      issues: d.issues.map((i) =>
        i.sprintId === "sp-chk-4" ? { ...i, sprintId: null } : i,
      ),
    });
    const sprint = list("Cycle 4");
    expect(
      within(sprint).getByRole("button", { name: "Start cycle" }),
    ).toBeDisabled();
    expect(within(sprint).getByText("Add tasks first.")).toBeInTheDocument();
  });

  it("shows what will be committed, then starts it with the edits and goes to the board", async () => {
    const d = nothingRunning();
    const { actions } = renderView(d);
    await userEvent.click(
      within(list("Cycle 4")).getByRole("button", {
        name: "Start cycle",
      }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Start cycle" });
    expect(
      within(dialog).getByText(
        "2 tasks and 11 effort will be committed to this cycle.",
      ),
    ).toBeInTheDocument();
    const name = within(dialog).getByLabelText(/Cycle name/);
    await userEvent.clear(name);
    await userEvent.type(name, "Launch sprint");
    await userEvent.type(
      within(dialog).getByLabelText(/Cycle goal/),
      "Go live",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Start cycle" }),
    );
    await waitFor(() => expect(actions.startSprint).toHaveBeenCalledTimes(1));
    const [id, edits] = actions.startSprint.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(id).toBe(sprintOf(d, "Cycle 4").id);
    expect(edits).toMatchObject({
      name: "Launch sprint",
      goal: "Go live",
      startDate: sprintOf(d, "Cycle 4").startDate,
      endDate: sprintOf(d, "Cycle 4").endDate,
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/projects/pj-chk"));
    expect(
      await screen.findByText("Launch sprint started"),
    ).toBeInTheDocument();
  });

  it("will not send an end date before the start date, or a missing name", async () => {
    const { actions } = renderView(nothingRunning());
    await userEvent.click(
      within(list("Cycle 4")).getByRole("button", {
        name: "Start cycle",
      }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Start cycle" });
    const end = within(dialog).getByLabelText(/End date/);
    await userEvent.clear(end);
    await userEvent.type(end, "2026-01-01");
    await userEvent.clear(within(dialog).getByLabelText(/Cycle name/));
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Start cycle" }),
    );
    expect(
      within(dialog).getByText("Give the cycle a name."),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "The end date must be on or after the start date.",
      ),
    ).toBeInTheDocument();
    expect(actions.startSprint).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the store's refusal inside the dialog and stays put", async () => {
    const { actions } = renderView(nothingRunning());
    actions.startSprint.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        message: "Another sprint is already running.",
        error: new Error("x"),
      }),
    );
    await userEvent.click(
      within(list("Cycle 4")).getByRole("button", {
        name: "Start cycle",
      }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Start cycle" });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Start cycle" }),
    );
    expect(
      await within(dialog).findByText("Another sprint is already running."),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("completing a sprint", () => {
  async function openComplete() {
    await userEvent.click(
      within(list("Cycle 3")).getByRole("button", {
        name: "Complete cycle",
      }),
    );
    return screen.findByRole("dialog", { name: "Complete Cycle 3" });
  }

  it("shows what was done and what is open, with the backlog as the default", async () => {
    const { actions } = renderView();
    const dialog = await openComplete();
    const done = within(dialog).getByText("Completed").closest("div")!;
    expect(done).toHaveTextContent("3");
    expect(done).toHaveTextContent("9 effort");
    const open = within(dialog).getByText("Open").closest("div")!;
    expect(open).toHaveTextContent("4");
    expect(open).toHaveTextContent("18 effort");
    expect(within(dialog).getByLabelText("Move open tasks to")).toHaveValue("");

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Complete cycle" }),
    );
    await waitFor(() =>
      expect(actions.completeSprint).toHaveBeenCalledTimes(1),
    );
    const [id, move] = actions.completeSprint.mock.calls[0] as [
      string,
      unknown,
    ];
    expect(id).toBe("sp-chk-3");
    expect(move).toBeNull();
    expect(
      await screen.findByText(
        "Cycle 3 completed, 9 of 27 effort done; 4 tasks moved to Later",
      ),
    ).toBeInTheDocument();
  });

  it("moves open issues to a planned sprint, or a new one with the drafted dates", async () => {
    const d = sampleData();
    const { actions } = renderView(d);
    let dialog = await openComplete();
    await userEvent.selectOptions(
      within(dialog).getByLabelText("Move open tasks to"),
      "Cycle 4",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Complete cycle" }),
    );
    await waitFor(() =>
      expect(actions.completeSprint).toHaveBeenCalledTimes(1),
    );
    expect(actions.completeSprint.mock.calls[0]![1]).toBe(
      sprintOf(d, "Cycle 4").id,
    );
    expect(
      await screen.findByText(/4 tasks moved to Cycle 4/),
    ).toBeInTheDocument();

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Complete Cycle 3" }),
      ).not.toBeInTheDocument(),
    );
    dialog = await openComplete();
    await userEvent.selectOptions(
      within(dialog).getByLabelText("Move open tasks to"),
      "A new cycle",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Complete cycle" }),
    );
    await waitFor(() =>
      expect(actions.completeSprint).toHaveBeenCalledTimes(2),
    );
    const [, move, next] = actions.completeSprint.mock.calls[1] as [
      string,
      unknown,
      { name: string; startDate: string },
    ];
    expect(move).toBe("new");
    expect(next.name).toBe("Cycle 5");
    expect(next.startDate).toBe("2026-11-06");
  });

  it("says every issue is done when nothing is open, and offers no destination", async () => {
    const d = sampleData();
    renderView({
      ...d,
      issues: d.issues.map((i) =>
        i.sprintId === "sp-chk-3"
          ? {
              ...i,
              statusId: "st-chk-done",
              doneAt: "2026-10-14T10:00:00.000Z",
            }
          : i,
      ),
    });
    const dialog = await openComplete();
    expect(within(dialog).getByText("Every task is done.")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Move open tasks to")).toBeNull();
  });

  it("shows a refusal in the dialog, and says nothing was completed", async () => {
    const { actions } = renderView();
    actions.completeSprint.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        message: "That sprint has already been completed.",
        error: new Error("x"),
      }),
    );
    const dialog = await openComplete();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Complete cycle" }),
    );
    expect(
      await within(dialog).findByText(
        "That sprint has already been completed.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/completed,/)).not.toBeInTheDocument();
  });

  it("keeps the figures it was asked with while it leaves, though the store has already moved the issues", async () => {
    /* The store applies a completion before the dialog is told to close, so a
       dialog that read the project live would show "Open 0" over its own exit. */
    const base = sampleData();
    function Harness() {
      const [data, setData] = useState(base);
      const ctx = contextFor(data);
      const actions = ctx.actions as unknown as Fake;
      actions.completeSprint.mockImplementation(async () => {
        setData(
          completeInData(
            data,
            "sp-chk-3",
            null,
            "2026-10-15T12:00:00.000Z",
            null,
          ).data,
        );
        return { ok: true, value: undefined };
      });
      return (
        <ToastProvider>
          <ProjectProvider value={ctx}>
            <BacklogView />
          </ProjectProvider>
        </ToastProvider>
      );
    }
    render(<Harness />);
    const dialog = await openComplete();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Complete cycle" }),
    );
    expect(await screen.findByText(/completed,/)).toBeInTheDocument();
    /* Gone from the lists, still on screen in the closing dialog, with its figures. */
    expect(screen.queryByRole("region", { name: "Cycle 3" })).toBeNull();
    const leaving = screen.getByRole("dialog", {
      name: "Complete Cycle 3",
    });
    expect(within(leaving).getByText("Open").closest("div")).toHaveTextContent(
      "4",
    );
  });

  it("is also on the board's sprint header, for the lead", async () => {
    const { actions } = renderView(sampleData(), {}, BoardView);
    expect(
      screen.getByRole("heading", { name: "Cycle 3" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Complete cycle" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Complete Cycle 3",
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Complete cycle" }),
    );
    await waitFor(() =>
      expect(actions.completeSprint).toHaveBeenCalledTimes(1),
    );
  });

  it("is not on the board for somebody who cannot manage the project", () => {
    renderView(sampleData(), { canManage: false }, BoardView);
    expect(screen.queryByRole("button", { name: "Complete cycle" })).toBeNull();
  });
});

describe("editing and deleting a sprint", () => {
  it("edits a sprint's name, dates and goal", async () => {
    const d = sampleData();
    const { actions } = renderView(d);
    await userEvent.click(screen.getByRole("button", { name: "Edit Cycle 4" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit cycle" });
    const name = within(dialog).getByLabelText(/Cycle name/);
    expect(name).toHaveValue("Cycle 4");
    await userEvent.clear(name);
    await userEvent.type(name, "Hardening");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(actions.updateSprint).toHaveBeenCalledTimes(1));
    const [id, patch] = actions.updateSprint.mock.calls[0] as [string, object];
    expect(id).toBe(sprintOf(d, "Cycle 4").id);
    expect(patch).toMatchObject({ name: "Hardening" });
    expect(await screen.findByText("Hardening saved")).toBeInTheDocument();
  });

  it("deletes a planned sprint after saying where its issues go", async () => {
    const d = sampleData();
    const { actions } = renderView(d);
    await userEvent.click(
      screen.getByRole("button", { name: "Delete Cycle 4" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Delete Cycle 4?",
    });
    expect(
      within(dialog).getByText(/Its 2 tasks go back to Later/),
    ).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete cycle" }),
    );
    await waitFor(() => expect(actions.deleteSprint).toHaveBeenCalledTimes(1));
    expect(actions.deleteSprint.mock.calls[0]![0]).toBe(
      sprintOf(d, "Cycle 4").id,
    );
  });

  it("offers no delete for the running sprint", () => {
    renderView();
    expect(screen.queryByRole("button", { name: "Delete Cycle 3" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Edit Cycle 3" }),
    ).toBeInTheDocument();
  });
});

describe("who sees what", () => {
  it("lets a member plan but gives them no sprint controls", () => {
    renderView(sampleData(), { canManage: false });
    expect(screen.queryByRole("button", { name: /Start cycle/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Complete cycle/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Edit / })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Delete / })).toBeNull();
    /* Planning is theirs: the menu, the grip, the quick row, a new sprint. */
    expect(screen.getByLabelText("Move CHK-19 to…")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Move CHK-19\./)).toBeInTheDocument();
    expect(screen.getByLabelText("Add a task to Later")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "New cycle" }),
    ).toBeInTheDocument();
  });

  it("leaves a viewer with rows to read and nothing to press", () => {
    renderView(sampleData(), { canWork: false, canManage: false });
    expect(screen.queryByLabelText(/^Move CHK-19/)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Add a task to Later"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New cycle" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Start cycle/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: /Instrument payment error rates/ }),
    ).toBeInTheDocument();
  });
});
