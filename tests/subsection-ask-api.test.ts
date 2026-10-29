import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ApiError } from "@/lib/api/client";

/**
 * The two writes that put a directly rated subsection on a period's review form,
 * and what the store does with them offline.
 *
 * Nothing about a path or a body is visible to `tsc` (both are strings and
 * objects), and the API refuses a wrong one in a way that looks like a bug in the
 * screen. The store's offline refusal matters for another reason: a form sent in
 * a browser moves no mark anywhere, so a demo that let somebody ask a subsection
 * would show a choice that changes nothing.
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

describe("performanceApi.askSubsection", () => {
  it("is a PUT to the period's subsection-questions route for that subsection, carrying who is asked", async () => {
    await performanceApi.askSubsection("cycle-1", "comp-9", [
      "SELF",
      "MANAGER",
    ]);

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      "/performance/cycles/cycle-1/subsection-questions/comp-9",
      { method: "PUT", body: { askedOf: ["SELF", "MANAGER"] } },
    );
  });

  it("sends one audience as a list of one", async () => {
    await performanceApi.askSubsection("cycle-1", "comp-9", ["MANAGER"]);
    expect(request).toHaveBeenCalledWith(
      "/performance/cycles/cycle-1/subsection-questions/comp-9",
      { method: "PUT", body: { askedOf: ["MANAGER"] } },
    );
  });

  it("hands back the question the period now lists", async () => {
    request.mockResolvedValue({ id: "q-1", answersSubsection: true });
    const question = await performanceApi.askSubsection("c", "k", ["SELF"]);
    expect(question).toMatchObject({ id: "q-1", answersSubsection: true });
  });
});

describe("performanceApi.stopAskingSubsection", () => {
  it("is a DELETE of the same route, with no body", async () => {
    await performanceApi.stopAskingSubsection("cycle-1", "comp-9");

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      "/performance/cycles/cycle-1/subsection-questions/comp-9",
      { method: "DELETE" },
    );
  });
});

describe("the period mutations, connected", () => {
  it("ask for a subsection through the API wrapper, with the period and the subsection", async () => {
    const { result } = renderHook(() => useCycleMutations());
    await result.current.askSubsection("cycle-1", "comp-9", ["SELF"]);
    expect(request).toHaveBeenCalledWith(
      "/performance/cycles/cycle-1/subsection-questions/comp-9",
      { method: "PUT", body: { askedOf: ["SELF"] } },
    );
  });

  it("stop asking through the same route", async () => {
    const { result } = renderHook(() => useCycleMutations());
    await result.current.stopAskingSubsection("cycle-1", "comp-9");
    expect(request).toHaveBeenCalledWith(
      "/performance/cycles/cycle-1/subsection-questions/comp-9",
      { method: "DELETE" },
    );
  });

  it("let a refusal from the API through untouched, for the screen to say in the server's words", async () => {
    const refusal = new ApiError(409, "conflict", "H2 2026 has started.");
    request.mockRejectedValue(refusal);
    const { result } = renderHook(() => useCycleMutations());
    await expect(
      result.current.askSubsection("cycle-1", "comp-9", ["SELF"]),
    ).rejects.toBe(refusal);
  });
});

describe("the period mutations, offline", () => {
  it("refuse to ask a subsection, in the sentence every period write uses, and never reach the API", async () => {
    connected = false;
    const { result } = renderHook(() => useCycleMutations());

    const failure = await result.current
      .askSubsection("cycle-1", "comp-9", ["SELF"])
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).message).toBe(
      "Asking a subsection on the review form needs the API.",
    );
    expect(request).not.toHaveBeenCalled();
  });

  it("refuse to stop asking one, and never reach the API", async () => {
    connected = false;
    const { result } = renderHook(() => useCycleMutations());

    const failure = await result.current
      .stopAskingSubsection("cycle-1", "comp-9")
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).message).toBe(
      "Taking a subsection off the review form needs the API.",
    );
    expect(request).not.toHaveBeenCalled();
  });
});
