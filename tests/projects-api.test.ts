import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import {
  isModuleOff,
  toActivity,
  toComment,
  toIssue,
  toProject,
  toSprint,
  toWeeklyTask,
} from "@/lib/api/projects";
import {
  openIssuesHeldBy,
  removalHolders,
  removalRefusal,
} from "@/lib/projects/members";
import { buildSample } from "@/lib/projects/sample";

/**
 * The adapter that reads the Projects API, against payloads copied from its own
 * contract, and the rule about taking somebody off a project.
 */

describe("reading a project", () => {
  const wire = {
    id: "p1",
    key: "CHK",
    name: "Checkout Revamp",
    description: "Rebuild web checkout.",
    type: "SCRUM",
    color: "#2A43D4",
    departmentId: null,
    departmentName: null,
    leadId: "e1",
    leadName: "Adaeze Okonkwo",
    goalId: null,
    memberIds: ["e1", "e2"],
    statuses: [
      {
        id: "s1",
        name: "To Do",
        category: "TODO",
        wipLimit: null,
        position: 0,
      },
      {
        id: "s2",
        name: "In Progress",
        category: "IN_PROGRESS",
        wipLimit: 5,
        position: 1,
      },
    ],
    openIssueCount: 3,
    issueCount: 9,
    activeSprintId: "sp1",
    canManage: true,
    createdAt: "2026-10-15T10:44:02.411Z",
    updatedAt: "2026-10-15T10:44:02.411Z",
  };

  it("carries what the cards need, and the API's own answer about managing", () => {
    const project = toProject(wire);
    expect(project).toMatchObject({
      key: "CHK",
      leadName: "Adaeze Okonkwo",
      openIssueCount: 3,
      issueCount: 9,
      activeSprintId: "sp1",
      canManage: true,
    });
    expect(project.memberIds).toEqual(["e1", "e2"]);
    expect(project.statuses.map((s) => s.wipLimit)).toEqual([null, 5]);
  });

  it("does not turn a missing count or answer into zero or false", () => {
    const project = toProject({ id: "p", key: "AB", name: "x", statuses: [] });
    expect(project.openIssueCount).toBeNull();
    expect(project.issueCount).toBeNull();
    expect(project.canManage).toBeNull();
    expect(project.memberIds).toEqual([]);
  });
});

describe("reading an issue", () => {
  const wire = {
    id: "i1",
    projectId: "p1",
    number: 2,
    key: "CHK-2",
    type: "STORY",
    title: "3-D Secure challenge flow",
    description: "",
    statusId: "s2",
    priority: "HIGHEST",
    assigneeId: "e2",
    reporterId: "e1",
    epicId: null,
    parentId: null,
    sprintId: "sp1",
    points: 8,
    labels: ["payments"],
    startDate: null,
    dueDate: "2026-10-20T00:00:00.000Z",
    rank: 0.5,
    doneAt: null,
    goalId: null,
    weeklyTask: null,
    commentCount: 3,
    createdAt: "2026-10-15T10:44:02.456Z",
    updatedAt: "2026-10-15T10:44:02.486Z",
    notified: [],
  };

  it("reads the fields, a date-only value as a day, and the comment count", () => {
    const issue = toIssue(wire);
    expect(issue.key).toBe("CHK-2");
    expect(issue.rank).toBe(0.5);
    expect(issue.dueDate).toBe("2026-10-20");
    expect(issue.commentCount).toBe(3);
    expect(issue.weeklyTask).toBeNull();
  });

  it("defaults the lists it might not be sent", () => {
    const issue = toIssue({ id: "x", key: "A-1", title: "t" });
    expect(issue.labels).toEqual([]);
    expect(issue.points).toBeNull();
    expect(issue.commentCount).toBe(0);
  });
});

describe("the weekly-task note", () => {
  it("passes the API's sentence through untouched", () => {
    expect(
      toWeeklyTask({
        state: "NOT_COUNTED",
        reason: "NO_OBJECTIVE",
        message:
          "Not counted toward a weekly task — link this issue or the project to an objective.",
      }),
    ).toEqual({
      state: "NOT_COUNTED",
      reason: "NO_OBJECTIVE",
      message:
        "Not counted toward a weekly task — link this issue or the project to an objective.",
    });
  });

  it("reads a filed task and whether it has been graded", () => {
    expect(
      toWeeklyTask({ state: "FILED", taskId: "t1", graded: true }),
    ).toEqual({
      state: "FILED",
      taskId: "t1",
      graded: true,
    });
  });

  it("treats anything else as nothing to say, never as filed", () => {
    expect(toWeeklyTask(null)).toBeNull();
    expect(toWeeklyTask(undefined)).toBeNull();
    expect(toWeeklyTask({ state: "SOMETHING_NEW" })).toBeNull();
    expect(toWeeklyTask("FILED")).toBeNull();
  });
});

