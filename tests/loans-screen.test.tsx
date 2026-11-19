import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import type {
  ApiLoan,
  ApiLoanSummary,
  LoanListParams,
  LoanStatus,
} from "@/lib/api/loans";

/**
 * The staff loans list: one row for each person, searchable.
 *
 * The screen was one row for each loan with no search, so somebody with two
 * loans appeared twice and finding a person meant reading the table. These
 * render it with the stores replaced by a book the test controls, and press
 * what a person would.
 *
 * `useLoans` is replaced, so what is tested is the screen's own choices: how it
 * groups, what it prints, what it filters, and what it asks the store for.
 */

const N = (naira: number): number => Math.round(naira * 100);

const world = vi.hoisted(() => ({
  seeEverybody: true,
  canDecide: true,
  loans: [] as unknown[],
  /** What the server says the whole book is, when it is more than was sent. */
  total: null as number | null,
  summary: null as unknown,
  asked: [] as unknown[],
}));

vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({
    employeeId: "me",
    isConnected: true,
    organization: { timezone: "Africa/Lagos" },
  }),
  useOrgTimezone: () => "Africa/Lagos",
}));

vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  usePermissions: () => ({
    loading: false,
    can: (permission: string) =>
      permission === "VIEW_SALARIES"
        ? world.seeEverybody
        : permission === "APPROVE_LOANS"
          ? world.canDecide
          : false,
  }),
}));

