import { StrictMode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";

/**
 * The completed-work reads, connected: one request each (also under StrictMode,
 * which asks twice), a page at a time, nothing from the last period shown under
 * the next, and a bulk link that reports each task's own answer.
 */

let session = {
  isConnected: true,
  isLoading: false,
  actingId: "me" as string | null,
  employeeId: "me" as string | null,
};
vi.mock("@/lib/store/session", () => ({
  useSession: () => session,
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/permissions", () => ({ useCan: () => false }));
vi.mock("@/lib/store/employees", () => ({
  useEmployeeStore: () => ({ directory: [] }),
}));
vi.mock("@/lib/store/performance", () => ({
  useDemoObjectives: () => [],
  demoCyclePeriod: () => null,
}));
vi.mock("@/lib/store/projects", () => ({
  useDemoBook: () => ({ projects: {} }),
  demoRun: vi.fn(),
}));

const teamCompleted = vi.fn();
const workForCycle = vi.fn();
const completedWork = vi.fn();
vi.mock("@/lib/api/completions", async (original) => ({
  ...(await original<typeof import("@/lib/api/completions")>()),
  completionsApi: {
    teamCompleted: (...a: unknown[]) => teamCompleted(...a),
    workForCycle: (...a: unknown[]) => workForCycle(...a),
    completedWork: (...a: unknown[]) => completedWork(...a),
  },
}));

const bulkObjective = vi.fn();
vi.mock("@/lib/api/projects", async (original) => ({
  ...(await original<typeof import("@/lib/api/projects")>()),
  projectsApi: { bulkObjective: (...a: unknown[]) => bulkObjective(...a) },
}));

const { useBulkLink, useCompletedWork, useTeamCompleted, useWorkThisCycle } =
  await import("@/lib/store/completions");

const row = (id: string, personId: string, name: string) => ({
  id,
  key: id.toUpperCase(),
  title: `Task ${id}`,
  projectId: "p1",
  projectName: "Payroll",
  personal: false,
  personId,
  personName: name,
  doneAt: "2026-10-12T10:00:00.000Z",
  doneDay: "2026-10-12",
  dueDate: null,
  onTime: null,
  objective: {
    state: "UNLINKED" as const,
    source: null,
    goalId: null,
    title: null,
    level: null,
    keyResultId: null,
    keyResultTitle: null,
    visible: true,
    message: "Not linked to an objective",
  },
  jobTitle: "Analyst",
  departmentName: null,
  totals: { finished: 3, withDueDate: 0, onTime: 0, late: 0, linked: 0 },
});

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  session = {
    isConnected: true,
    isLoading: false,
    actingId: "me",
    employeeId: "me",
  };
  teamCompleted.mockReset();
  workForCycle.mockReset();
  completedWork.mockReset();
  bulkObjective.mockReset();
});

describe("the manager's Completed view, connected", () => {
  it("asks once for the first page, also under StrictMode", async () => {
    teamCompleted.mockResolvedValue({
      rows: [row("a", "bola", "Bola")],
      total: 1,
      next: null,
    });
    const { result } = renderHook(
      () => useTeamCompleted("week", "2026-11-04"),
      {
        wrapper: StrictMode,
      },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(teamCompleted).toHaveBeenCalledTimes(1);
    expect(teamCompleted).toHaveBeenCalledWith({
      period: "week",
      date: "2026-11-04",
      cursor: null,
      limit: 50,
    });
    expect(result.current.people.map((p) => p.employee.name)).toEqual(["Bola"]);
  });

  it("asks for one person, and starts again from the first page when the person changes", async () => {
    teamCompleted.mockResolvedValue({
      rows: [row("a", "bola", "Bola")],
      total: 1,
      next: null,
    });
    const { result, rerender } = renderHook(
      ({ who }: { who: string | null }) =>
        useTeamCompleted("week", "2026-11-04", who),
      { initialProps: { who: null as string | null } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender({ who: "emp-7" });
    await waitFor(() => expect(teamCompleted).toHaveBeenCalledTimes(2));
    expect(teamCompleted).toHaveBeenLastCalledWith({
      period: "week",
      date: "2026-11-04",
      employeeId: "emp-7",
      cursor: null,
      limit: 50,
    });
  });

  it("shows nothing while loading: no people, no count", async () => {
    let finish: (value: unknown) => void = () => undefined;
    teamCompleted.mockReturnValue(new Promise((r) => (finish = r)));
    const { result } = renderHook(() => useTeamCompleted("week", "2026-11-04"));
    expect(result.current.loading).toBe(true);
    expect(result.current.people).toEqual([]);
    expect(result.current.total).toBeNull();
    await act(async () => {
      finish({ rows: [], total: 0, next: null });
      await wait();
    });
    expect(result.current.loading).toBe(false);
  });

  it("walks the pages by the marker the API gave, once each, also under StrictMode", async () => {
    teamCompleted
      .mockResolvedValueOnce({
        rows: [row("a", "bola", "Bola"), row("b", "bola", "Bola")],
        total: 3,
        next: "m1",
      })
      .mockResolvedValueOnce({
        rows: [row("c", "bola", "Bola")],
        total: 3,
        next: null,
      });
    const { result } = renderHook(
      () => useTeamCompleted("week", "2026-11-04"),
      {
        wrapper: StrictMode,
      },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasMore).toBe(true);
    expect(result.current.shown).toBe(2);
    expect(result.current.total).toBe(3);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.shown).toBe(3));
    expect(teamCompleted).toHaveBeenCalledTimes(2);
    expect(teamCompleted).toHaveBeenLastCalledWith({
      period: "week",
      date: "2026-11-04",
      cursor: "m1",
      limit: 50,
    });
    expect(result.current.hasMore).toBe(false);
    /* Cut across two pages, still one person. */
    expect(result.current.people).toHaveLength(1);
    expect(result.current.people[0]!.items).toHaveLength(3);
  });

  it("starts a new list for a new period and does not show the old one under it", async () => {
    teamCompleted.mockResolvedValueOnce({
      rows: [row("a", "bola", "Bola")],
      total: 1,
      next: null,
    });
    const { result, rerender } = renderHook(
      ({ anchor }) => useTeamCompleted("week", anchor),
      { initialProps: { anchor: "2026-11-04" } },
    );
    await waitFor(() => expect(result.current.people).toHaveLength(1));

    let finish: (value: unknown) => void = () => undefined;
    teamCompleted.mockReturnValueOnce(new Promise((r) => (finish = r)));
    rerender({ anchor: "2026-10-28" });
    /* While the earlier week's answer is on its way, nothing of the old one. */
    expect(result.current.people).toEqual([]);
    expect(result.current.loading).toBe(true);
    await act(async () => {
      finish({ rows: [row("z", "chi", "Chi")], total: 1, next: null });
      await wait();
    });
    expect(result.current.people.map((p) => p.employee.name)).toEqual(["Chi"]);
  });

  it("says a failure and keeps no stale list behind it", async () => {
    teamCompleted.mockRejectedValue(new ApiError(500, "boom", "It broke."));
    const { result } = renderHook(() => useTeamCompleted("week", "2026-11-04"));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.people).toEqual([]);
  });

  it("asks nothing in the demo", async () => {
    session = { ...session, isConnected: false };
    renderHook(() => useTeamCompleted("week", "2026-11-04"));
    await wait(5);
    expect(teamCompleted).not.toHaveBeenCalled();
  });
});

describe("work inside a review, connected", () => {
  const args = {
    subjectId: "bola",
    cycleId: "c1",
    periodStart: "2026-07-01",
    periodEnd: "2026-12-31",
    enabled: true,
  };

  it("asks once for the person and the cycle, also under StrictMode", async () => {
    workForCycle.mockResolvedValue({ summary: { finished: 0 }, items: [] });
    const { result } = renderHook(() => useWorkThisCycle(args), {
      wrapper: StrictMode,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(workForCycle).toHaveBeenCalledTimes(1);
    expect(workForCycle).toHaveBeenCalledWith("c1", "bola", { limit: 50 });
  });

  it("asks nothing until it is enabled, and gives no data meanwhile", async () => {
    const { result } = renderHook(() =>
      useWorkThisCycle({ ...args, enabled: false }),
    );
    await wait(5);
    expect(workForCycle).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ data: null, loading: false });
  });

  it("hands back nothing for a cycle with no dates", async () => {
    workForCycle.mockResolvedValue(null);
    const { result } = renderHook(() => useWorkThisCycle(args));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("passes the API's 404 on, so the panel is drawn as nothing", async () => {
    workForCycle.mockRejectedValue(
      new ApiError(404, "not_found", "That employee could not be found."),
    );
    const { result } = renderHook(() => useWorkThisCycle(args));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error!.status).toBe(404);
  });
});

describe("completed work under an objective, connected", () => {
  const goal = {
    id: "g1",
    ownerId: "bola",
    parentId: null,
    level: "personal" as const,
    reviewCycleId: null,
  };

  it("asks nothing until it is wanted", async () => {
    renderHook(() => useCompletedWork({ goal, enabled: false }));
    await wait(5);
    expect(completedWork).not.toHaveBeenCalled();
  });

  it("asks once when wanted, also under StrictMode", async () => {
    completedWork.mockResolvedValue({ groups: [], total: 0, capped: false });
    const { result } = renderHook(
      () => useCompletedWork({ goal, enabled: true }),
      {
        wrapper: StrictMode,
      },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(completedWork).toHaveBeenCalledTimes(1);
    expect(completedWork).toHaveBeenCalledWith("g1", { limit: 100 });
  });
});

describe("linking many tasks at once, connected", () => {
  const tasks = [
    { id: "a", key: "PRF-1", personId: "bola" },
    { id: "b", key: "PRF-2", personId: "bola" },
    { id: "c", key: "PRF-3", personId: "chi" },
  ];

  it("sends the tasks and the target in one request and reads each task's own answer", async () => {
    bulkObjective.mockResolvedValue({
      items: [
        { issueId: "a", key: "PRF-1", result: "linked", message: null },
        {
          issueId: "b",
          key: null,
          result: "refused",
          message: "Only the people this task is assigned to can link it.",
        },
        { issueId: "c", key: null, result: "not_found", message: null },
      ],
    });
    const { result } = renderHook(() => useBulkLink());
    let answer: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      answer = await result.current(tasks, { goalId: "g1", keyResultId: null });
    });
    expect(bulkObjective).toHaveBeenCalledTimes(1);
    expect(bulkObjective).toHaveBeenCalledWith({
      issueIds: ["a", "b", "c"],
      goalId: "g1",
      keyResultId: null,
    });
    expect(answer!.changed).toBe(1);
    expect(answer!.failed.map((f) => f.key)).toEqual(["PRF-2", "PRF-3"]);
    expect(answer!.failed[0]!.reason).toContain("can link it");
  });

  it("counts a task that already had the link as done, not as a failure", async () => {
    bulkObjective.mockResolvedValue({
      items: [
        { issueId: "a", key: "PRF-1", result: "unchanged", message: null },
        { issueId: "b", key: "PRF-2", result: "cleared", message: null },
      ],
    });
    const { result } = renderHook(() => useBulkLink());
    let answer: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      answer = await result.current(tasks.slice(0, 2), null);
    });
    expect(answer).toEqual({ changed: 2, failed: [] });
    expect(bulkObjective).toHaveBeenCalledWith({
      issueIds: ["a", "b"],
      goalId: null,
      keyResultId: null,
    });
  });

  it("says the same plain thing for every task when the objective itself was refused", async () => {
    bulkObjective.mockRejectedValue(
      new ApiError(422, "unprocessable", "That objective could not be found."),
    );
    const { result } = renderHook(() => useBulkLink());
    let answer: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      answer = await result.current(tasks, {
        goalId: "nope",
        keyResultId: null,
      });
    });
    expect(answer!.changed).toBe(0);
    expect(answer!.failed).toHaveLength(3);
    expect(
      answer!.failed.every(
        (f) => f.reason === "That objective could not be found.",
      ),
    ).toBe(true);
  });

  it("takes at most a hundred tasks at once", async () => {
    bulkObjective.mockResolvedValue({ items: [] });
    const many = Array.from({ length: 130 }, (_, i) => ({
      id: `t${i}`,
      key: `K-${i}`,
      personId: "bola",
    }));
    const { result } = renderHook(() => useBulkLink());
    await act(async () => {
      await result.current(many, null);
    });
    expect(bulkObjective.mock.calls[0]![0].issueIds).toHaveLength(100);
  });
});