describe("reading the rest", () => {
  it("reads a sprint with its dates as days", () => {
    const sprint = toSprint({
      id: "sp1",
      projectId: "p1",
      name: "CHK Sprint 1",
      goal: "Ship 3-D Secure",
      startDate: "2026-10-15",
      endDate: "2026-10-28",
      state: "ACTIVE",
      committedPoints: 8,
      completedPoints: null,
      closedAt: null,
      createdAt: "2026-10-15T10:44:02.479Z",
    });
    expect(sprint).toMatchObject({
      state: "ACTIVE",
      committedPoints: 8,
      completedPoints: null,
      endDate: "2026-10-28",
    });
  });

  it("reads a comment with its edit time, and a history row's nulls", () => {
    expect(
      toComment({
        id: "c1",
        issueId: "i1",
        authorId: "e2",
        body: "<@e1> hi",
        editedAt: null,
        createdAt: "2026-10-15T10:44:02.519Z",
      }).editedAt,
    ).toBeNull();
    const row = toActivity({
      id: "a1",
      issueId: "i1",
      actorId: null,
      field: "created",
      from: null,
      to: null,
      at: "2026-10-15T10:44:02.456Z",
    });
    expect(row.actorId).toBeNull();
    expect(row.from).toBeUndefined();
  });
});

describe("the module-off refusal", () => {
  it("is a 422 that says so in its details", () => {
    expect(
      isModuleOff(
        new ApiError(422, "unprocessable", "Projects is not switched on.", {
          reason: "module_off",
          module: "projects",
        }),
      ),
    ).toBe(true);
  });

  it("is not any other refusal", () => {
    expect(
      isModuleOff(
        new ApiError(422, "unprocessable", "x", { reason: "sprint_empty" }),
      ),
    ).toBe(false);
    expect(isModuleOff(new ApiError(404, "not_found", "x"))).toBe(false);
    expect(isModuleOff(new Error("x"))).toBe(false);
    expect(
      isModuleOff(
        new ApiError(422, "validation_failed", "x", [
          { field: "a", message: "b" },
        ]),
      ),
    ).toBe(false);
  });
});

describe("taking somebody off a project", () => {
  const sample = buildSample({
    today: "2026-10-15",
    now: "2026-10-15T12:00:00.000Z",
    people: ["p-01", "p-03", "p-09", "p-04"],
  });
  const names: Record<string, string> = {
    "p-03": "Chidi Nwosu",
    "p-09": "Emeka Anyanwu",
  };
  const nameOf = (id: string) => names[id] ?? id;

  it("counts open issues per person, finished work excluded", () => {
    const held = openIssuesHeldBy(sample.project.statuses, sample.issues);
    /* Chidi holds CHK-11 (Retry webhooks, done), CHK-6, CHK-15 (done)... only open ones count. */
    const chidi = sample.issues.filter(
      (i) => i.assigneeId === "p-03" && i.doneAt === null,
    ).length;
    expect(held.get("p-03") ?? 0).toBe(chidi);
  });

  it("refuses while they hold open issues, and names them with counts", () => {
    const holders = removalHolders(sample.project.statuses, sample.issues, [
      "p-09",
    ]);
    expect(holders.length).toBe(1);
    const text = removalRefusal(holders, nameOf);
    expect(text).toContain("Emeka Anyanwu");
    expect(text).toContain("open");
    expect(text).toMatch(/Reassign them first/);
  });

  it("allows it once they hold nothing open", () => {
    const cleared = sample.issues.map((i) =>
      i.assigneeId === "p-09" ? { ...i, assigneeId: null } : i,
    );
    expect(removalHolders(sample.project.statuses, cleared, ["p-09"])).toEqual(
      [],
    );
  });

  it("speaks of several people in the plural", () => {
    const text = removalRefusal(
      [
        { employeeId: "p-03", open: 2 },
        { employeeId: "p-09", open: 1 },
      ],
      nameOf,
    );
    expect(text).toContain("still have open issues");
  });
});
