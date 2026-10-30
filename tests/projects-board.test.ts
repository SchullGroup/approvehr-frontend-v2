import { describe, expect, it } from "vitest";
import {
  activeSprint,
  boardScope,
  columnIssues,
  decodeDropTarget,
  encodeDropTarget,
  isStaleDone,
  laneGroups,
  resolveDrop,
  sprintStrip,
} from "@/lib/projects/board";
import {
  EMPTY_FILTER,
  UNASSIGNED,
  applyFilter,
  filterAssigneeIds,
  isFiltering,
  matchesFilter,
  toggleAssignee,
} from "@/lib/projects/filters";
import {
  countProgress,
  epicProgress,
  percent,
  sprintPoints,
  sumPoints,
} from "@/lib/projects/progress";
import { buildSample } from "@/lib/projects/sample";
import { DEFAULT_SORT, nextSort, sortIssues } from "@/lib/projects/sort";
import type { Issue, ProjectData } from "@/lib/projects/types";
import { addDays } from "@/lib/projects/dates";

const TODAY = "2026-10-15";
const NOW = "2026-10-15T12:00:00.000Z";
const PEOPLE = ["p-01", "p-03", "p-09", "p-04"];
const NAMES: Record<string, string> = {
  "p-01": "Adaeze Okonkwo",
  "p-03": "Chidi Nwosu",
  "p-09": "Emeka Anyanwu",
  "p-04": "Ngozi Eze",
};
const nameOf = (id: string) => NAMES[id] ?? id;

function fixture(): ProjectData {
  const s = buildSample({ today: TODAY, now: NOW, people: PEOPLE });
  return { project: s.project, issues: s.issues, sprints: s.sprints };
}

const doneDayOf = (iso: string) => iso.slice(0, 10);
const byKey = (d: ProjectData, key: string): Issue =>
  d.issues.find((i) => i.key === key)!;
const status = (d: ProjectData, name: string) =>
  d.project.statuses.find((s) => s.name === name)!;

describe("filters", () => {
  const d = fixture();

  it("matches text against the key, the title and the labels", () => {
    const hit = (q: string) =>
      applyFilter(d.issues, { ...EMPTY_FILTER, q }, null).map((i) => i.key);
    expect(hit("chk-14")).toEqual(["CHK-14"]);
    expect(hit("3-d secure")).toContain("CHK-10");
    expect(hit("compliance")).toEqual(["CHK-10"]);
    expect(hit("zzz")).toEqual([]);
  });

  it("narrows by type", () => {
    const bugs = applyFilter(d.issues, { ...EMPTY_FILTER, type: "BUG" }, null);
    expect(bugs.length).toBe(4);
    expect(bugs.every((i) => i.type === "BUG")).toBe(true);
  });

  it("narrows to a person, to nobody, or to either", () => {
    const issue = (a: string | null): Issue =>
      ({ ...byKey(d, "CHK-14"), assigneeId: a }) as Issue;
    const f = { ...EMPTY_FILTER, assigneeIds: ["p-01"] };
    expect(matchesFilter(issue("p-01"), f, null)).toBe(true);
    expect(matchesFilter(issue("p-03"), f, null)).toBe(false);
    expect(matchesFilter(issue(null), f, null)).toBe(false);
    const nobody = { ...EMPTY_FILTER, assigneeIds: [UNASSIGNED] };
    expect(matchesFilter(issue(null), nobody, null)).toBe(true);
    expect(matchesFilter(issue("p-01"), nobody, null)).toBe(false);
    const both = { ...EMPTY_FILTER, assigneeIds: ["p-01", UNASSIGNED] };
    expect(matchesFilter(issue(null), both, null)).toBe(true);
    expect(matchesFilter(issue("p-01"), both, null)).toBe(true);
  });

  it("counts everybody on a shared task, for a person and for 'Only my issues'", () => {
    const shared = {
      ...byKey(d, "CHK-14"),
      assigneeId: "p-01",
      assigneeIds: ["p-01", "p-03"],
    } as Issue;
    expect(
      matchesFilter(shared, { ...EMPTY_FILTER, assigneeIds: ["p-03"] }, null),
    ).toBe(true);
    expect(matchesFilter(shared, { ...EMPTY_FILTER, mine: true }, "p-03")).toBe(
      true,
    );
    expect(matchesFilter(shared, { ...EMPTY_FILTER, mine: true }, "p-09")).toBe(
      false,
    );
  });

  it("'Only my issues' needs to know who I am, and shows nothing when it does not", () => {
    const mine = { ...EMPTY_FILTER, mine: true };
    const forMe = applyFilter(d.issues, mine, "p-03");
    expect(forMe.length).toBeGreaterThan(0);
    expect(forMe.every((i) => i.assigneeId === "p-03")).toBe(true);
    expect(applyFilter(d.issues, mine, null)).toEqual([]);
  });

  it("combines every part, and says whether anything is applied", () => {
    expect(isFiltering(EMPTY_FILTER)).toBe(false);
    expect(isFiltering({ ...EMPTY_FILTER, q: "  " })).toBe(false);
    expect(isFiltering({ ...EMPTY_FILTER, type: "BUG" })).toBe(true);
    const both = applyFilter(
      d.issues,
      { ...EMPTY_FILTER, type: "BUG", assigneeIds: ["p-09"] },
      null,
    );
    expect(both.map((i) => i.key)).toEqual(["CHK-7", "CHK-12"]);
  });

  it("toggles an assignee on and off", () => {
    const on = toggleAssignee(EMPTY_FILTER, "p-01");
    expect(on.assigneeIds).toEqual(["p-01"]);
    expect(toggleAssignee(on, "p-01").assigneeIds).toEqual([]);
  });

  it("offers members first, then anyone still holding an issue, capped", () => {
    const ids = filterAssigneeIds(["p-01"], [
      { assigneeId: "p-03" },
      { assigneeId: null },
    ] as Issue[]);
    expect(ids).toEqual(["p-01", "p-03"]);
    const many = Array.from({ length: 20 }, (_, i) => `m${i}`);
    expect(filterAssigneeIds(many, [])).toHaveLength(9);
  });
});

