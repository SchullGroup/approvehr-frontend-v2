import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiLoanDetail } from "@/lib/api/loans";

/**
 * A payment taken back or recorded is on the loan page as soon as it is saved.
 *
 * A user saw the toast "Payment taken back" over a table that still showed the payment, until the
 * page was reloaded. The loan on screen is the answer to one `GET /loans/:id`; a write has to bring
 * that answer back again, and what it brings back has to be what the screen shows.
 */

const session = vi.hoisted(() => ({ isConnected: true }));

vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({
    employeeId: "p-02",
    actingId: "p-02",
    isConnected: session.isConnected,
    organization: { timezone: "Africa/Lagos" },
  }),
  useOrgTimezone: () => "Africa/Lagos",
}));

const get = vi.hoisted(() => vi.fn());
const undoPayment = vi.hoisted(() => vi.fn());
const pay = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/loans", async (original) => ({
  ...(await original<typeof import("@/lib/api/loans")>()),
  loansApi: {
    ...(await original<typeof import("@/lib/api/loans")>()).loansApi,
    get,
    undoPayment,
    pay,
  },
}));

const { useLoan, useLoanActions } = await import("@/lib/store/loans");

const loan = (paidKobo: number): ApiLoanDetail =>
  ({
    id: "l1",
    employeeId: "e1",
    employeeName: "Ada",
    outstandingKobo: 17_000_000 - paidKobo,
    status: "ACTIVE",
    schedule: [],
  }) as unknown as ApiLoanDetail;

beforeEach(() => {
  session.isConnected = true;
  get.mockReset();
  undoPayment.mockReset();
  pay.mockReset();
});

describe("connected", () => {
  it("asks for the loan again after a payment is taken back, and shows what comes back", async () => {
    get.mockResolvedValueOnce(loan(3_000_000));
    const { result } = renderHook(() => ({
      one: useLoan("l1"),
      actions: useLoanActions(),
    }));
    await waitFor(() =>
      expect(result.current.one.loan?.outstandingKobo).toBe(14_000_000),
    );

    undoPayment.mockResolvedValueOnce(loan(0));
    get.mockResolvedValueOnce(loan(0));
    await act(async () => {
      await result.current.actions.undoPayment(
        "l1",
        1,
        "recorded in two pieces",
      );
    });

    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(result.current.one.loan?.outstandingKobo).toBe(17_000_000),
    );
  });
});
