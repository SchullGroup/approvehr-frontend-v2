import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { ApiQueryCounts } from "@/lib/api/query-ties";
import { summary } from "./queries-fixtures";

/**
 * A line manager's own drafts, and the counts.
 *
 * What is proved: a manager given only the drafting permission meets one route that shows their own
 * drafts and nothing of the company's register, asks the register nothing, and reads the server's
 * own sentence when it says they may not draft; a withheld count is read as Withheld and never as a
 * nought, and nothing on the counts screen adds up, subtracts, totals, ranks or cuts by anybody.
 */

let held = new Set<string>();
vi.mock("@/lib/permissions", () => ({
  useCan: (key: string) => held.has(key),
}));
vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
  useSession: () => ({ isConnected: true, employeeId: "e-mgr" }),
}));
const registerHook = vi.fn();
const draftsHook = vi.fn();
const countsHook = vi.fn();
let switchState = {
  on: true,
  known: true,
  said: true,
  editable: true,
  error: null,
};
vi.mock("@/lib/store/queries", async (original) => ({
  ...(await original<typeof import("@/lib/store/queries")>()),
  useQueriesSwitch: () => switchState,
  useQueryRegister: (...args: unknown[]) => registerHook(...args),
  useMyDrafts: (...args: unknown[]) => draftsHook(...args),
  useQueryCounts: (...args: unknown[]) => countsHook(...args),
}));

const { QueriesScreen } =
  await import("@/app/(app)/people/queries/queries-screen");
const { CountsScreen } =
  await import("@/app/(app)/people/queries/counts/counts-screen");

const page = (rows: ReturnType<typeof summary>[]) => ({
  data: {
    rows,
    meta: {
      page: 1,
      pageSize: 50,
      total: rows.length,
      totalPages: 1,
      hasMore: false,
    },
    waiting: null,
  },
  loading: false,
  error: null,
  reload: vi.fn(),
  unavailable: false,
});

beforeEach(() => {
  held = new Set();
  switchState = {
    on: true,
    known: true,
    said: true,
    editable: true,
    error: null,
  };
  registerHook.mockReset();
  registerHook.mockReturnValue(page([]));
  draftsHook.mockReset();
  countsHook.mockReset();
});

describe("a line manager", () => {
  beforeEach(() => {
    held = new Set(["DRAFT_QUERIES"]);
  });

  it("meets one route that shows their own drafts, by person and last change, and nothing else", () => {
    draftsHook.mockReturnValue(
      page([
        summary({
          id: "q-d1",
          status: "DRAFT",
          reference: null,
          startedByManager: true,
          subject: { id: "e-1", name: "Chidi Nwosu", employeeNo: "AHR-0003" },
          subjectLine: "A draft of mine",
          updatedAt: "2026-11-20T09:00:00.000Z",
        }),
      ]),
    );
    render(<QueriesScreen />);
    expect(screen.getByText("Chidi Nwosu")).toBeInTheDocument();
    expect(screen.getByText("A draft of mine")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chidi Nwosu" })).toHaveAttribute(
      "href",
      "/people/queries/q-d1",
    );
    /* Nothing of the company's register: no tabs, no search, no archive, no counts, no manager filter. */
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByText("Show archived")).toBeNull();
    expect(screen.queryByText("Counts")).toBeNull();
    expect(screen.queryByText("Drafted by managers")).toBeNull();
    expect(
      screen.getByText(/never a query once it has been issued/),
    ).toBeInTheDocument();
  });

  it("asks only for its drafts, and never asks the register", () => {
    draftsHook.mockReturnValue(page([]));
    render(<QueriesScreen />);
    expect(draftsHook).toHaveBeenCalledWith(true);
    /* The register hook is called by the screen's own rules of hooks but never enabled for them. */
    for (const call of registerHook.mock.calls) expect(call[1]).toBe(false);
  });

  it("has a clear empty state", () => {
    draftsHook.mockReturnValue(page([]));
    render(<QueriesScreen />);
    expect(screen.getByText("You have no drafts")).toBeInTheDocument();
  });

  it("reads the server's own sentence when it says they may not draft, and not a failure", () => {
    draftsHook.mockReturnValue({
      data: null,
      loading: false,
      error: new ApiError(
        403,
        "forbidden",
        "Managers cannot draft queries at your company. Ask HR to write it.",
      ),
      reload: vi.fn(),
      unavailable: false,
    });
    render(<QueriesScreen />);
    expect(
      screen.getByText("You cannot draft queries here"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Managers cannot draft queries at your company. Ask HR to write it.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/did not load/i)).toBeNull();
  });

  it("is told queries are off, not shown a list, while the company has them off", () => {
    switchState = { ...switchState, on: false };
    draftsHook.mockReturnValue(page([]));
    render(<QueriesScreen />);
    expect(
      screen.getByText("Queries are switched off for your company"),
    ).toBeInTheDocument();
    expect(screen.queryByText("You have no drafts")).toBeNull();
  });

  it("is not shown the register even when it also reads one for HR", () => {
    draftsHook.mockReturnValue(page([]));
    registerHook.mockReturnValue(
      page([summary({ id: "q-hr", subjectLine: "AN ISSUED LETTER" })]),
    );
    render(<QueriesScreen />);
    expect(screen.queryByText("AN ISSUED LETTER")).toBeNull();
  });
});

