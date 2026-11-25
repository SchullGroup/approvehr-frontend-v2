import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A manager's Projects Archive asks for their own archived projects, not the
 * whole company's (UAT 23 Nov, L11 / PERF-33). Asking everybody for "all" and
 * falling back on the 403 put a refused call on every load of the page.
 */
const listArchived = vi.fn();
vi.mock("@/lib/api/projects", async (original) => {
  const real = await original<typeof import("@/lib/api/projects")>();
  return {
    ...real,
    projectsApi: {
      ...real.projectsApi,
      listArchived: (...a: unknown[]) => listArchived(...a),
    },
  };
});
vi.mock("@/lib/store/session", async (original) => {
  const real = await original<typeof import("@/lib/store/session")>();
  return {
    ...real,
    useSession: () => ({
      isConnected: true,
      isLoading: false,
      actingId: "emp-1",
      employeeId: "emp-1",
      user: { id: "user-1" },
    }),
    useOrgTimezone: () => "Africa/Lagos",
  };
});

const { useArchivedProjects } = await import("@/lib/store/projects");

beforeEach(() => {
  listArchived.mockReset().mockResolvedValue([]);
});

describe("the archived projects", () => {
  it("asks only for the reader's own when they may not list the company's", async () => {
    renderHook(() => useArchivedProjects(true, false));
    await waitFor(() => expect(listArchived).toHaveBeenCalled());
    expect(listArchived.mock.calls.map((call) => call[0])).toEqual(["mine"]);
  });

  it("asks for the company's when they may", async () => {
    renderHook(() => useArchivedProjects(true, true));
    await waitFor(() => expect(listArchived).toHaveBeenCalled());
    expect(listArchived.mock.calls[0]?.[0]).toBe("all");
  });
});
