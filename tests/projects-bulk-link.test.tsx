import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProjectProvider,
  type ProjectContextValue,
} from "@/components/projects/project-context";
import type { ApiGoal } from "@/lib/api/performance";
import { contextFor, fakeActions, sampleData } from "./projects-fixture";

/**
 * Linking many tasks from a project's list.
 *
 * What is proved: the column of choices is there only for the people who may link
 * something here, and a tick only on the tasks each may link; choosing and
 * pressing makes one quiet change per task through the project's own write; the
 * answer is one line and a plain reason for any task that did not change; and no
 * task is required to be linked, so nothing here ever says one is missing.
 */

const actor = vi.hoisted(() => ({
  employeeId: "p-03" as string | null,
  editRecords: false,
  leadsPeople: false,
  headsDepartment: false,
}));
vi.mock("@/lib/store/project-session", () => ({
  useProjectActor: () => actor,
}));

const goals = [
  {
    id: "g1",
    title: "Grow revenue",
    ownerId: null,
    level: "company",
    status: "ON_TRACK",
    keyResults: [],
  },
  {
    id: "g2",
    title: "Lift checkout",
    ownerId: "p-03",
    ownerName: "Chidi Nwosu",
    level: "personal",
    status: "ON_TRACK",
    keyResults: [{ id: "kr1", label: "Conversion" }],
  },
] as unknown as ApiGoal[];
vi.mock("@/lib/store/performance", () => ({
  useDemoObjectives: () => [],
  useKpis: () => ({
    goals,
    cascade: [],
    loading: false,
    error: null,
    source: "api",
    reload: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/projects/pj-chk",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({ flat: [] }),
}));

const { IssuesView } = await import("@/app/(app)/projects/[id]/issues-view");

function mount(overrides: Partial<ProjectContextValue> = {}) {
  const ctx = contextFor(sampleData(), {
    connected: true,
    meId: "p-01",
    canManage: true,
    canWork: true,
    ...overrides,
  });
  render(
    <ProjectProvider value={ctx}>
      <IssuesView />
    </ProjectProvider>,
  );
  return {
    ctx,
    actions: ctx.actions as unknown as ReturnType<typeof fakeActions>,
  };
}

const ticks = () =>
  screen.queryAllByRole("checkbox", { name: /^Choose [A-Z]+-\d+ / });

beforeEach(() => {
  actor.employeeId = "p-03";
  actor.editRecords = false;
});

describe("who is offered the choice", () => {
  it("the project's lead gets a tick on every task", () => {
    mount();
    expect(ticks().length).toBeGreaterThan(10);
    expect(
      screen.getByRole("checkbox", {
        name: "Choose every task shown that you can link",
      }),
    ).toBeInTheDocument();
  });

  it("a member who is not the lead gets a tick on their own tasks only", () => {
    mount({ meId: "p-03", canManage: false });
    const names = ticks().map((t) => t.getAttribute("aria-label") ?? "");
    expect(names.length).toBeGreaterThan(0);
    const data = sampleData();
    const mine = data.issues.filter(
      (i) =>
        i.type !== "EPIC" &&
        i.type !== "SUBTASK" &&
        i.assigneeIds.includes("p-03"),
    );
    expect(names).toHaveLength(mine.length);
  });

  it("a member with nothing of their own to link gets no column at all", () => {
    mount({ meId: "p-77", canManage: false });
    expect(ticks()).toHaveLength(0);
    expect(
      screen.queryByRole("checkbox", { name: /Choose every task/ }),
    ).toBeNull();
  });

  it("somebody who can only read gets no choice, switched off or not", () => {
    mount({ canWork: false });
    expect(ticks()).toHaveLength(0);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("HR, through the records permission, gets every task", () => {
    actor.editRecords = true;
    mount({ meId: "p-77", canManage: false });
    expect(ticks().length).toBeGreaterThan(10);
  });

  it("never offers an initiative or a subtask, which do not count on their own", () => {
    mount();
    const data = sampleData();
    const initiative = data.issues.find((i) => i.type === "EPIC")!;
    expect(
      screen.queryByRole("checkbox", {
        name: new RegExp(`Choose ${initiative.key} `),
      }),
    ).toBeNull();
  });
});

describe("linking the ones chosen", () => {
  const choose = async (title: RegExp) =>
    userEvent.click(
      screen.getByRole("checkbox", {
        name: new RegExp(`Choose .* ${title.source}`),
      }),
    );

  it("shows no bar until something is chosen, then how many", async () => {
    mount();
    expect(
      screen.queryByRole("button", { name: "Link to an objective" }),
    ).toBeNull();
    await choose(/Cart drawer slides in/);
    expect(screen.getByText("1 chosen")).toBeInTheDocument();
  });

  it("makes one quiet change per task, with the objective and no measure", async () => {
    const { actions } = mount();
    await choose(/Cart drawer slides in/);
    await choose(/Address autocomplete/);
    await userEvent.click(
      screen.getByRole("button", { name: "Link to an objective" }),
    );
    const dialog = screen.getByRole("dialog");
    await userEvent.selectOptions(
      within(dialog).getByRole("combobox", { name: /Objective/ }),
      "Grow revenue (Company)",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Link 2 tasks" }),
    );
    await waitFor(() => expect(actions.patchIssue).toHaveBeenCalledTimes(2));
    for (const call of actions.patchIssue.mock.calls) {
      expect(call[1]).toEqual({ goalId: "g1", keyResultId: null });
      expect(call[2]).toEqual({ quiet: true });
    }
    expect(
      await screen.findByText("Linked 2 tasks to Grow revenue."),
    ).toBeInTheDocument();
  });

  it("sends the measure when one is chosen", async () => {
    const { actions } = mount();
    await choose(/Cart drawer slides in/);
    await userEvent.click(
      screen.getByRole("button", { name: "Link to an objective" }),
    );
    const dialog = screen.getByRole("dialog");
    await userEvent.selectOptions(
      within(dialog).getByRole("combobox", { name: /Objective/ }),
      "Lift checkout (Chidi Nwosu)",
    );
    await userEvent.selectOptions(
      within(dialog).getByRole("combobox", { name: /Measure/ }),
      "Conversion",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Link 1 task" }),
    );
    await waitFor(() => expect(actions.patchIssue).toHaveBeenCalledTimes(1));
    expect(actions.patchIssue.mock.calls[0]![1]).toEqual({
      goalId: "g2",
      keyResultId: "kr1",
    });
  });

  it("clears the links when none is chosen", async () => {
    const { actions } = mount();
    await choose(/Cart drawer slides in/);
    await userEvent.click(
      screen.getByRole("button", { name: "Link to an objective" }),
    );
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Clear the link on 1 task",
      }),
    );
    await waitFor(() => expect(actions.patchIssue).toHaveBeenCalled());
    expect(actions.patchIssue.mock.calls[0]![1]).toEqual({
      goalId: null,
      keyResultId: null,
    });
    expect(
      await screen.findByText("Cleared the link on 1 task."),
    ).toBeInTheDocument();
  });

  it("lists the task that did not change with its reason, plainly, and still changes the rest", async () => {
    const { actions } = mount();
    actions.patchIssue
      .mockResolvedValueOnce({ ok: true, value: {} })
      .mockResolvedValueOnce({
        ok: false,
        message: "Only the people this task is assigned to can link it.",
      });
    await choose(/Cart drawer slides in/);
    await choose(/Address autocomplete/);
    await userEvent.click(
      screen.getByRole("button", { name: "Link to an objective" }),
    );
    const dialog = screen.getByRole("dialog");
    await userEvent.selectOptions(
      within(dialog).getByRole("combobox", { name: /Objective/ }),
      "Grow revenue (Company)",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Link 2 tasks" }),
    );
    expect(
      await screen.findByText(
        /Linked 1 task to Grow revenue\. 1 task could not be changed\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Only the people this task is assigned to can link it\./,
      ),
    ).toBeInTheDocument();
    expect(actions.patchIssue).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByRole("dialog").querySelector("[class*=danger]"),
    ).toBeNull();
  });

  it("never says anything is missing a link", async () => {
    mount();
    expect(document.body.textContent).not.toMatch(
      /not linked|no objective|unlinked|missing|should be linked/i,
    );
  });

  it("clears the choice once it is done", async () => {
    mount();
    await choose(/Cart drawer slides in/);
    await userEvent.click(
      screen.getByRole("button", { name: "Link to an objective" }),
    );
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Clear the link on 1 task",
      }),
    );
    await screen.findByText("Cleared the link on 1 task.");
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByText("1 chosen")).toBeNull());
  });

  it("gives focus back to the list when the button that opened the dialog is gone", async () => {
    mount();
    await choose(/Cart drawer slides in/);
    await userEvent.click(
      screen.getByRole("button", { name: "Link to an objective" }),
    );
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Clear the link on 1 task",
      }),
    );
    await screen.findByText("Cleared the link on 1 task.");
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2 })).toHaveFocus(),
    );
  });
});
