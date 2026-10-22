import { describe, expect, it } from "vitest";
import {
  BACKLOG,
  buildBacklog,
  completionLine,
  decodeChoice,
  encodeChoice,
  listFor,
  moveOptions,
  resolveBacklogMove,
  resolveChoice,
  sectionOf,
  sprintFigures,
  type BacklogLayout,
} from "@/lib/projects/backlog";
import { addDays } from "@/lib/projects/dates";
import { applyFilter, EMPTY_FILTER } from "@/lib/projects/filters";
import {
  completeSprint,
  nextSprintDraft,
  startBlocker,
} from "@/lib/projects/sprints";
import type { Issue, ProjectData, Sprint } from "@/lib/projects/types";
import { NOW, TODAY, sampleData } from "./projects-fixture";

/**
 * The backlog's rules, without a screen: which list an issue is in, what a drop or
 * a menu choice writes, and the figures the sprint dialogs and the closing line
 * are made from.
 *
 * "Checkout Revamp" is the data. Sprint 3 is active (CHK-10 to CHK-16, 27 points,
 * 9 done), Sprint 4 is planned (CHK-17 and CHK-18, 11 points), and CHK-19 to
 * CHK-22 are loose in the backlog (17 points). Ranks are the issue numbers.
 */

const doneDayOf = (instant: string) => instant.slice(0, 10);

function layoutOf(
  data: ProjectData = sampleData(),
  visible?: (issue: Issue) => boolean,
): BacklogLayout {
  return buildBacklog({
    project: data.project,
    issues: data.issues,
    sprints: data.sprints,
    today: TODAY,
    doneDayOf,
    ...(visible ? { visible } : {}),
  });
}

const keys = (issues: readonly Issue[]) => issues.map((i) => i.key);
const byKey = (data: ProjectData, key: string) =>
  data.issues.find((i) => i.key === key)!;
const sprintNamed = (data: ProjectData, name: string) =>
  data.sprints.find((s) => s.name === name)!;

describe("what the backlog lists", () => {
  it("makes a list per open sprint, the running one first, then the backlog", () => {
    const layout = layoutOf();
    expect(layout.kind).toBe("SCRUM");
    expect(layout.sprints.map((s) => s.sprint.name)).toEqual([
      "CHK Sprint 3",
      "CHK Sprint 4",
    ]);
    expect(keys(layout.sprints[1]!.all)).toEqual(["CHK-17", "CHK-18"]);
    expect(keys(layout.backlog.all)).toEqual([
      "CHK-19",
      "CHK-20",
      "CHK-21",
      "CHK-22",
    ]);
  });

  it("never lists epics or sub-tasks, and keeps rank order", () => {
    const layout = layoutOf();
    const everything = [
      ...layout.sprints.flatMap((s) => s.all),
      ...layout.backlog.all,
    ];
    expect(everything.some((i) => i.type === "EPIC")).toBe(false);
    expect(everything.some((i) => i.type === "SUBTASK")).toBe(false);
    const active = layout.sprints[0]!.all;
    expect(keys(active)).toEqual([
      "CHK-10",
      "CHK-11",
      "CHK-12",
      "CHK-13",
      "CHK-14",
      "CHK-15",
      "CHK-16",
    ]);
  });

  it("puts the real figures in a sprint's header, from every issue in it", () => {
    const [active, planned] = layoutOf().sprints;
    expect(active).toMatchObject({ count: 7, points: 27, done: 3 });
    expect(planned).toMatchObject({ count: 2, points: 11, done: 0 });
  });

  it("narrows the rows with the filter but not the figures", () => {
    const data = sampleData();
    const layout = layoutOf(
      data,
      (issue) =>
        applyFilter([issue], { ...EMPTY_FILTER, type: "BUG" }, null).length > 0,
    );
    const active = layout.sprints[0]!;
    expect(keys(active.shown)).toEqual(["CHK-12", "CHK-15"]);
    expect(active.count).toBe(7);
    expect(active.points).toBe(27);
    expect(keys(layout.backlog.shown)).toEqual(["CHK-21"]);
    expect(layout.backlog.count).toBe(4);
  });

  it("sends an unfinished issue in a closed sprint back to the backlog, and hides a finished one", () => {
    const data = sampleData();
    const closed = sprintNamed(data, "CHK Sprint 2");
    const reopened: ProjectData = {
      ...data,
      issues: data.issues.map((i) =>
        i.key === "CHK-8" ? { ...i, statusId: "st-chk-todo", doneAt: null } : i,
      ),
    };
    const layout = layoutOf(reopened);
    /* CHK-8 (story i4) was finished in Sprint 2 and has been reopened. */
    expect(keys(layout.backlog.all)).toContain("CHK-8");
    expect(keys(layout.backlog.all)).not.toContain("CHK-9");
    expect(
      sectionOf(
        byKey(reopened, "CHK-8"),
        reopened.sprints,
        data.project.statuses,
      ),
    ).toBe(BACKLOG);
    expect(
      sectionOf(
        byKey(reopened, "CHK-9"),
        reopened.sprints,
        data.project.statuses,
      ),
    ).toBe(closed.id);
  });

  it("makes one ordered queue of a Kanban project, without finished work older than a fortnight", () => {
    const data = sampleData();
    const kanban: ProjectData = {
      project: { ...data.project, type: "KANBAN" },
      sprints: [],
      issues: data.issues.map((i) => ({ ...i, sprintId: null })),
    };
    const layout = layoutOf(kanban);
    expect(layout.kind).toBe("KANBAN");
    expect(layout.sprints).toEqual([]);
    const queue = keys(layout.backlog.all);
    /* CHK-5 finished 25 days ago; CHK-13 two days ago. */
    expect(queue).not.toContain("CHK-5");
    expect(queue).toContain("CHK-13");
    expect(queue).toEqual(
      [...queue].sort((a, b) => Number(a.slice(4)) - Number(b.slice(4))),
    );
  });
});