vi.mock("@/lib/store/loans", async (original) => ({
  ...(await original<typeof import("@/lib/store/loans")>()),
  useLoanActions: () => ({ approve: vi.fn() }),
  useLoanSummary: () => ({
    summary: world.summary,
    loading: false,
    error: null,
  }),
  useLoans: (params: LoanListParams & { scope?: string }) => {
    world.asked.push(params);
    const rows = (world.loans as ApiLoan[]).filter(
      (loan) => !params.status || loan.status === params.status,
    );
    return {
      loans: rows,
      total: world.total ?? rows.length,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 25,
      totalPages: 1,
      loading: false,
      error: null,
      live: true,
      reload: vi.fn(),
    };
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/payroll/loans",
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

const { LoansScreen } = await import("@/app/(app)/payroll/loans/loans-screen");

let count = 0;

const loan = (over: Partial<ApiLoan> = {}): ApiLoan => {
  count += 1;
  return {
    id: `loan-${count}`,
    employeeId: "e-ime",
    employeeName: "Ime Dennis",
    employeeNo: "CRF-0042",
    jobTitle: "Site engineer",
    principalKobo: N(600_000),
    interestRate: 0,
    interestKobo: 0,
    totalRepayableKobo: N(600_000),
    termMonths: 6,
    monthlyRepaymentKobo: N(100_000),
    outstandingKobo: N(400_000),
    status: "ACTIVE",
    reason: null,
    startPeriod: "2026-07-01",
    decidedById: null,
    decidedByName: null,
    decidedAt: null,
    declinedReason: null,
    completedAt: null,
    createdAt: "2026-06-01T10:00:00.000Z",
    ...over,
  };
};

/** Ime has two (one repaid, one being repaid); Joseph, Kelechi one each. */
const crafwell = (): ApiLoan[] => [
  loan({
    id: "ime-new",
    reason: "Laptop for evening classes",
    createdAt: "2026-06-22T09:00:00.000Z",
    principalKobo: N(240_000),
    monthlyRepaymentKobo: N(40_000),
    outstandingKobo: N(200_000),
    startPeriod: "2026-07-01",
  }),
  loan({
    id: "ime-old",
    reason: "Generator repair",
    status: "SETTLED" as LoanStatus,
    createdAt: "2026-01-18T09:00:00.000Z",
    principalKobo: N(180_000),
    monthlyRepaymentKobo: N(60_000),
    outstandingKobo: 0,
    startPeriod: "2026-02-01",
    termMonths: 3,
  }),
  loan({
    id: "joseph-1",
    employeeId: "e-joseph",
    employeeName: "Joseph Ogbonna",
    employeeNo: "CRF-0107",
    jobTitle: "Foreman",
    principalKobo: N(900_000),
    monthlyRepaymentKobo: N(150_000),
    outstandingKobo: N(750_000),
    createdAt: "2026-05-02T09:00:00.000Z",
    startPeriod: "2026-06-01",
  }),
  loan({
    id: "kelechi-1",
    employeeId: "e-kelechi",
    employeeName: "Kelechi Uzor",
    employeeNo: "CRF-0211",
    jobTitle: "Surveyor",
    status: "PENDING",
    principalKobo: N(250_000),
    monthlyRepaymentKobo: N(50_000),
    outstandingKobo: N(250_000),
    startPeriod: null,
    createdAt: "2026-08-14T14:00:00.000Z",
  }),
];

const summary = (over: Partial<ApiLoanSummary> = {}): ApiLoanSummary => ({
  period: "2026-11",
  outstandingKobo: N(3_125_000),
  activeCount: 19,
  pendingCount: 1,
  thisMonth: {
    deductionKobo: N(622_857.12),
    instalmentCount: 15,
    arrearsKobo: 0,
  },
  ...over,
});

function show() {
  return render(
    <ToastProvider>
      <LoansScreen />
    </ToastProvider>,
  );
}

/** The desktop table. The phone list is in the DOM too, with the same text. */
const table = () => screen.getByRole("table");

const rowFor = (name: string) =>
  within(table())
    .getAllByRole("row")
    .find((row) => within(row).queryByText(name) !== null)!;

beforeEach(() => {
  count = 0;
  world.seeEverybody = true;
  world.canDecide = true;
  world.loans = crafwell();
  world.total = null;
  world.summary = summary();
  world.asked = [];
});

describe("one row for each person", () => {
  it("shows a person with two loans once", () => {
    show();

    /* Header, then Ime, Joseph and Kelechi. Ime's two loans are not rows yet. */
    expect(within(table()).getAllByRole("row")).toHaveLength(4);
    expect(within(table()).getAllByText("Ime Dennis")).toHaveLength(1);
  });

  it("lists waiting first, then the biggest balance", () => {
    show();

    const names = within(table())
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("rowheader")[0]!.textContent);

    expect(names[0]).toContain("Kelechi Uzor");
    expect(names[1]).toContain("Joseph Ogbonna");
    expect(names[2]).toContain("Ime Dennis");
  });

  it("links a person with one loan straight to it", () => {
    show();

    expect(
      within(rowFor("Joseph Ogbonna")).getByRole("link", {
        name: "Joseph Ogbonna",
      }),
    ).toHaveAttribute("href", "/payroll/loans/joseph-1");
  });

  it("prints that one loan's own figures, in full with kobo", () => {
    show();

    const joseph = within(rowFor("Joseph Ogbonna"));
    expect(joseph.getByText("₦900,000.00")).toBeInTheDocument();
    expect(joseph.getByText("₦750,000.00")).toBeInTheDocument();
    expect(joseph.getByText("₦150,000.00")).toBeInTheDocument();
    /* June 2026, six months: the last deduction is November's. */
    expect(joseph.getByText("November 2026")).toBeInTheDocument();
    expect(joseph.getByText("Being repaid")).toBeInTheDocument();
  });

  it("shows a waiting request's ask and says when it will finish once approved", () => {
    show();

    const kelechi = within(rowFor("Kelechi Uzor"));
    expect(kelechi.getByText("₦250,000.00")).toBeInTheDocument();
    expect(kelechi.getByText("Once approved")).toBeInTheDocument();
    expect(kelechi.getByText("Waiting")).toBeInTheDocument();
  });

  it("adds a person's loans together, and says there are two", () => {
    show();

    const ime = within(rowFor("Ime Dennis"));
    /* 240,000 + 180,000 lent; only the live one is left to pay and deducted. */
    expect(ime.getByText("₦420,000.00")).toBeInTheDocument();
    expect(ime.getByText("₦200,000.00")).toBeInTheDocument();
    expect(ime.getByText("₦40,000.00")).toBeInTheDocument();
    expect(ime.getByText("December 2026")).toBeInTheDocument();
    expect(ime.getByText("Being repaid")).toBeInTheDocument();
    expect(ime.getByText("+1")).toBeInTheDocument();
    expect(
      ime.getByRole("button", { name: "Show Ime Dennis’s 2 loans" }),
    ).toHaveTextContent("2 loans");
  });

  it("does not make the person a link when there is more than one loan to go to", () => {
    show();

    expect(within(rowFor("Ime Dennis")).queryByRole("link")).toBeNull();
  });

  it("prints a dash, not zero, where a person has nothing being repaid", () => {
    world.loans = [
      loan({
        employeeId: "e-x",
        employeeName: "Solomon Augustine",
        employeeNo: "CRF-0300",
        status: "SETTLED",
        outstandingKobo: 0,
        createdAt: "2026-02-01T00:00:00.000Z",
      }),
      loan({
        employeeId: "e-x",
        employeeName: "Solomon Augustine",
        employeeNo: "CRF-0300",
        status: "DECLINED",
        startPeriod: null,
        createdAt: "2026-04-01T00:00:00.000Z",
      }),
    ];
    show();

    const row = within(rowFor("Solomon Augustine"));
    expect(row.getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(row.queryByText("₦0.00")).toBeNull();
  });
});

describe("opening a person's loans", () => {
  it("opens one row for each loan, each with a link, and closes them again", () => {
    show();

    const button = within(rowFor("Ime Dennis")).getByRole("button", {
      name: "Show Ime Dennis’s 2 loans",
    });
    expect(button).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button).toHaveAccessibleName("Hide Ime Dennis’s 2 loans");
    expect(within(table()).getAllByRole("row")).toHaveLength(6);

    const newer = within(table()).getByRole("link", {
      name: "Laptop for evening classes",
    });
    expect(newer).toHaveAttribute("href", "/payroll/loans/ime-new");
    const older = within(table()).getByRole("link", {
      name: "Generator repair",
    });
    expect(older).toHaveAttribute("href", "/payroll/loans/ime-old");

    fireEvent.click(button);

    expect(within(table()).getAllByRole("row")).toHaveLength(4);
  });

  it("gives each loan its own figures and status", () => {
    show();
    fireEvent.click(
      within(rowFor("Ime Dennis")).getByRole("button", {
        name: "Show Ime Dennis’s 2 loans",
      }),
    );

    const live = within(rowFor("Laptop for evening classes"));
    expect(live.getByText("₦240,000.00")).toBeInTheDocument();
    expect(live.getByText("₦200,000.00")).toBeInTheDocument();
    expect(live.getByText("Being repaid")).toBeInTheDocument();

    /* A repaid loan takes nothing a month, whatever it once did. */
    const done = within(rowFor("Generator repair"));
    expect(done.getByText("₦180,000.00")).toBeInTheDocument();
    expect(done.getByText("Fully repaid")).toBeInTheDocument();
    expect(done.queryByText("₦60,000.00")).toBeNull();
  });

  it("opens from a click on the row too", () => {
    show();

    fireEvent.click(within(rowFor("Ime Dennis")).getByText(/Site engineer/));

    expect(within(table()).getAllByRole("row")).toHaveLength(6);
  });

  it("keeps a loan's Approve and Decline on its own row", () => {
    world.loans = [
      ...crafwell(),
      loan({
        id: "ime-ask",
        status: "PENDING",
        reason: "School fees",
        createdAt: "2026-08-20T09:00:00.000Z",
        startPeriod: null,
      }),
    ];
    show();

    fireEvent.click(
      within(rowFor("Ime Dennis")).getByRole("button", {
        name: "Show Ime Dennis’s 3 loans",
      }),
    );

    const ask = within(rowFor("School fees"));
    expect(ask.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(ask.getByRole("button", { name: "Decline" })).toBeInTheDocument();
    expect(
      within(rowFor("Generator repair")).queryByRole("button", {
        name: "Approve",
      }),
    ).toBeNull();
  });

  it("offers Approve and Decline on a single waiting loan's row", () => {
    show();

    const kelechi = within(rowFor("Kelechi Uzor"));
    expect(
      kelechi.getByRole("button", { name: "Approve" }),
    ).toBeInTheDocument();
    expect(
      kelechi.getByRole("button", { name: "Decline" }),
    ).toBeInTheDocument();
  });

  it("offers nothing to somebody who cannot decide", () => {
    world.canDecide = false;
    show();

    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });
});

describe("search", () => {
  const search = () =>
    screen.getByRole("textbox", {
      name: "Search staff loans by name or staff number",
    });

  it("has a box with its placeholder, and says how many people and loans", () => {
    show();

    expect(search()).toHaveAttribute(
      "placeholder",
      "Search by name or staff number",
    );
    expect(screen.getByText(/people ·/)).toHaveTextContent(
      "3 people · 4 loans",
    );
  });

  it("narrows to the people whose name matches, case aside", () => {
    show();

    fireEvent.change(search(), { target: { value: "IME" } });

    expect(within(table()).getAllByRole("row")).toHaveLength(2);
    expect(within(table()).getByText("Ime Dennis")).toBeInTheDocument();
    expect(within(table()).queryByText("Joseph Ogbonna")).toBeNull();
  });

  it("says how many matched", () => {
    show();

    fireEvent.change(search(), { target: { value: "ime" } });

    expect(screen.getByText(/person ·/)).toHaveTextContent(
      "1 person · 2 loans match",
    );
  });

  it("narrows by staff number", () => {
    show();

    fireEvent.change(search(), { target: { value: "crf-0107" } });

    expect(within(table()).getAllByRole("row")).toHaveLength(2);
    expect(within(table()).getByText("Joseph Ogbonna")).toBeInTheDocument();
  });

  it("needs every word", () => {
    show();

    fireEvent.change(search(), { target: { value: "dennis ime" } });
    expect(within(table()).getByText("Ime Dennis")).toBeInTheDocument();

    fireEvent.change(search(), { target: { value: "ime ogbonna" } });
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("does not drop a person's other loans when their name matches", () => {
    show();

    fireEvent.change(search(), { target: { value: "ime" } });
    fireEvent.click(
      within(rowFor("Ime Dennis")).getByRole("button", {
        name: "Show Ime Dennis’s 2 loans",
      }),
    );

    expect(
      within(table()).getByRole("link", { name: "Laptop for evening classes" }),
    ).toBeInTheDocument();
    expect(
      within(table()).getByRole("link", { name: "Generator repair" }),
    ).toBeInTheDocument();
  });

  it("says so, and offers to clear it, when nobody matches", () => {
    show();

    fireEvent.change(search(), { target: { value: "zzz" } });

    expect(screen.getByText("Nobody matches that")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(search()).toHaveValue("");
    expect(within(table()).getAllByRole("row")).toHaveLength(4);
  });

  it("does not open anybody on its own", () => {
    show();

    fireEvent.change(search(), { target: { value: "ime" } });

    expect(
      within(rowFor("Ime Dennis")).getByRole("button", {
        name: "Show Ime Dennis’s 2 loans",
      }),
    ).toHaveAttribute("aria-expanded", "false");
  });
});

describe("asking for the book", () => {
  const lastAsked = () =>
    world.asked[world.asked.length - 1] as LoanListParams & { scope: string };

  it("asks for the whole book at the API's page size", () => {
    show();

    expect(lastAsked()).toMatchObject({
      scope: "all",
      pageSize: 200,
      page: 1,
    });
  });

  it("does not send the search when the whole book is in hand", async () => {
    show();
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Search staff loans by name or staff number",
      }),
      { target: { value: "ime" } },
    );

    /* Past the pause a send would have waited for. */
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(world.asked.some((asked) => "q" in (asked as object))).toBe(false);
  });

  it("sends the search as well when the book is bigger than one request", async () => {
    world.total = 450;
    show();
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Search staff loans by name or staff number",
      }),
      { target: { value: "  ime  " } },
    );

    await waitFor(() => expect(lastAsked().q).toBe("ime"));
    /* Still filtered in the browser too, in case the server ignores it. */
    expect(within(table()).queryByText("Joseph Ogbonna")).toBeNull();
  });

  it("holds the previous rows while a search is asked for", () => {
    show();

    expect(lastAsked()).toMatchObject({ keepPrevious: true });
  });
});

describe("a book bigger than one request", () => {
  it("says it is showing the first of them, and how many there are", () => {
    world.total = 450;
    show();

    expect(
      screen.getByText(
        "Showing the first 4 of 450 loans. Search to narrow it.",
      ),
    ).toBeInTheDocument();
    /* The way to the rest, until the server searches. */
    expect(screen.getByText("1–200 of 450 loans")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Next/ })).toBeInTheDocument();
  });

  it("says it is searching only those, once something is typed", () => {
    world.total = 450;
    show();

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Search staff loans by name or staff number",
      }),
      { target: { value: "ime" } },
    );

    expect(
      screen.getByText("Searching the first 4 of 450 loans."),
    ).toBeInTheDocument();
  });

  it("says nothing when the whole book is shown", () => {
    show();

    expect(screen.queryByText(/Showing the first/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Next/ })).toBeNull();
  });
});

