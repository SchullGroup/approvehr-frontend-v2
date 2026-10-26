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
import type {
  ApiPayComponent,
  ApiSchedule,
  PaySchedule,
} from "@/lib/api/pay-components";

/**
 * An allowance's schedule, in the table and in the form.
 *
 * The API owns the rules and the sentence, so the preview is answered here from
 * a variable: what is checked is what the screen does with the answer, and what
 * it sends. The panel, its table, its menu and its dialogs are the real ones.
 */

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  create: vi.fn(),
  rows: [] as unknown[],
  editable: true,
  preview: {
    available: true,
    loading: false,
    data: null as unknown,
    problems: [] as { field: string; message: string }[],
    error: null,
  },
}));

vi.mock("@/lib/store/pay-components", async (original) => ({
  ...(await original<typeof import("@/lib/store/pay-components")>()),
  usePayComponents: () => ({
    rows: mocks.rows,
    loading: false,
    error: null,
    connected: true,
    editable: mocks.editable,
    reload: vi.fn(),
    create: mocks.create,
    update: mocks.update,
    archive: vi.fn(),
    setActive: vi.fn(),
  }),
  usePayComponentDetail: () => ({
    detail: null,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  useAssignManyToComponent: () => ({ editable: false, assignToMany: vi.fn() }),
}));

vi.mock("@/lib/store/schedule-preview", () => ({
  useSchedulePreview: () => mocks.preview,
}));

vi.mock("@/lib/use-today", () => ({ useToday: () => "2026-10-23" }));

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

/* -------------------------------------------------------------------------- */

const longServiceSchedule: ApiSchedule = {
  qualifyingMonths: 36,
  serviceClock: "START_DATE",
  frequency: "EVERY_N_MONTHS",
  intervalMonths: 36,
  maxPayments: null,
  durationMonths: null,
  isEveryMonth: false,
  summary: "After 3 years of service, then every 3 years",
};

const everyMonth: ApiSchedule = {
  qualifyingMonths: 0,
  serviceClock: "START_DATE",
  frequency: "MONTHLY",
  intervalMonths: null,
  maxPayments: null,
  durationMonths: null,
  isEveryMonth: true,
  summary: "Every month",
};

const base = {
  kind: "ALLOWANCE" as const,
  preTax: false,
  sortOrder: 0,
  active: true,
  isSystem: false,
  archived: false,
  assignmentCount: 0,
  taxable: true,
  pensionable: false,
  defaultRate: null,
  basis: "FIXED" as const,
  applyMode: "OPTIONAL" as const,
};

const longService: ApiPayComponent = {
  ...base,
  id: "c-ls",
  code: "long_service",
  name: "Long-service allowance",
  defaultAmountKobo: 12_000_000,
  assignmentCount: 4,
  schedule: longServiceSchedule,
};

const transport: ApiPayComponent = {
  ...base,
  id: "c-tr",
  code: "transport",
  name: "Transport allowance",
  defaultAmountKobo: 5_000_000,
  schedule: everyMonth,
};

/** An API that predates schedules: the key is simply not there. */
const meal: ApiPayComponent = {
  ...base,
  id: "c-meal",
  code: "meal",
  name: "Meal allowance",
  defaultAmountKobo: 2_500_000,
};

const union: ApiPayComponent = {
  ...base,
  id: "c-un",
  code: "union_dues",
  kind: "DEDUCTION",
  name: "Union dues",
  defaultAmountKobo: 100_000,
};

const answerFor = (schedule: PaySchedule, summary: string) => ({
  schedule: { ...schedule, isEveryMonth: false, summary },
  problems: [] as { field: string; message: string }[],
  examples: {
    startDate: "2026-10-23",
    assignedOn: "2026-10-23",
    dueMonths: ["2029-10-01", "2032-10-01"],
  },
});

function mount(kind: "ALLOWANCE" | "DEDUCTION" = "ALLOWANCE") {
  return render(
    <ToastProvider>
      <ComponentsPanel kind={kind} />
    </ToastProvider>,
  );
}

const menuFor = (name: string) =>
  fireEvent.click(
    screen.getAllByRole("button", { name: `More actions for ${name}` })[0]!,
  );

const press = (name: string) =>
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name }),
  );

