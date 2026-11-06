import { readFileSync } from "node:fs";
import path from "node:path";
import {
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type {
  ApiDeliveryCounts,
  ApiDeliveryMeta,
  ApiDeliveryRow,
} from "@/lib/api/delivery-report";

/**
 * The weekly delivery report screen.
 *
 * The rules to hold are the house ones: logged and graded are kept apart, a
 * week nobody has graded has no rate and says so (never 0%), people are listed
 * by name in the order the API sends and never ranked, the team is drawn only
 * when the API sent a scope, an empty week is an empty state and not an error,
 * and a failure is the shared failure card.
 *
 * Answers are shaped from the merged backend (`modules/delivery-report`).
 */

const api = vi.hoisted(() => ({ report: vi.fn() }));
vi.mock("@/lib/api/delivery-report", async (original) => ({
  ...(await original<typeof import("@/lib/api/delivery-report")>()),
  deliveryReportApi: api,
}));

let connected = true;
vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({ isConnected: connected, employeeId: "e-me" }),
  useOrgTimezone: () => "Africa/Lagos",
}));

/* A Wednesday. Its Monday is 2 November 2026. */
vi.mock("@/lib/use-today", () => ({ useToday: () => "2026-11-04" }));

import { DeliveryScreen } from "@/app/(app)/wellness/delivery-screen";
import { useDeliveryReport } from "@/lib/store/delivery-report";
import { weekLabel } from "@/lib/wellness/format";

const THIS_WEEK = "2026-11-02";

const counts = (over: Partial<ApiDeliveryCounts> = {}): ApiDeliveryCounts => ({
  logged: 0,
  completed: 0,
  partial: 0,
  notCompleted: 0,
  rejected: 0,
  ungraded: 0,
  rate: null,
  ...over,
});

const row = (
  name: string,
  over: Partial<ApiDeliveryCounts> = {},
): ApiDeliveryRow => ({
  employeeId: `e-${name.toLowerCase().replace(/\W+/g, "-")}`,
  name,
  ...counts(over),
});

const answer = (
  rows: ApiDeliveryRow[],
  meta: Partial<ApiDeliveryMeta> = {},
  page: { page?: number; total?: number } = {},
) => ({
  data: rows,
  meta: {
    page: page.page ?? 1,
    pageSize: 25,
    total: page.total ?? rows.length,
    totalPages: Math.max(1, Math.ceil((page.total ?? rows.length) / 25)),
    hasMore: false,
    week: { start: THIS_WEEK, end: "2026-11-08", closed: false },
    me: counts(),
    scope: null,
    summary: null,
    silent: null,
    ...meta,
  } satisfies ApiDeliveryMeta & Record<string, unknown>,
});

/** Bola: 2 done, 1 partly, 1 rejected: 2.5 of 4 is 63. The backend's own example. */
const BOLA = counts({
  logged: 4,
  completed: 2,
  partial: 1,
  rejected: 1,
  rate: 63,
});

beforeEach(() => {
  vi.resetAllMocks();
  connected = true;
  api.report.mockResolvedValue(answer([], { me: BOLA }));
});

