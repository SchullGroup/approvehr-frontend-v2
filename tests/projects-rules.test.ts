import { describe, expect, it } from "vitest";
import {
  buildIssue,
  nextIssueNumber,
  parseLabels,
  parsePoints,
  patchIssue,
  removeIssue,
  sanitisePatch,
} from "@/lib/projects/mutations";
import { buildSample } from "@/lib/projects/sample";
import type { Issue, ProjectData } from "@/lib/projects/types";
import {
  boardTypeChangeBlocker,
  checkboxTarget,
  effectiveStatus,
  isDone,
  removalBlocker,
  wipState,
  workflowProblem,
} from "@/lib/projects/workflow";

const TODAY = "2026-10-15";
const NOW = "2026-10-15T12:00:00.000Z";
const LATER = "2026-10-15T15:30:00.000Z";
const PEOPLE = ["p-01", "p-03", "p-09", "p-04"];

function fixture(): ProjectData {
  const s = buildSample({ today: TODAY, now: NOW, people: PEOPLE });
  return { project: s.project, issues: s.issues, sprints: s.sprints };
}

const find = (d: ProjectData, key: string): Issue => {
  const hit = d.issues.find((i) => i.key === key);
  if (!hit) throw new Error(`no ${key}`);
  return hit;
};

const status = (d: ProjectData, name: string) =>
  d.project.statuses.find((s) => s.name === name)!;

describe("the Checkout Revamp sample", () => {
  const s = buildSample({ today: TODAY, now: NOW, people: PEOPLE });

  it("has the shape the design promises", () => {
    expect(s.sprints).toHaveLength(4);
    expect(s.issues.filter((i) => i.type === "EPIC")).toHaveLength(4);
    expect(s.issues.filter((i) => i.type === "SUBTASK")).toHaveLength(4);
    expect(
      s.issues.filter((i) => i.type !== "EPIC" && i.type !== "SUBTASK"),
    ).toHaveLength(18);
    expect(Object.values(s.comments).flat()).toHaveLength(2);
    expect(s.project.key).toBe("CHK");
  });

  it("keeps one active sprint, two closed and one planned", () => {
    const states = s.sprints.map((sp) => sp.state);
    expect(states.filter((x) => x === "ACTIVE")).toHaveLength(1);
    expect(states.filter((x) => x === "CLOSED")).toHaveLength(2);
    expect(states.filter((x) => x === "PLANNED")).toHaveLength(1);
  });

  it("gives sub-tasks their parent's sprint and epic", () => {
    for (const sub of s.issues.filter((i) => i.type === "SUBTASK")) {
      const parent = s.issues.find((i) => i.id === sub.parentId)!;
      expect(sub.sprintId).toBe(parent.sprintId);
      expect(sub.epicId).toBe(parent.epicId);
    }
  });

  it("uses only people it was given, and falls back for a small company", () => {
    const small = buildSample({ today: TODAY, now: NOW, people: ["only"] });
    const holders = new Set(
      small.issues.map((i) => i.assigneeId).filter(Boolean),
    );
    expect([...holders]).toEqual(["only"]);
  });

  it("numbers issues from one and never repeats a key", () => {
    const keys = s.issues.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys[0]).toBe("CHK-1");
    expect(s.lastNumber).toBe(26);
  });

  it("leaves one epic without dates, for the roadmap's needs-dates list", () => {
    const undated = s.issues.filter(
      (i) => i.type === "EPIC" && !(i.startDate && i.dueDate),
    );
    expect(undated).toHaveLength(1);
  });
});

