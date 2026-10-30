import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Who is on a task, over the wire.
 *
 * A new task goes with everybody as `assigneeIds` and the lead beside the list as
 * `assigneeId`, always the first of it. A server that takes several people reads
 * the list (it wins when both come) and one from before it reads `assigneeId`
 * alone and drops a key it does not know, so without the lead a person chosen on
 * a new task is left off it with a 201. Both take the same person as the lead.
 *
 * A change is not given a lead: it goes as what changed. A server that cannot hold
 * several people refuses a change to the list alone, which says it did not take,
 * and a lead added there would turn that into a silent no-op.
 */

const request = vi.fn();
vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  request: (...args: unknown[]) => request(...args),
  requestPaged: vi.fn(),
}));

const { projectsApi } = await import("@/lib/api/projects");

const sent = () => request.mock.calls[0]![1].body as Record<string, unknown>;

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({ id: "x" });
});

describe("creating a task", () => {
  it("sends the lead beside the list, so a server without the list still assigns them", async () => {
    await projectsApi.createIssue("p1", {
      type: "TASK",
      title: "Cover the timeout",
      assigneeIds: ["p-03", "p-09"],
    });
    expect(request).toHaveBeenCalledWith("/projects/p1/issues", {
      method: "POST",
      body: {
        type: "TASK",
        title: "Cover the timeout",
        assigneeId: "p-03",
        assigneeIds: ["p-03", "p-09"],
      },
    });
  });

  it("sends null as the lead of an empty list, which is nobody", async () => {
    await projectsApi.createIssue("p1", {
      type: "TASK",
      title: "A",
      assigneeIds: [],
    });
    expect(sent()).toEqual({
      type: "TASK",
      title: "A",
      assigneeId: null,
      assigneeIds: [],
    });
  });

  it("adds nothing to a task made with no word about who is on it", async () => {
    await projectsApi.createIssue("p1", {
      type: "TASK",
      title: "A",
      priority: "HIGH",
    });
    expect(sent()).toEqual({ type: "TASK", title: "A", priority: "HIGH" });
    expect("assigneeId" in sent()).toBe(false);
    expect("assigneeIds" in sent()).toBe(false);
  });

  it("takes the lead from the list, whatever lead came with it", async () => {
    /* The two servers must name the same person: one reads the list, the other
       the lead. */
    await projectsApi.createIssue("p1", {
      type: "TASK",
      title: "A",
      assigneeId: "p-09",
      assigneeIds: ["p-03", "p-09"],
    });
    expect(sent()).toEqual({
      type: "TASK",
      title: "A",
      assigneeId: "p-03",
      assigneeIds: ["p-03", "p-09"],
    });
  });
});

describe("changing a task", () => {
  it("does not give a change to the list alone a lead of its own", async () => {
    /* What the board sends when somebody is added who is not the lead: the lead
       did not change, so it is not in it. */
    await projectsApi.updateIssue("i1", { assigneeIds: ["p-03", "p-04"] });
    expect(request).toHaveBeenCalledWith("/issues/i1", {
      method: "PATCH",
      body: { assigneeIds: ["p-03", "p-04"] },
    });
    expect("assigneeId" in sent()).toBe(false);
  });

  it("sends a change of lead as the caller made it, lead and list together", async () => {
    await projectsApi.updateIssue("i1", {
      assigneeId: "p-04",
      assigneeIds: ["p-04", "p-03"],
    });
    expect(sent()).toEqual({
      assigneeId: "p-04",
      assigneeIds: ["p-04", "p-03"],
    });
  });

  it("sends only what changed when nothing about people did", async () => {
    await projectsApi.updateIssue("i1", { title: "Renamed" });
    expect(request).toHaveBeenCalledWith("/issues/i1", {
      method: "PATCH",
      body: { title: "Renamed" },
    });
  });
});
