import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Colleagues who shared a project, and flags on finished work, over the wire.
 *
 * What is proved for both: an answer that says the setting is off is not an empty list, because it
 * carries no list at all; an answer this side cannot read is `null`, which a screen treats as "the
 * server did not say" and draws nothing for; and nothing that is not a colleague or a flag gets
 * through. For flags, the routes and bodies are the ones the API takes.
 */

const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({ request }));

import { sharedProjectsApi, toSharedProjects } from "@/lib/api/shared-projects";
import {
  FLAG_REASON_MAX,
  FLAG_REASON_MIN,
  toWorkFlag,
  toWorkFlags,
  workFlagsApi,
} from "@/lib/api/work-flags";

beforeEach(() => vi.clearAllMocks());

describe("shared projects", () => {
  it("is off, with no list, when the API says the setting is off", () => {
    expect(toSharedProjects({ on: false })).toEqual({ on: false });
    const off = toSharedProjects({
      on: false,
      colleagues: [{ employeeId: "x" }],
    });
    expect(off).toEqual({ on: false });
    expect(off).not.toHaveProperty("colleagues");
  });

  it("is a list when it is on, and an empty list is a fact", () => {
    expect(toSharedProjects({ on: true, colleagues: [] })).toEqual({
      on: true,
      colleagues: [],
    });
    expect(
      toSharedProjects({
        on: true,
        colleagues: [{ employeeId: "e2", name: "Ada Obi", sharedProjects: 2 }],
      }),
    ).toEqual({
      on: true,
      colleagues: [{ employeeId: "e2", name: "Ada Obi", sharedProjects: 2 }],
    });
  });

  it.each([
    ["nothing", undefined],
    ["null", null],
    ["a string", "yes"],
    ["on with no list", { on: true }],
    ["on with a list that is not one", { on: true, colleagues: "all" }],
    ["a stranger's shape", { colleagues: [] }],
  ])("is not known when it reads %s", (_why, raw) => {
    expect(toSharedProjects(raw)).toBeNull();
  });

  it("leaves out somebody who shared no project, or a count this side will not print", () => {
    const read = toSharedProjects({
      on: true,
      colleagues: [
        { employeeId: "e1", name: "A", sharedProjects: 0 },
        { employeeId: "e2", name: "B", sharedProjects: -1 },
        { employeeId: "e3", name: "C", sharedProjects: 1.5 },
        { employeeId: "e4", name: "D", sharedProjects: "2" },
        { employeeId: "", name: "E", sharedProjects: 3 },
        { employeeId: "e6", name: "F", sharedProjects: 3 },
      ],
    });
    expect(read).toEqual({
      on: true,
      colleagues: [{ employeeId: "e6", name: "F", sharedProjects: 3 }],
    });
  });

  it("reads the person's own route and passes the signal", async () => {
    request.mockResolvedValue({ on: true, colleagues: [] });
    const controller = new AbortController();
    await sharedProjectsApi.read("e1", controller.signal);
    expect(request).toHaveBeenCalledWith(
      "/performance/employees/e1/shared-projects",
      { signal: controller.signal },
    );
  });
});

describe("flags", () => {
  it("limits are the API's: 3 to 280", () => {
    expect(FLAG_REASON_MIN).toBe(3);
    expect(FLAG_REASON_MAX).toBe(280);
  });

  it("reads the list whether or not the switch is on: what was written stays", () => {
    expect(
      toWorkFlags({
        on: false,
        flags: [{ issueId: "i1", key: "PLT-1", reason: "Not mine" }],
      }),
    ).toEqual({
      on: false,
      flags: [
        { issueId: "i1", key: "PLT-1", reason: "Not mine", flaggedAt: "" },
      ],
    });
  });

  it("says nothing about flags, not that there are none, when the server sends no list", () => {
    /* A server one deploy behind answers { on: false } with no list at all. */
    expect(toWorkFlags({ on: false })).toEqual({ on: false, flags: null });
    expect(toWorkFlags({ on: true })).toEqual({ on: true, flags: null });
    expect(toWorkFlags({ on: true, flags: "all" })).toEqual({
      on: true,
      flags: null,
    });
  });

  it("is not known when `on` is not a boolean: nothing can be claimed about what can be done", () => {
    expect(toWorkFlags({ flags: [] })).toBeNull();
    expect(toWorkFlags({ on: "yes", flags: [] })).toBeNull();
    expect(toWorkFlags({ on: 1, flags: [] })).toBeNull();
  });

  it("is a list when on, and an empty list is a fact", () => {
    expect(toWorkFlags({ on: true, flags: [] })).toEqual({
      on: true,
      flags: [],
    });
    expect(
      toWorkFlags({
        on: true,
        flags: [
          {
            issueId: "i1",
            key: "PLT-1",
            reason: " Not mine ",
            flaggedAt: "2026-11-06T09:00:00.000Z",
            title: "A private title",
          },
        ],
      }),
    ).toEqual({
      on: true,
      flags: [
        {
          issueId: "i1",
          key: "PLT-1",
          reason: "Not mine",
          flaggedAt: "2026-11-06T09:00:00.000Z",
        },
      ],
    });
  });

  it.each([
    ["nothing", undefined],
    ["null", null],
    ["a string", "flags"],
  ])("is not known when it reads %s", (_why, raw) => {
    expect(toWorkFlags(raw)).toBeNull();
  });

  it("is not a flag without a task or a reason", () => {
    expect(toWorkFlag({ issueId: "", reason: "x" })).toBeNull();
    expect(toWorkFlag({ issueId: "i1", reason: "  " })).toBeNull();
    expect(toWorkFlag(null)).toBeNull();
  });

  it("reads the cycle's flags for a person", async () => {
    request.mockResolvedValue({ on: true, flags: [] });
    await workFlagsApi.read("c1", "e1");
    expect(request).toHaveBeenCalledWith(
      "/performance/cycles/c1/employees/e1/work-flags",
      {},
    );
  });

  it("answers with the flag as the server now holds it, and with null when the answer cannot be read", async () => {
    request.mockResolvedValue({
      flag: {
        issueId: "i1",
        key: "PLT-1",
        reason: "Not mine",
        flaggedAt: "2026-11-06T09:00:00.000Z",
        title: "A private title",
      },
    });
    const made = await workFlagsApi.flag("c1", "e1", "i1", "Not mine");
    expect(made).toEqual({
      issueId: "i1",
      key: "PLT-1",
      reason: "Not mine",
      flaggedAt: "2026-11-06T09:00:00.000Z",
    });
    request.mockResolvedValue({ unexpected: true });
    await expect(
      workFlagsApi.flag("c1", "e1", "i1", "Not mine"),
    ).resolves.toBeNull();
    request.mockResolvedValue(undefined);
    await expect(
      workFlagsApi.flag("c1", "e1", "i1", "Not mine"),
    ).resolves.toBeNull();
  });

  it("flags with a PUT on the task and a trimmed reason, and takes it back with a DELETE", async () => {
    request.mockResolvedValue({});
    await workFlagsApi.flag("c1", "e1", "i1", "  Not mine  ");
    expect(request).toHaveBeenCalledWith(
      "/performance/cycles/c1/employees/e1/work-flags/i1",
      { method: "PUT", body: { reason: "Not mine" } },
    );
    await workFlagsApi.unflag("c1", "e1", "i1");
    expect(request).toHaveBeenLastCalledWith(
      "/performance/cycles/c1/employees/e1/work-flags/i1",
      { method: "DELETE" },
    );
  });
});
