import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";

/**
 * The two assists over the wire and in the hooks that ask for them: the tasks linked to a done-or-not
 * measure, and the finished tasks of the week as text for a weekly line.
 *
 * What is proved: an answer is read as the API said it and never as more (a task with no key, or in a
 * state this side does not know, is not one it will describe; a task the reader may not open is its id
 * and nothing else, even if more arrives with it; a count that is not a whole number is no answer); an
 * `{ on: false }` carries nothing else and is never read as an empty list; everything that is not an
 * answer is `null`, so a screen can draw nothing for it; the two routes are the ones the API serves; and
 * the hooks ask only when the company has the assists on and the reader has a reason to look, never with
 * no server, and say nothing about a failed or refused read.
 */

const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  request,
}));
const session = vi.hoisted(() => ({ isConnected: true }));
vi.mock("@/lib/store/session", () => ({ useSession: () => session }));

import {
  linkedTaskHref,
  toLinkedWork,
  toTaskSuggestions,
  workAssistsApi,
} from "@/lib/api/work-assists";
import { useLinkedWork, useTaskSuggestions } from "@/lib/store/work-assists";

const task = (over: Record<string, unknown> = {}) => ({
  issueId: "i1",
  key: "PLT-12",
  type: "TASK",
  state: "FINISHED",
  finishedOn: "2026-11-09",
  personal: false,
  accepted: null,
  canOpen: true,
  ...over,
});
const linked = (items: unknown[], over: Record<string, unknown> = {}) => ({
  on: true,
  measure: { id: "m1", label: "Both engineers hired", kind: "DONE" },
  items,
  total: items.length,
  truncated: false,
  ...over,
});
const line = (over: Record<string, unknown> = {}) => ({
  issueId: "i1",
  key: "PLT-12",
  type: "TASK",
  finishedOn: "2026-11-09",
  text: "PLT-12 Ship the retry",
  ...over,
});
const suggestions = (items: unknown[], over: Record<string, unknown> = {}) => ({
  on: true,
  week: { start: "2026-11-09", end: "2026-11-15" },
  items,
  total: items.length,
  truncated: false,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  session.isConnected = true;
});

