import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiGoal } from "@/lib/api/performance";
import {
  goalFacts,
  objectiveWhoseChoices,
  rungLabel,
} from "@/app/(app)/performance/goal-facts";

/**
 * "New objective" — the top-level button on the KPI screen, which used to say
 * "New KPI" and made a standalone KPI with nowhere to go next.
 *
 * What `tsc` cannot see here, and what each test pins:
 *
 * - **Who is offered what.** A choice the API will refuse is a name put in
 *   front of somebody that does not work, so a department head is offered the
 *   departments they head and a plain employee is offered only themselves.
 * - **Where the select starts.** A head's own department, otherwise the company
 *   for somebody who may set one. Starting on the wrong rung files the
 *   objective somewhere nobody meant.
 * - **A blank form on every open.** The dialog stays mounted for its exit
 *   animation, so without a reset the KPI added under a brand-new objective
 *   opens with the objective's title already typed in it.
 */

const state = vi.hoisted(() => ({
  permissions: new Set<string>(),
  employeeId: "emp-head" as string | null,
  departments: [] as { id: string; name: string; headId: string | null }[],
}));

vi.mock("@/lib/permissions", () => ({
  useCan: (permission: string) => state.permissions.has(permission),
}));
vi.mock("@/lib/store/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/session")>()),
  useSession: () => ({ employeeId: state.employeeId }),
}));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({ flat: state.departments }),
  useHeadedDepartmentIds: () =>
    new Set(
      state.departments
        .filter((department) => department.headId === state.employeeId)
        .map((department) => department.id),
    ),
}));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({ employees: [], people: [] }),
}));
vi.mock("@/lib/store/performance", () => ({
  useAppraisals: () => ({ cycles: [] }),
}));
vi.mock("@/lib/store/ai", () => ({
  /* No assistant wired, so the suggestion button under a parent is absent. */
  useAssistantAvailable: () => ({ available: false, loading: false }),
  useObjectiveSuggestions: () => ({
    loading: false,
    ask: vi.fn(),
    clear: vi.fn(),
  }),
}));

const { NewKpiDialog } = await import("@/app/(app)/performance/goal-dialogs");

const ENGINEERING = { id: "d-eng", name: "Engineering", headId: "emp-head" };
const FINANCE = { id: "d-fin", name: "Finance", headId: "emp-other" };

beforeEach(() => {
  state.permissions = new Set();
  state.employeeId = "emp-head";
  state.departments = [ENGINEERING, FINANCE];
});

const whoseSelect = () =>
  screen.getByRole("combobox", { name: /whose objective/i });

const options = () =>
  Array.from(whoseSelect().querySelectorAll("option")).map(
    (option) => option.value,
  );

describe("the objective form", () => {
  it("is called an objective, from the title to the button", () => {
    render(
      <NewKpiDialog
        open
        mode="objective"
        onClose={vi.fn()}
        onCreate={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "New objective" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Create objective" }),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/create kpi/i)).not.toBeInTheDocument();
  });

  it("offers a department head the department they head, and starts there", () => {
    render(
      <NewKpiDialog
        open
        mode="objective"
        onClose={vi.fn()}
        onCreate={vi.fn()}
      />,
    );
    expect(options()).toEqual(["dept:d-eng", "me"]);
    expect(whoseSelect()).toHaveValue("dept:d-eng");
  });

  it("offers HR the company and every department, starting on the company", () => {
    state.permissions = new Set(["EDIT_RECORDS"]);
    state.employeeId = "emp-hr";
    render(
      <NewKpiDialog
        open
        mode="objective"
        onClose={vi.fn()}
        onCreate={vi.fn()}
      />,
    );
    expect(options()).toEqual(["company", "dept:d-eng", "dept:d-fin", "me"]);
    expect(whoseSelect()).toHaveValue("company");
  });

  it("offers a plain employee only themselves", () => {
    state.employeeId = "emp-plain";
    render(
      <NewKpiDialog
        open
        mode="objective"
        onClose={vi.fn()}
        onCreate={vi.fn()}
      />,
    );
    expect(options()).toEqual(["me"]);
    expect(whoseSelect()).toHaveValue("me");
  });

  it("files a department objective under the department, owned by nobody", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(
      <NewKpiDialog
        open
        mode="objective"
        onClose={vi.fn()}
        onCreate={onCreate}
      />,
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /what is being aimed at/i }),
      "Ship the payments rebuild",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Create objective" }),
    );
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0]?.[0]).toMatchObject({
      title: "Ship the payments rebuild",
      ownerId: null,
      departmentId: "d-eng",
    });
  });

  it("opens blank every time, not on whatever was typed last", async () => {
    const { rerender } = render(
      <NewKpiDialog
        open
        mode="objective"
        onClose={vi.fn()}
        onCreate={vi.fn()}
      />,
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /what is being aimed at/i }),
      "Ship the payments rebuild",
    );
    await userEvent.selectOptions(whoseSelect(), "me");

    /* Closed, then opened again — what "Add a KPI under this" does to the very
       same mounted dialog straight after an objective was made. */
    rerender(
      <NewKpiDialog
        open={false}
        mode="objective"
        onClose={vi.fn()}
        onCreate={vi.fn()}
      />,
    );
    rerender(
      <NewKpiDialog open mode="kpi" onClose={vi.fn()} onCreate={vi.fn()} />,
    );

    expect(
      screen.getByRole("textbox", { name: /what is being aimed at/i }),
    ).toHaveValue("");
    expect(screen.getByRole("combobox", { name: /whose kpi/i })).toHaveValue(
      "me",
    );
  });
});

