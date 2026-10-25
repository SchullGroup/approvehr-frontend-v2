import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { PayComponentsPanel } from "@/app/(app)/payroll/pay-setup/pay-components-panel";
import type {
  ApiPayComponent,
  ApiResolvedAssignment,
  ApiSchedule,
  ApiScheduleStatus,
} from "@/lib/api/pay-components";

/**
 * One person's pay lines, and an allowance that is not due yet.
 *
 * An allowance on a schedule that does not fall due this month resolves to zero
 * and is left out of the totals by the API. A zero beside an allowance reads as
 * an amount somebody chose, so the line says the API's own sentence instead. And
 * when a line is added, the date it starts is the company's own day, sent
 * explicitly: left to the API it is the first of the month in UTC, which in the
 * first hours of a month in Lagos is last month, and moves a count that starts
 * from the day it was given.
 */

const mocks = vi.hoisted(() => ({
  assign: vi.fn(),
  assignments: [] as unknown[],
  library: [] as unknown[],
  previewData: null as unknown,
}));

vi.mock("@/lib/store/pay-components", async (original) => ({
  ...(await original<typeof import("@/lib/store/pay-components")>()),
  useEmployeePayComponents: () => ({
    data: {
      employee: {
        id: "e-1",
        employeeNo: "AHR-1",
        name: "Halimat Akande",
        grossMonthlyKobo: 40_000_000,
      },
      period: { start: "2026-10-01", end: "2026-10-31" },
      assignments: mocks.assignments,
      totals: {
        allowanceKobo: 0,
        preTaxDeductionKobo: 0,
        postTaxDeductionKobo: 0,
      },
    },
    loading: false,
    error: null,
    connected: true,
    editable: true,
    reload: vi.fn(),
    assign: mocks.assign,
    updateAssignment: vi.fn(),
    remove: vi.fn(),
  }),
  usePayComponents: () => ({
    rows: mocks.library,
    loading: false,
    error: null,
    connected: true,
    editable: false,
    reload: vi.fn(),
  }),
  usePayPreview: () => ({
    data: mocks.previewData,
    loading: false,
    error: null,
    available: true,
    reload: vi.fn(),
  }),
}));

vi.mock("@/lib/use-today", () => ({ useToday: () => "2026-10-23" }));

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

const schedule: ApiSchedule = {
  qualifyingMonths: 36,
  serviceClock: "START_DATE",
  frequency: "EVERY_N_MONTHS",
  intervalMonths: 36,
  maxPayments: null,
  durationMonths: null,
  isEveryMonth: false,
  summary: "After 3 years of service, then every 3 years",
};

const statusDue: ApiScheduleStatus = {
  due: true,
  occurrence: 1,
  text: "Due this month",
  nextDue: null,
  reason: null,
};

const statusLater: ApiScheduleStatus = {
  due: false,
  occurrence: null,
  text: "Next due Oct 2028",
  nextDue: "2028-10-01",
  reason: "BETWEEN_PAYMENTS",
};

const line = (
  over: Partial<ApiResolvedAssignment> & { id: string; name: string },
): ApiResolvedAssignment => ({
  employeeId: "e-1",
  componentId: `c-${over.id}`,
  code: over.name.toUpperCase(),
  kind: "ALLOWANCE",
  basis: "FIXED",
  taxable: true,
  pensionable: false,
  preTax: false,
  amountKobo: 5_000_000,
  rate: null,
  fromDefault: false,
  effectiveFrom: "2026-10-23",
  effectiveTo: null,
  note: null,
  componentActive: true,
  resolvedKobo: 5_000_000,
  appliesInPeriod: true,
  ...over,
});

function mount() {
  return render(
    <ToastProvider>
      <PayComponentsPanel employeeId="e-1" />
    </ToastProvider>,
  );
}

const rowFor = (name: string) =>
  screen.getAllByRole("row", { name: new RegExp(name) })[0]!;