describe("what a drop writes", () => {
  const scrumMove = (
    data: ProjectData,
    key: string,
    section: string,
    beforeKey: string | null,
  ) => {
    const layout = layoutOf(data);
    const issue = byKey(data, key);
    return resolveBacklogMove({
      issue,
      section,
      siblings: listFor(layout, section),
      beforeId: beforeKey ? byKey(data, beforeKey).id : null,
      scrum: true,
    });
  };

  it("plans a backlog issue into a sprint, at the end of it", () => {
    const data = sampleData();
    const planned = sprintNamed(data, "CHK Sprint 4");
    const patch = scrumMove(data, "CHK-19", planned.id, null);
    expect(patch).toEqual({ sprintId: planned.id, rank: 19 });
  });

  it("puts a dropped issue between its neighbours by the midpoint of their ranks", () => {
    const data = sampleData();
    const planned = sprintNamed(data, "CHK Sprint 4");
    const patch = scrumMove(data, "CHK-19", planned.id, "CHK-18");
    expect(patch).toEqual({ sprintId: planned.id, rank: 17.5 });
  });

  it("puts it above the first row when dropped in front of it", () => {
    const data = sampleData();
    const planned = sprintNamed(data, "CHK Sprint 4");
    expect(scrumMove(data, "CHK-19", planned.id, "CHK-17")).toEqual({
      sprintId: planned.id,
      rank: 16,
    });
  });

  it("returns an issue to the backlog with a null sprint", () => {
    const data = sampleData();
    const patch = scrumMove(data, "CHK-17", BACKLOG, "CHK-20");
    expect(patch).toMatchObject({ sprintId: null });
    expect((patch as { rank: number }).rank).toBeGreaterThan(19);
    expect((patch as { rank: number }).rank).toBeLessThan(20);
  });

  it("reorders inside a list with only a rank, and writes nothing when the order is unchanged", () => {
    const data = sampleData();
    expect(scrumMove(data, "CHK-22", BACKLOG, "CHK-19")).toEqual({
      rank: 18,
    });
    /* CHK-21 is already in front of CHK-22: dropping it there is no change. */
    expect(scrumMove(data, "CHK-21", BACKLOG, "CHK-22")).toBeNull();
    /* And the last one dropped at the end of its own list. */
    expect(scrumMove(data, "CHK-22", BACKLOG, null)).toBeNull();
  });

  it("keeps its own rank when the list it lands in is empty", () => {
    const data = sampleData();
    const empty: Sprint = {
      ...sprintNamed(data, "CHK Sprint 4"),
      id: "sp-new",
      name: "CHK Sprint 5",
    };
    const withEmpty: ProjectData = {
      ...data,
      sprints: [...data.sprints, empty],
    };
    expect(scrumMove(withEmpty, "CHK-19", "sp-new", null)).toEqual({
      sprintId: "sp-new",
    });
  });

  it("ranks against the rows a filter is hiding, so they are not reshuffled", () => {
    const data = sampleData();
    const layout = layoutOf(data);
    /* Only bugs are on screen: CHK-21. Dropping CHK-22 in front of it must land
       between CHK-20 (hidden, rank 20) and CHK-21 — not above everything. */
    const patch = resolveBacklogMove({
      issue: byKey(data, "CHK-22"),
      section: BACKLOG,
      siblings: layout.backlog.all,
      beforeId: byKey(data, "CHK-21").id,
      scrum: true,
    });
    expect(patch).toEqual({ rank: 20.5 });
  });

  it("never writes a sprint on a Kanban project", () => {
    const data = sampleData();
    const kanban: ProjectData = {
      project: { ...data.project, type: "KANBAN" },
      sprints: [],
      issues: data.issues.map((i) => ({ ...i, sprintId: null })),
    };
    const layout = layoutOf(kanban);
    const patch = resolveBacklogMove({
      issue: byKey(kanban, "CHK-22"),
      section: BACKLOG,
      siblings: layout.backlog.all,
      beforeId: byKey(kanban, "CHK-19").id,
      scrum: false,
    });
    /* CHK-18 is the row above it in the queue. */
    expect(patch).toEqual({ rank: 18.5 });
  });

  it("clears the closed sprint of an issue that was reopened into the backlog", () => {
    const data = sampleData();
    const reopened: ProjectData = {
      ...data,
      issues: data.issues.map((i) =>
        i.key === "CHK-8" ? { ...i, statusId: "st-chk-todo", doneAt: null } : i,
      ),
    };
    const layout = layoutOf(reopened);
    const patch = resolveBacklogMove({
      issue: byKey(reopened, "CHK-8"),
      section: BACKLOG,
      siblings: layout.backlog.all,
      beforeId: null,
      scrum: true,
    });
    expect(patch).toMatchObject({ sprintId: null });
  });
});

