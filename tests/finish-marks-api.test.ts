import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Won't do and acceptance on a finished task, over the wire and in the task's history.
 *
 * What is proved: the two marks are read as the API sent them and never as more (a half-sent mark is no
 * mark, an absent field is no mark, and no title or other field is read into one); what the reader may
 * do (`canMarkWontDo`, `canAccept`) is kept only when it is exactly `true`, so a server that says nothing
 * is read as "may not" and never as "may"; the four routes are the ones the API serves (under `/issues`,
 * not under `/projects`) with the verbs it expects, the reason goes as a body and acceptance has none;
 * every route answers with the task and its flags; the thread (which the board's drawer and a
 * personal task's drawer both read) and the leader's reduced read carry the flags; and the history says what happened in words, quotes the reason the
 * person wrote, and never prints an object.
 */

const request = vi.fn();
vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  request: (...args: unknown[]) => request(...args),
  requestPaged: vi.fn(),
}));

const {
  projectsApi,
  toAccepted,
  toFinishFlags,
  toFinishRead,
  toIssue,
  toLeaderRead,
  toWontDo,
} = await import("@/lib/api/projects");
const { describeActivity } = await import("@/lib/projects/history");

const WONT_DO = {
  at: "2026-11-10T09:00:00.000Z",
  byId: "p-05",
  byName: "Adaeze Okonkwo",
  reason: "The customer changed their mind",
};
const ACCEPTED = {
  at: "2026-11-11T14:30:00.000Z",
  byId: "p-05",
  byName: "Adaeze Okonkwo",
};
const issue = (over: Record<string, unknown> = {}) => ({
  id: "i1",
  projectId: "pr1",
  number: 12,
  key: "PLT-12",
  type: "TASK",
  title: "Ship the retry",
  statusId: "s-done",
  doneAt: "2026-11-09T10:00:00.000Z",
  ...over,
});

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue(issue());
});

describe("reading the won't-do mark", () => {
  it("reads what the API sent, field by field", () => {
    expect(toWontDo(WONT_DO)).toEqual(WONT_DO);
  });

  it.each([
    ["null", null],
    ["absent", undefined],
    ["a string", "yes"],
    ["a number", 1],
    ["an empty object", {}],
    ["one with no time", { byId: "p-05", byName: "A", reason: "r" }],
    ["one with no who", { at: "2026-11-10T09:00:00.000Z", reason: "r" }],
  ])("is no mark when it is %s", (_name, value) => {
    expect(toWontDo(value)).toBeNull();
  });

  it("reads a mark with no reason, which is what a leader's reduced read carries, as a mark with none", () => {
    const { reason: _withheld, ...withheld } = WONT_DO;
    void _withheld;
    expect(toWontDo(withheld)).toEqual({ ...withheld, reason: null });
  });

  it("never reads a blank reason as one: nothing quotes nothing", () => {
    expect(toWontDo({ ...WONT_DO, reason: "" })?.reason).toBeNull();
    expect(toWontDo({ ...WONT_DO, reason: "   " })?.reason).toBeNull();
    expect(toWontDo({ ...WONT_DO, reason: 7 })?.reason).toBeNull();
  });

  it("keeps nothing but the four fields, so a title that arrives is not read", () => {
    const read = toWontDo({ ...WONT_DO, title: "A private title" });
    expect(Object.keys(read ?? {}).sort()).toEqual(
      ["at", "byId", "byName", "reason"].sort(),
    );
  });
});

describe("reading the acceptance", () => {
  it("reads what the API sent, and has no reason to read", () => {
    expect(toAccepted(ACCEPTED)).toEqual(ACCEPTED);
    expect(toAccepted({ ...ACCEPTED, reason: "x" })).toEqual(ACCEPTED);
  });

  it.each([
    ["null", null],
    ["absent", undefined],
    ["true, which is not a mark", true],
    ["one with no time", { byId: "p-05", byName: "A" }],
    ["one with no who", { at: "2026-11-11T14:30:00.000Z" }],
  ])("is no acceptance when it is %s", (_name, value) => {
    expect(toAccepted(value)).toBeNull();
  });
});

describe("what a task carries", () => {
  it("carries both marks when the API sent them", () => {
    const read = toIssue(issue({ wontDo: WONT_DO, accepted: null }));
    expect(read.wontDo).toEqual(WONT_DO);
    expect(read.accepted).toBeNull();
    expect(toIssue(issue({ accepted: ACCEPTED })).accepted).toEqual(ACCEPTED);
  });

  it("reads a server that sends neither as no marks, not as a claim", () => {
    const read = toIssue(issue());
    expect(read.wontDo).toBeNull();
    expect(read.accepted).toBeNull();
  });
});

