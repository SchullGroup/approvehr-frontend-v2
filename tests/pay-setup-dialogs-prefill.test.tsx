import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ComponentsPanel } from "@/app/(app)/payroll/pay-setup/components-panel";
import { GradesPanel } from "@/app/(app)/payroll/pay-setup/grades-panel";
import type { ApiGrade } from "@/lib/api/grades";
import type { ApiPayComponent } from "@/lib/api/pay-components";

/**
 * The grade and component dialogs open holding the row's own values.
 *
 * Same fault as `expense-type-dialog-prefill`: each dialog stays mounted so
 * `Modal` can play its exit animation, so a draft seeded from the row at mount
 * was seeded when no row was being edited yet. Edit opened an empty form, and
 * Save wrote whatever was left in it over the real band or the real flags.
 *
 * Only the data hooks are replaced. The panels, their tables and their
 * dialogs are the real ones.
 */

const mocks = vi.hoisted(() => ({
  gradeUpdate: vi.fn(),
  gradeCreate: vi.fn(),
  componentUpdate: vi.fn(),
  componentCreate: vi.fn(),
  gradeRows: [] as unknown[],
  componentRows: [] as unknown[],
}));

vi.mock("@/lib/store/grades", async (original) => ({
  ...(await original<typeof import("@/lib/store/grades")>()),
  useGrades: () => ({
    rows: mocks.gradeRows,
    loading: false,
    error: null,
    connected: true,
    editable: true,
    reload: vi.fn(),
    create: mocks.gradeCreate,
    update: mocks.gradeUpdate,
    archive: vi.fn(),
    restore: vi.fn(),
  }),
  useGradeEmployees: () => ({ rows: [], loading: false, error: null }),
  useGradeIncrease: () => ({
    busy: null,
    canApply: false,
    connected: true,
  }),
}));

vi.mock("@/lib/store/pay-components", async (original) => ({
  ...(await original<typeof import("@/lib/store/pay-components")>()),
  usePayComponents: () => ({
    rows: mocks.componentRows,
    loading: false,
    error: null,
    connected: true,
    editable: true,
    reload: vi.fn(),
    create: mocks.componentCreate,
    update: mocks.componentUpdate,
    archive: vi.fn(),
    setActive: vi.fn(),
  }),
  usePayComponentDetail: () => ({
    detail: null,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  useAssignManyToComponent: () => ({
    editable: false,
    assignToMany: vi.fn(),
  }),
}));

vi.mock("@/lib/store/employees-api", async (original) => ({
  ...(await original<typeof import("@/lib/store/employees-api")>()),
  useEmployeeDirectory: () => ({ employees: [], people: [] }),
}));

vi.mock("@/lib/payroll/use-settings", async (original) => ({
  ...(await original<typeof import("@/lib/payroll/use-settings")>()),
  usePayrollSettings: () => ({
    settings: {
      pension: {
        enabled: true,
        employeeRate: 0.08,
        employerRate: 0.1,
        basis: ["basic", "housing", "transport"],
      },
    },
  }),
}));

const gone = () =>
  waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

const press = (name: string) =>
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name }),
  );

/* -------------------------------------------------------------------------- */

const associate: ApiGrade = {
  id: "g-1",
  code: "G1",
  name: "Associate",
  level: 1,
  minGrossKobo: 30_000_000,
  midGrossKobo: 36_000_000,
  maxGrossKobo: 42_000_000,
  bandWidthKobo: 12_000_000,
  employees: 2,
  monthlyPayrollKobo: 70_000_000,
  outsideBand: 0,
  archived: false,
};

const lead: ApiGrade = {
  id: "g-2",
  code: "G2",
  name: "Lead",
  level: 2,
  minGrossKobo: 50_000_000,
  midGrossKobo: 60_000_000,
  maxGrossKobo: 80_000_000,
  bandWidthKobo: 30_000_000,
  employees: 1,
  monthlyPayrollKobo: 55_000_000,
  outsideBand: 0,
  archived: false,
};

function editGrade(code: string) {
  fireEvent.click(
    within(screen.getByRole("row", { name: new RegExp(code) })).getByRole(
      "button",
      { name: "Edit" },
    ),
  );
}

function gradeForm() {
  const dialog = screen.getByRole("dialog");
  return {
    dialog,
    code: within(dialog).getByLabelText(/^code/i),
    name: within(dialog).getByLabelText(/^name/i),
    bottom: within(dialog).getByLabelText(/^bottom of band/i),
    top: within(dialog).getByLabelText(/^top of band/i),
  };
}