describe("doneAt follows the status category", () => {
  it("sets doneAt on entering a DONE status and clears it on leaving", () => {
    const d = fixture();
    const issue = find(d, "CHK-14");
    expect(issue.doneAt).toBeNull();
    const done = status(d, "Done");
    const moved = patchIssue(d, issue.id, { statusId: done.id }, NOW);
    expect(moved.issue!.doneAt).toBe(NOW);
    const reopened = patchIssue(
      moved.data,
      issue.id,
      { statusId: status(d, "In Progress").id },
      LATER,
    );
    expect(reopened.issue!.doneAt).toBeNull();
  });

  it("keeps doneAt when moving between two DONE statuses", () => {
    const d = fixture();
    const withShipped = {
      ...d,
      project: {
        ...d.project,
        statuses: [
          ...d.project.statuses,
          {
            id: "st-shipped",
            name: "Shipped",
            category: "DONE" as const,
            wipLimit: null,
            position: 4,
          },
        ],
      },
    };
    const issue = find(withShipped, "CHK-13");
    const doneAt = issue.doneAt;
    expect(doneAt).not.toBeNull();
    const moved = patchIssue(
      withShipped,
      issue.id,
      { statusId: "st-shipped" },
      LATER,
    );
    expect(moved.issue!.doneAt).toBe(doneAt);
  });

  it("does not stamp doneAt for a move that stays in progress", () => {
    const d = fixture();
    const issue = find(d, "CHK-14");
    const moved = patchIssue(
      d,
      issue.id,
      { statusId: status(d, "In Review").id },
      NOW,
    );
    expect(moved.issue!.doneAt).toBeNull();
  });
});

describe("sub-task inheritance", () => {
  it("moves a parent's sub-tasks with it when its sprint changes", () => {
    const d = fixture();
    const parent = find(d, "CHK-10");
    const subs = d.issues.filter((i) => i.parentId === parent.id);
    expect(subs).toHaveLength(3);
    const next = patchIssue(d, parent.id, { sprintId: "sp-chk-4" }, NOW);
    for (const sub of subs) {
      expect(next.data.issues.find((i) => i.id === sub.id)!.sprintId).toBe(
        "sp-chk-4",
      );
    }
    expect(next.touched).toHaveLength(4);
  });

  it("moves sub-tasks to the new epic when a parent changes epic", () => {
    const d = fixture();
    const parent = find(d, "CHK-10");
    const epic = d.issues.find(
      (i) => i.type === "EPIC" && i.title === "Fraud screening",
    )!;
    const next = patchIssue(d, parent.id, { epicId: epic.id }, NOW);
    const subs = next.data.issues.filter((i) => i.parentId === parent.id);
    expect(subs.every((s) => s.epicId === epic.id)).toBe(true);
  });

  it("refuses to move a sub-task out of its parent's sprint or epic", () => {
    const d = fixture();
    const sub = d.issues.find((i) => i.type === "SUBTASK")!;
    const next = patchIssue(
      d,
      sub.id,
      { sprintId: "sp-chk-4", epicId: null },
      NOW,
    );
    expect(next.issue!.sprintId).toBe(sub.sprintId);
    expect(next.issue!.epicId).toBe(sub.epicId);
    expect(next.changes).toHaveLength(0);
  });

  it("fixes a sub-task's type", () => {
    const d = fixture();
    const sub = d.issues.find((i) => i.type === "SUBTASK")!;
    const next = patchIssue(d, sub.id, { type: "BUG" }, NOW);
    expect(next.issue!.type).toBe("SUBTASK");
  });
});

