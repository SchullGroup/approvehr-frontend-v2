import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { clearSharedResources } from "@/lib/shared-resource";

/**
 * The flags on a person's finished work, as every panel that draws them reads and writes them.
 *
 * What is proved: the answer is asked for whenever the server has said what the setting is, **off
 * included**, because a flag written while it was on stays drawn once it is off; `flags` is a map only
 * when the server sent a list, and `null` (no claim, never "nothing was flagged") for a server that sent
 * none, an answer that cannot be read, a refusal, or no server; `on` is only whether one can be raised;
 * two panels are one read and one state, so a flag raised in one is in the other at once; and **a write
 * never blanks the screen**: the server's own reply goes into the shared answer, a reply that cannot be
 * read falls back to a quiet read, and a re-read (a screen mounting again, the window returned to)
 * replaces the answer when it lands and never empties it first, and one that fails changes nothing.
 */

const session = vi.hoisted(() => ({ isConnected: true }));
vi.mock("@/lib/store/session", () => ({ useSession: () => session }));
const feature = vi.hoisted(() => ({ workInAnswers: true as boolean | null }));
vi.mock("@/lib/store/features", () => ({
  useFeatureSettings: () => ({ workInAnswers: feature.workInAnswers }),
}));
/* The window being returned to, as a number a test can move. */
const rev = vi.hoisted(() => ({ n: 0 }));
vi.mock("@/lib/revalidate", () => ({ useRevalidation: () => rev.n }));
const api = vi.hoisted(() => ({
  read: vi.fn(),
  flag: vi.fn(),
  unflag: vi.fn(),
}));
vi.mock("@/lib/api/work-flags", async (original) => ({
  ...(await original<typeof import("@/lib/api/work-flags")>()),
  workFlagsApi: api,
}));

const { useWorkFlags } = await import("@/lib/store/work-flags");

const one = {
  issueId: "i1",
  key: "PLT-1",
  reason: "Not mine",
  flaggedAt: "2026-11-06T09:00:00.000Z",
};
const two = {
  issueId: "i2",
  key: "PLT-2",
  reason: "Wrong day",
  flaggedAt: "2026-11-07T09:00:00.000Z",
};
const args = { cycleId: "c1", subjectId: "e1", enabled: true };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Every `flags.size` the hook has shown, in order: `null` for no claim. */
function watched(over: Partial<typeof args> = {}) {
  const seen: (number | null)[] = [];
  const view = renderHook(() => {
    const read = useWorkFlags({ ...args, ...over });
    seen.push(read.flags === null ? null : read.flags.size);
    return read;
  });
  return { ...view, seen };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearSharedResources();
  session.isConnected = true;
  feature.workInAnswers = true;
  rev.n = 0;
});

