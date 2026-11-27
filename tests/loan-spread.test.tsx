/**
 * Spreading what is still owed on a running loan over a number of months.
 *
 * Two loans combined into one on a one-month term left ₦310,000 due in a single instalment. The dialog
 * asks how many months and from which month, and why, and sends exactly that; nothing owed changes, so it
 * says so. When the server refuses, its own words show.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiLoanDetail } from "@/lib/api/loans";

const respread = vi.fn();

vi.mock("@/lib/store/loans", async (original) => ({
  ...(await original<typeof import("@/lib/store/loans")>()),
  useLoanActions: () => ({ respread }),
  useLoanToday: () => "2026-11-26",
  useLoans: () => ({ loans: [], total: 0, loading: false, error: null }),
}));

const { SpreadLoanModal } = await import("@/app/(app)/payroll/loans/decisions");

const loan = {
  id: "loan-1",
  employeeId: "e1",
  employeeName: "Ada Obi",
  outstandingKobo: 31_000_000,
  status: "ACTIVE",
  schedule: [],
} as unknown as ApiLoanDetail;

const open = (onClose = vi.fn()) =>
  render(
    <ToastProvider>
      <SpreadLoanModal loan={loan} onClose={onClose} />
    </ToastProvider>,
  );

beforeEach(() => {
  respread.mockReset();
  respread.mockResolvedValue(loan);
});

describe("the spread dialog", () => {
  it("says what is owed and that only the timing changes", () => {
    open();
    expect(screen.getByText(/still owes ₦310,000\.00/)).toBeTruthy();
    expect(
      screen.getByText(/does not change, only when it comes off/),
    ).toBeTruthy();
  });

  it("will not go until there is a reason", async () => {
    open();
    const go = screen.getByRole("button", {
      name: "Spread it",
    }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    await userEvent.type(
      screen.getByRole("textbox", { name: /Why/ }),
      "Too much at once",
    );
    expect(go.disabled).toBe(false);
  });

  it("sends the months, the first month and the reason, and closes", async () => {
    const onClose = vi.fn();
    open(onClose);
    /* Five months, from next month, are the defaults. */
    await userEvent.type(
      screen.getByRole("textbox", { name: /Why/ }),
      "Too much at once",
    );
    await userEvent.click(screen.getByRole("button", { name: "Spread it" }));

    expect(respread).toHaveBeenCalledWith("loan-1", {
      startPeriod: "2026-12-01",
      termMonths: 5,
      reason: "Too much at once",
    });
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("sends the months it was given, not the default", async () => {
    open();
    const field = screen.getByRole("textbox", { name: /Over how many months/ });
    await userEvent.clear(field);
    await userEvent.type(field, "6");
    await userEvent.type(
      screen.getByRole("textbox", { name: /Why/ }),
      "Pay it well",
    );
    await userEvent.click(screen.getByRole("button", { name: "Spread it" }));
    expect(respread.mock.calls[0]?.[1]).toMatchObject({ termMonths: 6 });
  });

  it("shows the server's own words when it refuses", async () => {
    respread.mockRejectedValue(
      new ApiError(
        409,
        "conflict",
        "The December payroll is already approved, so nothing new can start then.",
      ),
    );
    open();
    await userEvent.type(
      screen.getByRole("textbox", { name: /Why/ }),
      "Too much at once",
    );
    await userEvent.click(screen.getByRole("button", { name: "Spread it" }));
    expect(await screen.findByText(/already approved/)).toBeTruthy();
  });
});
