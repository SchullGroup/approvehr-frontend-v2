import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ApiError } from "@/lib/api/client";

/**
 * The write that renames an appraisal period, and what the store does with it
 * offline.
 *
 * The API has taken a new `name` on `PATCH /performance/cycles/:id` at any stage
 * for as long as the route has existed, and nothing in the product sent it. A
 * path or a body is invisible to `tsc` (both are strings and objects), and a
 * wrong one is refused in a way that looks like a bug in the screen.
 */

let request: Mock<(...args: unknown[]) => Promise<unknown>>;
let connected = true;

vi.mock("@/lib/api/client", async (original) => {
  const real = await original<typeof import("@/lib/api/client")>();
  return {
    ...real,
    request: (...args: unknown[]) => request(...args),
    requestPaged: vi.fn(),
  };
});
vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({ isConnected: connected }),
}));

const { performanceApi } = await import("@/lib/api/performance");
const { useCycleMutations } = await import("@/lib/store/performance");

beforeEach(() => {
  request = vi.fn().mockResolvedValue({});
  connected = true;
});

describe("performanceApi.updateCycle with a name", () => {
  it("is a PATCH to the period, carrying the name and nothing else", async () => {
    await performanceApi.updateCycle("cycle-9", { name: "H1 2027 Appraisal" });

    expect(request).toHaveBeenCalledTimes(1);
    const [path, init] = request.mock.calls[0] as [
      string,
      { method: string; body: Record<string, unknown> },
    ];
    expect(path).toBe("/performance/cycles/cycle-9");
    expect(init.method).toBe("PATCH");
    expect(init.body).toEqual({ name: "H1 2027 Appraisal" });
  });

  it("lets the API's refusal through untouched, so its sentence reaches the field", async () => {
    const refusal = new ApiError(409, "conflict", '"H1" already exists.');
    request.mockRejectedValue(refusal);
    await expect(
      performanceApi.updateCycle("cycle-9", { name: "H1" }),
    ).rejects.toBe(refusal);
  });
});

describe("useCycleMutations().updateCycle with a name", () => {
  it("sends it through when connected", async () => {
    const { result } = renderHook(() => useCycleMutations());
    await result.current.updateCycle("cycle-9", { name: "H1 2027 Appraisal" });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[0]).toBe("/performance/cycles/cycle-9");
  });

  it("refuses offline, with a sentence and no request: a rename kept in one browser reaches nobody", async () => {
    connected = false;
    const { result } = renderHook(() => useCycleMutations());
    await expect(
      result.current.updateCycle("cycle-9", { name: "H1 2027 Appraisal" }),
    ).rejects.toThrow(/needs the API/);
    expect(request).not.toHaveBeenCalled();
  });
});
