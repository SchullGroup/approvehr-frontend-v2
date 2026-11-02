import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `projectsApi.openTask`: what `/projects/tasks/:id` does with a task is decided
 * by the read's `personal` flag, never by its key — a board made before `MY`
 * was reserved can be keyed `MY` too.
 */

const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  request: (...a: unknown[]) => request(...a),
}));

const { projectsApi } = await import("@/lib/api/projects");

const read = (over: Record<string, unknown>) => ({
  id: "t-1",
  projectId: "proj-1",
  key: "MY-1",
  title: "Something",
  type: "TASK",
  statusId: "s1",
  priority: "MEDIUM",
  labels: [],
  watchers: [],
  watching: false,
  attachments: [],
  activity: [],
  ...over,
});

beforeEach(() => request.mockReset());

describe("opening a task by id", () => {
  it("sends a board task keyed MY-1 to its board", async () => {
    request.mockResolvedValue(read({ personal: false }));
    expect(await projectsApi.openTask("t-1")).toEqual({
      kind: "board",
      projectId: "proj-1",
      key: "MY-1",
    });
  });

  it("opens a task the read calls personal in its drawer", async () => {
    request.mockResolvedValue(
      read({ personal: true, statuses: [], statusName: "To do" }),
    );
    const target = await projectsApi.openTask("t-1");
    expect(target.kind).toBe("personal");
  });

  it("opens a reduced read as one", async () => {
    request.mockResolvedValue(
      read({
        key: "PAY-3",
        reduced: true,
        personal: false,
        projectName: "Pay",
      }),
    );
    const target = await projectsApi.openTask("t-1");
    expect(target.kind).toBe("reduced");
  });
});

describe("the issue read's flags", () => {
  it("carries who may choose watchers and attach, and who added each watcher", async () => {
    request.mockImplementation(async (path: unknown) =>
      String(path).endsWith("/comments")
        ? []
        : read({
            watchers: [{ id: "e-1", name: "Ada", addedById: "u-9" }],
            canManageWatchers: true,
            canAttachToTask: false,
          }),
    );
    const thread = await projectsApi.thread("t-1");
    expect(thread.canManageWatchers).toBe(true);
    expect(thread.canAttachToTask).toBe(false);
    expect(thread.watchers).toEqual([
      { id: "e-1", name: "Ada", addedById: "u-9" },
    ]);
  });
});
