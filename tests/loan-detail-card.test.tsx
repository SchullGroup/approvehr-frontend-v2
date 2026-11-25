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
import type { ApiLoanDetail, ApiRepayment } from "@/lib/api/loans";
import { addMonths } from "@/lib/loans/schedule";

/**
 * The card at the top of a loan.
 *
 * It used to say the same things four times over: a card of six facts, four stat
 * cards, a bar, and then the table. It now says four things for a loan that is
 * running (who approved it, what was borrowed, what is left, how far along it
 * is) with the reason on one line, and leaves the due date and the monthly
 * figure to the table, which already has them. The application nobody has
 * decided keeps the monthly figure and the first month, because an approver
 * needs them before there is a table.
 *
 * The loan below is ₦720,000 over nine months, ₦80,000 a month, with the first
 * month taken.
 */

const session = vi.hoisted(() => ({
  isConnected: true,
  timeZone: "Africa/Lagos",
}));

vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({
    employeeId: "e1",
    isConnected: session.isConnected,
    organization: { timezone: session.timeZone },
  }),
  useOrgTimezone: () => session.timeZone,
}));

const loanOnScreen = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/lib/store/loans", async (original) => ({
  ...(await original<typeof import("@/lib/store/loans")>()),
  useLoanActions: () => ({ approve: vi.fn(), pay: vi.fn(), waive: vi.fn() }),
  useLoan: () => ({
    loan: loanOnScreen.current,
    loading: false,
    error: null,
  }),
}));

