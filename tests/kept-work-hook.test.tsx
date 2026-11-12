import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";

/**
 * Reading the work kept behind a final rating.
 *
 * What is proved: nothing is asked until the rating is final, and nothing at all is asked with no
 * server, where the hook is quiet and not an error; a different review is a different question and
 * is never shown the last one's answer; and a refusal reaches the screen as a refusal with data of
 * `null`, which the screen never reads as "none was kept".
 */

const session = vi.hoisted(() => ({ isConnected: true }));
vi.mock("@/lib/store/session", () => ({ useSession: () => session }));
const read = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/kept-work", () => ({ keptWorkApi: { read } }));

const { useKeptWork } = await import("@/lib/store/kept-work");

beforeEach(() => {
  vi.clearAllMocks();
  session.isConnected = true;
});

describe("when it is asked", () => {
  it("does not ask for a rating that is not final", () => {
    const { result } = renderHook(() => useKeptWork("r1", false));
    expect(result.current).toMatchObject({
      data: null,
      loading: false,
      error: null,
    });
    expect(read).not.toHaveBeenCalled();
  });

  it("does not ask with no server, and is quiet about it", () => {
    session.isConnected = false;
    const { result } = renderHook(() => useKeptWork("r1", true));
    expect(result.current).toMatchObject({
      data: null,
      loading: false,
      error: null,
    });
    expect(read).not.toHaveBeenCalled();
  });

  it("asks once, for this review, and reads what came back", async () => {
    read.mockResolvedValue({ state: "NOT_KEPT" });
    const { result } = renderHook(() => useKeptWork("r1", true));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ state: "NOT_KEPT" });
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith("r1", expect.any(AbortSignal));
  });
});

describe("switched off after it has read", () => {
  it("returns nothing, whatever it read before: a screen that stops asking must not keep showing the answer", async () => {
    read.mockResolvedValue({ state: "NOT_KEPT" });
    const { result, rerender } = renderHook(
      ({ on }: { on: boolean }) => useKeptWork("r1", on),
      { initialProps: { on: true } },
    );
    await waitFor(() =>
      expect(result.current.data).toEqual({ state: "NOT_KEPT" }),
    );
    rerender({ on: false });
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

describe("a different review", () => {
  it("is a different question: it asks again and is not shown the last answer", async () => {
    read.mockImplementation(async (id: string) =>
      id === "r1" ? { state: "NOT_KEPT" } : { state: "NOT_FINAL" },
    );
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useKeptWork(id, true),
      { initialProps: { id: "r1" } },
    );
    await waitFor(() =>
      expect(result.current.data).toEqual({ state: "NOT_KEPT" }),
    );

    rerender({ id: "r2" });
    /* In the instant between, it is loading and has no data, never r1's answer under r2. */
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);
    await waitFor(() =>
      expect(result.current.data).toEqual({ state: "NOT_FINAL" }),
    );
    expect(read).toHaveBeenCalledTimes(2);
  });
});

describe("a refusal", () => {
  it("is a refusal with no data, which is not the same as nothing having been kept", async () => {
    read.mockRejectedValue(
      new ApiError(404, "not_found", "That review was not found."),
    );
    const { result } = renderHook(() => useKeptWork("r1", true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error?.status).toBe(404);
  });
});