describe("what it asks, and when", () => {
  it("asks for this person and cycle once the server has said what the setting is, and reads the flags by task", async () => {
    api.read.mockResolvedValue({ on: true, flags: [one] });
    const { result } = renderHook(() => useWorkFlags(args));
    expect(result.current.on).toBe(false);
    expect(result.current.flags).toBeNull();
    await waitFor(() => expect(result.current.on).toBe(true));
    expect(result.current.flags?.get("i1")).toEqual(one);
    expect(api.read).toHaveBeenCalledWith("c1", "e1", undefined);
  });

  it("asks when the setting is off too, because what was written is still drawn, and says a flag cannot be raised", async () => {
    feature.workInAnswers = false;
    api.read.mockResolvedValue({ on: false, flags: [one] });
    const { result } = renderHook(() => useWorkFlags(args));
    await waitFor(() => expect(result.current.flags).not.toBeNull());
    expect(api.read).toHaveBeenCalledTimes(1);
    expect(result.current.on).toBe(false);
    expect(result.current.flags?.get("i1")).toEqual(one);
  });

  it("is one request for a first mount: nothing is held yet, so the quiet second read does not fire", async () => {
    api.read.mockResolvedValue({ on: true, flags: [] });
    const { result } = renderHook(() => useWorkFlags(args));
    await waitFor(() => expect(result.current.on).toBe(true));
    expect(api.read).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["this server does not say what the setting is", { workInAnswers: null }],
    ["the panel is not one that is shown", { enabled: false }],
    ["the cycle has no id", { cycleId: null }],
  ])("asks nothing when %s", (_why, over) => {
    if ("workInAnswers" in over) feature.workInAnswers = over.workInAnswers;
    const { result } = renderHook(() =>
      useWorkFlags({
        ...args,
        ...("enabled" in over ? { enabled: over.enabled } : {}),
        ...("cycleId" in over ? { cycleId: over.cycleId } : {}),
      }),
    );
    expect(api.read).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ on: false, flags: null });
  });

  it("asks nothing with no server", () => {
    session.isConnected = false;
    const { result } = renderHook(() => useWorkFlags(args));
    expect(api.read).not.toHaveBeenCalled();
    expect(result.current.flags).toBeNull();
  });

  it("stops saying anything once the panel stops asking, whatever it read before", async () => {
    api.read.mockResolvedValue({ on: true, flags: [one] });
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useWorkFlags({ ...args, enabled }),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(result.current.on).toBe(true));
    rerender({ enabled: false });
    expect(result.current).toMatchObject({ on: false, flags: null });
  });
});

describe("what it says", () => {
  it("keeps an empty list as an empty list: nothing was flagged, which only a list may say", async () => {
    api.read.mockResolvedValue({ on: true, flags: [] });
    const { result } = renderHook(() => useWorkFlags(args));
    await waitFor(() => expect(result.current.flags).not.toBeNull());
    expect(result.current.flags?.size).toBe(0);
  });

  it.each([
    ["a server one deploy behind, which sends no list", false],
    ["an answer with no list while on", true],
  ])("says nothing about flags for %s: null, never empty", async (_why, on) => {
    /* The wire reader has already turned a missing list into `null` (see shared-projects-api.test). */
    api.read.mockResolvedValue({ on, flags: null });
    const { result } = renderHook(() => useWorkFlags(args));
    await waitFor(() => expect(api.read).toHaveBeenCalled());
    await waitFor(() => expect(result.current.on).toBe(on));
    expect(result.current.flags).toBeNull();
  });

  it.each([
    ["an answer that cannot be read", null],
    ["a reader the server refuses", new ApiError(404, "not_found", "No")],
  ])("says nothing for %s", async (_why, outcome) => {
    if (outcome instanceof Error) api.read.mockRejectedValue(outcome);
    else api.read.mockResolvedValue(outcome);
    const { result } = renderHook(() => useWorkFlags(args));
    await waitFor(() => expect(api.read).toHaveBeenCalled());
    expect(result.current).toMatchObject({ on: false, flags: null });
  });
});