describe("the one line under the title", () => {
  it("says what is owed and what comes out of this month's payroll", () => {
    show();

    const line = screen.getByText(/still owed across/);
    expect(line).toHaveTextContent(
      "₦3,125,000.00 still owed across 19 loans · ₦622,857.12 comes out of this month’s payroll",
    );
  });

  it("says what was carried from a short month, when something was", () => {
    world.summary = summary({
      thisMonth: {
        deductionKobo: N(622_857.12),
        instalmentCount: 15,
        arrearsKobo: N(21_428.57),
      },
    });
    show();

    expect(screen.getByText(/still owed across/)).toHaveTextContent(
      "comes out of this month’s payroll, including ₦21,428.57 carried from a short month",
    );
  });

  it("is a line, not three cards, and does not repeat the Waiting count", () => {
    show();

    expect(screen.queryByText("Waiting for a decision")).toBeNull();
    expect(screen.queryByText("Still owed to the company")).toBeNull();
    expect(screen.queryByText("Coming out of this month's payroll")).toBeNull();
  });

  it("says one loan, not one loans", () => {
    world.summary = summary({ activeCount: 1 });
    show();

    expect(screen.getByText(/still owed across/)).toHaveTextContent(
      "across 1 loan ·",
    );
  });

  it("says so when nothing is being repaid, rather than printing zeros", () => {
    world.summary = summary({ activeCount: 0, outstandingKobo: 0 });
    show();

    expect(
      screen.getByText("No loan is being repaid right now."),
    ).toBeVisible();
  });
});

