/**
 * L30 (SELF-24, CRAWL-3): opening somebody else's payslip or leave request by
 * its link said "No payslip here ... it may belong to an older period" and
 * "That request is no longer here. It may have been withdrawn", though the API
 * had answered 403 "not yours to read". The API's own sentence is kept and
 * shown; the not-found words are for a 404.
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ApiError } from "@/lib/api/client";

const refusal = new ApiError(
  403,
  "forbidden",
  "That payslip is not yours to read.",
);
const leaveRefusal = new ApiError(
  403,
  "forbidden",
  "That leave request is not yours to read.",
);

vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({
    isConnected: true,
    isLoading: false,
    employeeId: "me",
    can: () => true,
  }),
}));
vi.mock("@/lib/api/payroll", async (original) => {
  const actual = await original<typeof import("@/lib/api/payroll")>();
  return {
    ...actual,
    payrollApi: {
      ...actual.payrollApi,
      payslip: () => Promise.reject(refusal),
    },
  };
});
vi.mock("@/lib/api/leave", async (original) => {
  const actual = await original<typeof import("@/lib/api/leave")>();
  return {
    ...actual,
    leaveApi: { ...actual.leaveApi, get: () => Promise.reject(leaveRefusal) },
  };
});

const { usePayslipRecord } = await import("@/lib/store/payroll");
const { useLeaveRequestDetail } = await import("@/lib/store/leave-api");

describe("a link to somebody else's", () => {
  it("payslip keeps the API's refusal", async () => {
    const { result } = renderHook(() => usePayslipRecord("slip-1", null));
    await waitFor(() =>
      expect(result.current.refused).toBe("That payslip is not yours to read."),
    );
  });

  it("leave request keeps the API's refusal", async () => {
    const { result } = renderHook(() => useLeaveRequestDetail("lv-1"));
    await waitFor(() =>
      expect(result.current.refused).toBe(
        "That leave request is not yours to read.",
      ),
    );
  });

  it("is shown in place of the not-found words", () => {
    const read = (p: string) =>
      readFileSync(path.resolve(import.meta.dirname, "..", p), "utf8");
    expect(read("src/app/(app)/payroll/payslips/[id]/view.tsx")).toContain(
      "record.refused",
    );
    expect(read("src/app/(app)/people/leave/leave-screen.tsx")).toContain(
      "refused={detail.refused}",
    );
  });
});
