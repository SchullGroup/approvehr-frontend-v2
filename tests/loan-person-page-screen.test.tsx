import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ApiError } from "@/lib/api/client";
import type { ApiLoan, ApiLoanDetail, ApiRepayment } from "@/lib/api/loans";
import { addMonths, monthLabel } from "@/lib/loans/schedule";

/**
 * A person's loans on one page.
 *
 * It used to be one loan: to see what somebody had borrowed you opened each line
 * of the list in turn. It is now the person: whichever loan is opened comes
 * first, every other loan follows with its own figures, schedule and buttons,
 * and a summary adds them up once there is more than one.
 *
 * Chinedu has three loans here, as in the case that asked for this: a waiting
 * request, a loan being repaid, and one that carried a balance over.
 */

const session = vi.hoisted(() => ({ employeeId: "e1" }));

vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({
    employeeId: session.employeeId,
    isConnected: true,
    organization: { timezone: "Africa/Lagos" },
  }),
  useOrgTimezone: () => "Africa/Lagos",
}));

const opened = vi.hoisted(() => ({ current: null as unknown }));
const person = vi.hoisted(() => ({ current: null as unknown }));
const approve = vi.hoisted(() => vi.fn());
const reload = vi.hoisted(() => vi.fn());

vi.mock("@/lib/store/loans", async (original) => ({
  ...(await original<typeof import("@/lib/store/loans")>()),
  useLoanActions: () => ({ approve, pay: vi.fn(), waive: vi.fn() }),
  useLoan: () => ({ loan: opened.current, loading: false, error: null }),
  usePersonLoans: () => person.current,
}));

