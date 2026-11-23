import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiLoan } from "@/lib/api/loans";

/**
 * Combining a person's loans into one.
 *
 * The case that prompted it: ₦5,000 left on one loan, a new ₦50,000 loan on top, and a repayment that should be
 * one line over the two months that remain. The dialog shows the same sum the API computes from the schedules, so
 * the one deciding can see it, and the only choices are the term and the first month.
 */

const consolidate = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());

vi.mock("@/lib/store/loans", async (original) => ({
  ...(await original<typeof import("@/lib/store/loans")>()),
  useLoanActions: () => ({ consolidate }),
  useLoanToday: () => "2026-11-01",
  useLoans: () => ({ loans: [] }),
}));
vi.mock("@/components/ui", async (original) => ({
  ...(await original<typeof import("@/components/ui")>()),
  useToast: () => ({ push }),
}));

const { CombineLoansModal } =
  await import("@/app/(app)/payroll/loans/decisions");

const loan = (over: Partial<ApiLoan>): ApiLoan => ({
  id: "l-1",
  employeeId: "e-1",
  employeeName: "Ime Dennis",
  employeeNo: "C-1",
  jobTitle: "Machinist",
  principalKobo: 2_000_000,
  interestRate: 0,
  interestKobo: 0,
  totalRepayableKobo: 2_000_000,
  termMonths: 4,
  monthlyRepaymentKobo: 500_000,
  outstandingKobo: 500_000,
  status: "ACTIVE",
  reason: null,
  startPeriod: "2026-08-01",
  decidedById: null,
  decidedByName: null,
  decidedAt: null,
  declinedReason: null,
  completedAt: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  ...over,
});

/** ₦5,000 left, ending this month; ₦50,000 left, ending next month. */
const LOANS = [
  loan({ id: "l-1" }),
  loan({
    id: "l-2",
    principalKobo: 5_000_000,
    totalRepayableKobo: 5_000_000,
    termMonths: 2,
    monthlyRepaymentKobo: 2_500_000,
    outstandingKobo: 5_000_000,
    startPeriod: "2026-11-01",
    createdAt: "2026-11-01T00:00:00.000Z",
  }),
];

beforeEach(() => {
  consolidate.mockReset();
  consolidate.mockResolvedValue({});
  push.mockClear();
});

function open(onClose = vi.fn()) {
  render(
    <CombineLoansModal
      employeeId="e-1"
      employeeName="Ime Dennis"
      loans={LOANS}
      onClose={onClose}
    />,
  );
  return onClose;
}

describe("the Combine dialog", () => {
  it("says what is owed in all and what it comes to a month, with no interest added", () => {
    open();
    expect(
      screen.getByText(/Ime Dennis has 2 loans being repaid/),
    ).toBeVisible();
    /* ₦5,000 + ₦50,000 over the two months the longest has left. */
    expect(
      screen.getByText(
        /₦55,000\.00 is still owed on 2 loans\. Combined: about ₦27,500\.00 a month for 2 months from November 2026, with no interest added\./,
      ),
    ).toBeVisible();
  });

  it("asks for the term and the first month, and nothing about money", () => {
    open();
    expect(screen.getByLabelText("Repaid over")).toHaveValue(2);
    expect(screen.getByLabelText("First deduction")).toBeVisible();
    expect(screen.queryByLabelText(/amount|principal|interest/i)).toBeNull();
  });

  it("sends the term and the month, and closes", async () => {
    const onClose = open();
    await userEvent.click(screen.getByRole("button", { name: "Combine" }));
    expect(consolidate).toHaveBeenCalledWith({
      employeeId: "e-1",
      termMonths: 2,
      startPeriod: "2026-11-01",
    });
    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Ime Dennis's loans are now one loan",
        tone: "success",
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("works the monthly figure again when the term changes", async () => {
    open();
    const term = screen.getByLabelText("Repaid over");
    await userEvent.clear(term);
    await userEvent.type(term, "5");
    expect(
      screen.getByText(/about ₦11,000\.00 a month for 5 months/),
    ).toBeVisible();
  });

  it("will not send a term that is not a whole number of months", async () => {
    open();
    const term = screen.getByLabelText("Repaid over");
    await userEvent.clear(term);
    await userEvent.type(term, "0");
    expect(screen.getByRole("button", { name: "Combine" })).toBeDisabled();
    expect(
      screen.getByText(/whole number of months, from 1 to 120/),
    ).toBeVisible();
    expect(consolidate).not.toHaveBeenCalled();
  });

  it("stays open and says why when the API refuses", async () => {
    const { ApiError } = await import("@/lib/api/client");
    consolidate.mockRejectedValue(
      new ApiError(
        409,
        "conflict",
        "Ime is on the 2026-11 payroll, which is still being worked.",
      ),
    );
    const onClose = open();
    await userEvent.click(screen.getByRole("button", { name: "Combine" }));
    expect(await screen.findByText(/still being worked/)).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
  });
});
