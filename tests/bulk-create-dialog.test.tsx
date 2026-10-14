import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { BulkCreateDialog } from "@/components/bulk-create/bulk-create-dialog";
import type { BulkSurface } from "@/lib/bulk-create/surface";
import type { ApiApplyResult, ApiValidateResult } from "@/lib/api/imports";
import { OBJECTIVES } from "@/lib/imports/objectives";

/**
 * The window for adding several objectives, pressed.
 *
 * What is being pinned is what a person would notice and no type can: switching
 * layout keeps what was typed; the review has no inputs and nothing is created
 * until it is confirmed; "Edit again" gives the values back; the same rows that
 * were checked are the rows that are created; closing with work asks first; and
 * 50 is a wall.
 */

const validate = vi.fn();
const apply = vi.fn();

vi.mock("@/lib/api/imports", async (original) => ({
  ...(await original<typeof import("@/lib/api/imports")>()),
  imports: {
    validate: (...args: unknown[]) => validate(...args) as unknown,
    apply: (...args: unknown[]) => apply(...args) as unknown,
  },
}));

vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({ isConnected: true }),
  useOrgTimezone: () => "Africa/Lagos",
}));

const surface = (overrides: Partial<BulkSurface> = {}): BulkSurface => ({
  dictionary: OBJECTIVES,
  title: "Add several objectives",
  intro: "Type up to 50.",
  controls: {
    quarter: {
      kind: "select",
      options: [
        { value: "2026-Q4", label: "Q4 2026" },
        { value: "2027-Q1", label: "Q1 2027" },
      ],
      blank: "Choose a quarter",
    },
    ownerEmail: {
      kind: "text",
      type: "email",
      suggestions: [{ value: "ngozi@co.com", label: "Ngozi — ngozi@co.com" }],
    },
    description: { kind: "longtext" },
  },
  groups: [
    { fields: ["title", "quarter"] },
    { fields: ["ownerEmail", "department", "parent", "period"] },
    { fields: ["description"] },
    {
      label: "A number to hit",
      fields: ["measure", "unit", "start", "target", "lowerIsBetter"],
    },
  ],
  defaults: { quarter: "2026-Q4" },
  itemName: (draft, position) =>
    draft.values["title"]?.trim() || `Objective ${String(position)}`,
  fillable: ["quarter", "period"],
  lists: { department: ["Marketing"], period: ["H2 2026"] },
  upload: { href: "/performance/kpis/import", label: "Upload objectives" },
  prerequisites: {},
  refusalWithoutApi: "",
  onChanged: vi.fn(),
  ...overrides,
});

const rowReport = (
  row: number,
  errors: { column: string; problem: string }[] = [],
) => ({
  row,
  employeeNo: null,
  name: null,
  action: errors.length > 0 ? ("skip" as const) : ("create" as const),
  errors: errors.map((e) => ({ row, value: null, ...e })),
  warnings: [],
  duplicate: null,
  missing: [],
  employeeNoGenerated: false,
});

const validated = (
  rows: ReturnType<typeof rowReport>[],
  notes: string[] = [],
  unmappedColumns: string[] = [],
): ApiValidateResult =>
  ({
    batchId: "batch-1",
    filename: "Added in the app",
    status: "VALIDATED",
    totalRows: rows.length,
    toCreate: rows.filter((r) => r.action === "create").length,
    toUpdate: 0,
    toSkip: rows.filter((r) => r.action === "skip").length,
    summary: "",
    missing: {},
    unmappedColumns,
    notes,
    rows,
    duplicates: { undecided: 0, skipping: 0, updating: 0 },
    flagged: 0,
    missingOrgTaxState: false,
    fingerprint: "f",
    maxRowsPerBatch: 500,
  }) as ApiValidateResult;

const applied = (over: Partial<ApiApplyResult> = {}): ApiApplyResult =>
  ({
    batchId: "batch-1",
    filename: "Added in the app",
    status: "COMPLETED",
    totalRows: 1,
    created: 1,
    updated: 0,
    skipped: 0,
    summary: "",
    notes: [],
    skippedRows: [],
    duplicates: { undecided: 0, skipping: 0, updating: 0 },
    flagged: 0,
    ...over,
  }) as ApiApplyResult;

