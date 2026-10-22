import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProjectProvider,
  type ProjectContextValue,
} from "@/components/projects/project-context";
import type { ApiGoal } from "@/lib/api/performance";
import type { Issue, IssueThread, ProjectData } from "@/lib/projects/types";
import { contextFor, fakeActions, sampleData } from "./projects-fixture";

/**
 * Tying a project, and an issue, to an objective.
 *
 * What is proved: the pickers offer only what the API will accept, they are drawn
 * only to the people the contract lets use them and only against the real API,
 * choosing one makes exactly one call with the objective's id (or `null`), and
 * the weekly-task line under the issue says what the API said and no more.
 */

let thread: IssueThread = { comments: [], activity: [] };
let mineGoals: ApiGoal[] = [];
let companyGoals: ApiGoal[] = [];
let loading = false;
let failed = false;
const reload = vi.fn();

vi.mock("@/lib/api/projects", async (original) => ({
  ...(await original<typeof import("@/lib/api/projects")>()),
  projectsApi: { links: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/lib/store/projects", () => ({
  useIssueThread: () => ({ thread, status: "ready", reload: vi.fn() }),
}));

vi.mock("@/lib/store/project-session", () => ({
  useProjectActor: () => ({
    employeeId: "p-03",
    editRecords: false,
    leadsPeople: false,
    headsDepartment: false,
  }),
}));

vi.mock("@/lib/store/performance", () => ({
  useKpis: (scope: "mine" | "team" | "company") => ({
    goals: scope === "mine" ? mineGoals : companyGoals,
    cascade: [],
    loading,
    error: failed ? { message: "down" } : null,
    source: "api",
    reload,
  }),
}));

vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({ flat: [] }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/projects/pj-chk",
  useSearchParams: () => new URLSearchParams(),
}));

const { IssueDrawer } = await import("@/components/projects/issue-drawer");
const { SettingsView } =
  await import("@/app/(app)/projects/[id]/settings-view");

const goal = (extra: Partial<ApiGoal> & { id: string }): ApiGoal =>
  ({
    title: "Objective",
    ownerId: "p-03",
    ownerName: "Chidi Nwosu",
    departmentId: null,
    departmentName: null,
    level: "personal",
    companyWide: false,
    parentId: null,
    approval: "AGREED",
    ...extra,
  }) as ApiGoal;

const checkout = goal({ id: "g-checkout", title: "Lift checkout conversion" });
const support = goal({ id: "g-support", title: "Cut support tickets" });
const draft = goal({
  id: "g-draft",
  title: "Learn the ledger",
  approval: "DRAFT",
});
const theirs = goal({
  id: "g-theirs",
  title: "Their objective",
  ownerId: "p-04",
  ownerName: "Ngozi Eze",
});
const company = goal({
  id: "g-company",
  title: "Grow online revenue",
  ownerId: null,
  ownerName: null,
  level: "company",
  companyWide: true,
  approval: "DRAFT",
});

const find = (d: ProjectData, pred: (i: Issue) => boolean): Issue =>
  d.issues.find(pred)!;

/** A top-level issue assigned to Chidi (p-03), the signed-in person in these tests. */
const chidis = (d: ProjectData) =>
  find(
    d,
    (i) =>
      i.assigneeId === "p-03" &&
      ["STORY", "TASK", "BUG"].includes(i.type) &&
      i.goalId === null,
  );

function renderDrawer(
  issue: Issue,
  overrides: Partial<ProjectContextValue> = {},
  data: ProjectData = sampleData(),
) {
  const withIssue = {
    ...data,
    issues: data.issues.map((i) => (i.id === issue.id ? issue : i)),
  };
  const ctx = contextFor(withIssue, {
    connected: true,
    meId: "p-03",
    ...overrides,
  });
  const actions = ctx.actions as unknown as ReturnType<typeof fakeActions>;
  render(
    <ProjectProvider value={ctx}>
      <IssueDrawer issue={issue} onClose={vi.fn()} />
    </ProjectProvider>,
  );
  return { ctx, actions };
}