vi.mock("@/lib/store/pay-components", async (original) => ({
  ...(await original<typeof import("@/lib/store/pay-components")>()),
  usePayPreview: () => ({ data: null, available: false, loading: false }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/payroll/loans/waiting",
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  usePermissions: () => ({ can: () => true }),
}));

const { LoanDetailScreen } =
  await import("@/app/(app)/payroll/loans/[id]/loan-detail-screen");

const repayment = (
  loanId: string,
  sequence: number,
  amount: number,
): ApiRepayment => ({
  id: `${loanId}-r${String(sequence)}`,
  sequence,
  dueDate: addMonths("2026-12-01", sequence - 1),
  amountKobo: amount,
  paidAmountKobo: 0,
  remainingKobo: amount,
  status: "SCHEDULED",
  paidAt: null,
  payslipId: null,
  note: null,
});

const base = (id: string, over: Partial<ApiLoanDetail> = {}): ApiLoanDetail =>
  ({
    id,
    employeeId: "e2",
    employeeName: "Chinedu Okwu",
    employeeNo: "EMP-20230801",
    jobTitle: "Welder",
    principalKobo: 20_000_000,
    interestRate: 0,
    interestKobo: 0,
    totalRepayableKobo: 20_000_000,
    termMonths: 4,
    monthlyRepaymentKobo: 5_000_000,
    outstandingKobo: 20_000_000,
    status: "ACTIVE",
    reason: null,
    startPeriod: "2026-12-01",
    decidedById: "u1",
    decidedByName: "Folake Adeyemi",
    decidedAt: "2026-11-18T10:00:00.000Z",
    declinedReason: null,
    completedAt: null,
    createdAt: "2026-11-18T10:00:00.000Z",
    schedule: [1, 2, 3, 4].map((n) => repayment(id, n, 5_000_000)),
    progress: {
      instalmentsTotal: 4,
      instalmentsSettled: 0,
      scheduledKobo: 20_000_000,
      paidKobo: 0,
      waivedKobo: 0,
      remainingKobo: 20_000_000,
      nextDueDate: "2026-12-01",
      nextDueKobo: 5_000_000,
    },
    ...over,
  }) as ApiLoanDetail;

/** The ₦10,000 request that waits. */
const waiting = (over: Partial<ApiLoanDetail> = {}) =>
  base("waiting", {
    status: "PENDING",
    principalKobo: 1_000_000,
    totalRepayableKobo: 1_000_000,
    monthlyRepaymentKobo: 1_000_000,
    outstandingKobo: 1_000_000,
    startPeriod: null,
    decidedById: null,
    decidedByName: null,
    decidedAt: null,
    createdAt: "2026-11-25T10:00:00.000Z",
    schedule: [],
    progress: {
      instalmentsTotal: 0,
      instalmentsSettled: 0,
      scheduledKobo: 0,
      paidKobo: 0,
      waivedKobo: 0,
      remainingKobo: 0,
      nextDueDate: null,
      nextDueKobo: 0,
    },
    ...over,
  });

/** The ₦200,000 loan being repaid. */
const staffLoan = (over: Partial<ApiLoanDetail> = {}) => base("staff", over);

/** The ₦150,000 balance carried over, 3 months of ₦50,000. */
const carried = (over: Partial<ApiLoanDetail> = {}) =>
  base("carried", {
    principalKobo: 15_000_000,
    totalRepayableKobo: 15_000_000,
    monthlyRepaymentKobo: 5_000_000,
    outstandingKobo: 10_000_000,
    termMonths: 3,
    reason: "Balance carried over from the September payroll",
    createdAt: "2026-10-26T10:00:00.000Z",
    startPeriod: "2026-10-01",
    schedule: [1, 2, 3].map((n) => repayment("carried", n, 5_000_000)),
    ...over,
  });

const loaded = (
  others: ApiLoanDetail[] | null,
  over: Record<string, unknown> = {},
) => ({
  others,
  leftOff: 0,
  folded: [] as ApiLoan[],
  loading: false,
  error: null,
  reload,
  ...over,
});

const sections = () =>
  Array.from(document.querySelectorAll<HTMLElement>("section[id^='loan-']"));

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  session.employeeId = "e1";
  approve.mockReset();
  reload.mockReset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-25T09:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("every loan the person has, at once", () => {
  it("draws a section for each loan without anything being opened", () => {
    opened.current = waiting();
    person.current = loaded([staffLoan(), carried()]);
    render(<LoanDetailScreen id="waiting" />);

    expect(sections().map((s) => s.id)).toEqual([
      "loan-waiting",
      "loan-staff",
      "loan-carried",
    ]);
    expect(
      screen.getAllByRole("heading", { level: 2, name: "Staff loan" }),
    ).toHaveLength(3);
  });

  it("shows each running loan's whole schedule, and the waiting one's proposed schedule", () => {
    opened.current = waiting();
    person.current = loaded([staffLoan(), carried()]);
    render(<LoanDetailScreen id="waiting" />);

    expect(
      screen.getAllByRole("heading", { name: "The repayment schedule" }),
    ).toHaveLength(2);
    expect(
      screen.getByRole("heading", { name: "What the schedule would be" }),
    ).toBeVisible();
    /* Four instalments on one loan, three on the other. */
    const tables = screen.getAllByRole("table");
    expect(tables).toHaveLength(3);
    expect(within(tables[1]!).getAllByText("₦50,000.00")).toHaveLength(4);
    expect(within(tables[2]!).getAllByText("₦50,000.00")).toHaveLength(3);
  });

  it("puts the opened loan first and marks only it", () => {
    opened.current = staffLoan();
    person.current = loaded([waiting(), carried()]);
    render(<LoanDetailScreen id="staff" />);

    expect(sections()[0]!.id).toBe("loan-staff");
    expect(
      sections().filter((s) => s.getAttribute("aria-current") === "true"),
    ).toHaveLength(1);
    expect(sections()[0]!).toHaveAttribute("aria-current", "true");
  });

  it("draws a line above every loan after the first, so one is told from the next", () => {
    opened.current = waiting();
    person.current = loaded([staffLoan(), carried()]);
    render(<LoanDetailScreen id="waiting" />);

    const [first, ...rest] = sections();
    expect(first!.className).not.toContain("border-t");
    expect(rest).toHaveLength(2);
    for (const section of rest) expect(section.className).toContain("border-t");
  });

  it("does not move the opened loan out of line with the others", () => {
    opened.current = waiting();
    person.current = loaded([staffLoan(), carried()]);
    render(<LoanDetailScreen id="waiting" />);

    /* The 2px rule and 14px of padding are the 16px of margin it is pulled into. */
    expect(sections()[0]!.className).toContain("border-l-2");
    expect(sections()[0]!.className).toContain("pl-3.5");
    expect(sections()[0]!.className).toContain("sm:-ml-4");
  });

  it("names the person once at the top, with their number and job", () => {
    opened.current = waiting();
    person.current = loaded([staffLoan(), carried()]);
    render(<LoanDetailScreen id="waiting" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Chinedu Okwu" }),
    ).toBeVisible();
    expect(screen.getAllByText("EMP-20230801 · Welder")).toHaveLength(1);
  });
});

describe("the summary above them", () => {
  it("adds up the loans that are lent, and says what is in each state", () => {
    opened.current = waiting();
    person.current = loaded([staffLoan(), carried()]);
    render(<LoanDetailScreen id="waiting" />);

    const card = screen
      .getByRole("heading", { name: "All their loans" })
      .closest("div[class*='rounded-lg']") as HTMLElement;
    const inCard = within(card);
    expect(
      inCard.getByText("3 loans: 1 waiting, 2 being repaid"),
    ).toBeVisible();
    /* ₦200,000 + ₦150,000 borrowed; the waiting ₦10,000 is not lent yet. */
    expect(inCard.getByText("₦350,000.00")).toBeVisible();
    /* ₦200,000 + ₦100,000 still to pay. */
    expect(inCard.getByText("₦300,000.00")).toBeVisible();
    /* ₦50,000 + ₦50,000 a month. */
    expect(inCard.getByText("₦100,000.00")).toBeVisible();
    /* The later of the two last months: December + 3 and October + 2. */
    expect(inCard.getByText(monthLabel("2027-03-01"))).toBeVisible();
  });

  it("says the waiting request is not in the figures, only when there is one", () => {
    opened.current = staffLoan();
    person.current = loaded([waiting(), carried()]);
    const { unmount } = render(<LoanDetailScreen id="staff" />);
    expect(
      screen.getByText(
        "Waiting and declined loans are not counted in these figures.",
      ),
    ).toBeVisible();
    unmount();

    opened.current = staffLoan();
    person.current = loaded([carried()]);
    render(<LoanDetailScreen id="staff" />);
    expect(
      screen.queryByText(
        "Waiting and declined loans are not counted in these figures.",
      ),
    ).toBeNull();
  });

  it("leaves a figure out when there is nothing to count, and never prints it as nil", () => {
    opened.current = waiting();
    person.current = loaded([
      base("declined", {
        status: "DECLINED",
        declinedReason: "Over the limit.",
        startPeriod: null,
        schedule: [],
        outstandingKobo: 0,
      }),
    ]);
    render(<LoanDetailScreen id="waiting" />);

    const card = screen
      .getByRole("heading", { name: "All their loans" })
      .closest("div[class*='rounded-lg']") as HTMLElement;
    const inCard = within(card);
    expect(inCard.getByText("2 loans: 1 waiting, 1 declined")).toBeVisible();
    /* Nothing has been lent, so nothing is borrowed, owed or taken a month. */
    for (const term of ["Borrowed", "Left to pay", "A month", "Finishes"]) {
      expect(inCard.queryByText(term)).toBeNull();
    }
    expect(inCard.queryByText("₦0.00")).toBeNull();
  });

  it("is not drawn for a person with one loan, which has nothing to add up", () => {
    opened.current = staffLoan();
    person.current = loaded([]);
    render(<LoanDetailScreen id="staff" />);

    expect(
      screen.queryByRole("heading", { name: /^All (their|your) loans$/ }),
    ).toBeNull();
    expect(sections()).toHaveLength(1);
    expect(sections()[0]!).not.toHaveAttribute("aria-current");
  });

  it("does not add a loan that was folded into another a second time", () => {
    opened.current = staffLoan();
    person.current = loaded([carried()], {
      folded: [
        {
          ...carried(),
          id: "folded",
          status: "CONSOLIDATED",
          principalKobo: 99_900_000,
        } as ApiLoan,
      ],
    });
    render(<LoanDetailScreen id="staff" />);

    const card = screen
      .getByRole("heading", { name: "All their loans" })
      .closest("div[class*='rounded-lg']") as HTMLElement;
    expect(within(card).getByText("2 loans: 2 being repaid")).toBeVisible();
    expect(within(card).queryByText("₦999,000.00")).toBeNull();
  });
});

describe("each loan keeps its own buttons", () => {
  it("offers Approve on the waiting loan and not on the others", () => {
    opened.current = staffLoan();
    person.current = loaded([waiting(), carried()]);
    render(<LoanDetailScreen id="staff" />);

    expect(screen.getAllByRole("button", { name: "Approve" })).toHaveLength(1);
    expect(
      within(document.getElementById("loan-waiting")!).getByRole("button", {
        name: "Approve",
      }),
    ).toBeVisible();
    expect(
      within(document.getElementById("loan-staff")!).queryByRole("button", {
        name: "Approve",
      }),
    ).toBeNull();
  });

  it("approves the loan whose button was pressed, even when it is not the opened one", () => {
    approve.mockResolvedValue(staffLoan({ id: "waiting" }));
    opened.current = staffLoan();
    person.current = loaded([waiting(), carried()]);
    render(<LoanDetailScreen id="staff" />);

    fireEvent.click(
      within(document.getElementById("loan-waiting")!).getByRole("button", {
        name: "Approve",
      }),
    );
    expect(approve).toHaveBeenCalledTimes(1);
    expect(approve).toHaveBeenCalledWith("waiting");
  });

  it("opens a dialog for one loan only", () => {
    opened.current = waiting();
    person.current = loaded([waiting({ id: "waiting-2" }), carried()]);
    render(<LoanDetailScreen id="waiting" />);

    fireEvent.click(
      within(document.getElementById("loan-waiting-2")!).getByRole("button", {
        name: "Decline",
      }),
    );
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
});

describe("while the others are read, and when they cannot be", () => {
  it("shows the opened loan at once and says the others are on their way", () => {
    opened.current = waiting();
    person.current = loaded(null, { loading: true });
    render(<LoanDetailScreen id="waiting" />);

    expect(sections()).toHaveLength(1);
    expect(screen.getByText("Loading their other loans")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /^All (their|your) loans$/ }),
    ).toBeNull();
  });

  it("looks as the old page did until the others are known", () => {
    opened.current = staffLoan();
    person.current = loaded(null, { loading: true });
    render(<LoanDetailScreen id="staff" />);

    /* Alone, the card still carries the person, as it always did. */
    expect(screen.getByText("EMP-20230801 · Welder")).toBeVisible();
    expect(sections()[0]!).not.toHaveAttribute("aria-current");
  });

  it("says the other loans did not load and offers to try again, and still shows the opened one", () => {
    opened.current = waiting();
    person.current = loaded(null, {
      error: new ApiError(500, "server_error", "It broke."),
    });
    render(<LoanDetailScreen id="waiting" />);

    expect(sections()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("heading", { name: /^All (their|your) loans$/ }),
    ).toBeNull();
  });

  it("says how many loans were left off, in the singular and the plural", () => {
    opened.current = staffLoan();
    person.current = loaded([carried()], { leftOff: 3 });
    const { unmount } = render(<LoanDetailScreen id="staff" />);
    expect(screen.getByText("3 more loans are not shown here.")).toBeVisible();
    unmount();

    person.current = loaded([carried()], { leftOff: 1 });
    render(<LoanDetailScreen id="staff" />);
    expect(screen.getByText("One more loan is not shown here.")).toBeVisible();
  });

  it("says nothing about other loans for a person who has none", () => {
    opened.current = staffLoan();
    person.current = loaded([]);
    render(<LoanDetailScreen id="staff" />);

    expect(screen.queryByText(/not shown here/)).toBeNull();
    expect(screen.queryByText(/other loans/i)).toBeNull();
  });
});

describe("loans that were folded into another", () => {
  const foldedRows = [
    {
      ...carried(),
      id: "f1",
      status: "CONSOLIDATED",
      reason: "House rent",
      principalKobo: 10_000_000,
      consolidatedAt: "2026-10-26T10:00:00.000Z",
    },
    {
      ...carried(),
      id: "f2",
      status: "CONSOLIDATED",
      reason: null,
      principalKobo: 5_000_000,
      consolidatedAt: null,
    },
  ] as ApiLoan[];

  it("are kept in a closed group, counted, and not drawn as loans", () => {
    opened.current = staffLoan();
    person.current = loaded([carried()], { folded: foldedRows });
    render(<LoanDetailScreen id="staff" />);

    const toggle = screen.getByRole("button", {
      name: /Combined into another loan/,
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(toggle).getByText("2")).toBeVisible();
    expect(sections()).toHaveLength(2);
  });

  it("open on their own lines, each a way to open that loan", () => {
    opened.current = staffLoan();
    person.current = loaded([carried()], { folded: foldedRows });
    render(<LoanDetailScreen id="staff" />);
    fireEvent.click(
      screen.getByRole("button", { name: /Combined into another loan/ }),
    );

    expect(screen.getByRole("link", { name: "House rent" })).toHaveAttribute(
      "href",
      "/payroll/loans/f1",
    );
    expect(screen.getByRole("link", { name: "Staff loan" })).toHaveAttribute(
      "href",
      "/payroll/loans/f2",
    );
    expect(screen.getByText(/₦100,000\.00, combined on/)).toBeVisible();
    expect(screen.getByText("₦50,000.00, combined")).toBeVisible();
  });

  it("draws no group at all when there are none", () => {
    opened.current = staffLoan();
    person.current = loaded([carried()]);
    render(<LoanDetailScreen id="staff" />);

    expect(
      screen.queryByRole("button", { name: /Combined into another loan/ }),
    ).toBeNull();
  });

  it("shows the opened loan in full when it is one of them, with the way to the loan that took it", () => {
    opened.current = staffLoan({
      id: "f1",
      status: "CONSOLIDATED",
      consolidatedIntoId: "carried",
      consolidatedAt: "2026-10-26T10:00:00.000Z",
    });
    person.current = loaded([carried()]);
    render(<LoanDetailScreen id="f1" />);

    expect(sections()[0]!.id).toBe("loan-f1");
    /* The badge and the notice both say so; the notice is the one with the way on. */
    expect(
      screen.getByText(/Nothing comes off this one any more/),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "the loan that took it over" }),
    ).toHaveAttribute("href", "/payroll/loans/carried");
    /* One live loan beside it: nothing to add up. */
    expect(
      screen.queryByRole("heading", { name: /^All (their|your) loans$/ }),
    ).toBeNull();
  });
});

describe("a person reading their own loans", () => {
  it("is told they are theirs", () => {
    session.employeeId = "e2";
    opened.current = staffLoan();
    person.current = loaded([carried()]);
    render(<LoanDetailScreen id="staff" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Your staff loans" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "All your loans" }),
    ).toBeVisible();
  });

  it("keeps the singular for one loan", () => {
    session.employeeId = "e2";
    opened.current = staffLoan();
    person.current = loaded([]);
    render(<LoanDetailScreen id="staff" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Your staff loan" }),
    ).toBeVisible();
  });
});