describe("what the rules refuse in a patch", () => {
  it("gives an epic no sprint, epic or points", () => {
    const d = fixture();
    const epic = d.issues.find((i) => i.type === "EPIC")!;
    const patch = sanitisePatch(d, epic, {
      sprintId: "sp-chk-3",
      epicId: "x",
      points: 5,
      title: "Renamed",
    });
    expect(patch).toEqual({ title: "Renamed" });
  });

  it("drops a sprint on a Kanban project", () => {
    const d = fixture();
    const kanban = { ...d, project: { ...d.project, type: "KANBAN" as const } };
    const issue = find(kanban, "CHK-19");
    expect(sanitisePatch(kanban, issue, { sprintId: "sp-chk-4" })).toEqual({});
  });

  it("ignores a status the project does not have and an epic that is not an epic", () => {
    const d = fixture();
    const issue = find(d, "CHK-14");
    const story = find(d, "CHK-10");
    expect(
      sanitisePatch(d, issue, { statusId: "nope", epicId: story.id }),
    ).toEqual({});
  });

  it("will not retype an issue into an epic or a sub-task", () => {
    const d = fixture();
    const issue = find(d, "CHK-14");
    expect(sanitisePatch(d, issue, { type: "EPIC" })).toEqual({});
    expect(sanitisePatch(d, issue, { type: "SUBTASK" })).toEqual({});
    expect(sanitisePatch(d, issue, { type: "BUG" })).toEqual({ type: "BUG" });
  });

  it("trims titles, refuses an empty one, and normalises labels and points", () => {
    const d = fixture();
    const issue = find(d, "CHK-14");
    expect(sanitisePatch(d, issue, { title: "   " })).toEqual({});
    expect(sanitisePatch(d, issue, { title: "  Tidy  " })).toEqual({
      title: "Tidy",
    });
    expect(sanitisePatch(d, issue, { points: -3 })).toEqual({});
    expect(
      sanitisePatch(d, issue, { labels: ["a", " a ", "b"] }).labels,
    ).toEqual(["a", "b"]);
  });

  it("does nothing, and records nothing, for a patch that changes nothing", () => {
    const d = fixture();
    const issue = find(d, "CHK-14");
    const same = patchIssue(
      d,
      issue.id,
      { title: issue.title, priority: issue.priority },
      NOW,
    );
    expect(same.changes).toEqual([]);
    expect(same.data).toBe(d);
  });
});

describe("history", () => {
  it("writes one change per field and none for rank", () => {
    const d = fixture();
    const issue = find(d, "CHK-14");
    const next = patchIssue(
      d,
      issue.id,
      { priority: "LOW", points: 8, rank: 99, description: "More." },
      NOW,
    );
    expect(next.changes.map((c) => c.field).sort()).toEqual([
      "description",
      "points",
      "priority",
    ]);
    const priority = next.changes.find((c) => c.field === "priority")!;
    expect(priority).toEqual({ field: "priority", from: "HIGH", to: "LOW" });
    const description = next.changes.find((c) => c.field === "description")!;
    expect(description.from).toBeUndefined();
    expect(description.to).toBeUndefined();
    expect(next.issue!.rank).toBe(99);
  });

  it("writes only rank when only rank moved, and no history row", () => {
    const d = fixture();
    const issue = find(d, "CHK-14");
    const next = patchIssue(d, issue.id, { rank: 0.5 }, NOW);
    expect(next.changes).toEqual([]);
    expect(next.issue!.rank).toBe(0.5);
    expect(next.issue!.updatedAt).toBe(NOW);
  });
});

