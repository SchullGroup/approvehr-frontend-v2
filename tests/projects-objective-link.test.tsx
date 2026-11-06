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
 * Linking a project, and a task, to an objective: optional, and forgiving.
 *
 * What is proved: the picker offers every objective the person can see (a draft
 * included, grouped by level), it is drawn to the people the contract lets link
 * and to nobody else, in the demo as well as against the API, choosing one makes
 * exactly one call with the objective's id (and the measure, or `null` for
 * none), and a task that is not linked is never mentioned: no error, no warning
 * and no red.
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

/* Programs are not what this file is about: a company with none. */
vi.mock("@/lib/store/programs", () => ({
  useProgramFacts: () => ({ facts: null, seesAll: false }),
  useProgramList: () => ({
    status: "ready",
    error: null,
    data: { programs: [], canCreate: false, seesAll: false },
    reload: vi.fn(),
  }),
  useProgramActions: () => ({ moveProject: vi.fn() }),
}));

vi.mock("@/lib/store/projects", () => ({
  useIssueThread: () => ({ thread, status: "ready", reload: vi.fn() }),
}));

const actor = vi.hoisted(() => ({
  employeeId: "p-03" as string | null,
  editRecords: false,
  leadsPeople: false,
  headsDepartment: false,
}));

vi.mock("@/lib/store/project-session", () => ({
  useProjectActor: () => actor,
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
    status: "ON_TRACK",
    keyResults: [],
    ...extra,
  }) as ApiGoal;

const checkout = goal({ id: "g-checkout", title: "Lift checkout conversion" });
const support = goal({ id: "g-support", title: "Cut support tickets" });
const draft = goal({
  id: "g-draft",
  title: "Learn the ledger",
  approval: "DRAFT",
});
const withMeasures = goal({
  id: "g-measured",
  title: "Win back lapsed buyers",
  keyResults: [
    { id: "kr-a", label: "Buyers returned" },
    { id: "kr-b", label: "Repeat orders" },
  ] as ApiGoal["keyResults"],
});
const department = goal({
  id: "g-dept",
  title: "Engineering ships on time",
  ownerId: null,
  ownerName: null,
  level: "department",
  departmentName: "Engineering",
  companyWide: false,
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

beforeEach(() => {
  actor.editRecords = false;
  thread = { comments: [], activity: [] };
  mineGoals = [];
  companyGoals = [
    theirs,
    draft,
    support,
    checkout,
    company,
    department,
    withMeasures,
  ];
  loading = false;
  failed = false;
  reload.mockClear();
});

const LABEL = "Link to an objective (optional)";

describe("link to an objective, on a task", () => {
  it("offers every objective the person can see, grouped by level, and No link", () => {
    renderDrawer(chidis(sampleData()));
    const select = screen.getByRole("combobox", { name: LABEL });
    expect(optionNames(select)).toEqual([
      "No link",
      "Grow online revenue (Company)",
      "Engineering ships on time (Department · Engineering)",
      "Cut support tickets",
      "Learn the ledger",
      "Lift checkout conversion",
      "Win back lapsed buyers",
      "Their objective (Ngozi Eze)",
    ]);
    expect(
      within(select)
        .getAllByRole("group")
        .map((g) => g.getAttribute("label")),
    ).toEqual(["Company", "Department", "Personal"]);
  });

  it("links the task to the one chosen, once, with no measure", async () => {
    const issue = chidis(sampleData());
    const { actions } = renderDrawer(issue);
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: LABEL }),
      "Lift checkout conversion",
    );
    expect(actions.patchIssue).toHaveBeenCalledTimes(1);
    expect(actions.patchIssue).toHaveBeenCalledWith(issue, {
      goalId: "g-checkout",
      keyResultId: null,
    });
  });

  it("links to a draft objective too, and to a company one", async () => {
    const issue = chidis(sampleData());
    const { actions } = renderDrawer(issue);
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: LABEL }),
      "Learn the ledger",
    );
    expect(actions.patchIssue).toHaveBeenLastCalledWith(issue, {
      goalId: "g-draft",
      keyResultId: null,
    });
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: LABEL }),
      "Grow online revenue (Company)",
    );
    expect(actions.patchIssue).toHaveBeenLastCalledWith(issue, {
      goalId: "g-company",
      keyResultId: null,
    });
  });

  it("offers a measure only once an objective with measures is chosen, and narrows to it", async () => {
    const issue = { ...chidis(sampleData()), goalId: "g-measured" };
    const { actions } = renderDrawer(issue);
    const measure = screen.getByRole("combobox", {
      name: "Measure (optional)",
    });
    expect(optionNames(measure)).toEqual([
      "Whole objective",
      "Buyers returned",
      "Repeat orders",
    ]);
    await userEvent.selectOptions(measure, "Repeat orders");
    expect(actions.patchIssue).toHaveBeenCalledWith(issue, {
      goalId: "g-measured",
      keyResultId: "kr-b",
    });
  });

  it("offers no measure for an objective that has none", () => {
    renderDrawer({ ...chidis(sampleData()), goalId: "g-checkout" });
    expect(
      screen.queryByRole("combobox", { name: "Measure (optional)" }),
    ).not.toBeInTheDocument();
  });

  it("asks for the task again once the link is saved, so the line follows", async () => {
    const issue = chidis(sampleData());
    const { actions } = renderDrawer(issue);
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: LABEL }),
      "Lift checkout conversion",
    );
    await waitFor(() =>
      expect(actions.refreshIssue).toHaveBeenCalledWith(issue),
    );
  });

  it("does not ask again when the save was refused", async () => {
    const issue = chidis(sampleData());
    const { actions } = renderDrawer(issue);
    actions.patchIssue.mockResolvedValueOnce({ ok: false, message: "No" });
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: LABEL }),
      "Lift checkout conversion",
    );
    await waitFor(() => expect(actions.patchIssue).toHaveBeenCalled());
    expect(actions.refreshIssue).not.toHaveBeenCalled();
  });

  it("unlinks with null for both, not by leaving the fields out", async () => {
    const issue = { ...chidis(sampleData()), goalId: "g-checkout" };
    const { actions } = renderDrawer(issue);
    const select = screen.getByRole("combobox", { name: LABEL });
    expect(select).toHaveValue("g-checkout");
    await userEvent.selectOptions(select, "No link");
    expect(actions.patchIssue).toHaveBeenCalledWith(issue, {
      goalId: null,
      keyResultId: null,
    });
  });

  it("keeps a saved link visible even when the person cannot list it", () => {
    const issue = { ...chidis(sampleData()), goalId: "g-gone" };
    renderDrawer(issue);
    const select = screen.getByRole("combobox", { name: LABEL });
    expect(select).toHaveValue("g-gone");
    expect(optionNames(select)).toContain("A linked objective");
  });

  it("reads one neutral line when linked, and nothing when not", () => {
    renderDrawer({ ...chidis(sampleData()), goalId: "g-checkout" });
    expect(
      screen.getByText("Linked to Lift checkout conversion"),
    ).toBeInTheDocument();
  });

  it("says nothing at all for a task that is not linked, and no alert, warning or red", () => {
    const { ctx } = renderDrawer(chidis(sampleData()));
    expect(
      screen.queryByText(/^Linked (to|objective)/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/not counted|weekly task|waiting|no objective|!/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.querySelector(".text-danger-text")).toBeNull();
    expect(ctx.actions.patchIssue).not.toHaveBeenCalled();
  });

  it("is absent, not an empty control, when there is nothing to choose from and nothing linked", () => {
    companyGoals = [];
    renderDrawer(chidis(sampleData()));
    expect(
      screen.queryByRole("combobox", { name: LABEL }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/no objective|nothing/i)).not.toBeInTheDocument();
  });

  it("waits for the objectives instead of showing an empty list", () => {
    loading = true;
    companyGoals = [];
    renderDrawer(chidis(sampleData()));
    const select = screen.getByRole("combobox", { name: LABEL });
    expect(select).toBeDisabled();
    expect(optionNames(select)).toEqual(["Loading objectives"]);
  });

  it("says plainly, without alarm, when the objectives could not be loaded, and offers another try", async () => {
    failed = true;
    renderDrawer(chidis(sampleData()));
    const line = screen.getByText(/Objectives could not be loaded/);
    expect(line).toBeInTheDocument();
    expect(line.className).not.toMatch(/danger/);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  describe("who is offered it", () => {
    it("the assignee, against the API", () => {
      renderDrawer(chidis(sampleData()), { meId: "p-03", canManage: false });
      expect(screen.getByRole("combobox", { name: LABEL })).toBeInTheDocument();
    });

    it("the assignee, in the demo too", () => {
      renderDrawer(chidis(sampleData()), {
        connected: false,
        meId: "p-03",
        canManage: false,
      });
      expect(screen.getByRole("combobox", { name: LABEL })).toBeInTheDocument();
    });

    it("the project's lead or HR, for somebody else's task", () => {
      renderDrawer(chidis(sampleData()), { meId: "p-01", canManage: true });
      expect(screen.getByRole("combobox", { name: LABEL })).toBeInTheDocument();
    });

    it("HR through the records permission, even without managing the project", () => {
      actor.editRecords = true;
      renderDrawer(chidis(sampleData()), { meId: "p-77", canManage: false });
      expect(screen.getByRole("combobox", { name: LABEL })).toBeInTheDocument();
    });

    it("the assignee's manager, in the demo, from the reporting line", () => {
      /* p-03 reports to p-01 in the demo directory. */
      renderDrawer(chidis(sampleData()), {
        connected: false,
        meId: "p-01",
        canManage: false,
      });
      expect(screen.getByRole("combobox", { name: LABEL })).toBeInTheDocument();
    });

    it("draws nothing for another member who may not manage, and no control either", () => {
      renderDrawer(chidis(sampleData()), { meId: "p-09", canManage: false });
      expect(screen.queryByText(LABEL)).not.toBeInTheDocument();
      expect(
        screen.queryByRole("combobox", { name: LABEL }),
      ).not.toBeInTheDocument();
    });

    it("shows that other member only the line, when linked", () => {
      renderDrawer(
        { ...chidis(sampleData()), goalId: "g-checkout" },
        { meId: "p-09", canManage: false },
      );
      expect(
        screen.queryByRole("combobox", { name: LABEL }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /remove link/i }),
      ).not.toBeInTheDocument();
    });

    it("the API's own answer wins: told no, even the assignee is drawn nothing", () => {
      renderDrawer(
        { ...chidis(sampleData()), canLinkObjective: false },
        { meId: "p-03", canManage: false },
      );
      expect(
        screen.queryByRole("combobox", { name: LABEL }),
      ).not.toBeInTheDocument();
    });

    it("draws nothing on an initiative or a subtask, which never count on their own", () => {
      const data = sampleData();
      const epic = {
        ...find(data, (i) => i.type === "EPIC"),
        assigneeId: "p-03",
        assigneeIds: ["p-03"],
      };
      renderDrawer(epic, {}, data);
      expect(screen.queryByText(LABEL)).not.toBeInTheDocument();
      const sub = {
        ...find(data, (i) => i.type === "SUBTASK"),
        assigneeId: "p-03",
        assigneeIds: ["p-03"],
      };
      renderDrawer(sub, {}, data);
      expect(screen.queryByText(LABEL)).not.toBeInTheDocument();
    });
  });
});

