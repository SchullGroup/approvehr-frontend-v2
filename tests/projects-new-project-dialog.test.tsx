import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
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

const moreButton = () => screen.getByRole("button", { name: /More options/ });
const openMore = () => userEvent.click(moreButton());

beforeEach(() => {
  localStorage.clear();
  create.mockReset();
  create.mockResolvedValue({ ok: true, value: { id: "pj-new" } });
  actor = { employeeId: "p-01" };
  directory = people;
});

describe("a new project", () => {
  it("is a simple board unless somebody chooses cycles", async () => {
    renderDialog();
    await openMore();
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
    await openMore();
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

  it("says what each board type means, under each", async () => {
    renderDialog();
    await openMore();
    const group = screen.getByRole("group", { name: "Board type" });
    expect(group).toHaveTextContent(
      "Simple boardTasks go straight onto the board.",
    );
    expect(group).toHaveTextContent(
      "Board with cyclesPlan work in cycles. Tasks not in a cycle wait in Later.",
    );
  });
});

describe("the short form", () => {
  const withOwnDepartment = (
    departmentId: string | null,
    department: string | null,
  ) => {
    const mine = (p: (typeof people.people)[number]) =>
      p.id === "p-01" ? { ...p, departmentId, department } : p;
    directory = {
      ...people,
      people: people.people.map(mine),
      byId: new Map([...people.byId].map(([id, p]) => [id, mine(p)])),
    };
  };

  it("shows the name and the department, and keeps the rest under More options", () => {
    renderDialog();
    expect(screen.getByLabelText(/^Name/)).toBeVisible();
    expect(screen.getByLabelText("Department")).toBeVisible();
    expect(moreButton()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByLabelText(/^Key/)).not.toBeVisible();
    expect(screen.getByLabelText(/^Description/)).not.toBeVisible();
  });

  it("starts on the creator's own department, and sends it", async () => {
    withOwnDepartment("d-eng", "Engineering");
    renderDialog();
    expect(screen.getByLabelText("Department")).toHaveValue("d-eng");
    await userEvent.type(screen.getByLabelText(/^Name/), "Office move");
    await userEvent.click(
      screen.getByRole("button", { name: "Create project" }),
    );
    expect(create.mock.calls[0]![0]).toMatchObject({ departmentId: "d-eng" });
  });

  it("finds the creator's department by name where the directory has no id", () => {
    withOwnDepartment(null, "Operations");
    renderDialog();
    expect(screen.getByLabelText("Department")).toHaveValue("d-ops");
  });

  it("starts empty, and still asks for one, when the creator has none", async () => {
    renderDialog();
    expect(screen.getByLabelText("Department")).toHaveValue("");
    await userEvent.type(screen.getByLabelText(/^Name/), "Office move");
    await userEvent.click(
      screen.getByRole("button", { name: "Create project" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a department.");
    expect(create).not.toHaveBeenCalled();
  });

  it("says the key it made while More options is closed", async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText(/^Name/), "Office move");
    expect(moreButton()).toHaveTextContent("Key: OM");
  });

  it("opens More options when the key is refused, and keeps it open while it is fixed", async () => {
    withOwnDepartment("d-eng", "Engineering");
    create.mockResolvedValueOnce({
      ok: false,
      message: "Another project already uses the key OM.",
      error: new ApiError(
        409,
        "conflict",
        "Another project already uses the key OM.",
      ),
    });
    renderDialog();
    await userEvent.type(screen.getByLabelText(/^Name/), "Office move");
    await userEvent.click(
      screen.getByRole("button", { name: "Create project" }),
    );
    expect(moreButton()).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByText("Another project already uses the key OM."),
    ).toBeVisible();
    await userEvent.type(screen.getByLabelText(/^Key/), "V");
    expect(moreButton()).toHaveAttribute("aria-expanded", "true");
  });
});
