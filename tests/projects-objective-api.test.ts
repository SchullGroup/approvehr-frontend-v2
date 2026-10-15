import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The objective link, over the wire.
 *
 * `goalId` goes out on `PATCH /projects/:id` and `PATCH /issues/:id` exactly as
 * set, with `null` meaning "unlink" (never an omitted field, which would mean
 * "leave it"), and comes back through the adapter as a string or `null`.
 */

const request = vi.fn();
vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  request: (...args: unknown[]) => request(...args),
  requestPaged: vi.fn(),
}));

const { projectsApi, toIssue, toProject } = await import("@/lib/api/projects");

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({ id: "x" });
});

describe("linking a project", () => {
  it("sends the objective's id", async () => {
    await projectsApi.update("p1", { goalId: "g1" });
    expect(request).toHaveBeenCalledWith("/projects/p1", {
      method: "PATCH",
      body: { goalId: "g1" },
    });
  });

  it("sends null, not nothing, to unlink", async () => {
    await projectsApi.update("p1", { goalId: null });
    const body = request.mock.calls[0]![1].body as Record<string, unknown>;
    expect(body).toEqual({ goalId: null });
    expect("goalId" in body).toBe(true);
  });

  it("reads the saved link back", () => {
    expect(toProject({ id: "p1", goalId: "g1" }).goalId).toBe("g1");
    expect(toProject({ id: "p1", goalId: null }).goalId).toBeNull();
    expect(toProject({ id: "p1" }).goalId).toBeNull();
  });
});

describe("linking an issue", () => {
  it("sends the objective's id, and only that when only that changed", async () => {
    await projectsApi.updateIssue("i1", { goalId: "g1" });
    expect(request).toHaveBeenCalledWith("/issues/i1", {
      method: "PATCH",
      body: { goalId: "g1" },
    });
  });

  it("sends null to unlink", async () => {
    await projectsApi.updateIssue("i1", { goalId: null });
    expect(request.mock.calls[0]![1].body).toEqual({ goalId: null });
  });

  it("reads the link and the bridge's answer from the same response", () => {
    const issue = toIssue({
      id: "i1",
      goalId: "g1",
      weeklyTask: { state: "FILED", taskId: "t1", graded: false },
    });
    expect(issue.goalId).toBe("g1");
    expect(issue.weeklyTask).toEqual({
      state: "FILED",
      taskId: "t1",
      graded: false,
    });
    expect(toIssue({ id: "i1" }).goalId).toBeNull();
  });
});
