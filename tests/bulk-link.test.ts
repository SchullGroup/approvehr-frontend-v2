import { describe, expect, it } from "vitest";
import {
  BULK_LINK_LIMIT,
  bulkLinkLine,
  runBulkLink,
  type BulkItem,
} from "@/lib/projects/bulk-link";

/**
 * Linking or clearing many tasks at once: one change per task, a few at a time,
 * and an answer that says only what happened, task by task.
 */

const tasks = (n: number): BulkItem[] =>
  Array.from({ length: n }, (_, i) => ({ id: `t${i}`, key: `K-${i}` }));

describe("running a bulk link", () => {
  it("changes every task once and counts them", async () => {
    const seen: string[] = [];
    const result = await runBulkLink(tasks(5), async (item) => {
      seen.push(item.id);
      return { ok: true };
    });
    expect(result).toEqual({ changed: 5, failed: [] });
    expect(seen.sort()).toEqual(["t0", "t1", "t2", "t3", "t4"]);
  });

  it("never stops at the first failure, and lists each with its own reason, in the order picked", async () => {
    const result = await runBulkLink(tasks(5), async (item) => {
      /* The later ones finish first, to prove order is the order picked. */
      await new Promise((r) => setTimeout(r, 5 - Number(item.id.slice(1))));
      return item.id === "t1" || item.id === "t3"
        ? { ok: false, message: `${item.key} is somebody else's` }
        : { ok: true };
    });
    expect(result.changed).toBe(3);
    expect(result.failed).toEqual([
      { id: "t1", key: "K-1", reason: "K-1 is somebody else's" },
      { id: "t3", key: "K-3", reason: "K-3 is somebody else's" },
    ]);
  });

  it("asks for no more than three at a time", async () => {
    let live = 0;
    let most = 0;
    await runBulkLink(tasks(12), async () => {
      live += 1;
      most = Math.max(most, live);
      await new Promise((r) => setTimeout(r, 2));
      live -= 1;
      return { ok: true };
    });
    expect(most).toBeLessThanOrEqual(3);
    expect(most).toBeGreaterThan(1);
  });

  it("takes at most a hundred", async () => {
    let n = 0;
    const result = await runBulkLink(tasks(130), async () => {
      n += 1;
      return { ok: true };
    });
    expect(BULK_LINK_LIMIT).toBe(100);
    expect(n).toBe(100);
    expect(result.changed).toBe(100);
  });

  it("reads a change that threw as that task not changing, in plain words", async () => {
    const result = await runBulkLink(tasks(2), async (item) => {
      if (item.id === "t0") throw new Error("socket hang up");
      return { ok: true };
    });
    expect(result.changed).toBe(1);
    expect(result.failed).toEqual([
      { id: "t0", key: "K-0", reason: "It could not be changed." },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/socket|Error/);
  });

  it("gives a task whose reason is empty a plain one", async () => {
    const result = await runBulkLink(tasks(1), async () => ({
      ok: false,
      message: "   ",
    }));
    expect(result.failed[0]!.reason).toBe("It could not be changed.");
  });

  it("does nothing for nothing", async () => {
    expect(await runBulkLink([], async () => ({ ok: true }))).toEqual({
      changed: 0,
      failed: [],
    });
  });
});

describe("the one line it ends in", () => {
  const failed = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `f${i}`,
      key: `F-${i}`,
      reason: "No",
    }));

  it("says what it linked, to what, and how many", () => {
    expect(bulkLinkLine({ changed: 4, failed: [] }, 4, "Grow revenue")).toBe(
      "Linked 4 tasks to Grow revenue.",
    );
    expect(bulkLinkLine({ changed: 1, failed: [] }, 1, "Grow revenue")).toBe(
      "Linked 1 task to Grow revenue.",
    );
  });

  it("says what it cleared", () => {
    expect(bulkLinkLine({ changed: 3, failed: [] }, 3, null)).toBe(
      "Cleared the link on 3 tasks.",
    );
  });

  it("says how many did not change, in the same line, when some did not", () => {
    expect(
      bulkLinkLine({ changed: 3, failed: failed(1) }, 4, "Grow revenue"),
    ).toBe("Linked 3 tasks to Grow revenue. 1 task could not be changed.");
    expect(bulkLinkLine({ changed: 2, failed: failed(2) }, 4, null)).toBe(
      "Cleared the link on 2 tasks. 2 tasks could not be changed.",
    );
  });

  it("does not claim a change that did not happen", () => {
    expect(
      bulkLinkLine({ changed: 0, failed: failed(3) }, 3, "Grow revenue"),
    ).toBe("None of the 3 tasks could be changed.");
    expect(
      bulkLinkLine({ changed: 0, failed: failed(1) }, 1, "Grow revenue"),
    ).toBe("That task could not be changed.");
  });

  it("is calm: no exclamation mark, no alarm word", () => {
    const lines = [
      bulkLinkLine({ changed: 3, failed: failed(1) }, 4, "X"),
      bulkLinkLine({ changed: 0, failed: failed(3) }, 3, "X"),
      bulkLinkLine({ changed: 2, failed: [] }, 2, null),
    ].join(" ");
    expect(lines).not.toMatch(/!|error|fail|warning|problem|refused|denied/i);
  });
});