describe("one state for every panel", () => {
  it("is one read for two panels on one page", async () => {
    api.read.mockResolvedValue({ on: true, flags: [one] });
    const first = renderHook(() => useWorkFlags(args));
    const second = renderHook(() => useWorkFlags(args));
    await waitFor(() => expect(first.result.current.on).toBe(true));
    await waitFor(() => expect(second.result.current.on).toBe(true));
    expect(api.read).toHaveBeenCalledTimes(1);
  });

  it("puts a flag raised in one panel in the other at once, with no read of its own", async () => {
    api.read.mockResolvedValue({ on: true, flags: [] });
    api.flag.mockResolvedValue(one);
    const live = renderHook(() => useWorkFlags(args));
    const kept = renderHook(() => useWorkFlags(args));
    await waitFor(() => expect(kept.result.current.on).toBe(true));
    await act(async () => {
      await live.result.current.flag("i1", "Not mine");
    });
    expect(kept.result.current.flags?.get("i1")).toEqual(one);
    expect(live.result.current.flags?.get("i1")).toEqual(one);
    expect(api.read).toHaveBeenCalledTimes(1);
  });

  it("takes a flag back from both panels at once", async () => {
    api.read.mockResolvedValue({ on: true, flags: [one] });
    api.unflag.mockResolvedValue(undefined);
    const live = renderHook(() => useWorkFlags(args));
    const kept = renderHook(() => useWorkFlags(args));
    await waitFor(() => expect(kept.result.current.flags?.size).toBe(1));
    await act(async () => {
      await kept.result.current.unflag("i1");
    });
    expect(live.result.current.flags?.size).toBe(0);
    expect(kept.result.current.flags?.size).toBe(0);
  });

  it("is a different answer for a different person or cycle", async () => {
    api.read.mockImplementation(async (cycle: string, person: string) => ({
      on: true,
      flags: [{ ...one, issueId: `${cycle}-${person}` }],
    }));
    const { result, rerender } = renderHook(
      ({ subjectId }: { subjectId: string }) =>
        useWorkFlags({ ...args, subjectId }),
      { initialProps: { subjectId: "e1" } },
    );
    await waitFor(() => expect(result.current.flags?.has("c1-e1")).toBe(true));
    rerender({ subjectId: "e2" });
    expect(result.current.flags).toBeNull();
    await waitFor(() => expect(result.current.flags?.has("c1-e2")).toBe(true));
  });
});