beforeEach(() => {
  mocks.rows = [longService, transport, meal];
  mocks.editable = true;
  mocks.update.mockReset().mockResolvedValue({ scheduleChange: null });
  mocks.create.mockReset().mockResolvedValue(undefined);
  mocks.preview = {
    available: true,
    loading: false,
    data: answerFor(
      {
        qualifyingMonths: 0,
        serviceClock: "START_DATE",
        frequency: "MONTHLY",
        intervalMonths: null,
        maxPayments: null,
        durationMonths: null,
      },
      "Every month",
    ),
    problems: [],
    error: null,
  };
});

/* -------------------------------------------------------------------------- */

describe("the Paid column", () => {
  it("prints the API's sentence, and Monthly for the default and for no schedule at all, never a blank", () => {
    mount();
    const table = screen.getByRole("table");
    const paid = (name: string) =>
      within(within(table).getByRole("row", { name: new RegExp(name) }))
        .getAllByRole("cell")
        .map((cell) => cell.textContent);

    expect(paid("Long-service")).toContain(
      "After 3 years of service, then every 3 years",
    );
    expect(paid("Transport")).toContain("Monthly");
    expect(paid("Meal")).toContain("Monthly");
    expect(within(table).getByText("Paid")).toBeInTheDocument();
  });

  it("is plain muted text and not a pill", () => {
    mount();
    const text = within(screen.getByRole("table")).getByText(
      "After 3 years of service, then every 3 years",
    );
    expect(text.className).toContain("text-muted");
    expect(text.className).not.toMatch(/rounded|border|bg-/);
  });

  it("is not there on the deductions tab, which have no schedule", () => {
    mocks.rows = [union];
    mount("DEDUCTION");
    expect(within(screen.getByRole("table")).queryByText("Paid")).toBeNull();
  });

  it("says per payment under the library's amount for a scheduled allowance, and a month otherwise", () => {
    mount();
    const table = within(screen.getByRole("table"));
    expect(table.getByText("₦120,000.00 per payment")).toBeInTheDocument();
    expect(table.getByText("₦50,000.00 a month")).toBeInTheDocument();
  });
});