const gradesPanel = (
  <ToastProvider>
    <GradesPanel />
  </ToastProvider>
);

describe("editing a salary grade", () => {
  let view: ReturnType<typeof render>;

  beforeEach(() => {
    mocks.gradeRows = [associate, lead];
    mocks.gradeUpdate.mockReset().mockResolvedValue(undefined);
    mocks.gradeCreate.mockReset().mockResolvedValue(undefined);
    view = render(gradesPanel);
  });

  it("opens with the band filled in and saves it unchanged", async () => {
    editGrade("G2");
    const fields = gradeForm();
    expect(screen.getByRole("dialog", { name: "Edit G2" })).toBe(fields.dialog);
    expect(fields.code).toHaveValue("G2");
    expect(fields.name).toHaveValue("Lead");
    expect(fields.bottom).toHaveValue(500000);
    expect(fields.top).toHaveValue(800000);
    expect(within(fields.dialog).getByLabelText(/^level/i)).toHaveValue(2);
    expect(within(fields.dialog).getByLabelText(/^mid-point/i)).toHaveValue(
      600000,
    );

    press("Save");

    await waitFor(() => expect(mocks.gradeUpdate).toHaveBeenCalledTimes(1));
    expect(mocks.gradeUpdate).toHaveBeenCalledWith("g-2", {
      code: "G2",
      name: "Lead",
      level: 2,
      minGrossKobo: 50_000_000,
      midGrossKobo: 60_000_000,
      maxGrossKobo: 80_000_000,
    });
  });

  it("shows the second grade's band when it is opened after the first", async () => {
    editGrade("G2");
    press("Cancel");
    await gone();

    editGrade("G1");
    const fields = gradeForm();
    expect(screen.getByRole("dialog", { name: "Edit G1" })).toBe(fields.dialog);
    expect(fields.code).toHaveValue("G1");
    expect(fields.name).toHaveValue("Associate");
    expect(fields.bottom).toHaveValue(300000);
    expect(fields.top).toHaveValue(420000);
  });

  it("keeps its title while it leaves, rather than losing the grade's name", () => {
    editGrade("G2");
    press("Cancel");

    expect(
      within(screen.getByRole("dialog")).getByRole("heading", {
        name: "Edit G2",
      }),
    ).toBeInTheDocument();
  });

  it("opens Add blank, even after an edit", async () => {
    editGrade("G2");
    press("Cancel");
    await gone();

    fireEvent.click(
      screen.getAllByRole("button", { name: /^add grade$/i })[0]!,
    );
    const fields = gradeForm();
    expect(screen.getByRole("dialog", { name: "Add a grade" })).toBe(
      fields.dialog,
    );
    expect(fields.code).toHaveValue("");
    expect(fields.name).toHaveValue("");
    expect(fields.bottom).toHaveValue(null);
    expect(fields.top).toHaveValue(null);
  });

  it("offers the next free level each time Add opens, not the one it first saw", async () => {
    const levelOnOffer = () =>
      within(screen.getByRole("dialog")).getByText("Level").nextElementSibling;

    fireEvent.click(
      screen.getAllByRole("button", { name: /^add grade$/i })[0]!,
    );
    expect(levelOnOffer()).toHaveTextContent("3");
    press("Cancel");
    await gone();

    mocks.gradeRows = [
      associate,
      lead,
      { ...lead, id: "g-3", code: "G3", name: "Principal", level: 3 },
    ];
    view.rerender(gradesPanel);

    fireEvent.click(
      screen.getAllByRole("button", { name: /^add grade$/i })[0]!,
    );
    expect(levelOnOffer()).toHaveTextContent("4");
  });

  it("opens Add blank again after something was typed and cancelled", async () => {
    fireEvent.click(
      screen.getAllByRole("button", { name: /^add grade$/i })[0]!,
    );
    fireEvent.change(gradeForm().name, { target: { value: "Principal" } });
    press("Cancel");
    await gone();

    fireEvent.click(
      screen.getAllByRole("button", { name: /^add grade$/i })[0]!,
    );
    expect(gradeForm().name).toHaveValue("");
  });
});

/* -------------------------------------------------------------------------- */

const base = {
  code: "x",
  kind: "ALLOWANCE" as const,
  preTax: false,
  sortOrder: 0,
  active: true,
  isSystem: false,
  archived: false,
  assignmentCount: 0,
};