vi.mock("@/lib/store/pay-components", async (original) => ({
  ...(await original<typeof import("@/lib/store/pay-components")>()),
  usePayPreview: () => ({ data: null, available: false, loading: false }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/payroll/loans/loan-7",
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  usePermissions: () => ({ can: () => true }),
}));

const { LoanDetailScreen } =
  await import("@/app/(app)/payroll/loans/[id]/loan-detail-screen");

const INSTALMENT = 8_000_000;

const repayment = (
  sequence: number,
  over: Partial<ApiRepayment> = {},
): ApiRepayment => ({
  id: `r${sequence}`,
  sequence,
  dueDate: addMonths("2026-10-01", sequence - 1),
  amountKobo: INSTALMENT,
  paidAmountKobo: 0,
  remainingKobo: INSTALMENT,
  status: "SCHEDULED",
  paidAt: null,
  payslipId: null,
  note: null,
  ...over,
});

const firstPaid = repayment(1, {
  status: "PAID",
  paidAmountKobo: INSTALMENT,
  remainingKobo: 0,
  paidAt: "2026-10-25T09:00:00.000Z",
  payslipId: "slip-1",
});

const running = (over: Partial<ApiLoanDetail> = {}): ApiLoanDetail => {
  const schedule = [
    firstPaid,
    ...[2, 3, 4, 5, 6, 7, 8, 9].map((n) => repayment(n)),
  ];
  return {
    id: "loan-7",
    employeeId: "e2",
    employeeName: "Kenedy Obasi",
    employeeNo: "CRF-0042",
    jobTitle: "Driver",
    principalKobo: 72_000_000,
    interestRate: 0,
    interestKobo: 0,
    totalRepayableKobo: 72_000_000,
    termMonths: 9,
    monthlyRepaymentKobo: INSTALMENT,
    outstandingKobo: 64_000_000,
    status: "ACTIVE",
    reason: "HOUSE RENT",
    startPeriod: "2026-10-01",
    decidedById: "u1",
    decidedByName: "Folake Adeyemi",
    decidedAt: "2026-09-28T10:00:00.000Z",
    declinedReason: null,
    completedAt: null,
    createdAt: "2026-09-27T10:00:00.000Z",
    schedule,
    progress: {
      instalmentsTotal: 9,
      instalmentsSettled: 1,
      scheduledKobo: 72_000_000,
      paidKobo: INSTALMENT,
      waivedKobo: 0,
      remainingKobo: 64_000_000,
      nextDueDate: "2026-11-01",
      nextDueKobo: INSTALMENT,
    },
    ...over,
  } as ApiLoanDetail;
};

const pending = (over: Partial<ApiLoanDetail> = {}): ApiLoanDetail =>
  running({
    status: "PENDING",
    startPeriod: null,
    decidedById: null,
    decidedByName: null,
    decidedAt: null,
    outstandingKobo: 72_000_000,
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

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  session.isConnected = true;
  /* Only the clock: React keeps its own scheduling. */
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-18T09:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

/** The card is the first thing in the page's main body: find it by its heading. */
const card = () =>
  screen
    .getByRole("heading", { name: /^The (loan|application)$/ })
    .closest("div[class*='rounded-lg']") as HTMLElement;

describe("the card on a loan that is being repaid", () => {
  it("shows who approved it, what was borrowed, what is left and how far along", () => {
    loanOnScreen.current = running();
    render(<LoanDetailScreen id="loan-7" />);
    const inCard = within(card());

    expect(inCard.getByText("Approved by")).toBeVisible();
    expect(inCard.getByText("Folake Adeyemi")).toBeVisible();
    expect(inCard.getByText("Borrowed")).toBeVisible();
    expect(inCard.getByText("₦720,000.00")).toBeVisible();
    expect(inCard.getByText("Left to pay")).toBeVisible();
    expect(inCard.getByText("₦640,000.00")).toBeVisible();
    expect(
      inCard.getByText("₦80,000.00 of ₦720,000.00 recovered"),
    ).toBeVisible();
    expect(inCard.getByText("11%")).toBeVisible();
    expect(inCard.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "11",
    );
  });

  it("keeps the employee on the card's heading line", () => {
    loanOnScreen.current = running();
    render(<LoanDetailScreen id="loan-7" />);

    expect(within(card()).getByText("CRF-0042 · Driver")).toBeVisible();
  });

  it("does not repeat what the table already says", () => {
    loanOnScreen.current = running();
    render(<LoanDetailScreen id="loan-7" />);

    for (const repeated of [
      "Interest",
      "Total to repay",
      "A month",
      "First deduction",
      "Next deduction",
      "Repaid so far",
      "Written off",
    ]) {
      expect(screen.queryByText(repeated)).toBeNull();
    }
    expect(screen.queryByText(/instalments done/)).toBeNull();
    expect(screen.queryByText("None")).toBeNull();
    expect(screen.queryByText("What it is for")).toBeNull();
  });

  it("is one card, with the three stat cards gone", () => {
    loanOnScreen.current = running();
    render(<LoanDetailScreen id="loan-7" />);

    /* The card, and nothing else with a heading above the schedule. */
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual(["The loan", "The repayment schedule"]);
  });

  it("says what interest costs only when there is some", () => {
    loanOnScreen.current = running({
      interestRate: 0.05,
      interestKobo: 2_700_000,
      totalRepayableKobo: 74_700_000,
    });
    render(<LoanDetailScreen id="loan-7" />);
    const inCard = within(card());

    expect(
      inCard.getByText("₦27,000.00 interest (5.00% a year)"),
    ).toBeVisible();
    expect(inCard.getByText("₦747,000.00 to repay in all")).toBeVisible();
  });

  it("shows a written-off amount as a small tag by the bar, and only then", () => {
    const base = running();
    loanOnScreen.current = running({
      progress: { ...base.progress, waivedKobo: 500_000 },
    });
    const { unmount } = render(<LoanDetailScreen id="loan-7" />);

    expect(within(card()).getByText("₦5,000.00 written off")).toBeVisible();
    unmount();

    loanOnScreen.current = running();
    render(<LoanDetailScreen id="loan-7" />);
    expect(screen.queryByText(/written off/)).toBeNull();
  });

  it("keeps a settled loan's figures: nothing left, full bar", () => {
    const base = running();
    loanOnScreen.current = running({
      status: "SETTLED",
      progress: {
        ...base.progress,
        paidKobo: 72_000_000,
        remainingKobo: 0,
        instalmentsSettled: 9,
      },
    });
    render(<LoanDetailScreen id="loan-7" />);
    const inCard = within(card());

    expect(inCard.getByText("₦0.00")).toBeVisible();
    expect(inCard.getByText("100%")).toBeVisible();
  });
});

describe("the reason, on one line", () => {
  it("is 'For:' and the words, with no control when it is short", () => {
    loanOnScreen.current = running();
    render(<LoanDetailScreen id="loan-7" />);

    expect(within(card()).getByText(/HOUSE RENT/)).toHaveTextContent(
      "For: HOUSE RENT",
    );
    expect(within(card()).getByText(/HOUSE RENT/)).toHaveClass("line-clamp-1");
    expect(
      within(card()).queryByRole("button", { name: /More|Less/ }),
    ).toBeNull();
  });

  it("is folded behind More when it is long, and opens in full", () => {
    const long =
      "Balance carried over from the September 2026 payslip (originally ₦800,000), agreed with the employee in writing and approved by the managing director.";
    loanOnScreen.current = running({ reason: long });
    render(<LoanDetailScreen id="loan-7" />);

    const more = within(card()).getByRole("button", { name: "More" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(within(card()).getByText(/Balance carried over/)).toHaveClass(
      "line-clamp-1",
    );

    fireEvent.click(more);

    const less = within(card()).getByRole("button", { name: "Less" });
    expect(less).toHaveAttribute("aria-expanded", "true");
    expect(within(card()).getByText(/Balance carried over/)).not.toHaveClass(
      "line-clamp-1",
    );
    expect(within(card()).getByText(/managing director/)).toBeVisible();

    fireEvent.click(less);
    expect(within(card()).getByRole("button", { name: "More" })).toBeVisible();
  });

  it("is not on the card at all when there is none", () => {
    loanOnScreen.current = running({ reason: null });
    render(<LoanDetailScreen id="loan-7" />);

    expect(screen.queryByText(/^For:/)).toBeNull();
  });
});

describe("the card on an application nobody has decided", () => {
  it("keeps Borrowed, A month and the first deduction, and has no approver or bar", () => {
    loanOnScreen.current = pending();
    render(<LoanDetailScreen id="loan-7" />);
    const inCard = within(card());

    expect(inCard.getByText("Borrowed")).toBeVisible();
    expect(inCard.getByText("₦720,000.00")).toBeVisible();
    expect(inCard.getByText("A month")).toBeVisible();
    expect(inCard.getByText("₦80,000.00")).toBeVisible();
    expect(inCard.getByText("First deduction")).toBeVisible();
    expect(inCard.getByText("November 2026 if approved now")).toBeVisible();
    expect(inCard.queryByText("Approved by")).toBeNull();
    expect(inCard.queryByText("Left to pay")).toBeNull();
    expect(inCard.queryByRole("progressbar")).toBeNull();
    expect(inCard.getByText(/HOUSE RENT/)).toHaveTextContent("For: HOUSE RENT");
  });

  it("still shows the schedule it would create", () => {
    loanOnScreen.current = pending();
    render(<LoanDetailScreen id="loan-7" />);

    expect(
      screen.getByRole("heading", { name: "What the schedule would be" }),
    ).toBeVisible();
  });

  it("names the month the applicant asked for", () => {
    loanOnScreen.current = pending({ startPeriod: "2027-01-01" });
    render(<LoanDetailScreen id="loan-7" />);

    expect(within(card()).getByText("January 2027")).toBeVisible();
  });
});

describe("the card on a loan that was declined", () => {
  it("says who declined it and has nothing left to pay", () => {
    loanOnScreen.current = running({
      status: "DECLINED",
      schedule: [],
      declinedReason: "Not this quarter.",
    });
    render(<LoanDetailScreen id="loan-7" />);
    const inCard = within(card());

    expect(inCard.getByText("Declined by")).toBeVisible();
    expect(inCard.getByText("Folake Adeyemi")).toBeVisible();
    expect(inCard.queryByText("Left to pay")).toBeNull();
    expect(inCard.queryByRole("progressbar")).toBeNull();
  });
});

describe("one person, one loan", () => {
  it("says what a loan that took others in was combined from, and links them", () => {
    loanOnScreen.current = running({
      principalKobo: 5_500_000,
      totalRepayableKobo: 5_500_000,
      carriedForwardKobo: 500_000,
      foldedLoans: [
        {
          id: "loan-3",
          employeeId: "e2",
          employeeName: "Kenedy Obasi",
          employeeNo: "CRF-0042",
          jobTitle: "Driver",
          principalKobo: 2_000_000,
          interestRate: 0,
          interestKobo: 0,
          totalRepayableKobo: 2_000_000,
          termMonths: 4,
          monthlyRepaymentKobo: 500_000,
          outstandingKobo: 0,
          status: "CONSOLIDATED",
          reason: "School fees",
          startPeriod: "2026-08-01",
          decidedById: null,
          decidedByName: null,
          decidedAt: null,
          declinedReason: null,
          completedAt: null,
          createdAt: "2026-08-01T00:00:00.000Z",
        },
      ],
    });
    render(<LoanDetailScreen id="loan-7" />);

    expect(screen.getByText("This loan combines 2 loans")).toBeVisible();
    expect(screen.getByRole("link", { name: "School fees" })).toHaveAttribute(
      "href",
      "/payroll/loans/loan-3",
    );
    /* And the card says how much of the borrowing is that. */
    expect(
      within(card()).getByText(
        "Includes ₦5,000.00 carried from an earlier loan",
      ),
    ).toBeVisible();
  });

  it("says a folded loan was combined, and points at the one that took it", () => {
    loanOnScreen.current = running({
      status: "CONSOLIDATED",
      outstandingKobo: 0,
      consolidatedIntoId: "loan-9",
      consolidatedAt: "2026-11-20T09:00:00.000Z",
    });
    render(<LoanDetailScreen id="loan-7" />);

    expect(
      screen.getByText("Combined into one loan", {
        selector: "p, h2, h3, div",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "the loan that took it over" }),
    ).toHaveAttribute("href", "/payroll/loans/loan-9");
  });

  it("warns an approver, before they decide, what approving will combine", () => {
    loanOnScreen.current = pending({
      termMonths: 2,
      principalKobo: 5_000_000,
      totalRepayableKobo: 5_000_000,
      combinesWith: { count: 1, owedKobo: 500_000 },
    });
    render(<LoanDetailScreen id="loan-7" />);

    expect(
      screen.getByText("This will be combined with their current loan"),
    ).toBeVisible();
    /* ₦5,000 owed plus ₦50,000 new, over two months. */
    expect(
      screen.getByText(/about ₦27,500\.00 a month over 2 months/),
    ).toBeVisible();
  });

  it("says nothing of this on an ordinary loan", () => {
    loanOnScreen.current = running();
    render(<LoanDetailScreen id="loan-7" />);

    expect(screen.queryByText(/This loan combines/)).toBeNull();
    expect(screen.queryByText("Combined into one loan")).toBeNull();
    expect(screen.queryByText(/combined with their current/)).toBeNull();
  });
});