describe("the Move to menu", () => {
  const optionsFor = (data: ProjectData, key: string) =>
    moveOptions({
      issue: byKey(data, key),
      layout: layoutOf(data),
      sprints: data.sprints,
      statuses: data.project.statuses,
    });

  it("offers every other list, and top and bottom of its own", () => {
    const data = sampleData();
    const options = optionsFor(data, "CHK-20");
    const by = (label: string) => options.find((o) => o.label === label)!;
    expect(options.map((o) => o.label)).toEqual([
      "CHK Sprint 3 (active)",
      "CHK Sprint 4",
      "Backlog",
      "Top of this list",
      "Bottom of this list",
    ]);
    expect(by("Backlog").disabled).toBe(true);
    expect(by("CHK Sprint 4").disabled).toBe(false);
    expect(by("Top of this list").disabled).toBe(false);
    expect(by("Bottom of this list").disabled).toBe(false);
  });

  it("will not offer top for the first row or bottom for the last", () => {
    const data = sampleData();
    const first = optionsFor(data, "CHK-19");
    expect(first.find((o) => o.label === "Top of this list")!.disabled).toBe(
      true,
    );
    const last = optionsFor(data, "CHK-22");
    expect(last.find((o) => o.label === "Bottom of this list")!.disabled).toBe(
      true,
    );
  });

  it("is only about order on a Kanban project", () => {
    const data = sampleData();
    const kanban: ProjectData = {
      project: { ...data.project, type: "KANBAN" },
      sprints: [],
      issues: data.issues.map((i) => ({ ...i, sprintId: null })),
    };
    const options = moveOptions({
      issue: byKey(kanban, "CHK-20"),
      layout: layoutOf(kanban),
      sprints: kanban.sprints,
      statuses: kanban.project.statuses,
    });
    expect(options.map((o) => o.label)).toEqual([
      "Top of this list",
      "Bottom of this list",
    ]);
  });

  it("turns a choice into the same patch a drop would", () => {
    const data = sampleData();
    const layout = layoutOf(data);
    const planned = sprintNamed(data, "CHK Sprint 4");
    const args = {
      issue: byKey(data, "CHK-20"),
      layout,
      sprints: data.sprints,
      statuses: data.project.statuses,
    };
    expect(
      resolveChoice({
        ...args,
        choice: { kind: "section", section: planned.id },
      }),
    ).toEqual({ sprintId: planned.id, rank: 19 });
    expect(resolveChoice({ ...args, choice: { kind: "top" } })).toEqual({
      rank: 18,
    });
    expect(resolveChoice({ ...args, choice: { kind: "bottom" } })).toEqual({
      rank: 23,
    });
  });

  it("round-trips a choice through the option value", () => {
    for (const choice of [
      { kind: "top" },
      { kind: "bottom" },
      { kind: "section", section: BACKLOG },
      { kind: "section", section: "sp-chk-4" },
    ] as const) {
      expect(decodeChoice(encodeChoice(choice))).toEqual(choice);
    }
    expect(decodeChoice("")).toBeNull();
    expect(decodeChoice("to:")).toBeNull();
    expect(decodeChoice("nonsense")).toBeNull();
  });
});

