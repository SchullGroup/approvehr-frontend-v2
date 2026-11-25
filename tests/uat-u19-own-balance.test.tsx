import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * UAT 23 Nov, U19 (SELF-3, NC-5): an employee's Leave page and booking form
 * asked for their own balance through the many-people read, which needs See
 * salaries, and showed "You need See salaries" in red. Their own balance is
 * theirs to read through `GET /leave/balances/:id`.
 */

const state = vi.hoisted(() => ({
  seesSalaries: false,
  balances: vi.fn(),
  balancesForMany: vi.fn(),
}));

vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({ isConnected: true, employeeId: "me" }),
}));
vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  useCan: () => state.seesSalaries,
}));
vi.mock("@/lib/api/leave", async (original) => {
  const real = await original<typeof import("@/lib/api/leave")>();
  return {
    ...real,
    leaveApi: {
      ...real.leaveApi,
      balances: state.balances,
      balancesForMany: state.balancesForMany,
    },
  };
});

import { useLeaveBalancesFor } from "@/lib/store/leave-api";

const ANNUAL = {
  leaveTypeId: "t-annual",
  leaveType: "Annual",
  year: 2026,
  entitled: 20,
  carriedIn: 0,
  taken: 12,
  pending: 0,
  remaining: 8,
};

beforeEach(() => {
  state.balances.mockReset().mockResolvedValue([ANNUAL]);
  state.balancesForMany.mockReset().mockResolvedValue({ me: [ANNUAL] });
});

describe("somebody without See salaries", () => {
  it("reads their own balance through the route that is theirs", async () => {
    state.seesSalaries = false;
    const { result } = renderHook(() => useLeaveBalancesFor(["me"]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(state.balances).toHaveBeenCalledWith("me");
    expect(state.balancesForMany).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
    expect(result.current.of("me")?.remaining).toBe(8);
  });

  it("asks for nobody else's, and shows none rather than an error", async () => {
    state.seesSalaries = false;
    const { result } = renderHook(() => useLeaveBalancesFor(["me", "someone"]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(state.balancesForMany).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
    expect(result.current.of("someone")).toBeUndefined();
    expect(result.current.of("me")?.remaining).toBe(8);
  });
});

describe("somebody with See salaries", () => {
  it("reads several people in one request", async () => {
    state.seesSalaries = true;
    const { result } = renderHook(() => useLeaveBalancesFor(["me", "someone"]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(state.balancesForMany).toHaveBeenCalledTimes(1);
  });
});
