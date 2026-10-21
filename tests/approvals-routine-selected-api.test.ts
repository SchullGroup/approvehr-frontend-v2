import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { SERVER_BEHIND, approvalsApi } from "@/lib/api/approvals";
import { ApiError } from "@/lib/api/client";

/**
 * The counted-ids route is the only way the screen approves in bulk.
 *
 * The old route decided "everything routine" on the server, which could be more
 * than the button had counted. An older server has no ids route and answers 404,
 * and falling back to the sweep there would be exactly the bug, so a 404 becomes
 * a sentence and one request.
 */

let request: Mock<(...args: unknown[]) => Promise<unknown>>;

vi.mock("@/lib/api/client", async (original) => {
  const real = await original<typeof import("@/lib/api/client")>();
  return {
    ...real,
    request: (...args: unknown[]) => request(...args),
    requestPaged: vi.fn(),
  };
});

beforeEach(() => {
  request = vi.fn();
});

describe("approvalsApi.approveSelected", () => {
  it("posts the ids it was given, to the ids route", async () => {
    request.mockResolvedValue({
      decided: 2,
      decidedIds: ["a", "b"],
      skipped: [],
    });

    const result = await approvalsApi.approveSelected(["a", "b"]);

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      "/approvals/approve-routine/selected",
      {
        method: "POST",
        body: { ids: ["a", "b"] },
      },
    );
    expect(result.decided).toBe(2);
  });

  it("turns a 404 into the version-behind sentence and never tries the sweep", async () => {
    request.mockRejectedValue(new ApiError(404, "not_found", "Not found."));

    const failure = await approvalsApi
      .approveSelected(["a"])
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).message).toBe(SERVER_BEHIND);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalledWith(
      "/approvals/approve-routine",
      expect.anything(),
    );
  });

  it("passes every other refusal through untouched", async () => {
    const refusal = new ApiError(403, "forbidden", "You cannot approve these.");
    request.mockRejectedValue(refusal);

    await expect(approvalsApi.approveSelected(["a"])).rejects.toBe(refusal);
  });

  it("no longer offers the whole-queue sweep at all", () => {
    expect("approveRoutine" in approvalsApi).toBe(false);
  });
});