describe("asking", () => {
  it("asks for this week's Monday, the first page, and says which week it is", async () => {
    render(<DeliveryScreen />);
    await screen.findByText("Your week");

    expect(api.report).toHaveBeenCalledWith(
      { weekStart: THIS_WEEK, page: 1, pageSize: 25 },
      expect.anything(),
    );
    expect(screen.getByText("2 Nov to 8 Nov 2026")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
  });

  it("asks nothing while there is no API", async () => {
    connected = false;
    const { result } = renderHook(() => useDeliveryReport(THIS_WEEK, 1));
    expect(result.current.data).toBeNull();
    expect(api.report).not.toHaveBeenCalled();
  });
});

describe("your week", () => {
  it("keeps what was logged apart from what was graded, and says what is waiting", async () => {
    api.report.mockResolvedValue(
      answer([], { me: counts({ ...BOLA, logged: 5, ungraded: 1 }) }),
    );
    render(<DeliveryScreen />);
    await screen.findByText("Your week");

    const logged = screen
      .getByText("Logged")
      .closest(".rounded-lg") as HTMLElement;
    expect(within(logged).getByText("5")).toBeInTheDocument();
    expect(
      within(logged).getByText("1 waiting for review"),
    ).toBeInTheDocument();
    const graded = screen
      .getByText("Graded")
      .closest(".rounded-lg") as HTMLElement;
    expect(within(graded).getByText("4")).toBeInTheDocument();
    const rate = screen
      .getByText("Delivery rate")
      .closest(".rounded-lg") as HTMLElement;
    expect(within(rate).getByText("63%")).toBeInTheDocument();
    expect(
      within(rate).getByText(/Over the 4 graded\. Done counts as one/),
    ).toBeInTheDocument();
  });

  it("lists the four outcomes in the grades' own words, once something is graded", async () => {
    render(<DeliveryScreen />);
    await screen.findByText("Your week");

    const outcomes = screen.getByRole("list", {
      name: "How the graded tasks came out",
    });
    expect(
      within(outcomes)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Done 2", "Partly done 1", "Not done 0", "Rejected 1"]);
  });

  it("says nothing graded yet, never 0%, and shows no row of noughts", async () => {
    api.report.mockResolvedValue(
      answer([], { me: counts({ logged: 3, ungraded: 3 }) }),
    );
    render(<DeliveryScreen />);
    await screen.findByText("Your week");

    expect(screen.getByText("Nothing graded yet")).toBeInTheDocument();
    expect(screen.queryByText(/0%/)).toBeNull();
    expect(
      screen.queryByRole("list", { name: "How the graded tasks came out" }),
    ).toBeNull();
    expect(screen.getByText("3 waiting for review")).toBeInTheDocument();
  });

  it("prints a real 0% when something was graded and not done", async () => {
    api.report.mockResolvedValue(
      answer([], { me: counts({ logged: 1, notCompleted: 1, rate: 0 }) }),
    );
    render(<DeliveryScreen />);
    await screen.findByText("Your week");

    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.queryByText("Nothing graded yet")).toBeNull();
  });

  it("is an empty state, not an error, for a week with nothing logged", async () => {
    api.report.mockResolvedValue(answer([], { me: counts() }));
    render(<DeliveryScreen />);

    expect(
      await screen.findByText("Nothing logged this week"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/did not load/)).toBeNull();
    expect(screen.queryByText("Delivery rate")).toBeNull();
  });

  it("says why there is no week for a sign-in with no staff record", async () => {
    api.report.mockResolvedValue(answer([], { me: null }));
    render(<DeliveryScreen />);

    expect(
      await screen.findByText("No week of your own to show"),
    ).toBeInTheDocument();
  });
});

describe("the team", () => {
  const team = [
    row("Aisha Bello", { logged: 2, ungraded: 2 }),
    row("Bola Eze", BOLA),
    row("Chidi Obi", { logged: 2, completed: 2, rate: 100 }),
  ];
  const summary = { people: 3, logged: 8, graded: 6, rate: 83 };

  it("is not drawn for somebody the API sent no scope for, and shows no other person", async () => {
    api.report.mockResolvedValue(answer([], { me: BOLA, scope: null }));
    render(<DeliveryScreen />);
    await screen.findByText("Your week");

    expect(screen.queryByText("Your team")).toBeNull();
    expect(screen.queryByText("Everyone")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("is not drawn from a row alone: the scope is what the API went by", async () => {
    api.report.mockResolvedValue(answer(team, { me: BOLA, scope: null }));
    render(<DeliveryScreen />);
    await screen.findByText("Your week");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("Aisha Bello")).toBeNull();
  });

  it("lists people by name in the order the API sent, with no way to sort by rate", async () => {
    /* Sent by name. The rates are 0, 63 and 100: a screen that sorted by rate
       would reorder these, and one that ranked would put Chidi first. */
    api.report.mockResolvedValue(
      answer(team, { me: BOLA, scope: "REPORTS", summary, silent: 1 }),
    );
    render(<DeliveryScreen />);
    await screen.findByText("Your team");

    const table = screen.getByRole("table");
    const names = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((r) => within(r).getAllByRole("cell")[0]?.textContent);
    expect(names).toEqual(["Aisha Bello", "Bola Eze", "Chidi Obi"]);
    /* Headers are text, not controls that sort. */
    expect(within(table).queryAllByRole("button")).toHaveLength(0);
    for (const header of within(table).getAllByRole("columnheader")) {
      expect(header).not.toHaveAttribute("aria-sort");
    }
  });

  it("shows each person's logged and graded apart, and an absence where nothing is graded", async () => {
    api.report.mockResolvedValue(
      answer(team, { me: BOLA, scope: "REPORTS", summary, silent: 0 }),
    );
    render(<DeliveryScreen />);
    await screen.findByText("Your team");

    const table = screen.getByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual([
      "Person",
      "Logged",
      "Done",
      "Partly done",
      "Not done",
      "Rejected",
      "Not graded yet",
      "Delivery rate",
    ]);
    const aisha = within(table)
      .getByText("Aisha Bello")
      .closest("tr") as HTMLElement;
    /* Two logged, both waiting: no outcomes to count and no rate, and not 0%. */
    expect(
      within(aisha).getAllByText("Nothing graded yet").length,
    ).toBeGreaterThan(0);
    expect(within(aisha).queryByText("0%")).toBeNull();
    const cells = within(aisha)
      .getAllByRole("cell")
      .map((c) => c.textContent);
    expect(cells[1]).toBe("2");
    expect(cells[6]).toBe("2");

    const bola = within(table)
      .getByText("Bola Eze")
      .closest("tr") as HTMLElement;
    expect(
      within(bola)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["Bola Eze", "4", "2", "1", "0", "1", "0", "63%"]);
  });

  it("has the summary, the waiting count and a way to the queue, and says how many logged nothing", async () => {
    api.report.mockResolvedValue(
      answer(team, { me: BOLA, scope: "REPORTS", summary, silent: 2 }),
    );
    render(<DeliveryScreen />);
    await screen.findByText("Your team");

    expect(screen.getByText("People who logged")).toBeInTheDocument();
    expect(screen.getByText("Tasks graded")).toBeInTheDocument();
    expect(screen.getByText("83%")).toBeInTheDocument();
    expect(
      screen.getByText("2 tasks are waiting to be graded."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review tasks" })).toHaveAttribute(
      "href",
      "/performance/review-tasks",
    );
    expect(
      screen.getByText("2 other people logged nothing this week."),
    ).toBeInTheDocument();
  });

  it("says everyone, for HR", async () => {
    api.report.mockResolvedValue(
      answer(team, { me: BOLA, scope: "ALL", summary, silent: 10 }),
    );
    render(<DeliveryScreen />);
    expect(await screen.findByText("Everyone")).toBeInTheDocument();
    expect(screen.queryByText("Your team")).toBeNull();
  });

  it("says nobody logged, and how many have not, instead of an empty table", async () => {
    api.report.mockResolvedValue(
      answer([], {
        me: BOLA,
        scope: "REPORTS",
        summary: { people: 0, logged: 0, graded: 0, rate: null },
        silent: 3,
      }),
    );
    render(<DeliveryScreen />);

    expect(
      await screen.findByText("Nobody logged tasks this week"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("3 people have not logged any yet."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText(/did not load/)).toBeNull();
  });

  it("draws the same people as cards for a phone, with the same numbers", async () => {
    api.report.mockResolvedValue(
      answer(team, { me: BOLA, scope: "REPORTS", summary, silent: 0 }),
    );
    render(<DeliveryScreen />);
    await screen.findByText("Your team");

    /* Once in the table and once as a card; CSS shows one of them. */
    expect(screen.getAllByText("Bola Eze")).toHaveLength(2);
    const card = screen
      .getAllByText("Bola Eze")
      .map((el) => el.closest("li"))
      .find(Boolean) as HTMLElement;
    expect(within(card).getByText("Not graded yet")).toBeInTheDocument();
    expect(within(card).getByText("63%")).toBeInTheDocument();
  });

  it("turns the page with the API's own page, and keeps what was on screen while it comes", async () => {
    const first = Array.from({ length: 25 }, (_, i) =>
      row(`Person ${String(i).padStart(2, "0")}`, { logged: 1, ungraded: 1 }),
    );
    api.report.mockResolvedValueOnce(
      answer(
        first,
        { scope: "ALL", summary: { ...summary, people: 40 } },
        { total: 40 },
      ),
    );
    render(<DeliveryScreen />);
    await screen.findByText("Everyone");
    expect(screen.getByText("1–25 of 40 people")).toBeInTheDocument();

    let release!: () => void;
    api.report.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve(
              answer(
                [row("Zed Last", { logged: 1, ungraded: 1 })],
                { scope: "ALL", summary },
                { page: 2, total: 40 },
              ),
            );
        }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(api.report).toHaveBeenLastCalledWith(
      { weekStart: THIS_WEEK, page: 2, pageSize: 25 },
      expect.anything(),
    );
    /* Still the first page, dimmed, until the second arrives. */
    expect(screen.getAllByText("Person 00").length).toBeGreaterThan(0);
    expect(screen.getByRole("table").closest("[aria-busy]")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    release();
    expect((await screen.findAllByText("Zed Last")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Person 00")).toBeNull();
  });
});

describe("the week", () => {
  it("steps back by seven days, starts again at page one, and offers the way home", async () => {
    render(<DeliveryScreen />);
    await screen.findByText("Your week");
    expect(screen.queryByRole("button", { name: "This week" })).toBeNull();
    expect(screen.getByRole("button", { name: "Next week" })).toBeDisabled();

    api.report.mockResolvedValue(
      answer([], {
        me: BOLA,
        week: { start: "2026-10-26", end: "2026-11-01", closed: true },
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Previous week" }),
    );

    await waitFor(() =>
      expect(api.report).toHaveBeenLastCalledWith(
        { weekStart: "2026-10-26", page: 1, pageSize: 25 },
        expect.anything(),
      ),
    );
    expect(await screen.findByText("26 Oct to 1 Nov 2026")).toBeInTheDocument();
    expect(await screen.findByText("Ended")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next week" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "This week" }));
    await waitFor(() =>
      expect(api.report).toHaveBeenLastCalledWith(
        { weekStart: THIS_WEEK, page: 1, pageSize: 25 },
        expect.anything(),
      ),
    );
    expect(screen.queryByRole("button", { name: "This week" })).toBeNull();
  });

  it("does not show last week's figures under this week's heading while it loads", async () => {
    render(<DeliveryScreen />);
    await screen.findByText("63%");

    api.report.mockImplementation(() => new Promise(() => {}));
    await userEvent.click(
      screen.getByRole("button", { name: "Previous week" }),
    );

    expect(screen.getByText("26 Oct to 1 Nov 2026")).toBeInTheDocument();
    expect(screen.queryByText("63%")).toBeNull();
    expect(screen.queryByText("Your week")).toBeNull();
  });

  it("says the year once, and on both ends when the week straddles New Year", () => {
    expect(weekLabel("2026-11-02", "2026-11-08")).toBe("2 Nov to 8 Nov 2026");
    expect(weekLabel("2025-12-29", "2026-01-04")).toBe(
      "29 Dec 2025 to 4 Jan 2026",
    );
  });
});

describe("when it does not load", () => {
  it("says so with the shared failure card, offers a retry, and does not say the week was empty", async () => {
    api.report.mockRejectedValue(new ApiError(500, "internal", "Broke."));
    render(<DeliveryScreen />);

    expect(
      await screen.findByText("The weekly delivery report did not load"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Nothing logged this week")).toBeNull();
    expect(screen.queryByText("Your week")).toBeNull();

    api.report.mockResolvedValue(answer([], { me: BOLA }));
    await userEvent.click(
      screen.getByRole("button", { name: /Try again|Retry/ }),
    );
    expect(await screen.findByText("Your week")).toBeInTheDocument();
  });
});

describe("the source", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const read = (file: string) => readFileSync(path.join(root, file), "utf8");
  const code = (file: string) =>
    read(file)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("never sorts or ranks, and has no sortable column", () => {
    const screenCode = code("src/app/(app)/wellness/delivery-screen.tsx");
    expect(screenCode).not.toMatch(
      /\.sort\(|\.toSorted\(|SortableTH|aria-sort/,
    );
    const adapter = code("src/lib/api/delivery-report.ts");
    expect(adapter).not.toMatch(/\bsort\b|\border\b/);
  });

  it("keeps nothing in the browser", () => {
    for (const file of [
      "src/app/(app)/wellness/delivery-screen.tsx",
      "src/lib/store/delivery-report.ts",
      "src/lib/api/delivery-report.ts",
    ]) {
      expect(code(file), file).not.toMatch(
        /localStorage|sessionStorage|indexedDB|createSharedResource/,
      );
    }
  });
});