function renderSettings(overrides: Partial<ProjectContextValue> = {}) {
  const ctx = contextFor(sampleData(), {
    connected: true,
    meId: "p-01",
    ...overrides,
  });
  const actions = ctx.actions as unknown as ReturnType<typeof fakeActions>;
  render(
    <ProjectProvider value={ctx}>
      <SettingsView />
    </ProjectProvider>,
  );
  return { ctx, actions };
}

const optionNames = (select: HTMLElement) =>
  within(select)
    .getAllByRole("option")
    .map((o) => o.textContent);

beforeEach(() => {
  thread = { comments: [], activity: [] };
  mineGoals = [theirs, draft, support, checkout, company];
  companyGoals = [theirs, draft, support, checkout, company];
  loading = false;
  failed = false;
  reload.mockClear();
});

describe("count toward, on an issue", () => {
  it("offers the assignee only their own agreed objectives, and None", () => {
    renderDrawer(chidis(sampleData()));
    const select = screen.getByRole("combobox", { name: "Count toward" });
    expect(optionNames(select)).toEqual([
      "None",
      "Cut support tickets",
      "Lift checkout conversion",
    ]);
  });

  it("links the issue to the one chosen, once", async () => {
    const issue = chidis(sampleData());
    const { actions } = renderDrawer(issue);
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Count toward" }),
      "Lift checkout conversion",
    );
    expect(actions.patchIssue).toHaveBeenCalledTimes(1);
    expect(actions.patchIssue).toHaveBeenCalledWith(issue, {
      goalId: "g-checkout",
    });
  });

  it("asks for the issue again once the link is saved, so the weekly-task line follows", async () => {
    const issue = chidis(sampleData());
    const { actions } = renderDrawer(issue);
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Count toward" }),
      "Lift checkout conversion",
    );
    await waitFor(() =>
      expect(actions.refreshIssue).toHaveBeenCalledWith(issue),
    );
  });

  it("does not ask again when the save was refused", async () => {
    const issue = chidis(sampleData());
    const { actions } = renderDrawer(issue);
    actions.patchIssue.mockResolvedValueOnce({
      ok: false,
      message: "No",
    });
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Count toward" }),
      "Lift checkout conversion",
    );
    await waitFor(() => expect(actions.patchIssue).toHaveBeenCalled());
    expect(actions.refreshIssue).not.toHaveBeenCalled();
  });

  it("unlinks with null, not by leaving the field out", async () => {
    const issue = { ...chidis(sampleData()), goalId: "g-checkout" };
    const { actions } = renderDrawer(issue);
    const select = screen.getByRole("combobox", { name: "Count toward" });
    expect(select).toHaveValue("g-checkout");
    await userEvent.selectOptions(select, "None");
    expect(actions.patchIssue).toHaveBeenCalledWith(issue, { goalId: null });
  });

  it("keeps a saved link visible even when it is no longer on offer", () => {
    const issue = { ...chidis(sampleData()), goalId: "g-draft" };
    renderDrawer(issue);
    const select = screen.getByRole("combobox", { name: "Count toward" });
    expect(select).toHaveValue("g-draft");
    expect(optionNames(select)).toContain("Learn the ledger");
  });

  it("says so, in a line, when the assignee has nothing agreed to count toward", () => {
    mineGoals = [draft, theirs];
    renderDrawer(chidis(sampleData()));
    expect(
      screen.getByText(
        "You have no agreed objective to count this toward yet.",
      ),
    ).toBeInTheDocument();
  });

  it("waits for the objectives instead of showing an empty list", () => {
    loading = true;
    mineGoals = [];
    renderDrawer(chidis(sampleData()));
    const select = screen.getByRole("combobox", { name: "Count toward" });
    expect(select).toBeDisabled();
    expect(optionNames(select)).toEqual(["Loading objectives"]);
    expect(screen.queryByText(/no agreed objective/)).not.toBeInTheDocument();
  });

  it("says when the objectives could not be loaded, and offers another try", async () => {
    failed = true;
    renderDrawer(chidis(sampleData()));
    expect(
      screen.getByText(/Your objectives could not be loaded/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  describe("who is offered it", () => {
    it("draws nothing at all in the demo, even for the assignee", () => {
      renderDrawer(chidis(sampleData()), { connected: false });
      expect(screen.queryByText("Count toward")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("combobox", { name: "Count toward" }),
      ).not.toBeInTheDocument();
    });

    it("draws nothing for the lead when the issue is somebody else's and not linked", () => {
      renderDrawer(chidis(sampleData()), { meId: "p-01", canManage: true });
      expect(screen.queryByText("Count toward")).not.toBeInTheDocument();
    });

    it("draws nothing for another member", () => {
      renderDrawer(chidis(sampleData()), { meId: "p-09", canManage: false });
      expect(screen.queryByText("Count toward")).not.toBeInTheDocument();
    });

    it("gives the lead only a way to remove a link somebody else made", async () => {
      const issue = { ...chidis(sampleData()), goalId: "g-checkout" };
      const { actions } = renderDrawer(issue, {
        meId: "p-01",
        canManage: true,
      });
      expect(
        screen.queryByRole("combobox", { name: "Count toward" }),
      ).not.toBeInTheDocument();
      expect(screen.getByText("An objective the assignee chose")).toBeVisible();
      await userEvent.click(
        screen.getByRole("button", { name: "Remove link" }),
      );
      expect(actions.patchIssue).toHaveBeenCalledWith(issue, { goalId: null });
    });

    it("gives a member who may not manage nothing, even on a linked issue", () => {
      const issue = { ...chidis(sampleData()), goalId: "g-checkout" };
      renderDrawer(issue, { meId: "p-09", canManage: false });
      expect(screen.queryByText("Count toward")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Remove link" }),
      ).not.toBeInTheDocument();
    });

    it("draws nothing on an epic or a sub-task, which never file", () => {
      const data = sampleData();
      const epic = {
        ...find(data, (i) => i.type === "EPIC"),
        assigneeId: "p-03",
      };
      renderDrawer(epic, {}, data);
      expect(screen.queryByText("Count toward")).not.toBeInTheDocument();
    });

    it("draws nothing on a sub-task assigned to the signed-in person", () => {
      const data = sampleData();
      const sub = {
        ...find(data, (i) => i.type === "SUBTASK"),
        assigneeId: "p-03",
      };
      renderDrawer(sub, {}, data);
      expect(screen.queryByText("Count toward")).not.toBeInTheDocument();
    });
  });
});

describe("the weekly-task line, in the three states", () => {
  const withWeekly = (weeklyTask: Issue["weeklyTask"]) => ({
    ...chidis(sampleData()),
    weeklyTask,
  });

  it("says a task was filed, and not which week", () => {
    renderDrawer(withWeekly({ state: "FILED", taskId: "t1", graded: false }));
    expect(screen.getByText("Filed as a weekly task")).toBeInTheDocument();
    expect(screen.queryByText(/this week/i)).not.toBeInTheDocument();
  });

  it("says it was graded once it has been", () => {
    renderDrawer(withWeekly({ state: "FILED", taskId: "t1", graded: true }));
    expect(
      screen.getByText("Filed as a weekly task, and graded"),
    ).toBeInTheDocument();
  });

  it("shows the API's sentence when nothing could be filed", () => {
    const message =
      "Not counted toward a weekly task, link this issue or the project to an objective.";
    renderDrawer(
      withWeekly({ state: "NOT_COUNTED", reason: "NO_OBJECTIVE", message }),
    );
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it("shows the API's sentence when the week has closed", () => {
    const message =
      "Not counted toward a weekly task, it was finished in a week that has closed.";
    renderDrawer(
      withWeekly({ state: "NOT_COUNTED", reason: "WEEK_CLOSED", message }),
    );
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it("says nothing when the API says nothing", () => {
    renderDrawer(withWeekly(null));
    expect(screen.queryByText(/weekly task/i)).not.toBeInTheDocument();
  });
});

describe("count finished work toward, in settings", () => {
  const FIELD = /Count finished work toward/;

  it("offers agreed objectives and the company ones, never a draft personal one", () => {
    renderSettings();
    const select = screen.getByRole("combobox", { name: FIELD });
    expect(optionNames(select)).toEqual([
      "None",
      "Cut support tickets (Chidi Nwosu)",
      "Grow online revenue (Company)",
      "Lift checkout conversion (Chidi Nwosu)",
      "Their objective (Ngozi Eze)",
    ]);
  });

  it("links the project to the one chosen", async () => {
    const { actions } = renderSettings();
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: FIELD }),
      "Grow online revenue (Company)",
    );
    expect(actions.updateProject).toHaveBeenCalledTimes(1);
    expect(actions.updateProject).toHaveBeenCalledWith({
      goalId: "g-company",
    });
  });

  it("unlinks with null", async () => {
    const data = sampleData();
    const ctx = contextFor(
      { ...data, project: { ...data.project, goalId: "g-company" } },
      { connected: true, meId: "p-01" },
    );
    render(
      <ProjectProvider value={ctx}>
        <SettingsView />
      </ProjectProvider>,
    );
    const select = screen.getByRole("combobox", { name: FIELD });
    expect(select).toHaveValue("g-company");
    await userEvent.selectOptions(select, "None");
    expect(
      (ctx.actions as unknown as ReturnType<typeof fakeActions>).updateProject,
    ).toHaveBeenCalledWith({ goalId: null });
  });

  it("explains what it does, in one plain sentence", () => {
    renderSettings();
    expect(
      screen.getByRole("combobox", { name: FIELD }),
    ).toHaveAccessibleDescription(
      /When someone finishes an issue assigned to them, a weekly task is filed under this objective for the week it was finished\. A manager still grades it\./,
    );
  });

  it("adds that a company objective files under each person's own, once one is chosen", () => {
    const data = sampleData();
    const ctx = contextFor(
      { ...data, project: { ...data.project, goalId: "g-company" } },
      { connected: true, meId: "p-01" },
    );
    render(
      <ProjectProvider value={ctx}>
        <SettingsView />
      </ProjectProvider>,
    );
    expect(
      screen.getByRole("combobox", { name: FIELD }),
    ).toHaveAccessibleDescription(
      /each person's work is filed under their own objective beneath it/,
    );
  });

  it("does not say that for a personal objective, which files under itself", () => {
    const data = sampleData();
    const ctx = contextFor(
      { ...data, project: { ...data.project, goalId: "g-checkout" } },
      { connected: true, meId: "p-01" },
    );
    render(
      <ProjectProvider value={ctx}>
        <SettingsView />
      </ProjectProvider>,
    );
    expect(
      screen.getByRole("combobox", { name: FIELD }),
    ).not.toHaveAccessibleDescription(/each person's work/);
  });

  it("is the lead's and HR's to set: not drawn for a member who cannot manage", () => {
    renderSettings({ canManage: false });
    expect(
      screen.queryByRole("combobox", { name: FIELD }),
    ).not.toBeInTheDocument();
  });

  it("is not drawn in the demo", () => {
    renderSettings({ connected: false });
    expect(
      screen.queryByRole("combobox", { name: FIELD }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(FIELD)).not.toBeInTheDocument();
  });

  it("says when there is nothing agreed to choose from", () => {
    companyGoals = [draft];
    renderSettings();
    expect(
      screen.getByText("There are no agreed objectives to choose from yet."),
    ).toBeInTheDocument();
  });
});
