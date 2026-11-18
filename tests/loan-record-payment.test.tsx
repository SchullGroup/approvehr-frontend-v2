import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiLoanDetail, ApiRepayment } from "@/lib/api/loans";

/**
 * Recording a payment that is bigger than the instalment it is taken against.
 *
 * The dialog used to imply an amount could be at most what was left on that one
 * instalment. It now takes up to what the loan still owes from that instalment on,
 * says where the money will go as it is typed (the same split the API makes), and
 * refuses more than the loan owes before anything is sent. When the server
 * disagrees, its own words still show.
 *
 * The loan below is ₦50,000 over three months, the shape of the figure that
 * prompted this: ₦16,666.66, ₦16,666.66 and ₦16,666.68.
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

const pay = vi.fn();
const loanOnScreen = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/lib/store/loans", async (original) => ({
  ...(await original<typeof import("@/lib/store/loans")>()),
  useLoanActions: () => ({ pay }),
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
  usePathname: () => "/payroll/loans/loan-3",
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  usePermissions: () => ({ can: () => true }),
}));

const { PayInstalmentModal } =
  await import("@/app/(app)/payroll/loans/decisions");
const { LoanDetailScreen } =
  await import("@/app/(app)/payroll/loans/[id]/loan-detail-screen");

const row = (
  over: Partial<ApiRepayment> & { sequence: number },
): ApiRepayment => {
  const amountKobo = over.sequence === 3 ? 1_666_668 : 1_666_666;
  return {
    id: `r${over.sequence}`,
    dueDate: `2026-${String(9 + over.sequence).padStart(2, "0")}-01`,
    amountKobo,
    paidAmountKobo: 0,
    remainingKobo: amountKobo,
    status: "SCHEDULED",
    paidAt: null,
    payslipId: null,
    note: null,
    ...over,
  };
};

const loanWith = (schedule: ApiRepayment[]): ApiLoanDetail =>
  ({
    id: "loan-3",
    employeeId: "e2",
    employeeName: "Chidi Nwosu",
    employeeNo: "AHR-2",
    jobTitle: "Engineer",
    principalKobo: 5_000_000,
    interestRate: 0,
    interestKobo: 0,
    totalRepayableKobo: 5_000_000,
    termMonths: 3,
    monthlyRepaymentKobo: 1_666_666,
    outstandingKobo: schedule.reduce((t, r) => t + r.remainingKobo, 0),
    status: "ACTIVE",
    reason: null,
    startPeriod: "2026-10-01",
    decidedById: null,
    decidedByName: null,
    decidedAt: null,
    declinedReason: null,
    completedAt: null,
    createdAt: "2026-10-01T10:00:00.000Z",
    schedule,
    progress: {
      instalmentsTotal: schedule.length,
      instalmentsSettled: 0,
      scheduledKobo: 5_000_000,
      paidKobo: 0,
      waivedKobo: 0,
      remainingKobo: 5_000_000,
      nextDueDate: "2026-10-01",
      nextDueKobo: 1_666_666,
    },
  }) as ApiLoanDetail;

const fresh = () =>
  loanWith([row({ sequence: 1 }), row({ sequence: 2 }), row({ sequence: 3 })]);

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  pay.mockReset();
  session.isConnected = true;
});

function renderPay(loan: ApiLoanDetail, sequence: number) {
  const repayment = loan.schedule.find((r) => r.sequence === sequence)!;
  const onClose = vi.fn();
  const onDone = vi.fn();
  render(
    <ToastProvider>
      <PayInstalmentModal
        loan={loan}
        repayment={repayment}
        onClose={onClose}
        onDone={onDone}
      />
    </ToastProvider>,
  );
  return { onClose, onDone };
}

const amountField = () => screen.getByLabelText(/How much came in/i);
const typeAmount = (value: string) =>
  fireEvent.change(amountField(), { target: { value } });
const recordButton = () => screen.getByRole("button", { name: "Record it" });

describe("the record-a-payment dialog", () => {
  it("says what is owing on this instalment and that more comes off the next months", () => {
    renderPay(fresh(), 1);
    expect(
      screen.getByText(
        "₦16,666.66 still owing on this one. Anything more comes off the next months.",
      ),
    ).toBeVisible();
    /* Prefilled with this instalment's balance, which needs no explaining. */
    expect(amountField()).toHaveValue("16666.66");
    expect(screen.queryByRole("status")).toBeNull();
    expect(recordButton()).toBeEnabled();
  });

  it("does not promise a next month when there is none", () => {
    renderPay(fresh(), 3);
    expect(
      screen.getByText("₦16,666.68 still owing on this one."),
    ).toBeVisible();
  });

  it("says where the money goes once the amount is above this instalment", () => {
    renderPay(fresh(), 1);
    typeAmount("20000");
    expect(screen.getByRole("status")).toHaveTextContent(
      "₦16,666.66 clears instalment 1, ₦3,333.34 goes to instalment 2.",
    );
    expect(recordButton()).toBeEnabled();

    /* Back under this instalment's balance, and the line goes. */
    typeAmount("5000");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("counts only what is still owing: a paid instalment after this one is skipped", () => {
    const loan = loanWith([
      row({ sequence: 1 }),
      row({
        sequence: 2,
        status: "PAID",
        paidAmountKobo: 1_666_666,
        remainingKobo: 0,
      }),
      row({ sequence: 3 }),
    ]);
    renderPay(loan, 1);
    typeAmount("20000");
    expect(screen.getByRole("status")).toHaveTextContent(
      "₦16,666.66 clears instalment 1, ₦3,333.34 goes to instalment 3.",
    );
  });

  it("refuses more than the loan owes from here on, naming the most, and sends nothing", () => {
    renderPay(fresh(), 1);
    typeAmount("50000.01");

    expect(
      screen.getByText(
        "Only ₦50,000.00 is left to pay from instalment 1 onwards. Record ₦50,000.00 or less.",
      ),
    ).toBeVisible();
    expect(recordButton()).toBeDisabled();
    fireEvent.click(recordButton());
    expect(pay).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();

    /* Exactly the lot is fine. */
    typeAmount("50000");
    expect(recordButton()).toBeEnabled();
  });

  it("counts from the instalment chosen, not from the first", () => {
    renderPay(fresh(), 2);
    typeAmount("33333.35");
    expect(
      screen.getByText(
        "Only ₦33,333.34 is left to pay from instalment 2 onwards. Record ₦33,333.34 or less.",
      ),
    ).toBeVisible();
  });

  it("sends the amount as kobo and says which instalments it covered", async () => {
    pay.mockResolvedValue(fresh());
    const { onDone, onClose } = renderPay(fresh(), 1);
    typeAmount("20000");
    fireEvent.click(recordButton());

    await waitFor(() => expect(pay).toHaveBeenCalledOnce());
    expect(pay).toHaveBeenCalledWith("loan-3", 1, { amountKobo: 2_000_000 });
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByText("₦20,000.00 recorded")).toBeVisible();
    expect(screen.getByText("Instalments 1 and 2 of 3.")).toBeVisible();
  });

  it("still shows the server's own words when the server disagrees", async () => {
    pay.mockRejectedValue(
      new ApiError(
        422,
        "unprocessable",
        "Only ₦1.00 is left to pay from instalment 1 onwards. Record ₦1.00 or less.",
      ),
    );
    renderPay(fresh(), 1);
    typeAmount("20000");
    fireEvent.click(recordButton());

    expect(
      await screen.findByText(
        "Only ₦1.00 is left to pay from instalment 1 onwards. Record ₦1.00 or less.",
      ),
    ).toBeVisible();
  });
});

