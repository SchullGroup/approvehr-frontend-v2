import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiLoan, ApiLoanDetail } from "@/lib/api/loans";
import { ApprovedLoanCard } from "@/app/(app)/payroll/loans/approved-loan-card";

/**
 * Asking for a loan ends in a statement inside the dialog, not a toast.
 *
 * The store is replaced with a canned answer, so what is tested is what the
 * dialog does with the loan the API sent back: it says what was saved, it is not
 * closed until somebody says so, and the screen behind is told straight away
 * (unlike pay early, nothing behind this dialog is mounted on the answer).
 */

const apply = vi.fn();

vi.mock("@/lib/store/loans", async (original) => ({
  ...(await original<typeof import("@/lib/store/loans")>()),
  useLoanActions: () => ({ apply }),
}));

vi.mock("@/lib/store/pay-components", async (original) => ({
  ...(await original<typeof import("@/lib/store/pay-components")>()),
  usePayPreview: () => ({ data: null, available: false, loading: false }),
}));

const { ApplyLoanModal } = await import("@/app/(app)/payroll/loans/apply-loan");

const saved = (over: Partial<ApiLoanDetail> = {}): ApiLoanDetail =>
  ({
    id: "loan-9",
    employeeId: "e1",
    employeeName: "Chidi Nwosu",
    employeeNo: "AHR-1",
    jobTitle: "Engineer",
    principalKobo: 30_000_000,
    interestRate: 0,
    interestKobo: 0,
    totalRepayableKobo: 30_000_000,
    termMonths: 6,
    monthlyRepaymentKobo: 5_000_000,
    outstandingKobo: 30_000_000,
    status: "PENDING",
    reason: null,
    startPeriod: null,
    decidedById: null,
    decidedByName: null,
    decidedAt: null,
    declinedReason: null,
    completedAt: null,
    createdAt: "2026-10-09T10:00:00.000Z",
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
  }) as ApiLoanDetail;

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  apply.mockReset();
});

function renderModal() {
  const onClose = vi.fn();
  const onApplied = vi.fn();
  render(
    <ApplyLoanModal
      onClose={onClose}
      onApplied={onApplied}
      forEmployeeId="e1"
    />,
  );
  fireEvent.change(screen.getByPlaceholderText("500,000"), {
    target: { value: "300000" },
  });
  return { onClose, onApplied };
}

describe("sending a loan request", () => {
  it("turns the dialog into what was saved, with a way to the loan", async () => {
    apply.mockResolvedValue(saved());
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));

    expect(
      await screen.findByRole("heading", {
        name: "Your loan request is sent for approval",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("₦300,000.00 over 6 months, ₦50,000.00 a month."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Nothing is deducted until somebody approves it."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "See the details" }),
    ).toHaveAttribute("href", "/payroll/loans/loan-9");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("tells the screen behind at once, and closes only on Done", async () => {
    apply.mockResolvedValue(saved());
    const { onApplied, onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));
    await screen.findByRole("button", { name: "Done" });

    expect(onApplied).toHaveBeenCalledWith(
      expect.objectContaining({ id: "loan-9" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("reads the figures from the loan the API sent back, not the form", async () => {
    apply.mockResolvedValue(
      saved({ principalKobo: 20_000_000, monthlyRepaymentKobo: 3_333_334 }),
    );
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));

    expect(
      await screen.findByText("₦200,000.00 over 6 months, ₦33,333.34 a month."),
    ).toBeInTheDocument();
  });

  it("keeps the form when the API refuses", async () => {
    const { ApiError } = await import("@/lib/api/client");
    apply.mockRejectedValue(
      new ApiError(400, "bad_request", "Some fields are not valid."),
    );
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));

    await waitFor(() => expect(apply).toHaveBeenCalled());
    expect(
      await screen.findByText("Some fields are not valid."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /sent for approval/ }),
    ).toBeNull();
  });
});

const loan: ApiLoan = {
  id: "loan-1",
  employeeId: "e1",
  employeeName: "Chidi Nwosu",
  employeeNo: "AHR-1",
  jobTitle: "Engineer",
  principalKobo: 30_000_000,
  interestRate: 0,
  interestKobo: 0,
  totalRepayableKobo: 30_000_000,
  termMonths: 6,
  monthlyRepaymentKobo: 5_000_000,
  outstandingKobo: 30_000_000,
  status: "ACTIVE",
  reason: null,
  startPeriod: "2026-11-01",
  decidedById: "d1",
  decidedByName: "Tunde Bakare",
  decidedAt: "2026-10-09T10:00:00.000Z",
  declinedReason: null,
  completedAt: null,
  createdAt: "2026-10-01T10:00:00.000Z",
};

describe("an approval card", () => {
  it("carries the words, and a way to the schedule", () => {
    render(<ApprovedLoanCard loan={loan} onDismiss={() => {}} />);

    expect(
      screen.getByRole("heading", { name: "Chidi Nwosu's loan is approved" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("₦300,000.00 over 6 months, ₦50,000.00 a month."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "See the schedule" }),
    ).toHaveAttribute("href", "/payroll/loans/loan-1");
  });

  it("leaves the link out on the loan's own page", () => {
    render(
      <ApprovedLoanCard loan={loan} linkToLoan={false} onDismiss={() => {}} />,
    );
    expect(screen.queryByRole("link", { name: "See the schedule" })).toBeNull();
  });
});