describe("sprint figures and the closing line", () => {
  it("counts top-level issues only, as the API commits and completes them", () => {
    const data = sampleData();
    const active = sprintNamed(data, "CHK Sprint 3");
    expect(
      sprintFigures(data.project.statuses, data.issues, active.id),
    ).toEqual({
      issues: 7,
      points: 27,
      doneIssues: 3,
      donePoints: 9,
      openIssues: 4,
      openPoints: 18,
    });
  });

  it("says what happened in real figures", () => {
    const figures = {
      issues: 7,
      points: 26,
      doneIssues: 4,
      donePoints: 22,
      openIssues: 3,
      openPoints: 4,
    };
    expect(completionLine("CHK Sprint 3", figures, { kind: "backlog" })).toBe(
      "CHK Sprint 3 completed, 22 of 26 points done; 3 issues moved to the backlog",
    );
    expect(
      completionLine("CHK Sprint 3", figures, {
        kind: "sprint",
        name: "CHK Sprint 4",
      }),
    ).toBe(
      "CHK Sprint 3 completed, 22 of 26 points done; 3 issues moved to CHK Sprint 4",
    );
    expect(completionLine("CHK Sprint 3", figures, { kind: "new" })).toMatch(
      /3 issues moved to a new sprint$/,
    );
  });

  it("says nothing about moving when everything was done, and counts issues when nothing was estimated", () => {
    expect(
      completionLine(
        "CHK Sprint 3",
        {
          issues: 5,
          points: 20,
          doneIssues: 5,
          donePoints: 20,
          openIssues: 0,
          openPoints: 0,
        },
        { kind: "backlog" },
      ),
    ).toBe("CHK Sprint 3 completed, 20 of 20 points done");
    expect(
      completionLine(
        "CHK Sprint 3",
        {
          issues: 4,
          points: 0,
          doneIssues: 3,
          donePoints: 0,
          openIssues: 1,
          openPoints: 0,
        },
        { kind: "backlog" },
      ),
    ).toBe(
      "CHK Sprint 3 completed, 3 of 4 issues done; 1 issue moved to the backlog",
    );
    expect(
      completionLine(
        "CHK Sprint 3",
        {
          issues: 0,
          points: 0,
          doneIssues: 0,
          donePoints: 0,
          openIssues: 0,
          openPoints: 0,
        },
        { kind: "backlog" },
      ),
    ).toBe("CHK Sprint 3 completed");
  });
});

describe("the sprint rules the dialogs rely on", () => {
  it("refuses to start a sprint with nothing in it, or while another is running", () => {
    const data = sampleData();
    const four = sprintNamed(data, "CHK Sprint 4");
    expect(startBlocker(four, data.sprints, data.issues)).toBe(
      "Complete the active sprint first.",
    );
    const noneRunning = data.sprints.map((s) =>
      s.state === "ACTIVE" ? { ...s, state: "CLOSED" as const } : s,
    );
    expect(startBlocker(four, noneRunning, data.issues)).toBeNull();
    const empty = data.issues.map((i) =>
      i.sprintId === four.id ? { ...i, sprintId: null } : i,
    );
    expect(startBlocker(four, noneRunning, empty)).toBe("Add issues first.");
  });

  it("names a new sprint past one that already exists after a deletion", () => {
    const data = sampleData();
    /* Sprint 2 was deleted: three sprints left, and "CHK Sprint 4" is taken. */
    const left = data.sprints.filter((s) => s.name !== "CHK Sprint 2");
    expect(left).toHaveLength(3);
    expect(nextSprintDraft(data.project, left, TODAY).name).toBe(
      "CHK Sprint 5",
    );
    expect(nextSprintDraft(data.project, data.sprints, TODAY).name).toBe(
      "CHK Sprint 5",
    );
    expect(nextSprintDraft(data.project, [], TODAY).name).toBe("CHK Sprint 1");
  });

  it("starts a draft the day after the last sprint's end", () => {
    const data = sampleData();
    const draft = nextSprintDraft(data.project, data.sprints, TODAY);
    expect(draft.startDate).toBe(addDays(TODAY, 22));
  });

  it("keeps a finished parent's sub-tasks with it when a sprint is completed, as the API does", () => {
    const data = sampleData();
    const active = sprintNamed(data, "CHK Sprint 3");
    /* CHK-10 is open; its sub-tasks move with it. Make a *finished* parent
       (CHK-11) carry an unfinished sub-task, which must stay in the sprint. */
    const parent = byKey(data, "CHK-11");
    const stray: Issue = {
      ...byKey(data, "CHK-25"),
      id: "is-stray",
      key: "CHK-99",
      number: 99,
      parentId: parent.id,
      sprintId: parent.sprintId,
      epicId: parent.epicId,
      statusId: "st-chk-todo",
      doneAt: null,
    };
    const withStray: ProjectData = {
      ...data,
      issues: [...data.issues, stray],
    };
    const out = completeSprint(withStray, active.id, null, NOW, null).data;
    const after = (key: string) => out.issues.find((i) => i.key === key)!;
    expect(after("CHK-99").sprintId).toBe(active.id);
    expect(after("CHK-11").sprintId).toBe(active.id);
    /* And the open parent's own sub-tasks went with it. */
    expect(after("CHK-10").sprintId).toBeNull();
    expect(after("CHK-24").sprintId).toBeNull();
  });
});
