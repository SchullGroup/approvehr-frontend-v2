import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * UAT 23 Nov, U70 (SELF-18): Home's clock card said "Clocked in at 09:40" while
 * the Today panel under it still said "Not clocked in", until a reload.
 */

const state = vi.hoisted(() => ({ generation: 0, today: vi.fn() }));

vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({ isConnected: true }),
}));
vi.mock("@/lib/store/attendance", () => ({
  useClockGeneration: () => state.generation,
}));
vi.mock("@/lib/api/me", async (original) => {
  const real = await original<typeof import("@/lib/api/me")>();
  return { ...real, meApi: { ...real.meApi, today: state.today } };
});

import { useMeToday } from "@/lib/store/me-today";

describe("the Today panel's data", () => {
  it("re-reads the clock section when somebody clocks in or out", async () => {
    state.today.mockReset().mockResolvedValue({
      asOf: "2026-11-23T09:00:00Z",
      sections: {},
    });
    const { rerender } = renderHook(() => useMeToday());
    await waitFor(() => expect(state.today).toHaveBeenCalledTimes(1));
    expect(state.today).toHaveBeenLastCalledWith();

    state.generation = 1;
    rerender();
    await waitFor(() => expect(state.today).toHaveBeenCalledTimes(2));
    expect(state.today).toHaveBeenLastCalledWith(["clockIn"]);
  });
});