beforeEach(() => {
  mocks.assign.mockReset().mockResolvedValue({});
  mocks.assignments = [];
  mocks.library = [];
  mocks.previewData = null;
});

/* -------------------------------------------------------------------------- */

describe("a scheduled allowance on somebody's pay", () => {
  it("says it is due this month, under the figure the API worked out", () => {
    mocks.assignments = [
      line({
        id: "a1",
        name: "Long-service",
        schedule,
        scheduleStatus: statusDue,
      }),
    ];
    mount();
    const row = within(rowFor("Long-service"));
    expect(row.getByText("+₦50,000.00")).toBeInTheDocument();
    expect(row.getByText("Due this month")).toBeInTheDocument();
  });

  it("says when it is next due instead of a ₦0.00 that reads as an amount", () => {
    mocks.assignments = [
      line({
        id: "a2",
        name: "Long-service",
        schedule,
        scheduleStatus: statusLater,
        resolvedKobo: 0,
      }),
    ];
    mount();
    const row = within(rowFor("Long-service"));
    expect(row.getByText("Next due Oct 2028")).toBeInTheDocument();
    expect(row.queryByText(/₦0\.00/)).toBeNull();
  });

  it("states the schedule under the name, in the API's words, in place of 'every month'", () => {
    mocks.assignments = [
      line({
        id: "a3",
        name: "Long-service",
        schedule,
        scheduleStatus: statusLater,
        resolvedKobo: 0,
      }),
    ];
    mount();
    const row = within(rowFor("Long-service"));
    expect(
      row.getByText(/After 3 years of service, then every 3 years/),
    ).toBeInTheDocument();
    expect(row.queryByText(/every month/)).toBeNull();
  });

  it("calls the amount per payment on the line, not a month", () => {
    mocks.assignments = [
      line({
        id: "a4",
        name: "Long-service",
        schedule,
        scheduleStatus: statusDue,
      }),
    ];
    mount();
    expect(
      within(rowFor("Long-service")).getByText(/₦50,000\.00 per payment/),
    ).toBeInTheDocument();
  });
});

describe("a line that is not on a schedule", () => {
  it("is exactly what it was: the figure, and 'every month'", () => {
    mocks.assignments = [
      line({
        id: "a5",
        name: "Transport",
        scheduleStatus: null,
      }),
      line({
        id: "a6",
        name: "Meal",
        schedule: {
          ...schedule,
          qualifyingMonths: 0,
          frequency: "MONTHLY",
          intervalMonths: null,
          isEveryMonth: true,
          summary: "Every month",
        },
      }),
    ];
    mount();
    const transport = within(rowFor("Transport"));
    expect(transport.getByText("+₦50,000.00")).toBeInTheDocument();
    expect(transport.getByText(/every month/)).toBeInTheDocument();
    expect(transport.getByText(/₦50,000\.00 a month/)).toBeInTheDocument();
    expect(transport.queryByText("Due this month")).toBeNull();
    expect(within(rowFor("Meal")).getByText(/every month/)).toBeInTheDocument();
  });

  it("shows a deduction with its figure and no schedule status", () => {
    mocks.assignments = [
      line({
        id: "a7",
        name: "Union",
        kind: "DEDUCTION",
        amountKobo: 100_000,
        resolvedKobo: 100_000,
        scheduleStatus: null,
      }),
    ];
    mount();
    const row = within(rowFor("Union"));
    expect(row.getByText("−₦1,000.00")).toBeInTheDocument();
  });
});

