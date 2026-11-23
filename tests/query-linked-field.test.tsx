import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAction } from "@/lib/api/conduct";
import { summary } from "./queries-fixtures";

/**
 * The optional "Linked query" choice in another module's own form, and the link back on the record.
 *
 * What is proved: it is offered only to somebody who works queries, only while the company has
 * queries on, and only the queries about this person that have been served and not withdrawn; it
 * shows a reference and where it stands and never a subject line; an employment change that moves
 * pay is told why there is no choice, in the server's sentence, and never sends one; an exit offers
 * it for a termination only; a form that is opened again starts with no query chosen; and the link
 * back is drawn only where the server sent an id, from the id.
 */

let held = new Set<string>();
let switchOn = true;
vi.mock("@/lib/permissions", () => ({
  useCan: (key: string) => held.has(key),
}));
const register = vi.fn();
vi.mock("@/lib/store/queries", () => ({
  useQueriesSwitch: () => ({
    on: switchOn,
    known: true,
    said: true,
    editable: true,
    error: null,
  }),
  useQueryRegister: (params: unknown, enabled: boolean) =>
    register(params, enabled),
}));
vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
  useSession: () => ({ isConnected: true, employeeId: "e-me" }),
}));

const { LinkedQueryField, LinkedQueryLine, QueryOriginLine } =
  await import("@/components/queries/linked-query");

const rows = [
  summary({
    id: "q-issued",
    reference: "Q-2026-001",
    status: "ISSUED",
    subjectLine: "A SECRET SUBJECT LINE",
  }),
  summary({ id: "q-replied", reference: "Q-2026-002", status: "REPLIED" }),
  summary({ id: "q-closed", reference: "Q-2026-003", status: "CLOSED" }),
  summary({ id: "q-draft", reference: null, status: "DRAFT" }),
  summary({ id: "q-withdrawn", reference: "Q-2026-004", status: "WITHDRAWN" }),
];

beforeEach(() => {
  held = new Set(["ISSUE_QUERIES"]);
  switchOn = true;
  register.mockReset();
  register.mockReturnValue({
    data: { rows, meta: {}, waiting: null },
    loading: false,
  });
});

