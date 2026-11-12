import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The work kept behind a final rating, over the wire.
 *
 * What is proved: the four states are read as the API sent them; a record is claimed only when its
 * list can be read, and anything the reader cannot make sense of is `null` ("nothing known"), which
 * a screen never draws as "none was kept"; a task is shown as named only when the API named it; and
 * the request goes to the review's own address.
 */

const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({ request }));

const { toKeptWork, keptWorkApi } = await import("@/lib/api/kept-work");

const item = (over: Record<string, unknown> = {}) => ({
  id: "i1",
  key: "PRF-1",
  type: "TASK",
  personal: false,
  projectId: "p1",
  doneAt: "2026-10-12T10:00:00.000Z",
  finishedOn: "2026-10-12",
  dueDate: "2026-10-05",
  timing: "LATE",
  linked: true,
  setBy: { id: "pat", name: "Pat Projects" },
  ...over,
});

const kept = (over: Record<string, unknown> = {}) => ({
  state: "KEPT",
  frozenAt: "2026-11-01T09:00:00.000Z",
  retainUntil: "2027-11-01T09:00:00.000Z",
  retainMonths: 12,
  period: { start: "2026-07-01", end: "2026-12-31" },
  summary: {
    finished: 2,
    withDueDate: 1,
    onTime: 0,
    late: 1,
    noDueDate: 1,
    linked: 1,
    unlinked: 1,
    linkedShare: 0.5,
  },
  items: [
    item(),
    item({ id: "i2", key: "PRF-2", dueDate: null, timing: "NO_DUE_DATE" }),
  ],
  total: 2,
  truncated: false,
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("the four states", () => {
  it("reads not final and not kept as what they are, and nothing more", () => {
    expect(toKeptWork({ state: "NOT_FINAL" })).toEqual({ state: "NOT_FINAL" });
    expect(toKeptWork({ state: "NOT_KEPT" })).toEqual({ state: "NOT_KEPT" });
  });

  it("reads a removed record with when it was kept and when it ended", () => {
    expect(
      toKeptWork({
        state: "REMOVED",
        frozenAt: "2026-11-01T09:00:00.000Z",
        endedAt: "2027-11-01T09:00:00.000Z",
      }),
    ).toEqual({
      state: "REMOVED",
      frozenAt: "2026-11-01T09:00:00.000Z",
      endedAt: "2027-11-01T09:00:00.000Z",
    });
  });

  it("reads a kept record with its totals, its period and its list", () => {
    const record = toKeptWork(kept());
    expect(record).toMatchObject({
      state: "KEPT",
      retainMonths: 12,
      period: { start: "2026-07-01", end: "2026-12-31" },
      total: 2,
      truncated: false,
      summary: { finished: 2, withDueDate: 1, late: 1, linked: 1, unlinked: 1 },
    });
    expect(record?.state === "KEPT" && record.items).toHaveLength(2);
  });

  it("claims nothing for a state it does not know, or for something that is not an answer", () => {
    expect(toKeptWork({ state: "SOMETHING_NEW" })).toBeNull();
    expect(toKeptWork(null)).toBeNull();
    expect(toKeptWork("KEPT")).toBeNull();
    expect(toKeptWork({})).toBeNull();
  });

  it("claims no record from one it cannot read: no list, no dates, or a removed one with no end", () => {
    expect(toKeptWork(kept({ items: undefined }))).toBeNull();
    expect(toKeptWork(kept({ period: {} }))).toBeNull();
    expect(toKeptWork(kept({ retainUntil: "" }))).toBeNull();
    expect(
      toKeptWork({ state: "REMOVED", frozenAt: "2026-11-01T09:00:00.000Z" }),
    ).toBeNull();
  });
});

describe("one task", () => {
  const first = (raw: unknown) => {
    const record = toKeptWork(raw);
    if (record?.state !== "KEPT") throw new Error("not a kept record");
    return record.items;
  };

  it("keeps what the API sent and nothing it did not: there is no title to read", () => {
    const [one] = first(kept());
    expect(one).toEqual({
      id: "i1",
      key: "PRF-1",
      type: "TASK",
      personal: false,
      projectId: "p1",
      doneAt: "2026-10-12T10:00:00.000Z",
      finishedOn: "2026-10-12",
      dueDate: "2026-10-05",
      timing: "LATE",
      linked: true,
      setBy: { id: "pat", name: "Pat Projects" },
    });
    expect(Object.keys(one!)).not.toContain("title");
  });

  it("names who set it only when the API named somebody", () => {
    const items = first(
      kept({
        items: [
          item({ setBy: null }),
          item({ id: "i2", key: "PRF-2", setBy: { id: "pat" } }),
          item({ id: "i3", key: "PRF-3", setBy: { id: "pat", name: "" } }),
          item({ id: "i4", key: "PRF-4", setBy: "Pat" }),
        ],
      }),
    );
    expect(items.map((one) => one.setBy)).toEqual([null, null, null, null]);
  });

  it("treats a missing due date as none, and anything but true as not personal and not linked", () => {
    const [one] = first(
      kept({
        items: [
          item({
            dueDate: null,
            personal: "yes",
            linked: 1,
            timing: "NO_DUE_DATE",
          }),
        ],
      }),
    );
    expect(one).toMatchObject({
      dueDate: null,
      personal: false,
      linked: false,
    });
  });

  it("drops a task it cannot identify or time, and keeps the rest", () => {
    const items = first(
      kept({
        items: [
          item({ id: "" }),
          item({ id: "i2", key: "" }),
          item({ id: "i3", key: "PRF-3", timing: "EARLY" }),
          item({ id: "i4", key: "PRF-4" }),
        ],
      }),
    );
    expect(items.map((one) => one.id)).toEqual(["i4"]);
  });

  it("slices a due date to its day", () => {
    const [one] = first(
      kept({ items: [item({ dueDate: "2026-10-05T00:00:00.000Z" })] }),
    );
    expect(one?.dueDate).toBe("2026-10-05");
  });
});

describe("a record that holds fewer than it matched", () => {
  it("says so, with the true total", () => {
    const record = toKeptWork(kept({ total: 1432, truncated: true }));
    expect(record).toMatchObject({
      state: "KEPT",
      total: 1432,
      truncated: true,
    });
  });

  it("is not truncated unless the API says it is", () => {
    const record = toKeptWork(kept({ truncated: "true" }));
    expect(record).toMatchObject({ truncated: false });
  });
});

describe("the request", () => {
  it("asks the review's own address, with the caller's signal, and reads the answer", async () => {
    request.mockResolvedValue({ state: "NOT_KEPT" });
    const controller = new AbortController();
    const read = await keptWorkApi.read("rev-1", controller.signal);
    expect(read).toEqual({ state: "NOT_KEPT" });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      "/performance/reviews/rev-1/work-evidence",
      {
        signal: controller.signal,
      },
    );
  });

  it("sends no signal when it is not given one", async () => {
    request.mockResolvedValue({ state: "NOT_FINAL" });
    await keptWorkApi.read("rev-2");
    expect(request).toHaveBeenCalledWith(
      "/performance/reviews/rev-2/work-evidence",
      {},
    );
  });

  it("reads an answer it cannot make sense of as nothing known", async () => {
    request.mockResolvedValue({ state: "SOMETHING_NEW" });
    expect(await keptWorkApi.read("rev-3")).toBeNull();
  });

  it("lets a refusal through, so the screen can tell it from an empty answer", async () => {
    request.mockRejectedValue(new Error("404"));
    await expect(keptWorkApi.read("rev-4")).rejects.toThrow("404");
  });
});
