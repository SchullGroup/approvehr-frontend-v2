import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";

/**
 * Reading colleagues who shared a project, for the screens that order a list by them.
 *
 * What is proved: nothing is asked with no server, where the hook is quiet and not an error, or where the
 * company has not switched the setting on, or where the screen is not one that needs it; the answer is
 * read as the server said it and `null` stands for everything that is not an answer, so a screen can
 * never read "the server did not say" as "nobody shared a project"; and a different person is a different
 * question and is not shown the last one's answer. (Flags on finished work are `work-flags-store.test.tsx`.)
 */

const session = vi.hoisted(() => ({ isConnected: true }));
vi.mock("@/lib/store/session", () => ({ useSession: () => session }));
const feature = vi.hoisted(() => ({ workInAnswers: true as boolean | null }));
vi.mock("@/lib/store/features", () => ({
  useFeatureSettings: () => ({ workInAnswers: feature.workInAnswers }),
}));
const sharedRead = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/shared-projects", async (original) => ({
  ...(await original<typeof import("@/lib/api/shared-projects")>()),
  sharedProjectsApi: { read: sharedRead },
}));
const { useSharedProjects } = await import("@/lib/store/shared-projects");

beforeEach(() => {
  vi.clearAllMocks();
  session.isConnected = true;
  feature.workInAnswers = true;
});

describe("colleagues who shared a project", () => {
  const colleagues = [{ employeeId: "e2", name: "Ada", sharedProjects: 2 }];

  it("asks for this person, once, and reads the list", async () => {
    sharedRead.mockResolvedValue({ on: true, colleagues });
    const { result } = renderHook(() => useSharedProjects("e1", true));
    expect(result.current.loading).toBe(true);
    expect(result.current.colleagues).toBeNull();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.colleagues).toEqual(colleagues);
    expect(sharedRead).toHaveBeenCalledTimes(1);
    expect(sharedRead).toHaveBeenCalledWith("e1", expect.any(AbortSignal));
  });

  it("keeps an empty list as an empty list: nobody shared a project, which only 'on' may say", async () => {
    sharedRead.mockResolvedValue({ on: true, colleagues: [] });
    const { result } = renderHook(() => useSharedProjects("e1", true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.colleagues).toEqual([]);
  });

  it.each([
    ["the setting is off", { on: false }],
    ["the server answered something it cannot read", null],
  ])("is null, not an empty list, when %s", async (_why, answer) => {
    sharedRead.mockResolvedValue(answer);
    const { result } = renderHook(() => useSharedProjects("e1", true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.colleagues).toBeNull();
  });

  it("is null, not an empty list, when the reader is refused or the request fails", async () => {
    sharedRead.mockRejectedValue(
      new ApiError(404, "not_found", "That employee"),
    );
    const { result } = renderHook(() => useSharedProjects("e1", true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.colleagues).toBeNull();
  });

  it.each([
    [
      "it is not enabled",
      () => renderHook(() => useSharedProjects("e1", false)),
    ],
    [
      "there is no person",
      () => renderHook(() => useSharedProjects(null, true)),
    ],
  ])("does not ask when %s, and is quiet", (_why, run) => {
    const { result } = run();
    expect(result.current).toEqual({ colleagues: null, loading: false });
    expect(sharedRead).not.toHaveBeenCalled();
  });

  it("does not ask with no server, and is quiet about it", () => {
    session.isConnected = false;
    const { result } = renderHook(() => useSharedProjects("e1", true));
    expect(result.current).toEqual({ colleagues: null, loading: false });
    expect(sharedRead).not.toHaveBeenCalled();
  });

  it("is a different question for a different person, and is never shown the last answer", async () => {
    sharedRead.mockImplementation(async (id: string) => ({
      on: true,
      colleagues: [{ employeeId: `of-${id}`, name: id, sharedProjects: 1 }],
    }));
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useSharedProjects(id, true),
      { initialProps: { id: "e1" } },
    );
    await waitFor(() =>
      expect(result.current.colleagues?.[0]?.employeeId).toBe("of-e1"),
    );
    rerender({ id: "e2" });
    expect(result.current.colleagues).toBeNull();
    await waitFor(() =>
      expect(result.current.colleagues?.[0]?.employeeId).toBe("of-e2"),
    );
  });

  it("returns nothing once the screen stops asking, whatever it read before", async () => {
    sharedRead.mockResolvedValue({ on: true, colleagues });
    const { result, rerender } = renderHook(
      ({ on }: { on: boolean }) => useSharedProjects("e1", on),
      { initialProps: { on: true } },
    );
    await waitFor(() => expect(result.current.colleagues).toEqual(colleagues));
    rerender({ on: false });
    expect(result.current.colleagues).toBeNull();
  });
});