describe("the choice", () => {
  it("lists the queries about the person that have been served and not withdrawn, by reference and standing", () => {
    render(<LinkedQueryField subjectId="e-1" value="" onChange={vi.fn()} />);
    const options = screen
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual([
      "None",
      "Q-2026-001, issued",
      "Q-2026-002, replied",
      "Q-2026-003, closed",
    ]);
  });

  it("asks the register about this person only, and only when it is offered", () => {
    render(<LinkedQueryField subjectId="e-1" value="" onChange={vi.fn()} />);
    expect(register).toHaveBeenCalledWith({ subjectId: "e-1" }, true);
  });

  it("never shows a subject line, in an option or anywhere", () => {
    const { container } = render(
      <LinkedQueryField subjectId="e-1" value="" onChange={vi.fn()} />,
    );
    expect(container.textContent).not.toMatch(/SECRET SUBJECT/);
  });

  it("says in words that it changes nothing about the query and the query changes nothing there", () => {
    render(<LinkedQueryField subjectId="e-1" value="" onChange={vi.fn()} />);
    expect(
      screen.getByText(
        /It changes nothing about the query, and the query changes nothing here/,
      ),
    ).toBeInTheDocument();
  });

  it("hands the chosen id up, and an empty string for none", async () => {
    const onChange = vi.fn();
    render(<LinkedQueryField subjectId="e-1" value="" onChange={onChange} />);
    await userEvent.selectOptions(screen.getByRole("combobox"), "q-closed");
    expect(onChange).toHaveBeenLastCalledWith("q-closed");
    await userEvent.selectOptions(screen.getByRole("combobox"), "");
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it.each([
    [
      "somebody who does not work queries",
      () => (held = new Set(["EDIT_RECORDS_NOT_EXPANDED"])),
    ],
    ["a company with queries off", () => (switchOn = false)],
  ])("is not offered to %s", (_name, setup) => {
    setup();
    const { container } = render(
      <LinkedQueryField subjectId="e-1" value="" onChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(register).toHaveBeenCalledWith({ subjectId: "e-1" }, false);
  });

  it("is offered to a decider as well as an issuer", () => {
    held = new Set(["DECIDE_QUERIES"]);
    render(<LinkedQueryField subjectId="e-1" value="" onChange={vi.fn()} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("is not offered when there is nobody chosen yet", () => {
    const { container } = render(
      <LinkedQueryField subjectId="" value="" onChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("draws nothing, not an empty choice, when there is nothing to link, or while it reads", () => {
    register.mockReturnValue({
      data: { rows: [rows[3], rows[4]], meta: {}, waiting: null },
      loading: false,
    });
    const first = render(
      <LinkedQueryField subjectId="e-1" value="" onChange={vi.fn()} />,
    );
    expect(first.container).toBeEmptyDOMElement();
    register.mockReturnValue({ data: null, loading: true });
    const second = render(
      <LinkedQueryField subjectId="e-1" value="" onChange={vi.fn()} />,
    );
    expect(second.container).toBeEmptyDOMElement();
  });
});

describe("the link back", () => {
  it("is drawn only where the server sent an id, from the id", () => {
    render(<LinkedQueryLine queryId="q-1" reference="Q-2026-014" />);
    expect(screen.getByRole("link", { name: "Q-2026-014" })).toHaveAttribute(
      "href",
      "/people/queries/q-1",
    );
  });

  it("draws nothing for a record that followed no query", () => {
    const { container } = render(
      <LinkedQueryLine queryId={null} reference={null} />,
    );
    expect(container).toBeEmptyDOMElement();
    const missing = render(
      <LinkedQueryLine queryId={undefined} reference="Q-1" />,
    );
    expect(missing.container).toBeEmptyDOMElement();
  });

  it("encodes the id, so text the server sent cannot become another address", () => {
    render(<LinkedQueryLine queryId="../../admin?x=1" reference={null} />);
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/people/queries/..%2F..%2Fadmin%3Fx%3D1",
    );
  });

  it("on a document request is offered to staff who work queries, with the company's queries on, and to nobody else", () => {
    const { rerender, container } = render(<QueryOriginLine queryId="q-1" />);
    expect(screen.getByText(/Asked under a query/)).toBeInTheDocument();
    held = new Set();
    rerender(<QueryOriginLine queryId="q-1" />);
    expect(container).toBeEmptyDOMElement();
    held = new Set(["ISSUE_QUERIES"]);
    switchOn = false;
    rerender(<QueryOriginLine queryId="q-1" />);
    expect(container).toBeEmptyDOMElement();
    switchOn = true;
    rerender(<QueryOriginLine queryId={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

/* ------------------------------------------------------------ the three forms */

const propose = vi.fn();
vi.mock("@/lib/store/employment-changes", () => ({
  useEmploymentChangeActions: () => ({ propose, readOnly: false }),
}));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({ flat: [] }),
}));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeSearch: () => ({
    search: vi.fn(),
    options: [],
    pending: false,
    failed: false,
    more: false,
    retry: vi.fn(),
  }),
  useEmployee: () => ({
    employee: { id: "e-1", jobTitle: "Engineer", grossMonthly: 300000 },
  }),
  useEmployeeDirectory: () => ({ employees: [], loading: false }),
}));

describe("an employment change", () => {
  const open = async () => {
    const { ProposeChangeDialog } =
      await import("@/app/(app)/people/changes/propose-dialog");
    render(
      <ProposeChangeDialog
        onClose={vi.fn()}
        person={{ id: "e-1", name: "Chidi Nwosu" }}
        kind="TRANSFER"
      />,
    );
  };
  const fill = () => {
    fireEvent.change(screen.getByLabelText(/New job title/), {
      target: { value: "Lead" },
    });
    fireEvent.change(screen.getByLabelText(/Why/), {
      target: { value: "Reorganised" },
    });
  };

  beforeEach(() => {
    propose.mockReset();
    propose.mockResolvedValue(undefined);
  });

  it("sends the chosen query beside a change that moves no pay", async () => {
    await open();
    fill();
    await userEvent.selectOptions(
      screen.getByLabelText(/Linked query/),
      "q-closed",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Send for approval" }),
    );
    await waitFor(() =>
      expect(propose).toHaveBeenCalledWith(
        expect.objectContaining({
          queryId: "q-closed",
          to: { jobTitle: "Lead" },
        }),
      ),
    );
  });

  it("says why there is no choice once pay is typed, in the server's own sentence, and never sends one", async () => {
    await open();
    fill();
    await userEvent.selectOptions(
      screen.getByLabelText(/Linked query/),
      "q-closed",
    );
    fireEvent.change(screen.getByLabelText(/New monthly pay/), {
      target: { value: "320000" },
    });
    expect(screen.queryByLabelText(/Linked query/)).toBeNull();
    expect(
      screen.getByText(
        "A query cannot be linked to a change of pay. Pay as a penalty needs counsel's advice first, so it is not offered.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Send for approval" }),
    );
    await waitFor(() => expect(propose).toHaveBeenCalled());
    expect(propose.mock.calls[0]?.[0]).not.toHaveProperty("queryId");
  });

  it("sends none when none was chosen", async () => {
    await open();
    fill();
    await userEvent.click(
      screen.getByRole("button", { name: "Send for approval" }),
    );
    await waitFor(() => expect(propose).toHaveBeenCalled());
    expect(propose.mock.calls[0]?.[0]).not.toHaveProperty("queryId");
  });
});

const start = vi.fn();
vi.mock("@/lib/store/offboarding", () => ({
  useStartExit: () => ({ start, source: "api" }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/use-today", () => ({ useToday: () => "2026-11-23" }));

describe("an exit", () => {
  const mount = async (open = true) => {
    const { StartExitDialog } =
      await import("@/app/(app)/people/offboarding/start-exit");
    const props = {
      onClose: vi.fn(),
      onStarted: vi.fn(),
      employeeId: "e-1",
      employeeName: "Chidi Nwosu",
    };
    const view = render(<StartExitDialog open={open} {...props} />);
    return { view, props, StartExitDialog };
  };
  const fill = () => {
    fireEvent.change(screen.getByLabelText(/Last working day/), {
      target: { value: "2026-12-31" },
    });
    fireEvent.change(screen.getByLabelText(/^Why/), {
      target: { value: "Ended" },
    });
  };

  beforeEach(() => {
    start.mockReset();
    start.mockResolvedValue({
      id: "x-1",
      employee: { name: "Chidi Nwosu" },
      status: "AWAITING_HR",
      progress: { total: 0 },
    });
  });

  it("offers the choice for a termination only, and sends it only then", async () => {
    await mount();
    expect(screen.queryByLabelText(/Linked query/)).toBeNull();
    await userEvent.selectOptions(
      screen.getByLabelText(/What happened/),
      "TERMINATION",
    );
    await userEvent.selectOptions(
      screen.getByLabelText(/Linked query/),
      "q-issued",
    );
    fill();
    await userEvent.click(
      screen.getByRole("button", { name: "Start the checklist" }),
    );
    await waitFor(() =>
      expect(start).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "TERMINATION", queryId: "q-issued" }),
      ),
    );
  });

  it("does not send a query chosen before the kind was changed away from a termination", async () => {
    await mount();
    await userEvent.selectOptions(
      screen.getByLabelText(/What happened/),
      "TERMINATION",
    );
    await userEvent.selectOptions(
      screen.getByLabelText(/Linked query/),
      "q-issued",
    );
    await userEvent.selectOptions(
      screen.getByLabelText(/What happened/),
      "RESIGNATION",
    );
    fill();
    await userEvent.click(
      screen.getByRole("button", { name: "Start the checklist" }),
    );
    await waitFor(() => expect(start).toHaveBeenCalled());
    expect(start.mock.calls[0]?.[0]).not.toHaveProperty("queryId");
  });

  it("starts with no query chosen each time it is opened", async () => {
    const { view, props, StartExitDialog } = await mount();
    await userEvent.selectOptions(
      screen.getByLabelText(/What happened/),
      "TERMINATION",
    );
    await userEvent.selectOptions(
      screen.getByLabelText(/Linked query/),
      "q-issued",
    );
    view.rerender(<StartExitDialog open={false} {...props} />);
    view.rerender(<StartExitDialog open {...props} />);
    await userEvent.selectOptions(
      screen.getByLabelText(/What happened/),
      "TERMINATION",
    );
    expect(
      (screen.getByLabelText(/Linked query/) as HTMLSelectElement).value,
    ).toBe("");
  });
});

/* ------------------------------------------------------------- the warning form */

const recordAction = vi.fn();
vi.mock("@/lib/store/conduct", async (original) => ({
  ...(await original<typeof import("@/lib/store/conduct")>()),
  useConductRecord: () => ({
    record: {
      employee: {
        id: "e-1",
        name: "Chidi Nwosu",
        employeeNo: "AHR-0003",
        jobTitle: "Engineer",
      },
      summary: {
        active: 0,
        lapsed: 0,
        total: 0,
        awaitingConfirmation: 0,
        disputed: 0,
        activeByLevel: {},
      },
      actions: [],
      total: 0,
      page: 1,
      pageSize: 25,
    },
    loading: false,
    error: null,
    editable: true,
    reload: vi.fn(),
    recordAction,
    update: vi.fn(),
    confirm: vi.fn(),
  }),
}));

describe("a conduct warning", () => {
  it("sends the query chosen in the form, and is a new form each time it opens", async () => {
    held = new Set(["EDIT_RECORDS", "ISSUE_QUERIES"]);
    recordAction.mockResolvedValue({ employeeNotified: true });
    const { ConductPanel } = await import("@/app/(app)/people/[id]/conduct");
    const { ToastProvider } = await import("@/components/ui");
    render(
      <ToastProvider>
        <ConductPanel employeeId="e-1" />
      </ToastProvider>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Record a warning/ }),
    );
    await userEvent.click(screen.getByLabelText(/Verbal warning/));
    fireEvent.change(screen.getByLabelText(/What happened/), {
      target: { value: "Left the site early" },
    });
    await userEvent.selectOptions(
      screen.getByLabelText(/Linked query/),
      "q-replied",
    );
    await userEvent.click(screen.getByRole("button", { name: "Record it" }));
    await waitFor(() =>
      expect(recordAction).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: "e-1",
          level: "VERBAL",
          queryId: "q-replied",
        }),
      ),
    );
    /* Opened again: nothing is left chosen or typed from the last warning. */
    await userEvent.click(
      screen.getByRole("button", { name: /Record a warning/ }),
    );
    expect(
      (screen.getByLabelText(/Linked query/) as HTMLSelectElement).value,
    ).toBe("");
    expect(
      (screen.getByLabelText(/What happened/) as HTMLInputElement).value,
    ).toBe("");
  });

  it("draws the link back on a record only where the server sent the id", async () => {
    const { ActionRow } = await import("@/app/(app)/people/[id]/conduct");
    const action = {
      id: "a-1",
      employeeId: "e-1",
      employeeName: "Chidi Nwosu",
      employeeNo: "AHR-0003",
      level: "WRITTEN",
      levelLabel: "Written warning",
      incidentOn: "2026-11-10",
      summary: "Summary",
      detail: null,
      outcome: null,
      issuedById: null,
      issuedByName: null,
      issuedAt: "2026-11-11T09:00:00.000Z",
      expiresOn: null,
      neverLapses: true,
      active: true,
      acknowledgedAt: null,
      disputedAt: null,
      disputeNote: null,
      awaitingConfirmation: false,
      createdAt: "2026-11-11T09:00:00.000Z",
      updatedAt: "2026-11-11T09:00:00.000Z",
    } satisfies ApiAction;
    const { rerender } = render(
      <ActionRow
        action={action}
        canEdit={false}
        isSubject={false}
        onConfirm={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Followed a query/)).toBeNull();
    rerender(
      <ActionRow
        action={{ ...action, queryId: "q-9", queryReference: "Q-2026-009" }}
        canEdit={false}
        isSubject={false}
        onConfirm={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByRole("link", { name: "Q-2026-009" })).toHaveAttribute(
      "href",
      "/people/queries/q-9",
    );
  });
});