describe("HR", () => {
  it("is offered a filter for managers' drafts, and a badge on one, and the way to the counts", async () => {
    held = new Set(["ISSUE_QUERIES"]);
    registerHook.mockReturnValue(
      page([
        summary({
          id: "q-m",
          status: "DRAFT",
          reference: null,
          startedByManager: true,
        }),
      ]),
    );
    render(<QueriesScreen />);
    expect(screen.getByText("A manager's draft")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Counts" })).toHaveAttribute(
      "href",
      "/people/queries/counts",
    );
    await userEvent.click(screen.getByLabelText("Drafted by managers"));
    expect(registerHook).toHaveBeenLastCalledWith(
      expect.objectContaining({ startedByManager: true }),
      true,
    );
    expect(draftsHook).not.toHaveBeenCalled();
  });
});

const counts = (over: Partial<ApiQueryCounts> = {}): ApiQueryCounts => ({
  year: 2026,
  floor: 3,
  byStatus: [
    { key: "ISSUED", count: 5 },
    { key: "REPLIED", count: null },
    { key: "CLOSED", count: 4 },
    { key: "WITHDRAWN", count: null },
  ],
  byMonth: [
    { key: "2026-01", count: null },
    { key: "2026-02", count: 3 },
    { key: "2026-03", count: 6 },
  ],
  note: "A figure under 3 is never shown, and where one is withheld another is withheld with it, so it cannot be worked out by subtraction. There are no totals, and no breakdown by person, manager or department.",
  ...over,
});

const countsPage = (data: ApiQueryCounts | null) => ({
  data,
  loading: false,
  error: null,
  reload: vi.fn(),
  unavailable: false,
});

describe("the counts", () => {
  beforeEach(() => {
    held = new Set(["ISSUE_QUERIES"]);
    countsHook.mockReturnValue(countsPage(counts()));
  });

  it("read a withheld cell as Withheld and never as a nought, and a real figure as itself", () => {
    render(<CountsScreen />);
    const status = screen.getByRole("table", { name: "Where they stand now" });
    const rows = within(status).getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      "Issued, not yet replied to5",
      "RepliedWithheld",
      "Closed4",
      "WithdrawnWithheld",
    ]);
    const months = screen.getByRole("table", {
      name: "The month they were served",
    });
    expect(within(months).getAllByText("Withheld")).toHaveLength(1);
    expect(within(months).getByText("January 2026")).toBeInTheDocument();
    /* No cell anywhere reads 0 for a withheld figure. */
    expect(within(status).queryByText("0")).toBeNull();
    expect(within(months).queryByText("0")).toBeNull();
  });

  it("shows the server's sentence about the floor as it came", () => {
    render(<CountsScreen />);
    expect(
      screen.getByText(
        /A figure under 3 is never shown, and where one is withheld another is withheld with it/,
      ),
    ).toBeInTheDocument();
  });

  it("adds nothing up: no total row, no total column, no sum, no ranking, no chart", () => {
    const { container } = render(<CountsScreen />);
    const text = (container.textContent ?? "").toLowerCase();
    /* The server's own "There are no totals" is the plural and is allowed; the word itself is not.
       No word boundary in front: `textContent` joins cells with no space, so a "Total" drawn after
       a cell reads as "withheldtotal" and a `\b` would let it through. */
    expect(text).not.toMatch(/total(?!s\b)/);
    for (const table of screen.getAllByRole("table")) {
      expect(
        within(table).queryByRole("columnheader", { name: /total/i }),
      ).toBeNull();
      expect(
        within(table).queryByRole("rowheader", { name: /total/i }),
      ).toBeNull();
    }
    /* Seven cells published or withheld, drawn as seven cells, and not one more number: 5+4+3+6 = 18
       is not on the page. */
    expect(container.textContent).not.toMatch(/\b18\b/);
    expect(
      container.querySelector("svg[role=img], canvas, [class*=chart]"),
    ).toBeNull();
    expect(
      screen.queryByText(/rank|per manager|per person|by department/i),
    ).toBeNull();
  });

  it("says that a withheld cell is hidden on purpose and may be three or more, only when one is", () => {
    render(<CountsScreen />);
    expect(screen.getByText(/may be three or more/)).toBeInTheDocument();
    countsHook.mockReturnValue(
      countsPage(
        counts({
          byStatus: [{ key: "ISSUED", count: 5 }],
          byMonth: [{ key: "2026-02", count: 4 }],
        }),
      ),
    );
    document.body.innerHTML = "";
    render(<CountsScreen />);
    expect(screen.queryByText(/may be three or more/)).toBeNull();
  });

  it("offers a year and nothing else to cut by, and asks for the year chosen", async () => {
    render(<CountsScreen />);
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    await userEvent.selectOptions(screen.getByLabelText("Year"), "2025");
    expect(countsHook).toHaveBeenLastCalledWith(2025, true);
  });

  it("is for the people who work queries, and says so to anybody else without asking", () => {
    held = new Set();
    render(<CountsScreen />);
    expect(screen.getByText("You cannot open the counts")).toBeInTheDocument();
    expect(countsHook).toHaveBeenCalledWith(undefined, false);
  });

  it("is told queries are off, and shows no figure", () => {
    switchState = { ...switchState, on: false };
    render(<CountsScreen />);
    expect(
      screen.getByText("Queries are switched off for your company"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("draws nothing for a server that sent no note but never invents a floor", () => {
    countsHook.mockReturnValue(countsPage(counts({ note: null, floor: null })));
    render(<CountsScreen />);
    expect(
      screen.getByText(/A small figure is never shown/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/under 3/)).toBeNull();
  });
});
