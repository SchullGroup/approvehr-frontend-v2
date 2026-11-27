import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/lib/api/client";
import type { DirectoryPerson } from "@/lib/types";

/**
 * A department head or line manager holds no `EDIT_RECORDS`, so the directory
 * answers them with lookup rows. The two dialogs that offer a leader their
 * people read the full rows, which were never sent, and showed an empty list:
 * "Nobody is in this department yet" over a department with people in it, and
 * a KPI form that could not pick anybody.
 *
 * Here the directory hands back what a lookup caller is really sent, and the
 * dialogs must offer exactly the people the API will let them set goals for.
 */

const state = vi.hoisted(() => ({
  permissions: new Set<string>(),
  employeeId: "emp-head" as string | null,
  departments: [] as { id: string; name: string; headId: string | null }[],
  people: [] as DirectoryPerson[],
  asked: [] as unknown[],
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
  useEmployeeDirectory: (params: { departmentId?: string }) => {
    state.asked.push(params);
    /* The server's own filter, which a lookup caller gets as much as anybody. */
    const people = params?.departmentId
      ? state.people.filter((one) => one.departmentId === params.departmentId)
      : state.people;
    return { employees: [], people, lookupOnly: true };
  },
}));
vi.mock("@/lib/store/performance", () => ({
  useAppraisals: () => ({ cycles: [] }),
}));
vi.mock("@/lib/store/ai", () => ({
  useAssistantAvailable: () => ({ available: false, loading: false }),
  useObjectiveSuggestions: () => ({
    loading: false,
    ask: vi.fn(),
    clear: vi.fn(),
  }),
}));

const { AssignKpiDialog } =
  await import("@/app/(app)/performance/goal-dialogs");

const person = (
  id: string,
  fullName: string,
  over: Partial<DirectoryPerson> = {},
): DirectoryPerson => ({
  id,
  fullName,
  jobTitle: "Analyst",
  department: "Engineering",
  departmentId: "d-eng",
  managerId: null,
  ...over,
});

beforeEach(() => {
  state.permissions = new Set();
  state.employeeId = "emp-head";
  state.asked = [];
  state.departments = [
    { id: "d-eng", name: "Engineering", headId: "emp-head" },
    { id: "d-fin", name: "Finance", headId: "emp-other" },
  ];
  state.people = [
    person("emp-head", "Adaeze Okonkwo"),
    person("eng-1", "Tunde Bello"),
    person("eng-2", "Ife Adeyemi"),
    /* Reports to the head from another department. */
    person("fin-report", "Kemi Cole", {
      department: "Finance",
      departmentId: "d-fin",
      managerId: "emp-head",
    }),
    person("fin-1", "Segun Ojo", {
      department: "Finance",
      departmentId: "d-fin",
    }),
  ];
});

const companyObjective: {
  id: string;
  title: string;
  departmentId: string | null;
  dueQuarter: string | null;
} = {
  id: "g-company",
  title: "Grow the business",
  departmentId: null,
  dueQuarter: null,
};

const people = () =>
  screen
    .getAllByRole("checkbox")
    .map((box) => (box as HTMLInputElement).labels?.[0]?.textContent);