describe("creating and deleting", () => {
  it("builds an issue with the next key, the first status and the end of the rank", () => {
    const d = fixture();
    const issue = buildIssue(
      d,
      { type: "TASK", title: "  Add retry banner  ", points: 3 },
      {
        id: "new",
        now: NOW,
        actorId: "p-03",
        number: nextIssueNumber(d.issues),
      },
    );
    expect(issue.key).toBe("CHK-27");
    expect(issue.title).toBe("Add retry banner");
    expect(issue.statusId).toBe(status(d, "To Do").id);
    expect(issue.rank).toBe(Math.max(...d.issues.map((i) => i.rank)) + 1);
    expect(issue.reporterId).toBe("p-03");
    expect(issue.doneAt).toBeNull();
  });

  it("never reuses a number after a delete when given the counter as a floor", () => {
    const d = fixture();
    expect(nextIssueNumber(d.issues, 40)).toBe(41);
  });

  it("makes a sub-task inherit its parent's sprint and epic", () => {
    const d = fixture();
    const parent = find(d, "CHK-16");
    const sub = buildIssue(
      d,
      {
        type: "SUBTASK",
        title: "Guest banner",
        parentId: parent.id,
        sprintId: "sp-chk-4",
      },
      { id: "s", now: NOW, actorId: null, number: 27 },
    );
    expect(sub.parentId).toBe(parent.id);
    expect(sub.sprintId).toBe(parent.sprintId);
    expect(sub.epicId).toBe(parent.epicId);
  });

  it("stamps doneAt on an issue created straight into a DONE status", () => {
    const d = fixture();
    const issue = buildIssue(
      d,
      { type: "TASK", title: "Already done", statusId: status(d, "Done").id },
      { id: "x", now: NOW, actorId: null, number: 27 },
    );
    expect(issue.doneAt).toBe(NOW);
  });

  it("keeps epics out of sprints and off the points scale", () => {
    const d = fixture();
    const epic = buildIssue(
      d,
      {
        type: "EPIC",
        title: "Loyalty",
        sprintId: "sp-chk-3",
        points: 8,
        startDate: "2026-11-01",
        dueDate: "2026-12-01",
      },
      { id: "e", now: NOW, actorId: null, number: 27 },
    );
    expect(epic.sprintId).toBeNull();
    expect(epic.points).toBeNull();
    expect(epic.startDate).toBe("2026-11-01");
  });

  it("deletes an issue with its sub-tasks", () => {
    const d = fixture();
    const parent = find(d, "CHK-10");
    const result = removeIssue(d, parent.id, NOW);
    expect(result.removedIds).toHaveLength(4);
    expect(result.data.issues).toHaveLength(d.issues.length - 4);
    expect(result.data.issues.some((i) => i.parentId === parent.id)).toBe(
      false,
    );
  });

  it("releases an epic's stories when the epic is deleted", () => {
    const d = fixture();
    const epic = d.issues.find(
      (i) => i.type === "EPIC" && i.title === "Saved cards",
    )!;
    const result = removeIssue(d, epic.id, NOW);
    expect(result.releasedIds).toHaveLength(1);
    expect(
      result.data.issues.find((i) => i.key === "CHK-20")!.epicId,
    ).toBeNull();
    expect(result.data.issues).toHaveLength(d.issues.length - 1);
  });
});

describe("labels and points", () => {
  it("parses comma separated labels, trimmed, unique, at most twelve", () => {
    expect(parseLabels("api, web ,API,,ops")).toEqual(["api", "web", "ops"]);
    const many = Array.from({ length: 20 }, (_, i) => `l${i}`).join(",");
    expect(parseLabels(many)).toHaveLength(12);
  });

  it("reads points as whole non-negative numbers or nothing", () => {
    expect(parsePoints("5")).toBe(5);
    expect(parsePoints("2.6")).toBe(3);
    expect(parsePoints("")).toBeNull();
    expect(parsePoints("-1")).toBeNull();
    expect(parsePoints("abc")).toBeNull();
    expect(parsePoints(null)).toBeNull();
    expect(parsePoints(0)).toBe(0);
  });
});