/**
 * Opens the window in the stacked layout unless told otherwise.
 *
 * The remembered layout lives in module memory as well as in storage, so a test
 * that picks "Table" would leave every later test in it — and clearing storage
 * does not clear memory. Choosing the layout explicitly is what keeps each test
 * about its own thing.
 */
function open(
  overrides: Partial<BulkSurface> = {},
  options: { keepLayout?: boolean } = {},
) {
  const onClose = vi.fn();
  const view = render(
    <ToastProvider>
      <BulkCreateDialog open onClose={onClose} surface={surface(overrides)} />
    </ToastProvider>,
  );
  if (!options.keepLayout) {
    fireEvent.click(screen.getByRole("radio", { name: "Stacked" }));
  }
  return { onClose, ...view };
}

const titleBox = () => screen.getByLabelText(/Objective title/);

beforeEach(() => {
  validate.mockReset();
  apply.mockReset();
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
});

describe("the layouts", () => {
  it("opens on one empty objective, stacked, with the quarter already chosen", () => {
    /* First in the file, before anything has chosen a layout. */
    open({}, { keepLayout: true });
    expect(
      screen.getByRole("heading", { name: "Add several objectives" }),
    ).toBeInTheDocument();
    expect(titleBox()).toHaveValue("");
    expect(screen.getByLabelText(/Due quarter/)).toHaveValue("2026-Q4");
    expect(screen.getByRole("radio", { name: "Stacked" })).toBeChecked();
  });

  it("keeps what was typed when the layout changes, in all three", async () => {
    const user = userEvent.setup();
    open();
    await user.type(titleBox(), "Grow pipeline");

    await user.click(screen.getByRole("radio", { name: "Table" }));
    expect(
      screen.getByRole("textbox", { name: /Objective title, Grow pipeline/ }),
    ).toHaveValue("Grow pipeline");

    await user.click(screen.getByRole("radio", { name: "Page by page" }));
    expect(titleBox()).toHaveValue("Grow pipeline");
    expect(screen.getByText("Objective 1 of 1")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Stacked" }));
    expect(titleBox()).toHaveValue("Grow pipeline");
  });

  it("moves between objectives with the arrows, page by page", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("radio", { name: "Page by page" }));
    await user.type(titleBox(), "First");
    await user.click(screen.getByRole("button", { name: "Add another" }));
    expect(screen.getByText("Objective 2 of 2")).toBeInTheDocument();
    expect(titleBox()).toHaveValue("");
    await user.type(titleBox(), "Second");
    await user.click(
      screen.getByRole("button", { name: "Previous objective" }),
    );
    expect(titleBox()).toHaveValue("First");
    await user.click(screen.getByRole("button", { name: "Next objective" }));
    expect(titleBox()).toHaveValue("Second");
  });

  it("remembers the layout for next time, and nothing that was typed", async () => {
    const user = userEvent.setup();
    const first = open({}, { keepLayout: true });
    await user.click(screen.getByRole("radio", { name: "Table" }));
    await user.type(
      screen.getByRole("textbox", { name: /Objective title/ }),
      "Typed in the table",
    );
    first.unmount();

    open({}, { keepLayout: true });
    expect(await screen.findByRole("radio", { name: "Table" })).toBeChecked();
    expect(
      screen.getByRole("textbox", { name: /Objective title/ }),
    ).toHaveValue("");
    /* The only thing in browser storage is the layout. */
    const stored = Object.keys(localStorage);
    expect(stored).toEqual(["approvehr.bulk-create.layout"]);
    expect(localStorage.getItem(stored[0] as string)).not.toContain(
      "Typed in the table",
    );
  });
});

