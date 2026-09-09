import { renderHook, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";

/**
 * What a reader is told when their dashboard arrangement will not load.
 *
 * A real report, from a real browser: the dashboard rendered
 *
 *   GET /api/v1/insights/dashboard/layout could not be found.
 *
 * in a warning callout, to somebody signed in as an ordinary employee. Two
 * separate faults behind one sentence:
 *
 * - the store passed `ApiError.message` straight through, and the API's own
 *   `NotFoundError` text carries the **method and path** — the status-code
 *   defect this repo already has a rule about, one worse, because it is a URL;
 * - a 404 was treated as a failure at all. The API serves only
 *   `/insights/dashboard` and `/insights/reports`; there is no layout route, so
 *   *every* reader in *every* company got that warning on *every* load, about a
 *   personalisation they had never made.
 *
 * `widgets: null` already means "has never chosen one", which is exactly what a
 * missing route leaves them with — the catalogue's defaults, the correct screen.
 * So a 404 must say nothing.
 *
 * None of this is visible to `tsc`: `caught.message` is a perfectly good
 * `string`, and so is every wrong sentence.
 */

const layout = vi.fn();
const saveLayout = vi.fn();

vi.mock("@/lib/api/insights", () => ({
  insightsApi: {
    layout: (...args: unknown[]) => layout(...args),
    saveLayout: (...args: unknown[]) => saveLayout(...args),
    clearLayout: vi.fn().mockResolvedValue({ layout: null }),
  },
}));

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: true, isLoading: false }),
}));

vi.mock("@/lib/revalidate", () => ({ useRevalidation: () => 0 }));

const { useDashboardLayout } = await import("@/lib/store/dashboard-layout");

const notFound = () =>
  new ApiError(
    404,
    "not_found",
    "GET /api/v1/insights/dashboard/layout could not be found.",
  );

beforeEach(() => {
  layout.mockReset();
  saveLayout.mockReset();
});

describe("when the layout route is not there", () => {
  it("says nothing and falls back to the defaults", async () => {
    layout.mockRejectedValue(notFound());
    const { result } = renderHook(() => useDashboardLayout());

    await waitFor(() => expect(result.current.loading).toBe(false));
    /* Not a fault — the ordinary state of every reader today. */
    expect(result.current.error).toBeNull();
    /* Null is "has never chosen", which is what the defaults answer to. */
    expect(result.current.widgets).toBeNull();
  });
});

describe("when it fails for some other reason", () => {
  it("never puts the server's own message on screen", async () => {
    const leaky = "GET /api/v1/insights/dashboard/layout blew up on row 4.";
    layout.mockRejectedValue(new ApiError(500, "server_error", leaky));
    const { result } = renderHook(() => useDashboardLayout());

    await waitFor(() => expect(result.current.error).not.toBeNull());
    const shown = result.current.error ?? "";
    expect(shown).not.toContain(leaky);
    /* No method, no path, no status code — the three things a reader cannot
       act on and should never be shown. */
    expect(shown).not.toMatch(/\/api\/|GET |500/);
    expect(shown).toContain("standard one");
  });
});

describe("a save the server refuses", () => {
  it("puts the arrangement back rather than leaving it looking saved", async () => {
    layout.mockResolvedValue({
      layout: { widgets: ["a", "b"], updatedAt: "2026-09-09T00:00:00.000Z" },
    });
    saveLayout.mockRejectedValue(notFound());
    const { result } = renderHook(() => useDashboardLayout());

    await waitFor(() => expect(result.current.widgets).toEqual(["a", "b"]));

    await act(async () => {
      await result.current.save(["b", "a", "c"]).catch(() => {});
    });

    /* The optimistic value was a guess the server did not take. Leaving the
       cards where they were dropped is a drawer claiming an arrangement that
       does not exist, and it reverts silently on the next load. */
    expect(result.current.widgets).toEqual(["a", "b"]);
    expect(result.current.error).toContain("not available on this server yet");
    expect(result.current.error).not.toMatch(/\/api\/|GET /);
  });
});
