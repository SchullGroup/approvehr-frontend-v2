import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rollover: vi.fn(),
  connected: true,
}));

vi.mock("@/lib/api/leave", async (original) => ({
  ...(await original<typeof import("@/lib/api/leave")>()),
  leaveApi: { rollover: (...args: unknown[]) => mocks.rollover(...args) },
}));
vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({ isConnected: mocks.connected }),
}));

const { useLeaveRollover } = await import("@/lib/store/leave-rollover");
const { ApiError } = await import("@/lib/api/client");

/**
 * The status read, as a hook.
 *
 * Offline there is no job, so no request is made and the answer is nothing: a
 * status for something that never ran would be a claim about balances. A failed
 * read is also nothing, never a status.
 */
beforeEach(() => {
  mocks.connected = true;
});
afterEach(() => vi.clearAllMocks());

describe("useLeaveRollover", () => {
  it("asks nothing and answers nothing offline", async () => {
    mocks.connected = false;
    mocks.rollover.mockResolvedValue({
      year: 2026,
      carryingTypes: 1,
      ranThisYear: null,
    });
    const { result } = renderHook(() => useLeaveRollover());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.rollover).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it("returns what the API recorded when connected", async () => {
    const recorded = { year: 2031, carryingTypes: 2, ranThisYear: null };
    mocks.rollover.mockResolvedValue(recorded);
    const { result } = renderHook(() => useLeaveRollover());
    await waitFor(() => expect(result.current).toEqual(recorded));
  });
});
