import { describe, expect, it, vi } from "vitest";
import {
  CONFIRM_BATCH_LIMIT,
  connectFailureText,
  connectionIdOf,
  confirmInBatches,
  type ApiConfirmResult,
} from "@/lib/api/work-trackers";

/**
 * Three small rules the work-tracker screens lean on, each of which was wrong
 * once in a way the types could not see.
 */

describe("connectFailureText", () => {
  it("words each reason the API sends, and falls back to the generic line", () => {
    expect(connectFailureText("denied")).toMatch(/Nothing was connected/);
    expect(connectFailureText("expired")).toMatch(/ten minutes/);
    expect(connectFailureText(null)).toBe(connectFailureText("failed"));
    expect(connectFailureText("something-new")).toBe(
      connectFailureText("failed"),
    );
  });

  /* The reason is read from the address bar, so it can be anything. A plain
     object lookup also finds what every object inherits, and the toast then
     tries to render an object or a function. */
  it.each(["__proto__", "constructor", "toString", "hasOwnProperty"])(
    "does not answer %s with something it inherited",
    (reason) => {
      const text = connectFailureText(reason);
      expect(typeof text).toBe("string");
      expect(text).toBe(connectFailureText("failed"));
    },
  );
});

describe("connectionIdOf", () => {
  it("accepts a real id and refuses anything else", () => {
    const id = "3f2b6f0e-8c1d-4e0a-9b7a-1d2c3e4f5a6b";
    expect(connectionIdOf(id)).toBe(id);
    expect(connectionIdOf(null)).toBeNull();
    expect(connectionIdOf("../../people")).toBeNull();
    expect(connectionIdOf(`${id}/extra`)).toBeNull();
    expect(connectionIdOf("")).toBeNull();
  });
});

describe("confirmInBatches", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);
  const gradeAll = (batch: string[]): Promise<ApiConfirmResult> =>
    Promise.resolve({ graded: batch, skipped: [] });

  it("sends nothing it does not have to", async () => {
    const confirm = vi.fn(gradeAll);
    expect(await confirmInBatches(confirm, [])).toEqual({
      graded: [],
      skipped: [],
    });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("sends one request when everything fits, and never more than the API allows", async () => {
    const confirm = vi.fn(gradeAll);
    await confirmInBatches(confirm, ids(CONFIRM_BATCH_LIMIT));
    expect(confirm).toHaveBeenCalledTimes(1);

    confirm.mockClear();
    const result = await confirmInBatches(confirm, ids(450));
    expect(confirm.mock.calls.map(([batch]) => batch.length)).toEqual([
      200, 200, 50,
    ]);
    /* One answer, in the order asked, with nothing lost between batches. */
    expect(result.graded).toEqual(ids(450));
  });

  it("merges what each batch refused", async () => {
    const confirm = vi.fn((batch: string[]): Promise<ApiConfirmResult> =>
      Promise.resolve({
        graded: batch.slice(1),
        skipped: [{ id: batch[0]!, reason: "Not yours to grade." }],
      }),
    );
    const result = await confirmInBatches(confirm, ids(250));
    expect(result.skipped.map((s) => s.id)).toEqual(["t0", "t200"]);
    expect(result.graded).toHaveLength(248);
  });

  it("throws if the first batch fails, because nothing has changed", async () => {
    const confirm = vi.fn(() => Promise.reject(new Error("down")));
    await expect(confirmInBatches(confirm, ids(10))).rejects.toThrow("down");
  });

  it("reports the batches that never ran, rather than hiding the one that did", async () => {
    let call = 0;
    const confirm = vi.fn((batch: string[]) => {
      call += 1;
      return call === 1
        ? gradeAll(batch)
        : Promise.reject(new Error("The service is busy."));
    });
    const result = await confirmInBatches(confirm, ids(450));
    expect(result.graded).toHaveLength(200);
    expect(result.skipped).toHaveLength(250);
    expect(
      result.skipped.every((s) => s.reason === "The service is busy."),
    ).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(2);
  });
});
