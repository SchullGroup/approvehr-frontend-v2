import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { people } from "./projects-fixture";

/**
 * The New project dialog: what it sends when somebody only types a name.
 *
 * A new project used to start on cycles, so its first task waited in Later and
 * the board stayed empty. It starts as a simple board now.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/ui", async (original) => ({
  ...(await original<typeof import("@/components/ui")>()),
  useToast: () => ({ push: vi.fn() }),
}));

const create = vi.hoisted(() => vi.fn());
vi.mock("@/lib/store/projects", () => ({
  useCreateProject: () => create,
}));

let actor = { employeeId: "p-01" as string | null };
let directory = people;
vi.mock("@/lib/store/project-session", () => ({
  usePeople: () => directory,
  useProjectActor: () => actor,
}));

const DEPARTMENTS = [
  { id: "d-eng", name: "Engineering", archived: false },
  { id: "d-ops", name: "Operations", archived: false },
];
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({
    flat: DEPARTMENTS,
    loading: false,
    reload: vi.fn(),
  }),
}));

vi.mock("@/lib/store/programs", () => ({
  useProgramList: () => ({ data: { programs: [] } }),
}));

/* The real field is a search picker with an "Add a department" action; what is
   tested here is the dialog around it, so a plain select stands in. */
vi.mock("@/components/projects/department-field", () => ({
  DepartmentField: ({
    value,
    onChange,
    error,
  }: {
    value: string;
    onChange: (id: string) => void;
    error?: string;
  }) => (
    <label>
      Department
      <select
        aria-label="Department"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Choose a department</option>
        {DEPARTMENTS.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      {error && <span role="alert">{error}</span>}
    </label>
  ),
}));

const { NewProjectDialog } =
  await import("@/app/(app)/projects/new-project-dialog");

function renderDialog() {
  return render(<NewProjectDialog open onClose={vi.fn()} takenKeys={[]} />);
}

beforeEach(() => {
  create.mockReset();
  create.mockResolvedValue({ ok: true, value: { id: "pj-new" } });
  actor = { employeeId: "p-01" };
  directory = people;
});

describe("a new project", () => {
  it("is a simple board unless somebody chooses cycles", async () => {
    renderDialog();
    expect(screen.getByRole("radio", { name: "Simple board" })).toBeChecked();
    await userEvent.type(screen.getByLabelText(/^Name/), "Office move");
    await userEvent.selectOptions(screen.getByLabelText("Department"), "d-ops");
    await userEvent.click(
      screen.getByRole("button", { name: "Create project" }),
    );
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0]).toMatchObject({
      name: "Office move",
      type: "KANBAN",
      departmentId: "d-ops",
    });
  });

  it("sends cycles when that is what was chosen", async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText(/^Name/), "Office move");
    await userEvent.selectOptions(screen.getByLabelText("Department"), "d-ops");
    await userEvent.click(
      screen.getByRole("radio", { name: "Board with cycles" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Create project" }),
    );
    expect(create.mock.calls[0]![0]).toMatchObject({ type: "SCRUM" });
  });

  it("says what each board type means, under each", () => {
    renderDialog();
    const group = screen.getByRole("group", { name: "Board type" });
    expect(group).toHaveTextContent(
      "Simple boardTasks go straight onto the board.",
    );
    expect(group).toHaveTextContent(
      "Board with cyclesPlan work in cycles. Tasks not in a cycle wait in Later.",
    );
  });
});