describe("the KPI form is as it was", () => {
  it("still says KPI, and still starts on the person making it", () => {
    render(<NewKpiDialog open onClose={vi.fn()} onCreate={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "New KPI" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Create KPI" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /whose kpi/i })).toHaveValue(
      "me",
    );
  });

  it("names the objective it goes under", () => {
    render(
      <NewKpiDialog
        open
        parentId="g-1"
        parentTitle="Ship the payments rebuild"
        onClose={vi.fn()}
        onCreate={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("heading", {
        name: 'New KPI under "Ship the payments rebuild"',
      }),
    ).toBeInTheDocument();
  });
});

describe("whose objective, as a pure choice", () => {
  const departments = [ENGINEERING, FINANCE];

  it("never offers what the API would refuse", () => {
    const choices = objectiveWhoseChoices({
      departments,
      employeeId: "emp-head",
      canSetCompanyWide: false,
    });
    expect(choices.choices.map((choice) => choice.value)).toEqual([
      "dept:d-eng",
      "me",
    ]);
  });

  it("starts on a headed department, then the company, then yourself", () => {
    const start = (input: {
      employeeId: string | null;
      canSetCompanyWide: boolean;
    }) => objectiveWhoseChoices({ departments, ...input }).fallback;

    expect(start({ employeeId: "emp-head", canSetCompanyWide: false })).toBe(
      "dept:d-eng",
    );
    /* HR who also heads a department: the department is the narrower, more
       likely meaning. */
    expect(start({ employeeId: "emp-head", canSetCompanyWide: true })).toBe(
      "dept:d-eng",
    );
    expect(start({ employeeId: "emp-hr", canSetCompanyWide: true })).toBe(
      "company",
    );
    expect(start({ employeeId: "emp-plain", canSetCompanyWide: false })).toBe(
      "me",
    );
    expect(start({ employeeId: null, canSetCompanyWide: false })).toBe("me");
  });

  it("lists a department once for somebody who heads two", () => {
    const two = objectiveWhoseChoices({
      departments: [
        ENGINEERING,
        { id: "d-prod", name: "Product", headId: "emp-head" },
        FINANCE,
      ],
      employeeId: "emp-head",
      canSetCompanyWide: false,
    });
    expect(two.choices.map((choice) => choice.value)).toEqual([
      "dept:d-eng",
      "dept:d-prod",
      "me",
    ]);
    expect(two.fallback).toBe("dept:d-eng");
  });
});

describe("what the detail modal is told about a goal", () => {
  const goal = (over: Partial<ApiGoal> = {}): ApiGoal => ({
    id: "g-1",
    title: "Ship the payments rebuild",
    description: null,
    ownerId: null,
    ownerName: null,
    departmentId: "d-eng",
    departmentName: "Engineering",
    level: "department",
    companyWide: false,
    parentId: null,
    parentTitle: null,
    status: "ON_TRACK",
    progress: 0,
    measuredProgress: null,
    dueQuarter: "2026-Q3",
    reviewCycleId: null,
    reviewCycleName: null,
    approval: "DRAFT",
    approvalLabel: "Draft",
    targetFrozen: false,
    submittedAt: null,
    agreedAt: null,
    approvalNote: null,
    revisionCount: 0,
    revisedAt: null,
    keyResults: [],
    childCount: 0,
    createdAt: "2026-10-09T08:00:00.000Z",
    updatedAt: "2026-10-09T08:00:00.000Z",
    ...over,
  });

  it("names the rung from the API's own level", () => {
    expect(rungLabel(goal())).toBe("Engineering objective");
    expect(rungLabel(goal({ departmentName: null }))).toBe(
      "Department objective",
    );
    expect(rungLabel(goal({ level: "company" }))).toBe("Company KPI");
    expect(rungLabel(goal({ level: "personal" }))).toBe("Personal KPI");
  });

  it("takes measured progress over the stored figure", () => {
    expect(goalFacts(goal({ progress: 10 }), null).progress).toBe(10);
    expect(
      goalFacts(goal({ progress: 10, measuredProgress: 40 }), null).progress,
    ).toBe(40);
  });

  it("lets only the owner log tasks, and only once it is agreed", () => {
    const mine = goal({ ownerId: "emp-1", approval: "AGREED" });
    expect(goalFacts(mine, "emp-1").canLogTasks).toBe(true);
    expect(goalFacts(mine, "emp-2").canLogTasks).toBe(false);
    expect(goalFacts({ ...mine, approval: "DRAFT" }, "emp-1").canLogTasks).toBe(
      false,
    );
    expect(goalFacts({ ...mine, status: "DONE" }, "emp-1").canLogTasks).toBe(
      false,
    );
  });

  it("will not offer to tell people about an objective with no measure", () => {
    expect(goalFacts(goal(), null).canShare).toBe(false);
    expect(goalFacts(goal({ dueQuarter: null }), null).canShare).toBe(false);
  });

  it("says when there is no period to be agreed in", () => {
    expect(goalFacts(goal(), null).noPeriod).toBe(false);
    expect(goalFacts(goal({ dueQuarter: null }), null).noPeriod).toBe(true);
    expect(
      goalFacts(goal({ dueQuarter: null, reviewCycleId: "c-1" }), null)
        .noPeriod,
    ).toBe(false);
  });
});