describe("reading the tasks linked to a measure", () => {
  it("reads a task the reader may open field by field", () => {
    const read = toLinkedWork(
      linked([
        task({
          accepted: { byName: "Ada Eze", at: "2026-11-11T10:00:00.000Z" },
        }),
      ]),
    );
    expect(read).toEqual({
      on: true,
      measure: { id: "m1", label: "Both engineers hired", kind: "DONE" },
      items: [
        {
          issueId: "i1",
          key: "PLT-12",
          type: "TASK",
          state: "FINISHED",
          finishedOn: "2026-11-09",
          personal: false,
          accepted: { byName: "Ada Eze", at: "2026-11-11T10:00:00.000Z" },
          canOpen: true,
        },
      ],
      total: 1,
      truncated: false,
    });
  });

  it("reads a task the reader may not open as its id and nothing else", () => {
    const read = toLinkedWork(linked([{ issueId: "i9", canOpen: false }]));
    expect(read).toMatchObject({
      on: true,
      items: [{ issueId: "i9", canOpen: false }],
    });
    if (read?.on)
      expect(Object.keys(read.items[0]!).sort()).toEqual([
        "canOpen",
        "issueId",
      ]);
  });

  it("ignores everything that arrives with a task the reader may not open: a key, a state and a day are facts about work they cannot see", () => {
    const read = toLinkedWork(
      linked([
        task({
          issueId: "i9",
          canOpen: false,
          key: "SEC-1",
          state: "WONT_DO",
          finishedOn: "2026-11-02",
          accepted: { byName: "X", at: "2026-11-03T00:00:00.000Z" },
          personal: true,
        }),
      ]),
    );
    if (!read?.on) throw new Error("expected an answer");
    expect(read.items).toEqual([{ issueId: "i9", canOpen: false }]);
    expect(JSON.stringify(read)).not.toMatch(/SEC-1|WONT_DO|2026-11-02/);
  });

  it("reads a task whose openness is not said as one the reader may not open, never as one they may", () => {
    const { canOpen: _gone, ...unsaid } = task({ issueId: "i8" });
    void _gone;
    const read = toLinkedWork(linked([unsaid]));
    if (!read?.on) throw new Error("expected an answer");
    expect(read.items).toEqual([{ issueId: "i8", canOpen: false }]);
  });

  it("keeps the three states and no other, and a day only for a finished task", () => {
    const read = toLinkedWork(
      linked([
        task({ issueId: "a", state: "OPEN", finishedOn: "2026-11-09" }),
        task({ issueId: "b", state: "WONT_DO", finishedOn: "2026-11-09" }),
        task({ issueId: "c", state: "FINISHED" }),
        task({ issueId: "d", state: "ON_HOLD" }),
      ]),
    );
    if (!read?.on) throw new Error("expected an answer");
    expect(
      read.items.map((i) =>
        i.canOpen ? [i.issueId, i.state, i.finishedOn] : [i.issueId],
      ),
    ).toEqual([
      ["a", "OPEN", null],
      ["b", "WONT_DO", null],
      ["c", "FINISHED", "2026-11-09"],
    ]);
  });

  it("drops a task with no id, and one with no key that the reader may open", () => {
    const read = toLinkedWork(
      linked([
        task({ issueId: "" }),
        task({ key: "" }),
        task({ issueId: "ok" }),
      ]),
    );
    if (!read?.on) throw new Error("expected an answer");
    expect(read.items.map((i) => i.issueId)).toEqual(["ok"]);
  });

  it("keeps the API's total and its truncation, whatever it listed", () => {
    const read = toLinkedWork(linked([task()], { total: 63, truncated: true }));
    expect(read).toMatchObject({ total: 63, truncated: true });
  });

  it("keeps an empty list as an empty list: nothing is linked, which only an answer may say", () => {
    expect(toLinkedWork(linked([], { total: 0 }))).toMatchObject({
      on: true,
      items: [],
      total: 0,
    });
  });

  it("reads { on: false } as that and nothing else", () => {
    expect(toLinkedWork({ on: false })).toEqual({ on: false });
    expect(toLinkedWork({ on: false, items: [task()], total: 1 })).toEqual({
      on: false,
    });
  });

  it.each([
    ["null", null],
    ["a string", "yes"],
    ["no on", { items: [], total: 0 }],
    ["on with no list", { on: true, total: 0 }],
    ["on with no total", { on: true, items: [] }],
    ["a fractional total", linked([], { total: 1.5 })],
    ["a negative total", linked([], { total: -1 })],
    ["a string total", linked([], { total: "3" })],
  ])("is no answer when it is %s", (_name, raw) => {
    expect(toLinkedWork(raw)).toBeNull();
  });

  it("opens a task by its id, which sends a board task on to its board", () => {
    expect(linkedTaskHref("i 1/2")).toBe("/projects/tasks/i%201%2F2");
  });
});

describe("reading the suggestions", () => {
  it("reads the week and the lines as the API said them", () => {
    expect(toTaskSuggestions(suggestions([line()]))).toEqual({
      on: true,
      week: { start: "2026-11-09", end: "2026-11-15" },
      items: [
        {
          issueId: "i1",
          key: "PLT-12",
          type: "TASK",
          finishedOn: "2026-11-09",
          text: "PLT-12 Ship the retry",
        },
      ],
      total: 1,
      truncated: false,
    });
  });

  it("drops a line with no id, no day or no text, and keeps the total the API gave", () => {
    const read = toTaskSuggestions(
      suggestions(
        [
          line({ issueId: "" }),
          line({ finishedOn: "soon" }),
          line({ text: "   " }),
          line({ issueId: "ok" }),
        ],
        { total: 9, truncated: true },
      ),
    );
    if (!read?.on) throw new Error("expected an answer");
    expect(read.items.map((i) => i.issueId)).toEqual(["ok"]);
    expect(read).toMatchObject({ total: 9, truncated: true });
  });

  it("reads { on: false } as that and nothing else", () => {
    expect(toTaskSuggestions({ on: false })).toEqual({ on: false });
    expect(toTaskSuggestions({ on: false, items: [line()] })).toEqual({
      on: false,
    });
  });

  it.each([
    ["null", null],
    ["no week", { on: true, items: [], total: 0 }],
    [
      "a week with no end",
      { on: true, week: { start: "2026-11-09" }, items: [], total: 0 },
    ],
    [
      "a week whose start is not a day",
      {
        on: true,
        week: { start: "Monday", end: "2026-11-15" },
        items: [],
        total: 0,
      },
    ],
    [
      "a week whose end is not a day",
      {
        on: true,
        week: { start: "2026-11-09", end: "Sunday" },
        items: [],
        total: 0,
      },
    ],
    [
      "a week that is not days",
      {
        on: true,
        week: { start: "Monday", end: "Sunday" },
        items: [],
        total: 0,
      },
    ],
    [
      "no list",
      { on: true, week: { start: "2026-11-09", end: "2026-11-15" }, total: 0 },
    ],
    ["a fractional total", suggestions([], { total: 0.5 })],
  ])("is no answer when it is %s", (_name, raw) => {
    expect(toTaskSuggestions(raw)).toBeNull();
  });
});