describe("what the board shows", () => {
  const d = fixture();

  it("shows the active sprint's issues on a Scrum board, sub-tasks included, never epics", () => {
    const scope = boardScope({
      project: d.project,
      issues: d.issues,
      sprints: d.sprints,
      today: TODAY,
      doneDayOf,
    });
    expect(scope.sprint?.name).toBe("CHK Sprint 3");
    expect(scope.issues.every((i) => i.sprintId === scope.sprint!.id)).toBe(
      true,
    );
    expect(scope.issues.some((i) => i.type === "EPIC")).toBe(false);
    expect(scope.issues.some((i) => i.type === "SUBTASK")).toBe(true);
    /* Seven issues in Sprint 3, plus their four sub-tasks. */
    expect(scope.issues).toHaveLength(7 + 4);
  });

  it("has nothing to show for a Scrum project with no active sprint", () => {
    const none = d.sprints.map((s) =>
      s.state === "ACTIVE" ? { ...s, state: "CLOSED" as const } : s,
    );
    const scope = boardScope({
      project: d.project,
      issues: d.issues,
      sprints: none,
      today: TODAY,
      doneDayOf,
    });
    expect(scope.sprint).toBeNull();
    expect(scope.issues).toEqual([]);
    expect(activeSprint(none)).toBeNull();
  });

  it("hides Done issues older than fourteen days on a Kanban board", () => {
    const kanban = { ...d.project, type: "KANBAN" as const };
    const issues = d.issues.map((i) => ({ ...i, sprintId: null }));
    const scope = boardScope({
      project: kanban,
      issues,
      sprints: [],
      today: TODAY,
      doneDayOf,
    });
    /* CHK-5..7 finished 22-25 days ago, CHK-8 14 days ago (kept), CHK-9 9 days ago. */
    const keys = scope.issues.map((i) => i.key);
    expect(keys).not.toContain("CHK-5");
    expect(keys).not.toContain("CHK-6");
    expect(keys).not.toContain("CHK-7");
    expect(keys).toContain("CHK-8");
    expect(keys).toContain("CHK-9");
    expect(keys.some((k) => ["CHK-1", "CHK-2"].includes(k))).toBe(false);
  });

  it("counts the fourteenth day as still showing and the fifteenth as gone", () => {
    const at = (n: number) => ({
      doneAt: `${addDays(TODAY, -n)}T09:00:00.000Z`,
    });
    expect(isStaleDone(at(14), addDays(TODAY, -14), TODAY)).toBe(false);
    expect(isStaleDone(at(15), addDays(TODAY, -15), TODAY)).toBe(true);
    expect(isStaleDone({ doneAt: null }, null, TODAY)).toBe(false);
  });

  it("puts issues in their column in rank order, and a lost status in the first column", () => {
    const orphan = { ...byKey(d, "CHK-14"), statusId: "gone", rank: -5 };
    const issues = [...d.issues.filter((i) => i.id !== orphan.id), orphan];
    const first = columnIssues(d.project.statuses, status(d, "To Do"), issues);
    expect(first[0]!.id).toBe(orphan.id);
    const ranks = first.map((i) => i.rank);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  it("describes the sprint strip, late once past its end", () => {
    const sprint = d.sprints.find((s) => s.state === "ACTIVE")!;
    expect(sprintStrip(sprint, TODAY)).toEqual({ left: 7, late: false });
    expect(sprintStrip(sprint, addDays(TODAY, 10))).toEqual({
      left: -3,
      late: true,
    });
  });
});

describe("swimlanes", () => {
  const d = fixture();
  const sprintIssues = d.issues.filter((i) => i.sprintId === "sp-chk-3");

  it("is one lane with no label when there are no swimlanes", () => {
    const lanes = laneGroups({
      mode: "none",
      issues: sprintIssues,
      allIssues: d.issues,
      nameOf,
    });
    expect(lanes).toHaveLength(1);
    expect(lanes[0]!.label).toBeNull();
    expect(lanes[0]!.items).toHaveLength(sprintIssues.length);
  });

  it("orders assignee lanes alphabetically with Unassigned last", () => {
    const withNobody = [
      ...sprintIssues,
      { ...sprintIssues[0]!, id: "x", assigneeId: null },
    ];
    const lanes = laneGroups({
      mode: "assignee",
      issues: withNobody,
      allIssues: d.issues,
      nameOf,
    });
    const labels = lanes.map((l) => l.label);
    expect(labels[labels.length - 1]).toBe("Unassigned");
    const people = labels.slice(0, -1) as string[];
    expect([...people].sort((a, b) => a.localeCompare(b))).toEqual(people);
    expect(lanes.reduce((n, l) => n + l.items.length, 0)).toBe(
      withNobody.length,
    );
  });

  it("groups by epic in rank order with 'No epic' last", () => {
    const loose = { ...sprintIssues[0]!, id: "y", epicId: null };
    const lanes = laneGroups({
      mode: "epic",
      issues: [...sprintIssues, loose],
      allIssues: d.issues,
      nameOf,
    });
    expect(lanes.map((l) => l.label)).toEqual([
      "Payments API v2",
      "Cart & checkout UX",
      "No epic",
    ]);
  });
});

describe("what a drop does", () => {
  const d = fixture();
  const sts = (name: string) => status(d, name).id;
  const memberIds = d.project.memberIds;

  const cell = (name: string) =>
    columnIssues(
      d.project.statuses,
      status(d, name),
      d.issues.filter((i) => i.sprintId === "sp-chk-3"),
    );

  it("moves to the column and takes a rank at the end of it when dropped on empty space", () => {
    const issue = byKey(d, "CHK-14"); // To Do
    const target = cell("In Progress");
    const patch = resolveDrop({
      issue,
      target: { statusId: sts("In Progress"), laneKey: "all" },
      cell: target,
      beforeId: null,
      mode: "none",
      memberIds,
    })!;
    expect(patch.statusId).toBe(sts("In Progress"));
    expect(patch.rank).toBe(Math.max(...target.map((i) => i.rank)) + 1);
  });

  it("takes the midpoint when dropped in front of a card", () => {
    const issue = byKey(d, "CHK-14");
    const target = cell("In Progress");
    expect(target.length).toBeGreaterThanOrEqual(2);
    const patch = resolveDrop({
      issue,
      target: { statusId: sts("In Progress"), laneKey: "all" },
      cell: target,
      beforeId: target[1]!.id,
      mode: "none",
      memberIds,
    })!;
    expect(patch.rank).toBe((target[0]!.rank + target[1]!.rank) / 2);
  });

  it("does nothing for a drop where the card already is", () => {
    const target = cell("In Progress");
    const issue = target[0]!;
    expect(
      resolveDrop({
        issue,
        target: { statusId: issue.statusId, laneKey: "all" },
        cell: target,
        beforeId: target[1]!.id,
        mode: "none",
        memberIds,
      }),
    ).toBeNull();
    expect(
      resolveDrop({
        issue: target[target.length - 1]!,
        target: { statusId: issue.statusId, laneKey: "all" },
        cell: target,
        beforeId: null,
        mode: "none",
        memberIds,
      }),
    ).toBeNull();
  });

  it("writes only a rank for a reorder within the same column", () => {
    const target = cell("In Progress");
    const last = target[target.length - 1]!;
    const patch = resolveDrop({
      issue: last,
      target: { statusId: last.statusId, laneKey: "all" },
      cell: target,
      beforeId: target[0]!.id,
      mode: "none",
      memberIds,
    })!;
    expect(Object.keys(patch)).toEqual(["rank"]);
    expect(patch.rank).toBe(target[0]!.rank - 1);
  });

  it("reassigns the assignee when dropped into another assignee lane", () => {
    const issue = byKey(d, "CHK-14"); // assigned p-01
    const patch = resolveDrop({
      issue,
      target: { statusId: issue.statusId, laneKey: "p-03" },
      cell: [],
      beforeId: null,
      mode: "assignee",
      memberIds,
    })!;
    expect(patch.assigneeIds).toEqual(["p-03"]);
    /* The others on it stay; the person whose lane it lands in leads. */
    const shared = resolveDrop({
      issue: { ...issue, assigneeIds: ["p-01", "p-09"] },
      target: { statusId: issue.statusId, laneKey: "p-03" },
      cell: [],
      beforeId: null,
      mode: "assignee",
      memberIds,
    })!;
    expect(shared.assigneeIds).toEqual(["p-03", "p-09"]);
    const unassign = resolveDrop({
      issue,
      target: { statusId: issue.statusId, laneKey: "none" },
      cell: [],
      beforeId: null,
      mode: "assignee",
      memberIds,
    })!;
    expect(unassign.assigneeIds).toEqual([]);
  });

  it("will not hand work to a lane's person who is not a member", () => {
    const issue = byKey(d, "CHK-14");
    const patch = resolveDrop({
      issue,
      target: { statusId: issue.statusId, laneKey: "someone-who-left" },
      cell: [],
      beforeId: null,
      mode: "assignee",
      memberIds,
    });
    /* No reassignment, and nothing else changed: the drop does nothing. */
    expect(patch).toBeNull();
    const elsewhere = cell("In Review");
    const moved = resolveDrop({
      issue,
      target: { statusId: sts("In Review"), laneKey: "someone-who-left" },
      cell: elsewhere,
      beforeId: null,
      mode: "assignee",
      memberIds,
    })!;
    expect(moved.assigneeId).toBeUndefined();
    expect(moved.statusId).toBe(sts("In Review"));
  });

  it("moves a story to another epic's lane, but leaves a sub-task with its parent's epic", () => {
    const story = byKey(d, "CHK-14");
    const epic = d.issues.find((i) => i.title === "Fraud screening")!;
    const patch = resolveDrop({
      issue: story,
      target: { statusId: story.statusId, laneKey: epic.id },
      cell: [],
      beforeId: null,
      mode: "epic",
      memberIds,
    })!;
    expect(patch.epicId).toBe(epic.id);
    const sub = d.issues.find((i) => i.type === "SUBTASK")!;
    expect(
      resolveDrop({
        issue: sub,
        target: { statusId: sub.statusId, laneKey: epic.id },
        cell: [],
        beforeId: null,
        mode: "epic",
        memberIds,
      }),
    ).toBeNull();
  });

  it("keeps an issue's own rank when it is dropped into an empty cell", () => {
    const issue = byKey(d, "CHK-14");
    const patch = resolveDrop({
      issue,
      target: { statusId: sts("Done"), laneKey: "all" },
      cell: [],
      beforeId: null,
      mode: "none",
      memberIds,
    })!;
    expect(patch).toEqual({ statusId: sts("Done") });
  });

  it("round-trips a drop target through its id", () => {
    const id = encodeDropTarget({ statusId: "st-1", laneKey: "p-01" });
    expect(decodeDropTarget(id)).toEqual({ statusId: "st-1", laneKey: "p-01" });
    expect(decodeDropTarget("nonsense")).toBeNull();
  });
});

describe("progress", () => {
  const d = fixture();
  const st = d.project.statuses;

  it("counts sub-task progress by issue", () => {
    const parent = byKey(d, "CHK-10");
    const subs = d.issues.filter((i) => i.parentId === parent.id);
    expect(countProgress(st, subs)).toEqual({
      done: 1,
      total: 3,
      ratio: 1 / 3,
    });
    expect(countProgress(st, [])).toEqual({ done: 0, total: 0, ratio: 0 });
  });

  it("weights an epic's bar by points, an unestimated issue counting as one", () => {
    const epic = d.issues.find((i) => i.title === "Payments API v2")!;
    const stories = d.issues.filter(
      (i) => i.epicId === epic.id && i.type !== "SUBTASK",
    );
    const p = epicProgress(st, stories);
    const total = stories.reduce((n, i) => n + (i.points ?? 1), 0);
    const done = stories
      .filter((i) => i.statusId === status(d, "Done").id)
      .reduce((n, i) => n + (i.points ?? 1), 0);
    expect(p.ratio).toBeCloseTo(done / total, 10);
    expect(p.total).toBe(stories.length);

    const noPoints = [{ ...stories[0]!, points: null }] as Issue[];
    expect(epicProgress(st, noPoints).total).toBe(1);
  });

  it("says nothing, not zero, for an epic with no issues", () => {
    expect(epicProgress(st, [])).toEqual({ done: 0, total: 0, ratio: null });
  });

  it("counts a sprint's points over top-level non-epic issues only", () => {
    const sprint = d.sprints.find((s) => s.state === "ACTIVE")!;
    const p = sprintPoints(st, d.issues, sprint);
    /* Sprint 3 holds 8, 3, 2, 5, 3, 1 and 5 points; 3, 5 and 1 of them are done. */
    expect(p.total).toBe(8 + 3 + 2 + 5 + 3 + 1 + 5);
    expect(p.done).toBe(3 + 5 + 1);
    expect(sumPoints([{ points: 2 }, { points: null }, { points: 3 }])).toBe(5);
    expect(percent(0.456)).toBe(46);
  });
});

describe("sorting the table", () => {
  const d = fixture();
  const ctx = { statuses: d.project.statuses, sprints: d.sprints, nameOf };

  it("starts in rank order and flips direction on a second click", () => {
    expect(DEFAULT_SORT).toEqual({ key: "rank", dir: 1 });
    expect(nextSort(DEFAULT_SORT, "title")).toEqual({ key: "title", dir: 1 });
    expect(nextSort({ key: "title", dir: 1 }, "title")).toEqual({
      key: "title",
      dir: -1,
    });
  });

  it("sorts by priority with the most urgent first", () => {
    const sorted = sortIssues(d.issues, { key: "priority", dir: 1 }, ctx);
    expect(sorted[0]!.priority).toBe("HIGHEST");
    expect(sorted[sorted.length - 1]!.priority).toBe("LOW");
  });

  it("sorts by assignee name with nobody last", () => {
    const sorted = sortIssues(d.issues, { key: "assignee", dir: 1 }, ctx);
    expect(sorted[0]!.assigneeId).toBe("p-01");
    expect(sorted[sorted.length - 1]!.assigneeId).toBeNull();
  });

  it("sorts by due date with undated issues last", () => {
    const sorted = sortIssues(d.issues, { key: "due", dir: 1 }, ctx);
    const dated = sorted.filter((i) => i.dueDate);
    expect(sorted.slice(0, dated.length)).toEqual(dated);
  });
});
