/**
 * L3 (PAY-28): somebody who asked to be paid early could not take the request
 * back. The API lets a person withdraw their own request while nobody has
 * decided it; the Advances list now offers Withdraw on exactly those rows.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ApiAdvance } from "@/lib/api/advances";

const cancel = vi.fn();
const reload = vi.fn();

const advance = (over: Partial<ApiAdvance>): ApiAdvance => ({
  id: "a1",
  employeeId: "e-musa",
  employeeName: "Musa Ibrahim",
  period: "2026-11-01",
  amountKobo: 1_000_000,
  feeKobo: 0,
  outstandingKobo: 1_000_000,
  earnedAtRequestKobo: 5_000_000,
  capAtRequestKobo: 2_500_000,
  status: "REQUESTED",
  requestedAt: "2026-11-20T09:00:00Z",
  decidedAt: null,
  declineReason: null,
  paidAt: null,
  recoveredAt: null,
  recoveredKobo: 0,
  ...over,
});

let rows: ApiAdvance[] = [];

vi.mock("@/lib/store/advances", () => ({
  useMyAdvance: () => ({
    available: true,
    refusal: "",
    data: null,
    loading: false,
    error: null,
    reload,
  }),
  useAdvances: () => ({
    available: true,
    data: rows,
    loading: false,
    error: null,
    reload,
  }),
  useAdvancePolicy: () => ({ available: false, reload }),
  useAdvanceMutations: () => ({ cancel, markPaid: vi.fn() }),
}));
vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  useCan: () => false,
}));
vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({ employeeId: "e-musa", isConnected: true }),
}));
vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageBody: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { AdvancesScreen } from "@/app/(app)/payroll/advances/advances-screen";

beforeEach(() => {
  cancel.mockReset();
  cancel.mockResolvedValue(advance({ status: "CANCELLED" }));
  reload.mockReset();
});

async function openAdvances() {
  render(<AdvancesScreen />);
  await userEvent.click(screen.getByRole("tab", { name: "Advances" }));
}

describe("withdrawing a pay-early request", () => {
  it("is offered on your own request while it waits, and asks first", async () => {
    rows = [advance({})];
    await openAdvances();
    await userEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    expect(cancel).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Withdraw request" }),
    );
    expect(cancel).toHaveBeenCalledWith("a1");
  });

  it("is not offered once it has been decided", async () => {
    rows = [advance({ status: "APPROVED" })];
    await openAdvances();
    expect(screen.queryByRole("button", { name: "Withdraw" })).toBeNull();
  });

  it("is not offered on somebody else's request", async () => {
    rows = [advance({ employeeId: "e-ada", employeeName: "Ada Eze" })];
    await openAdvances();
    expect(screen.queryByRole("button", { name: "Withdraw" })).toBeNull();
  });
});