describe("a part-paid instalment on the loan screen", () => {
  it("says money paid outside payroll is part of what is owing, not a short month", () => {
    loanOnScreen.current = loanWith([
      row({
        sequence: 1,
        status: "PAID",
        paidAmountKobo: 1_666_666,
        remainingKobo: 0,
        paidAt: "2026-10-05T09:00:00.000Z",
      }),
      row({
        sequence: 2,
        status: "PARTIAL",
        paidAmountKobo: 333_334,
        remainingKobo: 1_333_332,
        paidAt: "2026-10-05T09:00:00.000Z",
      }),
      row({ sequence: 3 }),
    ]);
    render(<LoanDetailScreen id="loan-3" />);

    expect(
      screen.getAllByText(/was paid outside payroll\. The remaining/).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/could not carry the rest/)).toBeNull();
  });

  it("keeps the carry wording for a short payroll month", () => {
    loanOnScreen.current = loanWith([
      row({
        sequence: 1,
        status: "PARTIAL",
        paidAmountKobo: 1_000_000,
        remainingKobo: 666_666,
        paidAt: "2026-10-25T09:00:00.000Z",
        payslipId: "slip-1",
      }),
      row({ sequence: 2 }),
      row({ sequence: 3 }),
    ]);
    render(<LoanDetailScreen id="loan-3" />);

    expect(
      screen.getAllByText(/could not carry the rest/).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText(/was paid outside payroll\. The remaining/),
    ).toBeNull();
  });
});