describe("a write never blanks the screen", () => {
  it("writes the server's own reply into the answer, and shows the old one until it does", async () => {
    api.read.mockResolvedValue({ on: true, flags: [one] });
    const write = deferred<typeof two>();
    api.flag.mockReturnValue(write.promise);
    const { result, seen } = watched();
    await waitFor(() => expect(result.current.flags?.size).toBe(1));

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.flag("i2", "Wrong day");
    });
    /* In flight: nothing has gone. */
    expect(result.current.on).toBe(true);
    expect(result.current.flags?.get("i1")).toEqual(one);
    await act(async () => {
      write.resolve(two);
      await pending;
    });
    expect(result.current.flags?.get("i2")).toEqual(two);
    expect(result.current.flags?.get("i1")).toEqual(one);
    expect(api.flag).toHaveBeenCalledWith("c1", "e1", "i2", "Wrong day");
    expect(api.read).toHaveBeenCalledTimes(1);
    /* And at no render was the answer taken away. */
    expect(seen.slice(seen.indexOf(1))).not.toContain(null);
  });

  it("replaces a flag that was changed, once, with the server's wording", async () => {
    api.read.mockResolvedValue({ on: true, flags: [one] });
    api.flag.mockResolvedValue({ ...one, reason: "Changed my mind" });
    const { result } = watched();
    await waitFor(() => expect(result.current.flags?.size).toBe(1));
    await act(async () => {
      await result.current.flag("i1", "Changed my mind");
    });
    expect(result.current.flags?.size).toBe(1);
    expect(result.current.flags?.get("i1")?.reason).toBe("Changed my mind");
  });

  it("proves a flag can be raised by having one accepted, even if the answer it held said otherwise", async () => {
    api.read.mockResolvedValue({ on: false, flags: [] });
    api.flag.mockResolvedValue(one);
    const { result } = renderHook(() => useWorkFlags(args));
    await waitFor(() => expect(result.current.flags).not.toBeNull());
    expect(result.current.on).toBe(false);
    await act(async () => {
      await result.current.flag("i1", "Not mine");
    });
    expect(result.current.on).toBe(true);
  });

  it("falls back to a quiet read when the reply cannot be read, and holds the old answer while it is out", async () => {
    api.read.mockResolvedValueOnce({ on: true, flags: [] });
    api.flag.mockResolvedValue(null);
    const second = deferred<{ on: boolean; flags: (typeof one)[] }>();
    api.read.mockReturnValueOnce(second.promise);
    const { result, seen } = watched();
    await waitFor(() => expect(result.current.on).toBe(true));

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.flag("i1", "Not mine");
    });
    await waitFor(() => expect(api.read).toHaveBeenCalledTimes(2));
    /* The read is out: the answer is still the old one, not nothing. */
    expect(result.current.on).toBe(true);
    expect(result.current.flags?.size).toBe(0);
    await act(async () => {
      second.resolve({ on: true, flags: [one] });
      await pending;
    });
    expect(result.current.flags?.get("i1")).toEqual(one);
    expect(seen.slice(seen.indexOf(0))).not.toContain(null);
  });

  it("does not fail a write the server accepted because the quiet read after it failed, and invents nothing", async () => {
    api.read.mockResolvedValueOnce({ on: true, flags: [] });
    api.flag.mockResolvedValue(null);
    api.read.mockRejectedValueOnce(new ApiError(500, "internal", "Internal"));
    const { result } = renderHook(() => useWorkFlags(args));
    await waitFor(() => expect(result.current.on).toBe(true));
    await act(async () => {
      await expect(
        result.current.flag("i1", "Not mine"),
      ).resolves.toBeUndefined();
    });
    expect(api.read).toHaveBeenCalledTimes(2);
    /* The flag was written and cannot be read back: nothing is drawn that this side was not told. */
    expect(result.current.on).toBe(true);
    expect(result.current.flags?.size).toBe(0);
  });

  it("takes a flag back by removing it, with no read of its own", async () => {
    api.read.mockResolvedValue({ on: true, flags: [one, two] });
    api.unflag.mockResolvedValue(undefined);
    const { result, seen } = watched();
    await waitFor(() => expect(result.current.flags?.size).toBe(2));
    await act(async () => {
      await result.current.unflag("i1");
    });
    expect(api.unflag).toHaveBeenCalledWith("c1", "e1", "i1");
    expect(result.current.flags?.has("i1")).toBe(false);
    expect(result.current.flags?.has("i2")).toBe(true);
    expect(api.read).toHaveBeenCalledTimes(1);
    expect(seen.slice(seen.indexOf(2))).not.toContain(null);
  });

  it("treats a take-back the server answers with not found as done: the flag was already gone", async () => {
    api.read.mockResolvedValue({ on: true, flags: [one, two] });
    api.unflag.mockRejectedValue(
      new ApiError(404, "not_found", "That flag was not found."),
    );
    const { result, seen } = watched();
    await waitFor(() => expect(result.current.flags?.size).toBe(2));
    await act(async () => {
      /* Taken back in another tab or window: what was asked for has already happened. */
      await expect(result.current.unflag("i1")).resolves.toBeUndefined();
    });
    expect(api.unflag).toHaveBeenCalledWith("c1", "e1", "i1");
    expect(result.current.flags?.has("i1")).toBe(false);
    expect(result.current.flags?.has("i2")).toBe(true);
    expect(api.read).toHaveBeenCalledTimes(1);
    expect(seen.slice(seen.indexOf(2))).not.toContain(null);
  });

  it.each([
    ["a refusal", new ApiError(409, "conflict", "This review has been sent.")],
    ["a server fault", new ApiError(500, "internal", "Something went wrong.")],
    [
      "a forbidden",
      new ApiError(403, "forbidden", "That is not yours to change."),
    ],
    ["a dropped connection", new Error("Failed to fetch")],
  ])("still throws for %s, and keeps the flag", async (_why, failure) => {
    api.read.mockResolvedValue({ on: true, flags: [one] });
    api.unflag.mockRejectedValue(failure);
    const { result } = renderHook(() => useWorkFlags(args));
    await waitFor(() => expect(result.current.flags?.size).toBe(1));
    await act(async () => {
      await expect(result.current.unflag("i1")).rejects.toBe(failure);
    });
    expect(result.current.flags?.has("i1")).toBe(true);
  });

  it("takes a flag back while the setting is off, and leaves `on` as the server said it", async () => {
    feature.workInAnswers = false;
    api.read.mockResolvedValue({ on: false, flags: [one] });
    api.unflag.mockResolvedValue(undefined);
    const { result } = renderHook(() => useWorkFlags(args));
    await waitFor(() => expect(result.current.flags?.size).toBe(1));
    await act(async () => {
      await result.current.unflag("i1");
    });
    expect(result.current.flags?.size).toBe(0);
    expect(result.current.on).toBe(false);
  });

  it("throws the server's refusal, changes nothing and reads nothing for a write that did not happen", async () => {
    api.read.mockResolvedValue({ on: true, flags: [one] });
    api.flag.mockRejectedValue(new ApiError(422, "unprocessable", "Nope."));
    const { result } = renderHook(() => useWorkFlags(args));
    await waitFor(() => expect(result.current.flags?.size).toBe(1));
    await act(async () => {
      await expect(result.current.flag("i2", "Wrong day")).rejects.toThrow(
        "Nope.",
      );
    });
    expect(result.current.flags?.size).toBe(1);
    expect(api.read).toHaveBeenCalledTimes(1);
  });
});