describe("Change schedule", () => {
  it("is in the row's menu for an allowance, beside Edit", () => {
    mount();
    menuFor("Long-service allowance");
    expect(
      screen.getByRole("menuitem", { name: "Change schedule" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
  });

  it("is not on a deduction, which the API refuses a schedule for", () => {
    mocks.rows = [union];
    mount("DEDUCTION");
    menuFor("Union dues");
    expect(
      screen.queryByRole("menuitem", { name: "Change schedule" }),
    ).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
  });

  it("is hidden, not disabled, for somebody who may not define one: the Paid text stays", () => {
    mocks.editable = false;
    mount();
    expect(
      screen.queryAllByRole("button", { name: /More actions for/ }),
    ).toHaveLength(0);
    expect(screen.queryByRole("menuitem")).toBeNull();
    expect(
      screen.getAllByText("After 3 years of service, then every 3 years")
        .length,
    ).toBeGreaterThan(0);
  });

  it("saves the whole schedule and nothing else, and says which payrolls it reaches", async () => {
    mocks.update.mockResolvedValue({
      scheduleChange: {
        from: longServiceSchedule,
        to: longServiceSchedule,
        openRuns: [
          { id: "r1", period: "2026-03-01", sequence: 1, status: "IN_REVIEW" },
        ],
        assignmentCount: 4,
      },
    });
    mount();
    menuFor("Long-service allowance");
    fireEvent.click(screen.getByRole("menuitem", { name: "Change schedule" }));

    const dialog = screen.getByRole("dialog", {
      name: "Change schedule: Long-service allowance",
    });
    /* Opens holding what is stored: 3 years, every 3 years. */
    expect(within(dialog).getByLabelText("Waits for")).toHaveValue(3);
    expect(
      within(dialog).getByLabelText("Unit for how long it waits"),
    ).toHaveValue("years");
    /* Nothing changed yet, so there is nothing to save. */
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText("Waits for"), {
      target: { value: "2" },
    });
    press("Save");

    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(mocks.update).toHaveBeenCalledWith("c-ls", {
      schedule: {
        qualifyingMonths: 24,
        serviceClock: "START_DATE",
        frequency: "EVERY_N_MONTHS",
        intervalMonths: 36,
        maxPayments: null,
        durationMonths: null,
      },
    });
    expect(
      await screen.findByText(/The March 2026 payroll is in review\./),
    ).toBeInTheDocument();
  });

  it("warns, behind the mark, that it moves when it falls due for everybody on it and that history does not change", () => {
    mount();
    menuFor("Long-service allowance");
    fireEvent.click(screen.getByRole("menuitem", { name: "Change schedule" }));
    const dialog = screen.getByRole("dialog");
    const mark = within(dialog).getByRole("button", {
      name: /4 people have been on it/,
    });
    expect(mark.getAttribute("aria-label")).toMatch(
      /next run that has not been prepared/,
    );
    expect(mark.getAttribute("aria-label")).toMatch(/do not change/);
  });
});

describe("the Applies section of the form", () => {
  it("is on an allowance and not on a deduction", () => {
    mount();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Add an allowance" })[0]!,
    );
    expect(
      within(screen.getByRole("dialog")).getByRole("heading", {
        name: "Applies",
      }),
    ).toBeInTheDocument();
  });

  it("is not offered when adding a deduction", () => {
    mocks.rows = [union];
    mount("DEDUCTION");
    fireEvent.click(
      screen.getAllByRole("button", { name: "Add a deduction" })[0]!,
    );
    expect(
      within(screen.getByRole("dialog")).queryByRole("heading", {
        name: "Applies",
      }),
    ).toBeNull();
  });

  it("sends all six fields, in months, when the allowance is created", async () => {
    mount();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Add an allowance" })[0]!,
    );
    const dialog = screen.getByRole("dialog");

    fireEvent.change(within(dialog).getByLabelText(/^name/i), {
      target: { value: "Long-service allowance" },
    });
    fireEvent.change(within(dialog).getByLabelText("Waits for"), {
      target: { value: "3" },
    });
    fireEvent.change(
      within(dialog).getByLabelText("Unit for how long it waits"),
      {
        target: { value: "years" },
      },
    );
    fireEvent.click(
      within(dialog).getByRole("radio", { name: "Every few months or years" }),
    );
    fireEvent.change(within(dialog).getByLabelText("Every"), {
      target: { value: "3" },
    });
    fireEvent.change(
      within(dialog).getByLabelText("Unit for how often it is paid"),
      { target: { value: "years" } },
    );
    press("Add allowance");

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    const body = mocks.create.mock.calls[0]![0] as {
      schedule: Record<string, unknown>;
    };
    expect(body.schedule).toEqual({
      qualifyingMonths: 36,
      serviceClock: "START_DATE",
      frequency: "EVERY_N_MONTHS",
      intervalMonths: 36,
      maxPayments: null,
      durationMonths: null,
    });
  });

  it("calls the amount per payment once it is scheduled, and each month before", () => {
    mount();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Add an allowance" })[0]!,
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByLabelText(/^amount each month/i),
    ).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/^amount per payment/i)).toBeNull();

    fireEvent.change(within(dialog).getByLabelText("Waits for"), {
      target: { value: "12" },
    });
    expect(
      within(dialog).getByLabelText(/^amount per payment/i),
    ).toBeInTheDocument();
  });

  it("prints the API's sentence and the dates it would be paid, not dates worked out here", () => {
    mocks.preview.data = answerFor(
      {
        qualifyingMonths: 36,
        serviceClock: "START_DATE",
        frequency: "EVERY_N_MONTHS",
        intervalMonths: 36,
        maxPayments: null,
        durationMonths: null,
      },
      "After 3 years of service, then every 3 years",
    );
    mount();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Add an allowance" })[0]!,
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("After 3 years of service, then every 3 years"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Oct 2029 and Oct 2032/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/23 Oct 2026/)).toBeInTheDocument();
  });

  it("says nothing, rather than something stale, while the answer is on its way", () => {
    mocks.preview = { ...mocks.preview, loading: true, data: null };
    mount();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Add an allowance" })[0]!,
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("Working out the dates"),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/falls due in/)).toBeNull();
  });

  it("shows no example offline, where there is no answer to show", () => {
    mocks.preview = { ...mocks.preview, available: false, data: null };
    mount();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Add an allowance" })[0]!,
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText(/falls due in/)).toBeNull();
    expect(
      within(dialog).queryByText("Example for somebody who started on"),
    ).toBeNull();
  });

  it("shows a refusal at its own field in the API's words, and does not offer to save it", () => {
    mocks.preview = {
      ...mocks.preview,
      problems: [
        {
          field: "schedule.intervalMonths",
          message:
            "Every month is 'every month'. Pick an interval of 2 or more.",
        },
      ],
    };
    mount();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Add an allowance" })[0]!,
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^name/i), {
      target: { value: "Long-service allowance" },
    });
    fireEvent.click(
      within(dialog).getByRole("radio", { name: "Every few months or years" }),
    );
    expect(
      within(dialog).getByText(
        "Every month is 'every month'. Pick an interval of 2 or more.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Add allowance" }),
    ).toBeDisabled();
  });

  it("refuses a number that is not a number, without asking the API", () => {
    mount();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Add an allowance" })[0]!,
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^name/i), {
      target: { value: "Long-service allowance" },
    });
    fireEvent.change(within(dialog).getByLabelText("Waits for"), {
      target: { value: "" },
    });
    expect(
      within(dialog).getByText(/Use a whole number for how long it waits/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Add allowance" }),
    ).toBeDisabled();
  });

  it("cannot count from the day it is given to them when it applies to everyone", async () => {
    mount();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Add an allowance" })[0]!,
    );
    const dialog = screen.getByRole("dialog");
    const assigned = within(dialog).getByRole("radio", {
      name: "The day it is given to them",
    });
    expect(assigned).toBeEnabled();

    fireEvent.click(assigned);
    expect(assigned).toBeChecked();

    fireEvent.click(
      within(dialog).getByRole("switch", {
        name: /charge every employee automatically/i,
      }),
    );
    expect(assigned).toBeDisabled();
    expect(
      within(dialog).getByRole("radio", { name: "Their start date" }),
    ).toBeChecked();

    fireEvent.change(within(dialog).getByLabelText(/^name/i), {
      target: { value: "Welfare" },
    });
    fireEvent.change(within(dialog).getByLabelText("Waits for"), {
      target: { value: "6" },
    });
    press("Add allowance");
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(
      (mocks.create.mock.calls[0]![0] as { schedule: PaySchedule }).schedule
        .serviceClock,
    ).toBe("START_DATE");
  });

  it("leaves 'once' with no way to stop it, which the API refuses", () => {
    mount();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Add an allowance" })[0]!,
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("It stops")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("radio", { name: "Once" }));
    expect(within(dialog).queryByText("It stops")).toBeNull();
  });

  it("saves an edit of something else without touching the schedule it was not asked to change", async () => {
    mount();
    menuFor("Long-service allowance");
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    fireEvent.change(
      within(screen.getByRole("dialog")).getByLabelText(/^name/i),
      { target: { value: "Long service" } },
    );
    press("Save");
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(mocks.update.mock.calls[0]![1]).not.toHaveProperty("schedule");
  });

  it("sends the whole schedule on an edit that changes it", async () => {
    mount();
    menuFor("Long-service allowance");
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: "Every month" }));
    press("Save");
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    const body = mocks.update.mock.calls[0]![1] as {
      schedule: Record<string, unknown>;
    };
    expect(Object.keys(body.schedule).sort()).toEqual(
      [
        "durationMonths",
        "frequency",
        "intervalMonths",
        "maxPayments",
        "qualifyingMonths",
        "serviceClock",
      ].sort(),
    );
    expect(body.schedule).toMatchObject({
      qualifyingMonths: 36,
      frequency: "MONTHLY",
      intervalMonths: null,
    });
  });
});
