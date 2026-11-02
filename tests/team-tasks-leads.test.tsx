import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The sidebar's question "do I lead anybody?": asked once per employee through the
 * cheap existence endpoint, not at all when Projects is off, and a failure reads as
 * "no" so the row stays hidden rather than leading to a page that cannot load.
 */

const teamLeads = vi.fn();
let session = { isConnected: true, employeeId: "e-1" as string | null };

vi.mock("@/lib/api/projects", () => ({
  projectsApi: { teamLeads: (...a: unknown[]) => teamLeads(...a) },
}));
vi.mock("@/lib/store/session", () => ({ useSession: () => session }));

const { useLeadsTeam } = await import("@/lib/store/team-tasks");
const { clearSharedResources } = await import("@/lib/shared-resource");

beforeEach(() => {
  clearSharedResources();
  teamLeads.mockReset();
  session = { isConnected: true, employeeId: "e-1" };
});

describe("useLeadsTeam", () => {
  it("is false until asked, then follows the answer", async () => {
    teamLeads.mockResolvedValue(true);
    const { result } = renderHook(() => useLeadsTeam(true));
    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
    expect(teamLeads).toHaveBeenCalledTimes(1);
  });

  it("asks again for another employee rather than inheriting the answer", async () => {
    teamLeads.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const first = renderHook(() => useLeadsTeam(true));
    await waitFor(() => expect(first.result.current).toBe(true));
    session = { isConnected: true, employeeId: "e-2" };
    const second = renderHook(() => useLeadsTeam(true));
    await waitFor(() => expect(teamLeads).toHaveBeenCalledTimes(2));
    expect(second.result.current).toBe(false);
  });

  it("reads a failure as false", async () => {
    teamLeads.mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useLeadsTeam(true));
    await waitFor(() => expect(teamLeads).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });

  it("does not ask when Projects is off", () => {
    renderHook(() => useLeadsTeam(false));
    expect(teamLeads).not.toHaveBeenCalled();
  });

  it("does not ask without a staff record", () => {
    session = { isConnected: true, employeeId: null };
    renderHook(() => useLeadsTeam(true));
    expect(teamLeads).not.toHaveBeenCalled();
  });
});
