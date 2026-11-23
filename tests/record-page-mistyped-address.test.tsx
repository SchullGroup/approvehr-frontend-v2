/**
 * L22 (HR-28, CRAWL-5): `/people/leev` (any non-id after /people/) was taken
 * for a person id: it fired two 400s for that person's leave and said "That
 * link is from the demo" to somebody who had only mistyped. Connected, an
 * address that is not an id is "No such employee", and nothing is asked for
 * it. `/billing` was a 404 though Settings shows a Billing block; it goes to
 * `/billing/pay`.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";

const asked = vi.hoisted(() => ({
  leave: [] as unknown[],
  record: [] as string[],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({ isConnected: true, isLoading: false, employeeId: "me" }),
}));
vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  useCan: () => true,
}));
vi.mock("@/lib/store/employees-api", async (original) => ({
  ...(await original<typeof import("@/lib/store/employees-api")>()),
  useEmployee: (id: string) => {
    asked.record.push(id);
    return {
      employee: null,
      loading: false,
      connected: true,
      notFound: true,
      demoId: true,
      forbidden: false,
      error: null,
      reload: vi.fn(),
    };
  },
  useEmployeeDirectory: () => ({ employees: [] }),
  useEmployeeMutations: () => ({}),
}));
vi.mock("@/lib/store/leave-api", async (original) => ({
  ...(await original<typeof import("@/lib/store/leave-api")>()),
  useLeaveRequests: (params: unknown) => {
    asked.leave.push(params);
    return { requests: [], loading: false };
  },
  useEmployeeLeaveBalances: () => ({ balances: [], loading: false }),
}));

const { EmployeeRecordPage } =
  await import("@/app/(app)/people/[id]/record-page");

describe("a mistyped address under /people/", () => {
  it("is No such employee, not a demo link, and asks for nothing", () => {
    render(<EmployeeRecordPage id="leev" />);
    expect(screen.getByText("No such employee")).toBeInTheDocument();
    expect(screen.queryByText(/from the demo/)).toBeNull();
    expect(asked.leave).toEqual([]);
    expect(asked.record).toEqual([]);
  });
});

describe("/billing", () => {
  it("goes to the billing page", () => {
    const page = readFileSync(
      path.resolve(import.meta.dirname, "../src/app/(app)/billing/page.tsx"),
      "utf8",
    );
    expect(page).toMatch(/redirect\("\/billing\/pay"\)/);
  });
});
