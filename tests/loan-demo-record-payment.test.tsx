import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";

/**
 * Recording a payment in demo mode splits it the way the API does.
 *
 * With no database behind it the demo book has to take a payment that is bigger
 * than the instalment the same way the server would: this instalment first, then
 * the next ones in order, and a refusal only beyond what the loan still owes. It
 * used to cap the amount at the instalment and quietly drop the rest, which is a
 * payment the screen said was recorded and the book never held.
 *
 * `loan-0001` in the seed is ₦600,000 over six months with April to June paid
 * and July part paid (₦12,000 of ₦100,000): ₦88,000 left on instalment 4, then two
 * untouched ₦100,000 instalments.
 */

vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({
    employeeId: "p-02",
    actingId: "p-02",
    displayName: "Demo Approver",
    isConnected: false,
    organization: { timezone: "Africa/Lagos" },
  }),
  useOrgTimezone: () => "Africa/Lagos",
}));

const { useLoanActions } = await import("@/lib/store/loans");

const N = (naira: number) => Math.round(naira * 100);

describe("the demo book's record-a-payment", () => {
  it("fills the instalment, then spills the rest onto the next one", async () => {
    const { result } = renderHook(() => useLoanActions());
    const after = await result.current.pay("loan-0001", 4, {
      amountKobo: N(150_000),
      note: "Bank transfer",
    });

    const [, , , fourth, fifth, sixth] = after.schedule;
    expect(fourth).toMatchObject({
      status: "PAID",
      paidAmountKobo: N(100_000),
      remainingKobo: 0,
      note: "Bank transfer",
    });
    expect(fifth).toMatchObject({
      status: "PARTIAL",
      paidAmountKobo: N(62_000),
      remainingKobo: N(38_000),
      note: "Part of a payment recorded against instalment 4",
    });
    expect(sixth).toMatchObject({ status: "SCHEDULED", paidAmountKobo: 0 });
    /* ₦600,000 less ₦312,000 paid before and ₦150,000 now. */
    expect(after.outstandingKobo).toBe(N(138_000));
  });

  it("refuses only beyond what the loan still owes, and says so", async () => {
    const { result } = renderHook(() => useLoanActions());
    /* Instalment 5 and 6 are still open whatever the test before did. */
    const attempt = result.current.pay("loan-0001", 5, {
      amountKobo: N(1_000_000),
    });
    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await expect(attempt).rejects.toMatchObject({ status: 422 });
    await expect(attempt).rejects.toThrow(
      /is left to pay from instalment 5 onwards/,
    );
  });
});