describe("a quiet read replaces the answer and never empties it", () => {
  it("shows what an earlier visit held at once, asks again, and keeps it until the fresh one lands", async () => {
    api.read.mockResolvedValueOnce({ on: true, flags: [one] });
    const first = renderHook(() => useWorkFlags(args));
    await waitFor(() => expect(first.result.current.flags?.size).toBe(1));
    first.unmount();

    const fresh = deferred<{ on: boolean; flags: (typeof one)[] }>();
    api.read.mockReturnValueOnce(fresh.promise);
    const { result, seen } = watched();
    /* On the very first render: what was held, not a blank. */
    expect(seen[0]).toBe(1);
    await waitFor(() => expect(api.read).toHaveBeenCalledTimes(2));
    expect(result.current.flags?.size).toBe(1);
    await act(async () => {
      fresh.resolve({ on: true, flags: [one, two] });
    });
    await waitFor(() => expect(result.current.flags?.size).toBe(2));
    expect(seen).not.toContain(null);
  });

  it("asks again, once however many panels are mounted, when the window is returned to", async () => {
    api.read.mockResolvedValue({ on: true, flags: [one] });
    const live = renderHook(() => useWorkFlags(args));
    const kept = renderHook(() => useWorkFlags(args));
    await waitFor(() => expect(kept.result.current.flags?.size).toBe(1));
    expect(api.read).toHaveBeenCalledTimes(1);

    const fresh = deferred<{ on: boolean; flags: (typeof one)[] }>();
    api.read.mockReturnValue(fresh.promise);
    rev.n += 1;
    live.rerender();
    kept.rerender();
    await waitFor(() => expect(api.read).toHaveBeenCalledTimes(2));
    expect(live.result.current.flags?.size).toBe(1);
    await act(async () => {
      fresh.resolve({ on: true, flags: [] });
    });
    await waitFor(() => expect(live.result.current.flags?.size).toBe(0));
    expect(kept.result.current.flags?.size).toBe(0);
    expect(api.read).toHaveBeenCalledTimes(2);
  });

  it("keeps what it holds when the quiet read fails or cannot be read", async () => {
    api.read.mockResolvedValue({ on: true, flags: [one] });
    const { result, rerender } = renderHook(() => useWorkFlags(args));
    await waitFor(() => expect(result.current.flags?.size).toBe(1));

    api.read.mockRejectedValue(new ApiError(500, "internal", "Internal"));
    rev.n += 1;
    rerender();
    await waitFor(() => expect(api.read).toHaveBeenCalledTimes(2));
    expect(result.current.flags?.size).toBe(1);

    api.read.mockResolvedValue(null);
    rev.n += 1;
    rerender();
    await waitFor(() => expect(api.read).toHaveBeenCalledTimes(3));
    expect(result.current).toMatchObject({ on: true });
    expect(result.current.flags?.size).toBe(1);
  });
});
