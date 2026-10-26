import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * A shared resource answers `null` until it has loaded, not `undefined`.
 *
 * Four stores derived `loading` as `outcome === undefined`, which is never true:
 * `use()` returns `null` for a key that has not loaded, so these screens were
 * never told they were waiting and drew their empty state ("Nothing waiting",
 * "No probations ending") while the request was still in flight. What is pinned
 * is the flag itself, against a request that has not come back.
 */

const pending = vi.hoisted(() => ({
  resolve: (_value: unknown) => {},
}));

vi.mock("@/lib/store/session", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/session")>()),
  useSession: () => ({ isConnected: true, isLoading: false, mode: "api" }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/api/endpoints", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api/endpoints")>();
  return {
    ...actual,
    employees: {
      ...actual.employees,
      employmentChangesInFlight: () =>
        new Promise((resolve) => {
          pending.resolve = resolve;
        }),
    },
  };
});

describe("useEmploymentChanges", () => {
  it("is loading until the request answers, and then is not", async () => {
    const { useEmploymentChanges } =
      await import("@/lib/store/employment-changes");
    const { result } = renderHook(() => useEmploymentChanges());

    expect(result.current.loading).toBe(true);
    expect(result.current.rows).toEqual([]);

    await act(async () => {
      pending.resolve([]);
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
  });
});