describe("the limit", () => {
  const csvOf = (count: number) =>
    [
      "Objective title,Due quarter",
      ...Array.from(
        { length: count },
        (_, i) => `Goal ${String(i + 1)},2026-Q4`,
      ),
    ].join("\n");
  const fileOf = (count: number) =>
    new File([csvOf(count)], "goals.csv", { type: "text/csv" });
  const chooser = () =>
    document.querySelector<HTMLInputElement>(
      'input[type="file"]',
    ) as HTMLInputElement;

  it("takes 50 and then stops offering to add another", async () => {
    const user = userEvent.setup();
    open();
    /* In the table, which is the cheap layout to render fifty of in jsdom. How
       the stacked one holds up at fifty is measured in a real browser. */
    await user.click(screen.getByRole("radio", { name: "Table" }));
    await user.upload(chooser(), fileOf(50));
    expect(
      await screen.findByText(/Loaded 50 objectives from goals.csv/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add another" })).toBeDisabled();
    expect(
      screen.getByText(/50 is the most this window holds/),
    ).toBeInTheDocument();
  });

  it("refuses 51 whole, says where to go, and loads none of them", async () => {
    const user = userEvent.setup();
    open();
    await user.upload(chooser(), fileOf(51));
    expect(await screen.findByText(/That would make 51/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "upload objectives" }),
    ).toHaveAttribute("href", "/performance/kpis/import");
    expect(titleBox()).toHaveValue("");
    expect(screen.getAllByLabelText(/Objective title/)).toHaveLength(1);
  });
});

describe("typing with a full list", () => {
  it("re-renders only the card being typed in, not the other five", async () => {
    /* The reason cards are memoised. With fifty of them every keystroke used to
       re-render six hundred fields, and measured at 1.3 seconds a key in a real
       browser. Six cards are enough to tell: unmemoised, one keystroke renders
       six; memoised, it renders the one. More only makes jsdom slow, and under a
       full parallel run a slow test that times out leaves its typing to land in
       the next test's inputs. `itemName` runs once per rendered card, so counting its calls is
       counting cards that rendered. */
    const user = userEvent.setup();
    const itemName = vi.fn(
      (draft: { values: Readonly<Record<string, string>> }, position: number) =>
        draft.values["title"]?.trim() || `Objective ${String(position)}`,
    );
    open({ itemName });
    const csv = [
      "Objective title,Due quarter",
      ...Array.from({ length: 6 }, (_, i) => `Goal ${String(i + 1)},2026-Q4`),
    ].join("\n");
    await user.upload(
      document.querySelector<HTMLInputElement>(
        'input[type="file"]',
      ) as HTMLInputElement,
      new File([csv], "six.csv", { type: "text/csv" }),
    );
    await screen.findByText(/Loaded 6 objectives/);
    const boxes = screen.getAllByLabelText(/Objective title/);
    expect(boxes).toHaveLength(6);

    itemName.mockClear();
    await user.type(boxes[5] as HTMLElement, "x");
    expect(itemName.mock.calls.length).toBeGreaterThan(0);
    expect(itemName.mock.calls.length).toBeLessThanOrEqual(3);
    expect(boxes[5]).toHaveValue("Goal 6x");
  });
});

describe("checking, and the read-only review", () => {
  it("sends the rows under the template's headings, then shows them with no inputs", async () => {
    const user = userEvent.setup();
    validate.mockResolvedValue(
      validated([rowReport(1)], ["Objectives arrive as drafts."]),
    );
    open();
    await user.type(titleBox(), "Grow pipeline");
    await user.click(screen.getByRole("button", { name: "Check and review" }));

    await screen.findByRole("heading", { name: "Review 1 objective" });
    const [entity, body] = validate.mock.calls[0] as [
      string,
      { rows: Record<string, string>[] },
    ];
    expect(entity).toBe("objectives");
    expect(body.rows).toEqual([
      { "Objective title": "Grow pipeline", "Due quarter": "2026-Q4" },
    ]);

    /* Read only: the title is text, and there is nothing to type in. */
    expect(screen.queryByLabelText(/Objective title/)).not.toBeInTheDocument();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    /* The name heads the card and fills the title field, so it appears twice. */
    expect(screen.getAllByText("Grow pipeline").length).toBeGreaterThanOrEqual(
      2,
    );
    expect(
      screen.getByText("Objectives arrive as drafts."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Nothing is created yet/)).toBeInTheDocument();
    /* And nothing has been created. */
    expect(apply).not.toHaveBeenCalled();
  });

  it("gives the values back on Edit again, and checks again afterwards", async () => {
    const user = userEvent.setup();
    validate.mockResolvedValue(validated([rowReport(1)]));
    open();
    await user.type(titleBox(), "Grow pipeline");
    await user.click(screen.getByRole("button", { name: "Check and review" }));
    await screen.findByRole("heading", { name: "Review 1 objective" });

    await user.click(screen.getByRole("button", { name: "Edit again" }));
    expect(titleBox()).toHaveValue("Grow pipeline");
    await user.clear(titleBox());
    await user.type(titleBox(), "Grow qualified pipeline");
    await user.click(screen.getByRole("button", { name: "Check and review" }));
    await screen.findByRole("heading", { name: "Review 1 objective" });
    expect(validate).toHaveBeenCalledTimes(2);
    const second = validate.mock.calls[1] as [
      string,
      { rows: Record<string, string>[] },
    ];
    expect(second[1].rows[0]?.["Objective title"]).toBe(
      "Grow qualified pipeline",
    );
  });

  it("stays on the form when a row is refused, and says which and why", async () => {
    const user = userEvent.setup();
    validate.mockResolvedValue(
      validated([
        rowReport(1, [
          {
            column: "Due quarter",
            problem: "That quarter has already closed.",
          },
        ]),
      ]),
    );
    open();
    await user.type(titleBox(), "Grow pipeline");
    await user.click(screen.getByRole("button", { name: "Check and review" }));

    expect(
      await screen.findByText(/1 objective needs a change/),
    ).toBeInTheDocument();
    /* On the field, and in the list at the top. */
    expect(
      screen.getAllByText(/That quarter has already closed/).length,
    ).toBeGreaterThan(1);
    expect(
      screen.queryByRole("heading", { name: /^Review/ }),
    ).not.toBeInTheDocument();
    expect(titleBox()).toHaveValue("Grow pipeline");
  });

  it("stops when the server did not recognise a column it was sent, and creates nothing", async () => {
    /* A server a deploy behind the app does not know a renamed heading, and
       would carry on without it: the objectives would be made with nobody
       assigned and every row would have passed. */
    const user = userEvent.setup();
    validate.mockResolvedValue(
      validated([rowReport(1)], [], ["Assigned to (work email)"]),
    );
    open();
    await user.type(titleBox(), "Grow pipeline");
    await user.click(screen.getByRole("button", { name: "Check and review" }));

    expect(
      await screen.findByText(
        /does not recognise the column "Assigned to \(work email\)"/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /^Review/ }),
    ).not.toBeInTheDocument();
    expect(apply).not.toHaveBeenCalled();
    expect(titleBox()).toHaveValue("Grow pipeline");
  });

  it("does not check an empty window", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("button", { name: "Check and review" }));
    expect(
      await screen.findByText(/Add at least one objective first/),
    ).toBeInTheDocument();
    expect(validate).not.toHaveBeenCalled();
  });

  it("reports a server failure in the server's words and keeps the work", async () => {
    const { ApiError } = await import("@/lib/api/client");
    const user = userEvent.setup();
    validate.mockRejectedValue(
      new ApiError(
        403,
        "forbidden",
        "You cannot raise objectives for another department.",
      ),
    );
    open();
    await user.type(titleBox(), "Keep me");
    await user.click(screen.getByRole("button", { name: "Check and review" }));
    expect(
      await screen.findByText(
        "You cannot raise objectives for another department.",
      ),
    ).toBeInTheDocument();
    expect(titleBox()).toHaveValue("Keep me");
  });
});