const car: ApiPayComponent = {
  ...base,
  id: "c-car",
  code: "car_allowance",
  name: "Car allowance",
  basis: "FIXED",
  taxable: false,
  pensionable: true,
  defaultAmountKobo: 5_000_000,
  defaultRate: null,
  applyMode: "PERMANENT",
};

const bonus: ApiPayComponent = {
  ...base,
  id: "c-bonus",
  code: "bonus_pool",
  name: "Bonus pool",
  basis: "PERCENT_OF_GROSS",
  taxable: true,
  pensionable: false,
  defaultAmountKobo: null,
  defaultRate: 0.1,
  applyMode: "OPTIONAL",
};

function editComponent(name: string) {
  fireEvent.click(screen.getAllByRole("button", { name: `Edit ${name}` })[0]!);
}

function componentForm() {
  const dialog = screen.getByRole("dialog");
  return {
    dialog,
    name: within(dialog).getByLabelText(/^name/i),
    taxable: within(dialog).getByRole("switch", { name: /paye applies/i }),
    pensionable: within(dialog).getByRole("switch", { name: /pension/i }),
  };
}

describe("editing a pay component", () => {
  beforeEach(() => {
    mocks.componentRows = [car, bonus];
    mocks.componentUpdate.mockReset().mockResolvedValue(undefined);
    mocks.componentCreate.mockReset().mockResolvedValue(undefined);
    render(
      <ToastProvider>
        <ComponentsPanel kind="ALLOWANCE" />
      </ToastProvider>,
    );
  });

  it("opens with every field filled in and saves them unchanged", async () => {
    editComponent("Car allowance");
    const fields = componentForm();
    expect(screen.getByRole("dialog", { name: "Edit Car allowance" })).toBe(
      fields.dialog,
    );
    expect(fields.name).toHaveValue("Car allowance");
    expect(
      within(fields.dialog).getByLabelText(/^amount each month/i),
    ).toHaveValue(50000);
    expect(fields.taxable).not.toBeChecked();
    expect(fields.pensionable).toBeChecked();

    press("Save");

    await waitFor(() => expect(mocks.componentUpdate).toHaveBeenCalledTimes(1));
    expect(mocks.componentUpdate).toHaveBeenCalledWith("c-car", {
      name: "Car allowance",
      basis: "FIXED",
      defaultAmountKobo: 5_000_000,
      defaultRate: null,
      applyMode: "PERMANENT",
      taxable: false,
      pensionable: true,
    });
  });

  it("shows the second component's values when it is opened after the first", async () => {
    editComponent("Car allowance");
    press("Cancel");
    await gone();

    editComponent("Bonus pool");
    const fields = componentForm();
    expect(screen.getByRole("dialog", { name: "Edit Bonus pool" })).toBe(
      fields.dialog,
    );
    expect(fields.name).toHaveValue("Bonus pool");
    expect(within(fields.dialog).getByLabelText(/^percentage of/i)).toHaveValue(
      10,
    );
    expect(fields.taxable).toBeChecked();
    expect(fields.pensionable).not.toBeChecked();
  });

  it("keeps its title while it leaves, rather than turning into Add", () => {
    editComponent("Car allowance");
    press("Cancel");

    const leaving = screen.getByRole("dialog");
    expect(
      within(leaving).getByRole("heading", { name: "Edit Car allowance" }),
    ).toBeInTheDocument();
    expect(
      within(leaving).getByRole("button", { name: "Save" }),
    ).toBeInTheDocument();
  });

  it("opens Add blank after an edit, and Edit again after an Add", async () => {
    editComponent("Car allowance");
    press("Cancel");
    await gone();

    fireEvent.click(
      screen.getAllByRole("button", { name: "Add an allowance" })[0]!,
    );
    const added = componentForm();
    expect(screen.getByRole("dialog", { name: "Add an allowance" })).toBe(
      added.dialog,
    );
    expect(added.name).toHaveValue("");
    expect(added.taxable).toBeChecked();
    expect(added.pensionable).not.toBeChecked();
    press("Cancel");
    await gone();

    editComponent("Bonus pool");
    expect(
      screen.getByRole("dialog", { name: "Edit Bonus pool" }),
    ).toBeInTheDocument();
    expect(componentForm().name).toHaveValue("Bonus pool");
  });
});
