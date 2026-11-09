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

  it("sends the measure with the objective, and clears both together", async () => {
    await projectsApi.updateIssue("i1", { goalId: "g1", keyResultId: "kr1" });
    expect(request.mock.calls[0]![1].body).toEqual({
      goalId: "g1",
      keyResultId: "kr1",
    });
    request.mockClear();
    await projectsApi.updateIssue("i1", { goalId: null, keyResultId: null });
    expect(request.mock.calls[0]![1].body).toEqual({
      goalId: null,
      keyResultId: null,
    });
  });

  it("reads the link and what it reads as from the same response", () => {
    const issue = toIssue({
      id: "i1",
      goalId: "g1",
      keyResultId: "kr1",
      objective: {
        state: "LINKED",
        source: "TASK",
        goalId: "g1",
        title: "Cut support tickets",
        level: "personal",
        keyResultId: "kr1",
        keyResultLabel: "Tickets a week",
        visible: true,
        message: "Linked to Cut support tickets (Tickets a week)",
      },
    });
    expect(issue.goalId).toBe("g1");
    expect(issue.keyResultId).toBe("kr1");
    expect(issue.objective?.keyResultTitle).toBe("Tickets a week");
    expect(issue.objective?.message).toBe(
      "Linked to Cut support tickets (Tickets a week)",
    );
    expect(toIssue({ id: "i1" }).goalId).toBeNull();
  });

  it("an unlinked task says nothing, and the old bridge note is ignored", () => {
    const issue = toIssue({
      id: "i1",
      goalId: null,
      objective: { state: "UNLINKED", message: "Not linked to an objective" },
      weeklyTask: {
        state: "NOT_COUNTED",
        reason: "NO_OBJECTIVE",
        message: "Not counted toward a weekly task",
      },
    });
    expect(issue.objective?.state).toBe("UNLINKED");
    expect("weeklyTask" in issue).toBe(false);
  });

  it("a link with no objective detail still reads as linked, never as a fault", () => {
    expect(toIssue({ id: "i1", goalId: "g1" }).objective).toMatchObject({
      state: "LINKED",
      goalId: "g1",
      title: null,
      message: "Linked to an objective",
    });
  });

  it("reads whether the person may link it, only when the API says", () => {
    expect(toIssue({ id: "i1", canLinkObjective: true }).canLinkObjective).toBe(
      true,
    );
    expect(
      toIssue({ id: "i1", canLinkObjective: false }).canLinkObjective,
    ).toBe(false);
    expect("canLinkObjective" in toIssue({ id: "i1" })).toBe(false);
  });
});

describe("the whole link and the batch", () => {
  it("PUT /issues/:id/objective sends the whole link, null clearing both", async () => {
    request.mockResolvedValueOnce({
      id: "i1",
      key: "PRF-1",
      goalId: "g1",
      keyResultId: null,
      objective: {
        state: "LINKED",
        goalId: "g1",
        title: "Grow",
        message: "Linked to Grow",
      },
      changed: true,
    });
    const answer = await projectsApi.setObjective("i1", {
      goalId: "g1",
      keyResultId: null,
    });
    expect(request).toHaveBeenCalledWith("/issues/i1/objective", {
      method: "PUT",
      body: { goalId: "g1", keyResultId: null },
    });
    expect(answer.changed).toBe(true);
    expect(answer.objective.message).toBe("Linked to Grow");
  });

  it("POST /issues/objective-links names the tasks and reads each one's own answer", async () => {
    request.mockResolvedValueOnce({
      goalId: "g1",
      keyResultId: null,
      counts: { linked: 1, cleared: 0, unchanged: 0, refused: 1, not_found: 1 },
      items: [
        { issueId: "a", key: "PRF-1", result: "linked" },
        {
          issueId: "b",
          key: null,
          result: "refused",
          reason: "cannot_link",
          message: "Only the people this task is assigned to can link it.",
        },
        { issueId: "c", key: null, result: "not_found" },
      ],
    });
    const answer = await projectsApi.bulkObjective({
      issueIds: ["a", "b", "c"],
      goalId: "g1",
      keyResultId: null,
    });
    expect(request).toHaveBeenCalledWith("/issues/objective-links", {
      method: "POST",
      body: { issueIds: ["a", "b", "c"], goalId: "g1", keyResultId: null },
    });
    expect(answer.items.map((i) => i.result)).toEqual([
      "linked",
      "refused",
      "not_found",
    ]);
    expect(answer.items[1]!.message).toContain("can link it");
  });
});