describe("what the reader may do", () => {
  it("is exactly what the API said, only when it said true", () => {
    expect(toFinishFlags({ canMarkWontDo: true, canAccept: false })).toEqual({
      canMarkWontDo: true,
      canAccept: false,
    });
    expect(toFinishFlags({ canMarkWontDo: false, canAccept: true })).toEqual({
      canMarkWontDo: false,
      canAccept: true,
    });
  });

  it.each([
    ["absent", {}],
    ["the string true", { canMarkWontDo: "true", canAccept: "true" }],
    ["1", { canMarkWontDo: 1, canAccept: 1 }],
    ["null", { canMarkWontDo: null, canAccept: null }],
  ])("is not offered when the field is %s", (_name, raw) => {
    expect(toFinishFlags(raw)).toEqual({
      canMarkWontDo: false,
      canAccept: false,
    });
  });

  it("is on the task's own read", async () => {
    request
      .mockResolvedValueOnce(
        issue({ canMarkWontDo: true, canAccept: true, wontDo: null }),
      )
      .mockResolvedValueOnce([]);
    const thread = await projectsApi.thread("i1");
    expect(thread.canMarkWontDo).toBe(true);
    expect(thread.canAccept).toBe(true);
  });

  it("is off on the task's own read when the server says nothing about it", async () => {
    request.mockResolvedValueOnce(issue()).mockResolvedValueOnce([]);
    const thread = await projectsApi.thread("i1");
    expect(thread.canMarkWontDo).toBe(false);
    expect(thread.canAccept).toBe(false);
  });

  it("is on a leader's reduced read, so a manager off the board can accept", () => {
    const read = toLeaderRead({
      ...issue({ accepted: null }),
      reduced: true,
      projectName: "Platform",
      statusName: "Done",
      statusCategory: "DONE",
      subtasks: [],
      canAccept: true,
      canMarkWontDo: false,
    });
    expect(read.reduced).toBe(true);
    if (read.reduced) {
      expect(read.canAccept).toBe(true);
      expect(read.canMarkWontDo).toBe(false);
    }
  });

  it("carries a won't-do mark with no reason on a leader's reduced read, and never invents one", () => {
    const read = toLeaderRead({
      ...issue({
        wontDo: { at: WONT_DO.at, byId: WONT_DO.byId, byName: WONT_DO.byName },
      }),
      reduced: true,
      projectName: "Platform",
      statusName: "Done",
      statusCategory: "DONE",
      subtasks: [],
    });
    expect(read.reduced).toBe(true);
    if (read.reduced) {
      expect(read.issue.wontDo).toEqual({
        at: WONT_DO.at,
        byId: WONT_DO.byId,
        byName: WONT_DO.byName,
        reason: null,
      });
    }
  });
});

describe("the four routes", () => {
  it("close a task as won't do with the reason as the body", async () => {
    await projectsApi.markWontDo("i1", "The customer changed their mind");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("/issues/i1/wont-do", {
      method: "POST",
      body: { reason: "The customer changed their mind" },
    });
  });

  it("take that back with a DELETE and no body", async () => {
    await projectsApi.takeBackWontDo("i1");
    expect(request).toHaveBeenCalledWith("/issues/i1/wont-do", {
      method: "DELETE",
    });
  });

  it("accept with a POST and no body", async () => {
    await projectsApi.acceptTask("i1");
    expect(request).toHaveBeenCalledWith("/issues/i1/accept", {
      method: "POST",
    });
  });

  it("take an acceptance back with a DELETE and no body", async () => {
    await projectsApi.withdrawAcceptance("i1");
    expect(request).toHaveBeenCalledWith("/issues/i1/accept", {
      method: "DELETE",
    });
  });

  it("are under /issues and never under /projects", async () => {
    await projectsApi.markWontDo("i1", "Not needed any more");
    await projectsApi.acceptTask("i1");
    for (const call of request.mock.calls) {
      expect(String(call[0])).toMatch(/^\/issues\//);
    }
  });

  it("answer with the task and what the reader may do now", async () => {
    request.mockResolvedValueOnce(
      issue({
        wontDo: WONT_DO,
        canMarkWontDo: true,
        canAccept: false,
      }),
    );
    const read = await projectsApi.markWontDo("i1", "Not needed any more");
    expect(read.issue.wontDo).toEqual(WONT_DO);
    expect(read.canMarkWontDo).toBe(true);
    expect(read.canAccept).toBe(false);
    expect(toFinishRead(issue({ accepted: ACCEPTED })).issue.accepted).toEqual(
      ACCEPTED,
    );
  });

  it("let a refusal through as it came, so the screen can show the server's sentence", async () => {
    const refusal = new Error(
      "Only a finished task can be closed as won't do.",
    );
    request.mockRejectedValueOnce(refusal);
    await expect(
      projectsApi.markWontDo("i1", "Not needed any more"),
    ).rejects.toBe(refusal);
  });
});

describe("the history", () => {
  const lookup = {
    statusName: () => null,
    personName: (id: string) => id,
    sprintName: () => null,
    issueKey: () => null,
  };
  const row = (field: string, from: unknown, to: unknown) => ({
    field,
    from,
    to,
  });

  it("says a task was closed as won't do, and quotes the reason the person wrote", () => {
    const text = describeActivity(
      row("wontDo", null, { reason: "The customer changed their mind" }),
      lookup,
    );
    expect(text.verb).toBe(
      "closed the task as won't do: The customer changed their mind",
    );
    expect(text.from).toBeNull();
    expect(text.to).toBeNull();
  });

  it("still says it when the row carries no reason, and never prints an object", () => {
    const text = describeActivity(row("wontDo", null, {}), lookup);
    expect(text.verb).toBe("closed the task as won't do");
    expect(JSON.stringify(text)).not.toContain("[object");
  });

  it("says the mark was removed, whether taken back or cleared by leaving Done", () => {
    const text = describeActivity(
      row("wontDo", { reason: "The customer changed their mind" }, null),
      lookup,
    );
    expect(text.verb).toBe("removed the won't-do mark from the task");
    expect(text.verb).not.toContain("customer");
  });

  it("says a task was accepted, and that an acceptance was removed", () => {
    expect(describeActivity(row("accepted", null, true), lookup).verb).toBe(
      "accepted the task",
    );
    expect(describeActivity(row("accepted", true, null), lookup).verb).toBe(
      "removed the acceptance of the task",
    );
  });

  it("does not print true or null as a value", () => {
    const text = describeActivity(row("accepted", null, true), lookup);
    expect(text.from).toBeNull();
    expect(text.to).toBeNull();
  });
});