describe("link to an objective, in settings", () => {
  const FIELD = /Link to an objective/;

  it("offers every objective, grouped, and No link", () => {
    renderSettings();
    const select = screen.getByRole("combobox", { name: FIELD });
    expect(optionNames(select)[0]).toBe("No link");
    expect(optionNames(select)).toContain("Learn the ledger (Chidi Nwosu)");
    expect(optionNames(select)).toContain("Grow online revenue (Company)");
  });

  it("says it is optional", () => {
    renderSettings();
    expect(
      screen.getByRole("combobox", {
        name: /Link to an objective\s*\(optional\)/,
      }),
    ).toBeInTheDocument();
  });

  it("links the project to the one chosen", async () => {
    const { actions } = renderSettings();
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: FIELD }),
      "Grow online revenue (Company)",
    );
    expect(actions.updateProject).toHaveBeenCalledTimes(1);
    expect(actions.updateProject).toHaveBeenCalledWith({ goalId: "g-company" });
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
    await userEvent.selectOptions(select, "No link");
    expect(
      (ctx.actions as unknown as ReturnType<typeof fakeActions>).updateProject,
    ).toHaveBeenCalledWith({ goalId: null });
  });

  it("explains it in one plain sentence, with no talk of weekly tasks or grading", () => {
    renderSettings();
    const field = screen.getByRole("combobox", { name: FIELD });
    expect(field).toHaveAccessibleDescription(
      /Tasks in this project use this link unless they have one of their own\. You can leave it empty\./,
    );
    expect(field).not.toHaveAccessibleDescription(/weekly task|grade/i);
  });

  it("is drawn in the demo as well", () => {
    renderSettings({ connected: false });
    expect(screen.getByRole("combobox", { name: FIELD })).toBeInTheDocument();
  });

  it("is absent for somebody who may not manage the project", () => {
    renderSettings({ canManage: false });
    expect(
      screen.queryByRole("combobox", { name: FIELD }),
    ).not.toBeInTheDocument();
  });
});