describe("the two routes", () => {
  it("ask for the linked tasks of one measure, with the abort signal", async () => {
    request.mockResolvedValue({ on: false });
    const controller = new AbortController();
    await workAssistsApi.linkedWork("m 1", controller.signal);
    expect(request).toHaveBeenCalledWith(
      "/performance/key-results/m%201/linked-work",
      { signal: controller.signal },
    );
  });

  it("ask for the suggestions of one objective", async () => {
    request.mockResolvedValue({ on: false });
    await workAssistsApi.taskSuggestions("g1");
    expect(request).toHaveBeenCalledWith(
      "/performance/goals/g1/task-suggestions",
      {},
    );
  });

  it("let a refusal through as it came: whether to say anything is the screen's to decide", async () => {
    const refusal = new ApiError(404, "not_found", "That measure");
    request.mockRejectedValue(refusal);
    await expect(workAssistsApi.linkedWork("m1")).rejects.toBe(refusal);
  });
});

describe("asking for the linked tasks", () => {
  it("asks once, for this measure, when the company has the assists on, and reads the answer", async () => {
    request.mockResolvedValue(linked([task()]));
    const { result } = renderHook(() => useLinkedWork("m1", true));
    await waitFor(() => expect(result.current.work).not.toBeNull());
    expect(request).toHaveBeenCalledTimes(1);
    expect(result.current.work?.items).toHaveLength(1);
  });

  it.each([
    [
      "the company has not switched the assists on",
      () => undefined,
      "m1",
      false,
    ],
    ["there is no measure", () => undefined, null, true],
  ])("asks nothing when %s", (_why, _setup, measureId, enabled) => {
    renderHook(() => useLinkedWork(measureId, enabled));
    expect(request).not.toHaveBeenCalled();
  });

  it("asks nothing with no server, and is quiet and not an error", () => {
    session.isConnected = false;
    const { result } = renderHook(() => useLinkedWork("m1", true));
    expect(request).not.toHaveBeenCalled();
    expect(result.current).toEqual({ work: null, loading: false });
  });

  it.each([
    ["the assists are off", { on: false }],
    ["the server answered something it cannot read", { nonsense: true }],
  ])("is null, not an empty list, when %s", async (_why, answer) => {
    request.mockResolvedValue(answer);
    const { result } = renderHook(() => useLinkedWork("m1", true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.work).toBeNull();
  });

  it("is null, and says nothing, when the reader is refused or the request fails", async () => {
    request.mockRejectedValue(new ApiError(404, "not_found", "That measure"));
    const { result } = renderHook(() => useLinkedWork("m1", true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.work).toBeNull();
  });
});

describe("asking for the suggestions", () => {
  it("asks for this objective when the box is open and the assists are on", async () => {
    request.mockResolvedValue(suggestions([line()]));
    const { result } = renderHook(() => useTaskSuggestions("g1", true));
    await waitFor(() => expect(result.current.suggestions).not.toBeNull());
    expect(request).toHaveBeenCalledTimes(1);
    expect(result.current.suggestions?.items).toHaveLength(1);
  });

  it("asks nothing when the assists are not on, and nothing with no server", () => {
    renderHook(() => useTaskSuggestions("g1", false));
    session.isConnected = false;
    renderHook(() => useTaskSuggestions("g1", true));
    expect(request).not.toHaveBeenCalled();
  });

  it("is null for an off answer and for a failure", async () => {
    request.mockResolvedValueOnce({ on: false });
    const off = renderHook(() => useTaskSuggestions("g1", true));
    await waitFor(() => expect(off.result.current.loading).toBe(false));
    expect(off.result.current.suggestions).toBeNull();

    request.mockRejectedValueOnce(new ApiError(500, "server", "Down"));
    const failed = renderHook(() => useTaskSuggestions("g2", true));
    await waitFor(() => expect(failed.result.current.loading).toBe(false));
    expect(failed.result.current.suggestions).toBeNull();
  });
});