describe("adding a line", () => {
  const library: ApiPayComponent = {
    id: "c-ls",
    code: "long_service",
    name: "Long-service allowance",
    kind: "ALLOWANCE",
    basis: "FIXED",
    taxable: true,
    pensionable: false,
    preTax: false,
    defaultAmountKobo: 12_000_000,
    defaultRate: null,
    sortOrder: 0,
    active: true,
    isSystem: false,
    archived: false,
    applyMode: "OPTIONAL",
    assignmentCount: 0,
    schedule,
  };

  const open = () => {
    mocks.library = [library];
    mount();
    fireEvent.click(
      screen.getAllByRole("button", {
        name: /Add a line|Add the first line/,
      })[0]!,
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("combobox"), {
      target: { value: "c-ls" },
    });
    return dialog;
  };

  it("sends the start date explicitly, the company's own day, when it is left blank", async () => {
    const dialog = open();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save it" }));
    await waitFor(() => expect(mocks.assign).toHaveBeenCalledTimes(1));
    expect(mocks.assign.mock.calls[0]![0]).toMatchObject({
      payComponentId: "c-ls",
      amountKobo: 12_000_000,
      effectiveFrom: "2026-10-23",
    });
  });

  it("keeps a date somebody typed", async () => {
    const dialog = open();
    fireEvent.change(within(dialog).getByLabelText("Starts"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save it" }));
    await waitFor(() => expect(mocks.assign).toHaveBeenCalledTimes(1));
    expect(mocks.assign.mock.calls[0]![0]).toMatchObject({
      effectiveFrom: "2026-09-01",
    });
  });

  it("says per payment, and states the schedule, for a scheduled allowance", () => {
    const dialog = open();
    expect(
      within(dialog).getByLabelText(/^amount per payment/i),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/After 3 years of service, then every 3 years/),
    ).toBeInTheDocument();
  });

  it("prices a scheduled allowance for 'a month it is paid', never 'a month'", async () => {
    mocks.previewData = {
      employee: {
        id: "e-1",
        employeeNo: "AHR-1",
        name: "H",
        grossMonthlyKobo: 1,
      },
      period: { start: "2026-10-01", end: "2026-10-31" },
      taxSchedule: {
        effectiveFrom: "",
        citation: "",
        confirmedThrough: "",
        stale: false,
      },
      settingsIssues: [],
      applied: { allowances: [], deductions: [] },
      payslip: {},
      current: {},
      change: {
        grossKobo: 5_000_000,
        payeKobo: 900_000,
        pensionEmployeeKobo: 0,
        nhfKobo: 0,
        netKobo: 4_100_000,
        employerCostKobo: 5_000_000,
      },
      held: [],
    };
    const dialog = open();
    expect(
      await within(dialog).findByText(
        "₦41,000.00 more in the account in a month it is paid",
      ),
    ).toBeInTheDocument();
    /* The heading and the line about what it costs the company both say it. */
    expect(within(dialog).getAllByText(/in a month it is paid/)).toHaveLength(
      2,
    );
    expect(within(dialog).queryByText(/₦50,000\.00 a month/)).toBeNull();
  });

  it("says when it will first be paid when the effect on take-home is nothing this month", async () => {
    mocks.previewData = {
      employee: {
        id: "e-1",
        employeeNo: "AHR-1",
        name: "H",
        grossMonthlyKobo: 1,
      },
      period: { start: "2026-10-01", end: "2026-10-31" },
      taxSchedule: {
        effectiveFrom: "",
        citation: "",
        confirmedThrough: "",
        stale: false,
      },
      settingsIssues: [],
      applied: { allowances: [], deductions: [] },
      payslip: {},
      current: {},
      change: {
        grossKobo: 0,
        payeKobo: 0,
        pensionEmployeeKobo: 0,
        nhfKobo: 0,
        netKobo: 0,
        employerCostKobo: 0,
      },
      held: [
        {
          componentId: "c-ls",
          code: "long_service",
          name: "Long-service allowance",
          status: statusLater,
        },
      ],
    };
    const dialog = open();
    /* The preview waits for the typed figure to settle before it is an answer
       to it, so the line arrives with the answer and not before. */
    expect(
      await within(dialog).findByText("Take-home pay does not change"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Long-service allowance: Next due Oct 2028"),
    ).toBeInTheDocument();
  });
});
