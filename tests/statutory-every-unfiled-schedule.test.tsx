/**
 * U33 (PAY-11): August's six schedules were never filed, and once November
 * was approved they appeared nowhere and could not be downloaded. The screen
 * lists the newest approved payroll's schedules and every unfiled schedule
 * from the approved payrolls before it, each saying which month it is for.
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ApiStatutorySchedule } from "@/lib/api/statutory";

const schedule = (
  id: string,
  filedAt: string | null,
): ApiStatutorySchedule => ({
  id,
  kind: "PAYE",
  recipient: "LIRS",
  employeeCount: 10,
  amountKobo: 100,
  dueDate: "2026-09-10",
  filedAt,
  reference: null,
  dueDateConfirmed: true,
  dueDateBasis: "PITA s.82",
});

vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({ isConnected: true, isLoading: false }),
}));
vi.mock("@/lib/api/payroll", async (original) => {
  const actual = await original<typeof import("@/lib/api/payroll")>();
  return {
    ...actual,
    payrollApi: {
      ...actual.payrollApi,
      runs: () =>
        Promise.resolve({
          runs: [
            { id: "nov", period: "2026-11-01", status: "APPROVED" },
            { id: "oct", period: "2026-10-01", status: "IN_REVIEW" },
            { id: "aug", period: "2026-08-01", status: "APPROVED" },
          ],
        }),
    },
  };
});
vi.mock("@/lib/api/statutory", async (original) => ({
  ...(await original<typeof import("@/lib/api/statutory")>()),
  statutory: {
    forRun: (runId: string) =>
      Promise.resolve(
        runId === "nov"
          ? [schedule("n1", null), schedule("n2", "2026-12-01")]
          : [schedule("a1", null), schedule("a2", "2026-09-05")],
      ),
  },
}));

const { useStatutorySchedules } = await import("@/lib/store/statutory");

describe("the remittance schedules", () => {
  it("keep an older month's unfiled ones, with their month", async () => {
    const { result } = renderHook(() => useStatutorySchedules());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const rows = result.current.schedules.map((row) => [row.id, row.period]);
    expect(rows).toEqual([
      ["n1", "2026-11-01"],
      ["n2", "2026-11-01"],
      ["a1", "2026-08-01"],
    ]);
  });
});