describe("workflow rules", () => {
  const draft = (
    names: [string, "TODO" | "IN_PROGRESS" | "DONE", number | null][],
  ) =>
    names.map(([name, category, wipLimit]) => ({ name, category, wipLimit }));

  it("needs at least two statuses and one Done", () => {
    expect(workflowProblem(draft([["Done", "DONE", null]]))).toMatch(
      /at least 2/,
    );
    expect(
      workflowProblem(
        draft([
          ["A", "TODO", null],
          ["B", "IN_PROGRESS", null],
        ]),
      ),
    ).toMatch(/Done status/);
    expect(
      workflowProblem(
        draft([
          ["A", "TODO", null],
          ["B", "DONE", null],
        ]),
      ),
    ).toBeNull();
  });

  it("refuses blank and duplicate names and a bad WIP limit", () => {
    expect(
      workflowProblem(
        draft([
          ["", "TODO", null],
          ["B", "DONE", null],
        ]),
      ),
    ).toMatch(/needs a name/);
    expect(
      workflowProblem(
        draft([
          ["A", "TODO", null],
          ["a", "DONE", null],
        ]),
      ),
    ).toMatch(/Two statuses/);
    expect(
      workflowProblem(
        draft([
          ["A", "TODO", 0],
          ["B", "DONE", null],
        ]),
      ),
    ).toMatch(/WIP limit/);
    expect(
      workflowProblem(
        draft([
          ["A", "TODO", 2.5],
          ["B", "DONE", null],
        ]),
      ),
    ).toMatch(/WIP limit/);
  });

  it("refuses to remove a status that has issues, and says how many", () => {
    const d = fixture();
    const reason = removalBlocker(
      d.project.statuses,
      d.issues,
      status(d, "Done").id,
    );
    expect(reason).toMatch(/issues are in Done/);
    expect(reason).toMatch(/another status first/);
  });

  it("allows removing an empty status while two or more remain and a Done is kept", () => {
    const d = fixture();
    const empty = {
      ...d,
      issues: d.issues.filter((i) => i.statusId !== status(d, "In Review").id),
    };
    expect(
      removalBlocker(
        empty.project.statuses,
        empty.issues,
        status(d, "In Review").id,
      ),
    ).toBeNull();
    const two = [
      {
        id: "a",
        name: "A",
        category: "TODO" as const,
        wipLimit: null,
        position: 0,
      },
      {
        id: "b",
        name: "B",
        category: "DONE" as const,
        wipLimit: null,
        position: 1,
      },
    ];
    expect(removalBlocker(two, [], "a")).toMatch(/at least 2/);
  });

  it("will not remove the last Done status even when it is empty", () => {
    const three = [
      {
        id: "a",
        name: "A",
        category: "TODO" as const,
        wipLimit: null,
        position: 0,
      },
      {
        id: "b",
        name: "B",
        category: "IN_PROGRESS" as const,
        wipLimit: null,
        position: 1,
      },
      {
        id: "c",
        name: "C",
        category: "DONE" as const,
        wipLimit: null,
        position: 2,
      },
    ];
    expect(removalBlocker(three, [], "c")).toMatch(/at least one Done/);
  });

  it("colours a column over its limit and nothing else", () => {
    expect(wipState(6, 5)).toBe("over");
    expect(wipState(5, 5)).toBe("within");
    expect(wipState(2, 5)).toBe("within");
    expect(wipState(99, null)).toBe("none");
  });

  it("reads categories from the status, not the name", () => {
    const d = fixture();
    expect(isDone(d.project.statuses, find(d, "CHK-13"))).toBe(true);
    expect(isDone(d.project.statuses, find(d, "CHK-14"))).toBe(false);
    /* An issue whose status has gone sits in the first column. */
    expect(effectiveStatus(d.project.statuses, "gone").name).toBe("To Do");
  });

  it("sends a ticked sub-task to Done and an unticked one back to To Do", () => {
    const d = fixture();
    expect(checkboxTarget(d.project.statuses, false).name).toBe("Done");
    expect(checkboxTarget(d.project.statuses, true).name).toBe("To Do");
  });

  it("refuses to change the board type while a sprint is active or holds issues", () => {
    const d = fixture();
    expect(
      boardTypeChangeBlocker(d.project, "KANBAN", d.issues, d.sprints),
    ).toMatch(/active sprint/);
    const none = d.sprints.map((s) => ({ ...s, state: "PLANNED" as const }));
    expect(boardTypeChangeBlocker(d.project, "KANBAN", d.issues, none)).toMatch(
      /planned into sprints/,
    );
    expect(boardTypeChangeBlocker(d.project, "KANBAN", [], none)).toBeNull();
    expect(
      boardTypeChangeBlocker(d.project, "SCRUM", d.issues, d.sprints),
    ).toBeNull();
  });
});