describe("the empty tab", () => {
  it("shows everything again, and clears the search, from the button", () => {
    show();
    const search = screen.getByRole("textbox", {
      name: "Search staff loans by name or staff number",
    });
    fireEvent.change(search, { target: { value: "ime" } });

    /* Nobody has a declined loan in this book. */
    fireEvent.click(screen.getByRole("tab", { name: "Declined" }));
    expect(screen.getByText("No loans declined")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show all loans" }));

    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(search).toHaveValue("");
    expect(within(table()).getAllByRole("row")).toHaveLength(4);
  });
});

describe("somebody who cannot see the book", () => {
  beforeEach(() => {
    world.seeEverybody = false;
    world.canDecide = false;
    world.loans = [
      loan({
        id: "mine-1",
        employeeId: "me",
        employeeName: "Me Myself",
        reason: "Rent deposit",
      }),
      loan({
        id: "mine-2",
        employeeId: "me",
        employeeName: "Me Myself",
        reason: "Generator repair",
        status: "SETTLED",
        outstandingKobo: 0,
        createdAt: "2026-01-18T09:00:00.000Z",
      }),
    ];
  });

  it("sees their own loans as they always did: what for, one row each", () => {
    show();

    expect(
      screen.getByRole("columnheader", { name: "What for" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Who" })).toBeNull();
    expect(within(table()).getAllByRole("row")).toHaveLength(3);
    expect(
      within(table()).getByRole("link", { name: "Rent deposit" }),
    ).toHaveAttribute("href", "/payroll/loans/mine-1");
    expect(
      within(table()).getByRole("link", { name: "Generator repair" }),
    ).toHaveAttribute("href", "/payroll/loans/mine-2");
  });

  it("has no search, no grouping and no summary line", () => {
    show();

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /loans$/ })).toBeNull();
    expect(screen.queryByText(/still owed across/)).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("asks for their own, a page at a time, and never sends a search", () => {
    show();

    const asked = world.asked[world.asked.length - 1] as LoanListParams & {
      scope: string;
    };
    expect(asked).toMatchObject({ scope: "mine", pageSize: 25 });
    expect(asked.q).toBeUndefined();
  });
});