describe("Give a KPI to people, as a department head", () => {
  it("lists the department's members and a direct report from elsewhere, not another department", () => {
    render(
      <AssignKpiDialog
        open
        parent={companyObjective}
        onClose={vi.fn()}
        onAssign={vi.fn()}
      />,
    );
    expect(people()).toEqual([
      expect.stringContaining("Adaeze Okonkwo"),
      expect.stringContaining("Tunde Bello"),
      expect.stringContaining("Ife Adeyemi"),
      expect.stringContaining("Kemi Cole"),
    ]);
    expect(screen.queryByText(/Segun Ojo/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/nobody is in this department/i),
    ).not.toBeInTheDocument();
  });

  it("asks the directory for the department's own people under a department objective", () => {
    render(
      <AssignKpiDialog
        open
        parent={{ ...companyObjective, departmentId: "d-eng" }}
        onClose={vi.fn()}
        onAssign={vi.fn()}
      />,
    );
    expect(state.asked).toContainEqual({
      departmentId: "d-eng",
      pageSize: 200,
    });
    expect(people()).toHaveLength(3);
  });

  it("offers HR everybody", () => {
    state.permissions = new Set(["EDIT_RECORDS"]);
    state.employeeId = "emp-hr";
    render(
      <AssignKpiDialog
        open
        parent={companyObjective}
        onClose={vi.fn()}
        onAssign={vi.fn()}
      />,
    );
    expect(people()).toHaveLength(5);
  });

  it("offers a plain employee nobody but themselves", () => {
    state.employeeId = "eng-1";
    render(
      <AssignKpiDialog
        open
        parent={companyObjective}
        onClose={vi.fn()}
        onAssign={vi.fn()}
      />,
    );
    expect(people()).toEqual([expect.stringContaining("Tunde Bello")]);
  });

  it("says nothing about an empty department: the menu does not offer the dialog then", () => {
    state.people = [];
    render(
      <AssignKpiDialog
        open
        parent={{ ...companyObjective, departmentId: "d-eng" }}
        onClose={vi.fn()}
        onAssign={vi.fn()}
      />,
    );
    expect(screen.queryByText(/nobody is in this department/i)).toBeNull();
    expect(screen.queryByText(/yours to set goals for/i)).toBeNull();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});

describe("Give a KPI to people, opened a second time", () => {
  const reopen = (
    parent: typeof companyObjective,
    again: typeof companyObjective,
  ) => {
    const props = { onClose: vi.fn(), onAssign: vi.fn() };
    const view = render(<AssignKpiDialog open parent={parent} {...props} />);
    return {
      view,
      props,
      again: () => {
        view.rerender(
          <AssignKpiDialog open={false} parent={null} {...props} />,
        );
        view.rerender(<AssignKpiDialog open parent={again} {...props} />);
      },
    };
  };

  it("starts on the parent's own title with nobody ticked", async () => {
    const { again } = reopen(companyObjective, companyObjective);
    screen.getAllByRole("checkbox")[1]?.click();
    expect(
      screen
        .getAllByRole("checkbox")
        .filter((box) => (box as HTMLInputElement).checked),
    ).toHaveLength(1);
    again();
    expect(
      screen
        .getAllByRole("checkbox")
        .filter((box) => (box as HTMLInputElement).checked),
    ).toHaveLength(0);
  });

  it("does not send somebody ticked earlier who the list no longer shows", async () => {
    const { view, props } = reopen(companyObjective, companyObjective);
    /* Kemi Cole reports to the head from Finance, so the company list shows her
       and an Engineering objective's list does not. */
    const boxFor = (name: string) =>
      screen
        .getAllByRole("checkbox")
        .find((box) =>
          (box as HTMLInputElement).labels?.[0]?.textContent?.includes(name),
        ) as HTMLInputElement | undefined;
    boxFor("Kemi Cole")?.click();
    boxFor("Tunde Bello")?.click();
    view.rerender(
      <AssignKpiDialog
        open
        parent={{ ...companyObjective, departmentId: "d-eng" }}
        {...props}
      />,
    );
    expect(boxFor("Kemi Cole")).toBeUndefined();
    expect(
      screen.getByRole("button", { name: "Assign to 1 person" }),
    ).toBeInTheDocument();
  });
});

describe("Give a KPI to people, when the API says no", () => {
  it("shows what it said, and stays open, rather than failing silently", async () => {
    const refusal =
      "That goal is somebody else's. You can change your own and your reports'.";
    const onAssign = vi
      .fn()
      .mockRejectedValue(new ApiError(403, "forbidden", refusal));
    const onClose = vi.fn();
    render(
      <AssignKpiDialog
        open
        parent={companyObjective}
        onClose={onClose}
        onAssign={onAssign}
      />,
    );
    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText(/ship one customer story/i),
      "Close three deals",
    );
    await user.click(screen.getAllByRole("checkbox")[1]!);
    await user.click(
      screen.getByRole("button", { name: "Assign to 1 person" }),
    );

    expect(await screen.findByText(refusal)).toBeInTheDocument();
    expect(onAssign).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("Give a KPI to people, what it asks", () => {
  const open = (
    over: Partial<typeof companyObjective> = {},
    onAssign = vi.fn().mockResolvedValue({ created: [], alreadyHad: [] }),
  ) => {
    render(
      <AssignKpiDialog
        open
        parent={{ ...companyObjective, ...over }}
        onClose={vi.fn()}
        onAssign={onAssign}
      />,
    );
    return { onAssign, user: userEvent.setup() };
  };

  it("has the parent's title already in the title field", () => {
    open();
    expect(screen.getByLabelText(/Objective title/)).toHaveValue(
      "Grow the business",
    );
  });

  it("has no help line, no description and no footer paragraph", () => {
    open();
    expect(screen.queryByLabelText(/Description/)).toBeNull();
    expect(screen.queryByText(/worded once/)).toBeNull();
    expect(screen.queryByText(/Anybody, since this is a company/)).toBeNull();
    expect(screen.queryByText(/not the same as agreeing/)).toBeNull();
    expect(screen.queryByRole("button", { name: /More about/ })).toBeNull();
  });

  it("asks for a quarter only where the objective has none", () => {
    open();
    expect(screen.getByLabelText(/Due quarter/)).toBeInTheDocument();
  });

  it("does not ask for a quarter when the objective has one, and gives it that one", async () => {
    const { onAssign, user } = open({ dueQuarter: "2026-Q4" });
    expect(screen.queryByLabelText(/Due quarter/)).toBeNull();
    await user.click(screen.getAllByRole("checkbox")[1]!);
    await user.click(
      screen.getByRole("button", { name: "Assign to 1 person" }),
    );
    expect(onAssign).toHaveBeenCalledWith("g-company", {
      title: "Grow the business",
      employeeIds: ["eng-1"],
      dueQuarter: "2026-Q4",
    });
  });

  it("is not sendable until somebody is picked and the title is there", async () => {
    const { user } = open();
    const assign = screen.getByRole("button", { name: "Assign" });
    expect(assign).toBeDisabled();
    await user.click(screen.getAllByRole("checkbox")[0]!);
    expect(
      screen.getByRole("button", { name: "Assign to 1 person" }),
    ).toBeEnabled();
    await user.clear(screen.getByLabelText(/Objective title/));
    expect(
      screen.getByRole("button", { name: "Assign to 1 person" }),
    ).toBeDisabled();
    expect(screen.queryByText(/at least three characters/)).toBeNull();
    expect(screen.queryByText(/Pick at least one person/)).toBeNull();
  });

  it("groups the people by department, and ticks a whole department at once", async () => {
    const { user } = open();
    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(screen.getByText("Finance")).toBeInTheDocument();
    /* Finance has one person here, so there is nothing to select all of. */
    const all = screen.getAllByRole("button", { name: "Select all" });
    expect(all).toHaveLength(1);

    await user.click(all[0]!);
    expect(
      screen.getByRole("button", { name: "Assign to 3 people" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByRole("button", { name: "Assign" })).toBeDisabled();
  });
});
