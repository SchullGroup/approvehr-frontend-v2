import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ApiError } from "@/lib/api/client";

/**
 * The write that starts a new version of a subsection, and what the store does with
 * it offline.
 *
 * Nothing about a path or a body is visible to `tsc` (both are strings and
 * objects), and the API refuses a wrong one in a way that looks like a bug in the
 * screen. The offline refusal matters for another reason: it retires one subsection
 * and creates another, and a framework change kept in one browser would reach no
 * period and move no mark.
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
const { useFrameworkActions } = await import("@/lib/store/performance");

beforeEach(() => {
  request = vi.fn().mockResolvedValue({});
  connected = true;
});

describe("performanceApi.newCompetencyVersion", () => {
  it("is a POST to the subsection's new-version route, carrying the way it is answered and nothing else", async () => {
    await performanceApi.newCompetencyVersion("comp-9", {
      answerKind: "BOOLEAN",
    });

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      "/performance/competencies/comp-9/new-version",
      { method: "POST", body: { answerKind: "BOOLEAN" } },
    );
  });

  it("hands back the new subsection, the one it retired and the API's own notes", async () => {
    const sent = {
      competency: { id: "comp-10", name: "Teamwork" },
      retired: { id: "comp-9", name: "Teamwork (retired)", ratingsKept: 12 },
      notes: ['"H2 2026 Appraisal" asks the new one.'],
    };
    request.mockResolvedValue(sent);

    await expect(
      performanceApi.newCompetencyVersion("comp-9", { answerKind: "RATING" }),
    ).resolves.toEqual(sent);
  });
});

describe("the framework actions, connected", () => {
  it("start a new version through the API wrapper, with the subsection and the way", async () => {
    const { result } = renderHook(() => useFrameworkActions());
    await result.current.newCompetencyVersion("comp-9", "CHOICE");

    expect(request).toHaveBeenCalledWith(
      "/performance/competencies/comp-9/new-version",
      { method: "POST", body: { answerKind: "CHOICE" } },
    );
  });

  it("let a refusal from the API through untouched, for the screen to say in the server's words", async () => {
    const refusal = new ApiError(
      409,
      "conflict",
      '"Teamwork" is asked on the review form of "H2 2026 Appraisal", which is running.',
    );
    request.mockRejectedValue(refusal);
    const { result } = renderHook(() => useFrameworkActions());

    await expect(
      result.current.newCompetencyVersion("comp-9", "RATING"),
    ).rejects.toBe(refusal);
  });
});

describe("the framework actions, offline", () => {
  it("refuse to start a new version, in a sentence, and never reach the API", async () => {
    connected = false;
    const { result } = renderHook(() => useFrameworkActions());

    const failure = await result.current
      .newCompetencyVersion("comp-9", "RATING")
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).message).toBe(
      "Starting a new version needs the API: the demo framework is fixed.",
    );
    expect(request).not.toHaveBeenCalled();
  });
});