describe("creating them", () => {
  async function reviewed() {
    const user = userEvent.setup();
    validate.mockResolvedValue(validated([rowReport(1)]));
    const onChanged = vi.fn();
    const view = open({ onChanged });
    await user.type(titleBox(), "Grow pipeline");
    await user.click(screen.getByRole("button", { name: "Check and review" }));
    await screen.findByRole("heading", { name: "Review 1 objective" });
    return { user, onChanged, ...view };
  }

  it("applies exactly the rows that were checked, and reloads the screen behind", async () => {
    const { user, onChanged } = await reviewed();
    apply.mockResolvedValue(applied());
    await user.click(
      screen.getByRole("button", { name: "Create 1 objective" }),
    );

    expect(await screen.findByText("1 objective created")).toBeInTheDocument();
    const [entity, batchId, body] = apply.mock.calls[0] as [
      string,
      string,
      { confirm: boolean; rows: Record<string, string>[] },
    ];
    expect(entity).toBe("objectives");
    expect(batchId).toBe("batch-1");
    expect(body.confirm).toBe(true);
    expect(body.rows).toEqual(
      (validate.mock.calls[0] as [string, { rows: unknown[] }])[1].rows,
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("names what did not go in, and brings only those back to fix", async () => {
    const user = userEvent.setup();
    validate.mockResolvedValue(validated([rowReport(1), rowReport(2)]));
    open();
    await user.type(titleBox(), "Lands");
    await user.click(screen.getByRole("button", { name: "Add another" }));
    await user.type(
      screen.getAllByLabelText(/Objective title/)[1] as HTMLElement,
      "Does not land",
    );
    await user.click(screen.getByRole("button", { name: "Check and review" }));
    await screen.findByRole("heading", { name: "Review 2 objectives" });

    apply.mockResolvedValue(
      applied({
        created: 1,
        skipped: 1,
        skippedRows: [
          rowReport(2, [
            {
              column: "Assigned to (work email)",
              problem: "Nobody has that email.",
            },
          ]),
        ],
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Create 2 objectives" }),
    );

    expect(await screen.findByText("1 objective created")).toBeInTheDocument();
    expect(screen.getByText("1 objective did not go in")).toBeInTheDocument();
    expect(screen.getByText(/Nobody has that email/)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: /Fix the 1 objective that did not go in/,
      }),
    );
    /* The one that landed is gone from the window, so pressing the button again
       cannot create it twice. */
    expect(screen.getAllByLabelText(/Objective title/)).toHaveLength(1);
    expect(titleBox()).toHaveValue("Does not land");
    expect(screen.getAllByText(/Nobody has that email/).length).toBeGreaterThan(
      0,
    );
  });

  it("says so when the server failed part-way, instead of claiming all went in", async () => {
    const { ApiError } = await import("@/lib/api/client");
    const { user } = await reviewed();
    apply.mockRejectedValue(new ApiError(504, "timeout", "Gateway timeout"));
    await user.click(
      screen.getByRole("button", { name: "Create 1 objective" }),
    );
    expect(await screen.findByText(/not clear whether/)).toBeInTheDocument();
    expect(screen.queryByText(/1 objective created/)).not.toBeInTheDocument();
  });
});

describe("closing", () => {
  it("closes at once when nothing was typed", async () => {
    const user = userEvent.setup();
    const { onClose } = open();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("asks first when something was typed, and offers the download", async () => {
    const user = userEvent.setup();
    const { onClose } = open();
    await user.type(titleBox(), "Do not lose me");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    const question = await screen.findByRole("dialog", {
      name: /Close without creating 1 objective/,
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(
      within(question).getByRole("button", { name: "Download Excel draft" }),
    ).toBeInTheDocument();
    expect(
      within(question).getByRole("button", { name: "Download CSV draft" }),
    ).toBeInTheDocument();

    await user.click(
      within(question).getByRole("button", { name: "Keep editing" }),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(titleBox()).toHaveValue("Do not lose me");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(
      within(
        await screen.findByRole("dialog", { name: /Close without creating/ }),
      ).getByRole("button", { name: "Discard" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("the draft as a file", () => {
  it("downloads what was typed, under the template's headings", async () => {
    const user = userEvent.setup();
    let saved: Blob | null = null;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      saved = blob;
      return "blob:test";
    });
    open();
    expect(
      screen.getByRole("button", { name: /Download draft/ }),
    ).toBeDisabled();
    await user.type(titleBox(), "Grow pipeline");
    await user.click(screen.getByRole("button", { name: /Download draft/ }));
    await user.click(screen.getByRole("menuitem", { name: /CSV/ }));

    expect(saved).not.toBeNull();
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(saved as unknown as Blob);
    });
    expect(text).toContain("Objective title *");
    expect(text).toContain("Grow pipeline");
  });

  it("loads a file into the window, and says what it left out", async () => {
    const user = userEvent.setup();
    open();
    const file = new File(
      [
        "Objective title *,Due quarter *,Assigned to (work email),Religion\nGrow pipeline,2027-Q1,ngozi@co.com,x\nCut churn,2026-Q4,,y",
      ],
      "draft.csv",
      { type: "text/csv" },
    );
    await user.upload(
      document.querySelector<HTMLInputElement>(
        'input[type="file"]',
      ) as HTMLInputElement,
      file,
    );
    expect(
      await screen.findByText(/Loaded 2 objectives from draft.csv/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Left out a column we did not recognise: Religion/),
    ).toBeInTheDocument();
    const titles = screen.getAllByLabelText(
      /Objective title/,
    ) as HTMLInputElement[];
    expect(titles.map((box) => box.value)).toEqual([
      "Grow pipeline",
      "Cut churn",
    ]);
  });

  it("adds a loaded file after what is typed, never over it", async () => {
    const user = userEvent.setup();
    open();
    await user.type(titleBox(), "Already here");
    await user.upload(
      document.querySelector<HTMLInputElement>(
        'input[type="file"]',
      ) as HTMLInputElement,
      new File(["Objective title,Due quarter\nFrom file,2026-Q4"], "x.csv", {
        type: "text/csv",
      }),
    );
    await screen.findByText(/Loaded 1 objective from x.csv/);
    const titles = screen.getAllByLabelText(
      /Objective title/,
    ) as HTMLInputElement[];
    expect(titles.map((box) => box.value)).toEqual([
      "Already here",
      "From file",
    ]);
  });
});

describe("the table and the bar above the list", () => {
  it("takes a block of cells pasted from Excel, adding rows as needed", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("radio", { name: "Table" }));
    fireEvent.paste(screen.getByRole("textbox", { name: /Objective title/ }), {
      clipboardData: {
        getData: () => "First goal\t2026-Q4\nSecond goal\t2027-Q1",
      },
    });
    const titles = (await screen.findAllByRole("textbox", {
      name: /^Objective title/,
    })) as HTMLInputElement[];
    expect(titles.map((box) => box.value)).toEqual([
      "First goal",
      "Second goal",
    ]);
    expect(screen.getByText(/Pasted 2 rows/)).toBeInTheDocument();
  });

  it("leaves a single pasted value alone", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("radio", { name: "Table" }));
    const paste = fireEvent.paste(
      screen.getByRole("textbox", { name: /Objective title/ }),
      {
        clipboardData: { getData: () => "Just one value" },
      },
    );
    /* Not cancelled, so the browser does what a paste does. */
    expect(paste).toBe(true);
    await waitFor(() =>
      expect(screen.queryByText(/Pasted/)).not.toBeInTheDocument(),
    );
  });

  it("sets one column on everything typed, from the same-for-everyone bar", async () => {
    const user = userEvent.setup();
    open();
    await user.type(titleBox(), "One");
    await user.click(screen.getByRole("button", { name: "Add another" }));
    await user.type(
      screen.getAllByLabelText(/Objective title/)[1] as HTMLElement,
      "Two",
    );

    await user.click(
      screen.getByRole("button", { name: /Set one value for every objective/ }),
    );
    await user.selectOptions(screen.getByLabelText("Column"), "Due quarter");
    await user.selectOptions(screen.getByLabelText("Value"), "2027-Q1");
    await user.click(screen.getByRole("button", { name: "Set on 2" }));

    expect(
      screen.getByText(/Set Due quarter on 2 objectives/),
    ).toBeInTheDocument();
    const quarters = screen.getAllByLabelText(
      /^Due quarter/,
    ) as HTMLSelectElement[];
    expect(quarters.map((select) => select.value)).toEqual([
      "2027-Q1",
      "2027-Q1",
    ]);
  });
});
