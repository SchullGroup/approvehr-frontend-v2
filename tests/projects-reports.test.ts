import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/projects/dates";
import {
  VELOCITY_SPRINTS,
  burndown,
  burndownSprints,
  defaultBurndownSprint,
  niceStep,
  pointsAxis,
  pointsOf,
  reportTiles,
  sprintShortName,
  statusBreakdown,
  typeBreakdown,
  velocity,
  workload,
  type Burndown,
} from "@/lib/projects/reports";
import { buildSample } from "@/lib/projects/sample";
import type { Issue, Sprint } from "@/lib/projects/types";

/**
 * Reports are plain functions of the issue and sprint lists. The sample project is
 * hand-counted from its rows (see the comments), and each rule that a figure
 * depends on has a case of its own: the 7-day window's edges, the overdue rule,
 * a weekend in a burndown, a sprint with no points, one with no dates.
 */

const TODAY = "2026-10-15"; /* a Thursday */
const NOW = "2026-10-15T12:00:00.000Z";
const PEOPLE = ["p-01", "p-03", "p-09", "p-04"];
const NAMES: Record<string, string> = {
  "p-01": "Adaeze Okonkwo",
  "p-03": "Chidi Nwosu",
  "p-09": "Emeka Anyanwu",
  "p-04": "Ngozi Eze",
};
const nameOf = (id: string) => NAMES[id] ?? id;
const dayOf = (instant: string) => instant.slice(0, 10);

const data = buildSample({ today: TODAY, now: NOW, people: PEOPLE });
const statuses = data.project.statuses;
const TODO = statuses.find((s) => s.name === "To Do")!.id;
const PROG = statuses.find((s) => s.name === "In Progress")!.id;
const DONE = statuses.find((s) => s.name === "Done")!.id;

let counter = 0;
function issue(over: Partial<Issue> = {}): Issue {
  counter += 1;
  return {
    id: `i${counter}`,
    projectId: "p",
    number: counter,
    key: `T-${counter}`,
    type: "TASK",
    title: `Issue ${counter}`,
    description: "",
    statusId: TODO,
    priority: "MEDIUM",
    assigneeId: null,
    reporterId: null,
    epicId: null,
    parentId: null,
    sprintId: null,
    points: null,
    labels: [],
    startDate: null,
    dueDate: null,
    rank: counter,
    doneAt: null,
    goalId: null,
    weeklyTask: null,
    commentCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
    assigneeIds: over.assigneeIds ?? (over.assigneeId ? [over.assigneeId] : []),
  };
}

/** A finished issue, done on `day` at midday. */
const finished = (day: string, over: Partial<Issue> = {}): Issue =>
  issue({ statusId: DONE, doneAt: `${day}T12:00:00.000Z`, ...over });

function sprint(over: Partial<Sprint> = {}): Sprint {
  counter += 1;
  return {
    id: `s${counter}`,
    projectId: "p",
    name: `Sprint ${counter}`,
    goal: "",
    startDate: "2026-10-09",
    endDate: "2026-10-22",
    state: "ACTIVE",
    committedPoints: null,
    completedPoints: null,
    closedAt: null,
    createdAt: `2026-10-0${(counter % 8) + 1}T10:00:00.000Z`,
    ...over,
  };
}

const run = (
  s: Sprint,
  issues: Issue[],
  over: { today?: string; dayOf?: (i: string) => string | null } = {},
): Burndown =>
  burndown({
    sprint: s,
    issues,
    statuses,
    dayOf: over.dayOf ?? dayOf,
    today: over.today ?? TODAY,
  });

function ok(result: Burndown) {
  if (result.kind !== "ok")
    throw new Error(`expected a burndown, got ${result.kind}`);
  return result;
}

describe("the four tiles", () => {
  /* Hand-counted from the sample. Non-epic issues: 18 stories, tasks and bugs and
     4 sub-tasks, 22 in all. Done: CHK-5..9 (5 issues), 11, 13, 15 and one sub-task. */
  const tiles = reportTiles({
    statuses,
    issues: data.issues,
    today: TODAY,
    dayOf,
  });

  it("counts open issues and the points still to do", () => {
    /* 22 issues, 9 done (8 top-level and 1 sub-task) = 13 open. Open top-level
       points: 8+2+3+5 (this sprint) + 3+8+5+8+2+2 = 46. */
    expect(tiles.open).toEqual({ issues: 13, points: 46 });
  });

  it("counts what was finished in the last seven days, and its points", () => {
    /* Done 4, 2 and 1 days ago, and a sub-task 3 days ago: 3+5+1 = 9 points. */
    expect(tiles.doneInWeek).toEqual({ issues: 4, points: 9 });
  });

  it("counts open bugs and how many are high priority", () => {
    /* The Safari bug is done. Open: a medium one and a high one. */
    expect(tiles.bugs).toEqual({ open: 2, high: 1 });
  });

  it("counts what is past its due date and not done", () => {
    /* The receipt bug was due two days ago. The load test is due in five. */
    expect(tiles.overdue).toBe(1);
  });

  it("leaves epics out of every figure", () => {
    const epic = issue({ type: "EPIC", dueDate: "2026-01-01", points: null });
    const withEpic = reportTiles({
      statuses,
      issues: [...data.issues, epic],
      today: TODAY,
      dayOf,
    });
    expect(withEpic).toEqual(tiles);
  });

  it("counts a sub-task as an issue and never adds its points", () => {
    const parent = issue({ type: "STORY", points: 5 });
    const sub = issue({ type: "SUBTASK", parentId: parent.id, points: 3 });
    const t = reportTiles({
      statuses,
      issues: [parent, sub],
      today: TODAY,
      dayOf,
    });
    expect(t.open).toEqual({ issues: 2, points: 5 });
    expect(pointsOf([parent, sub])).toBe(5);
  });

  it("takes done from the status's category, not its name", () => {
    const shipped = {
      ...statuses.find((s) => s.name === "Done")!,
      name: "Shipped",
    };
    const renamed = statuses.map((s) => (s.id === shipped.id ? shipped : s));
    const t = reportTiles({
      statuses: renamed,
      issues: [finished(TODAY, { points: 2 }), issue({ points: 4 })],
      today: TODAY,
      dayOf,
    });
    expect(t.open).toEqual({ issues: 1, points: 4 });
    expect(t.doneInWeek).toEqual({ issues: 1, points: 2 });
  });

  describe("the seven-day window", () => {
    const count = (day: string) =>
      reportTiles({
        statuses,
        issues: [finished(day, { points: 1 })],
        today: TODAY,
        dayOf,
      }).doneInWeek.issues;

    it("takes today and the six days before it", () => {
      expect(count(TODAY)).toBe(1);
      expect(count(addDays(TODAY, -6))).toBe(1);
    });

    it("leaves out the seventh day back", () => {
      expect(count(addDays(TODAY, -7))).toBe(0);
    });

    it("reads the day in the company's zone, not the instant's", () => {
      const lagos = (instant: string) =>
        new Date(Date.parse(instant) + 3_600_000).toISOString().slice(0, 10);
      /* 23:30 UTC on the 8th is the 9th in Lagos: inside the window by a day. */
      const late = finished("2026-10-08", {
        doneAt: "2026-10-08T23:30:00.000Z",
      });
      const t = (fn: (i: string) => string | null) =>
        reportTiles({ statuses, issues: [late], today: TODAY, dayOf: fn });
      expect(t(dayOf).doneInWeek.issues).toBe(0);
      expect(t(lagos).doneInWeek.issues).toBe(1);
    });

    it("does not count work that is no longer done, or has no time", () => {
      const reopened = issue({ doneAt: `${TODAY}T08:00:00.000Z` });
      const untimed = issue({ statusId: DONE, doneAt: null });
      const t = reportTiles({
        statuses,
        issues: [reopened, untimed],
        today: TODAY,
        dayOf,
      });
      expect(t.doneInWeek.issues).toBe(0);
    });
  });

  describe("the overdue rule", () => {
    const overdue = (over: Partial<Issue>) =>
      reportTiles({ statuses, issues: [issue(over)], today: TODAY, dayOf })
        .overdue;

    it("is a due date before today on an issue that is not done", () => {
      expect(overdue({ dueDate: addDays(TODAY, -1) })).toBe(1);
      expect(overdue({ dueDate: addDays(TODAY, -90), statusId: PROG })).toBe(1);
    });

    it("is not due today, or later, or without a date", () => {
      expect(overdue({ dueDate: TODAY })).toBe(0);
      expect(overdue({ dueDate: addDays(TODAY, 1) })).toBe(0);
      expect(overdue({ dueDate: null })).toBe(0);
    });

    it("is not an issue that was done, however late", () => {
      expect(
        overdue({ dueDate: addDays(TODAY, -30), statusId: DONE, doneAt: NOW }),
      ).toBe(0);
    });
  });

  it("counts only open bugs, and only highest and high as high priority", () => {
    const bug = (over: Partial<Issue>) => issue({ type: "BUG", ...over });
    const t = reportTiles({
      statuses,
      issues: [
        bug({ priority: "HIGHEST" }),
        bug({ priority: "HIGH" }),
        bug({ priority: "MEDIUM" }),
        bug({ priority: "LOW" }),
        finished(TODAY, { type: "BUG", priority: "HIGHEST" }),
        issue({ type: "STORY", priority: "HIGHEST" }),
      ],
      today: TODAY,
      dayOf,
    });
    expect(t.bugs).toEqual({ open: 4, high: 2 });
  });

  it("reads zero from an empty project", () => {
    expect(reportTiles({ statuses, issues: [], today: TODAY, dayOf })).toEqual({
      open: { issues: 0, points: 0 },
      doneInWeek: { issues: 0, points: 0 },
      bugs: { open: 0, high: 0 },
      overdue: 0,
    });
  });
});

describe("the axis", () => {
  it("rounds a step to one, two, five or ten times a power of ten", () => {
    expect(niceStep(0.75)).toBe(1);
    expect(niceStep(2)).toBe(2);
    expect(niceStep(3)).toBe(5);
    expect(niceStep(6.5)).toBe(10);
    expect(niceStep(12)).toBe(20);
    expect(niceStep(0)).toBe(1);
  });

  it("is never finer than a whole point and always holds the largest value", () => {
    expect(pointsAxis(27)).toEqual({
      step: 10,
      max: 30,
      ticks: [0, 10, 20, 30],
    });
    expect(pointsAxis(8)).toEqual({ step: 2, max: 8, ticks: [0, 2, 4, 6, 8] });
    expect(pointsAxis(3)).toEqual({ step: 1, max: 3, ticks: [0, 1, 2, 3] });
    expect(pointsAxis(100).max).toBe(100);
  });

  it("gives a chart of nothing an axis rather than a divide by zero", () => {
    expect(pointsAxis(0)).toEqual({ step: 1, max: 1, ticks: [0, 1] });
    expect(pointsAxis(-4).max).toBe(1);
  });
});

describe("a sprint's burndown", () => {
  const sprint3 = data.sprints.find((s) => s.name === "CHK Sprint 3")!;

  it("steps down on the days the sample's sprint finished things", () => {
    /* The sprint started 6 days ago with 27 points: 8+3+2+5+3+1+5. Finished: 3
       points 4 days ago (day 2), 5 points 2 days ago (day 4), 1 point yesterday
       (day 5). Today is day 6 of 13. */
    const b = ok(run(sprint3, data.issues));
    expect(b.span).toBe(13);
    expect(b.total).toBe(27);
    expect(b.basis).toBe("current");
    expect(b.points.map((p) => p.remaining)).toEqual([
      27, 27, 24, 24, 19, 18, 18,
    ]);
    expect(b.points[0]!.day).toBe("2026-10-09");
    expect(b.points[6]!.day).toBe(TODAY);
    expect(b.todayIndex).toBe(6);
    expect(b.remaining).toBe(18);
  });

  it("draws an even pace from the whole scope to nothing at the end", () => {
    const b = ok(run(sprint3, data.issues));
    expect(b.points[0]!.ideal).toBe(27);
    expect(b.points[6]!.ideal).toBeCloseTo((27 * 7) / 13, 10);
  });

  it("leaves a sub-task and an epic out of the scope", () => {
    const parent = issue({ sprintId: "x", type: "STORY", points: 5 });
    const sub = issue({ sprintId: "x", type: "SUBTASK", points: 8 });
    const epic = issue({ sprintId: "x", type: "EPIC" });
    const s = sprint({ id: "x" });
    expect(ok(run(s, [parent, sub, epic])).total).toBe(5);
  });

  describe("across a weekend", () => {
    /* Friday 9 to Tuesday 13 October. Nothing on Sunday, work on Saturday. */
    const s = sprint({
      state: "CLOSED",
      startDate: "2026-10-09",
      endDate: "2026-10-13",
      committedPoints: 10,
      completedPoints: 8,
      closedAt: "2026-10-13T17:00:00.000Z",
    });
    const items = [
      finished("2026-10-10", { sprintId: s.id, points: 5 }) /* Saturday */,
      finished("2026-10-12", { sprintId: s.id, points: 3 }) /* Monday */,
    ];
    const b = ok(run(s, items));

    it("counts a Saturday finish on the Saturday", () => {
      expect(b.points.map((p) => p.day)).toEqual([
        "2026-10-09",
        "2026-10-10",
        "2026-10-11",
        "2026-10-12",
        "2026-10-13",
      ]);
      expect(b.points[1]!.remaining).toBe(5);
    });

    it("repeats Saturday's figure on a quiet Sunday", () => {
      expect(b.points.map((p) => p.remaining)).toEqual([10, 5, 5, 2, 2]);
    });

    it("burns the commitment, so what was not finished is what is left", () => {
      expect(b.basis).toBe("committed");
      expect(b.total).toBe(10);
      expect(b.remaining).toBe(2);
      /* The even pace is a straight line through the weekend. */
      expect(b.points.map((p) => p.ideal)).toEqual([10, 7.5, 5, 2.5, 0]);
    });
  });

  describe("a sprint with no points", () => {
    it("reads zero all the way, with no NaN", () => {
      const s = sprint({ id: "np" });
      const b = ok(
        run(s, [
          issue({ sprintId: "np" }),
          finished(TODAY, { sprintId: "np" }),
        ]),
      );
      expect(b.total).toBe(0);
      expect(b.points.every((p) => p.remaining === 0 && p.ideal === 0)).toBe(
        true,
      );
      expect(
        b.points.some(
          (p) => Number.isNaN(p.remaining) || Number.isNaN(p.ideal),
        ),
      ).toBe(false);
    });

    it("reads zero from a sprint with nothing in it", () => {
      const b = ok(run(sprint(), []));
      expect(b.total).toBe(0);
      expect(b.remaining).toBe(0);
    });
  });

  describe("a sprint without dates", () => {
    it("says so when either end is missing", () => {
      expect(run(sprint({ startDate: null }), [])).toEqual({
        kind: "no-dates",
      });
      expect(run(sprint({ endDate: null }), [])).toEqual({ kind: "no-dates" });
      expect(run(sprint({ startDate: null, endDate: null }), [])).toEqual({
        kind: "no-dates",
      });
    });

    it("says so when the end is before the start", () => {
      expect(
        run(sprint({ startDate: "2026-10-20", endDate: "2026-10-10" }), []),
      ).toEqual({ kind: "no-dates" });
    });

    it("says a planned sprint has not started, dates or not", () => {
      expect(run(sprint({ state: "PLANNED" }), [])).toEqual({
        kind: "not-started",
      });
      expect(run(sprint({ state: "PLANNED", startDate: null }), [])).toEqual({
        kind: "not-started",
      });
    });
  });

  it("makes a one-day sprint a one-reading chart on an axis of one", () => {
    const s = sprint({ id: "one", startDate: TODAY, endDate: TODAY });
    const b = ok(run(s, [issue({ sprintId: "one", points: 4 })]));
    expect(b.span).toBe(1);
    expect(b.points).toHaveLength(1);
    expect(b.points[0]).toMatchObject({ day: TODAY, remaining: 4, ideal: 4 });
  });

  it("counts work done before the sprint started from the first reading", () => {
    const s = sprint({ id: "pre" });
    const b = ok(
      run(s, [
        finished("2026-10-01", { sprintId: "pre", points: 3 }),
        issue({ sprintId: "pre", points: 5 }),
      ]),
    );
    expect(b.total).toBe(8);
    expect(b.points[0]!.remaining).toBe(5);
  });

  it("counts finished work with no recorded time from the first reading", () => {
    const s = sprint({ id: "untimed" });
    const b = ok(
      run(s, [
        issue({ sprintId: "untimed", statusId: DONE, doneAt: null, points: 2 }),
        issue({ sprintId: "untimed", points: 6 }),
      ]),
    );
    expect(b.points[0]!.remaining).toBe(6);
    /* The end label agrees with the status. */
    expect(b.remaining).toBe(6);
  });

  it("does not count work that was reopened", () => {
    const s = sprint({ id: "re" });
    const reopened = issue({
      sprintId: "re",
      points: 4,
      doneAt: `${TODAY}T09:00:00.000Z`,
    });
    expect(ok(run(s, [reopened])).remaining).toBe(4);
  });

  it("never reads below zero when more was finished than was committed", () => {
    const s = sprint({
      id: "over",
      state: "CLOSED",
      committedPoints: 5,
      endDate: "2026-10-12",
    });
    const b = ok(
      run(s, [finished("2026-10-10", { sprintId: "over", points: 8 })]),
    );
    expect(b.points.map((p) => p.remaining)).toEqual([5, 0, 0, 0]);
  });

  it("leaves work finished after a closed sprint ended as still to do at its end", () => {
    const s = sprint({
      id: "late",
      state: "CLOSED",
      committedPoints: 5,
      endDate: "2026-10-12",
    });
    const b = ok(
      run(s, [finished("2026-10-14", { sprintId: "late", points: 5 })]),
    );
    expect(b.remaining).toBe(5);
  });

  it("burns what the running sprint holds now, so added work moves the start", () => {
    const s = sprint({ id: "grow", committedPoints: 3 });
    const b = ok(
      run(s, [
        issue({ sprintId: "grow", points: 3 }),
        issue({ sprintId: "grow", points: 4 }),
      ]),
    );
    /* `committedPoints` is only used once a sprint is closed. */
    expect(b.total).toBe(7);
    expect(b.basis).toBe("current");
  });

  it("uses what a closed sprint holds when it never recorded a commitment", () => {
    const s = sprint({
      id: "legacy",
      state: "CLOSED",
      committedPoints: null,
      endDate: "2026-10-12",
    });
    const b = ok(
      run(s, [finished("2026-10-10", { sprintId: "legacy", points: 3 })]),
    );
    expect(b.total).toBe(3);
    expect(b.basis).toBe("current");
  });

  it("reads the day in the company's zone, not the instant's", () => {
    const s = sprint({ id: "tz" });
    /* 23:30 UTC on the 10th is already the 11th in Lagos. */
    const late = finished("2026-10-10", {
      sprintId: "tz",
      points: 4,
      doneAt: "2026-10-10T23:30:00.000Z",
    });
    const lagos = (instant: string) =>
      new Date(Date.parse(instant) + 3_600_000).toISOString().slice(0, 10);
    const utc = ok(run(s, [late]));
    expect(utc.points[1]!.day).toBe("2026-10-10");
    expect(utc.points[1]!.remaining).toBe(0);
    const company = ok(run(s, [late], { dayOf: lagos }));
    expect(company.points[1]!.remaining).toBe(4);
    expect(company.points[2]!.remaining).toBe(0);
  });

  describe("a running sprint", () => {
    it("runs to today and no further", () => {
      const b = ok(run(sprint3, data.issues));
      expect(b.points).toHaveLength(7);
    });

    it("runs to its end, and puts today at the end, once it has overrun", () => {
      const b = ok(run(sprint3, data.issues, { today: "2026-10-30" }));
      expect(b.points).toHaveLength(14);
      expect(b.todayIndex).toBe(13);
    });

    it("has no today before it starts, and one reading", () => {
      const b = ok(run(sprint3, data.issues, { today: "2026-10-01" }));
      expect(b.todayIndex).toBeNull();
      expect(b.points).toHaveLength(1);
    });

    it("has today on the last day on its last day", () => {
      const b = ok(run(sprint3, data.issues, { today: "2026-10-22" }));
      expect(b.points).toHaveLength(14);
      expect(b.todayIndex).toBe(13);
    });
  });

  it("runs a closed sprint to its end and has no today", () => {
    const s = sprint({
      id: "c",
      state: "CLOSED",
      endDate: "2026-10-13",
      committedPoints: 4,
    });
    const b = ok(run(s, [], { today: "2026-12-01" }));
    expect(b.points).toHaveLength(5);
    expect(b.todayIndex).toBeNull();
  });
});

describe("choosing a sprint", () => {
  it("offers running and closed sprints, newest first, never a planned one", () => {
    const names = burndownSprints(data.sprints).map((s) => s.name);
    expect(names).toEqual(["CHK Sprint 3", "CHK Sprint 2", "CHK Sprint 1"]);
  });

  it("starts on the running sprint, else the most recent", () => {
    expect(defaultBurndownSprint(data.sprints)!.name).toBe("CHK Sprint 3");
    const closedOnly = data.sprints.filter((s) => s.state === "CLOSED");
    expect(defaultBurndownSprint(closedOnly)!.name).toBe("CHK Sprint 2");
  });

  it("has nothing to start on when no sprint has begun", () => {
    expect(defaultBurndownSprint([])).toBeNull();
    expect(
      defaultBurndownSprint(data.sprints.filter((s) => s.state === "PLANNED")),
    ).toBeNull();
  });
});

describe("velocity", () => {
  it("lists the closed sprints oldest first, committed against completed", () => {
    const v = velocity(data.sprints);
    expect(
      v.rows.map((r) => [r.sprint.name, r.committed, r.completed]),
    ).toEqual([
      ["CHK Sprint 1", 21, 18],
      ["CHK Sprint 2", 24, 22],
    ]);
  });

  it("averages the points completed, to a whole number", () => {
    expect(velocity(data.sprints).average).toBe(20);
    const odd = [
      sprint({
        state: "CLOSED",
        completedPoints: 5,
        closedAt: "2026-09-01T00:00:00.000Z",
      }),
      sprint({
        state: "CLOSED",
        completedPoints: 6,
        closedAt: "2026-09-15T00:00:00.000Z",
      }),
    ];
    expect(velocity(odd).average).toBe(6); /* 5.5 rounds up */
  });

  it("keeps the last six, by when they closed rather than when they were made", () => {
    const eight = Array.from({ length: 8 }, (_, n) =>
      sprint({
        id: `v${n}`,
        name: `V${n}`,
        state: "CLOSED",
        completedPoints: n,
        committedPoints: n + 1,
        /* Created in reverse order of closing. */
        createdAt: `2026-0${8 - n}-01T00:00:00.000Z`,
        closedAt: `2026-09-0${n + 1}T00:00:00.000Z`,
      }),
    );
    const v = velocity(eight);
    expect(VELOCITY_SPRINTS).toBe(6);
    expect(v.rows.map((r) => r.sprint.name)).toEqual([
      "V2",
      "V3",
      "V4",
      "V5",
      "V6",
      "V7",
    ]);
    expect(v.average).toBe(5); /* (2+3+4+5+6+7)/6 = 4.5, rounded */
  });

  it("ignores sprints that have not closed", () => {
    const v = velocity(data.sprints.filter((s) => s.state !== "CLOSED"));
    expect(v).toEqual({ rows: [], average: null });
  });

  it("keeps a sprint with no recorded figure as a gap and out of the average", () => {
    const sprints = [
      sprint({
        state: "CLOSED",
        committedPoints: 10,
        completedPoints: 8,
        closedAt: "2026-09-01T00:00:00.000Z",
      }),
      sprint({
        state: "CLOSED",
        committedPoints: null,
        completedPoints: null,
        closedAt: "2026-09-10T00:00:00.000Z",
      }),
    ];
    const v = velocity(sprints);
    expect(v.rows).toHaveLength(2);
    expect(v.rows[1]).toMatchObject({ committed: null, completed: null });
    expect(v.average).toBe(8);
  });

  it("has no average from sprints that recorded nothing", () => {
    const v = velocity([
      sprint({ state: "CLOSED", committedPoints: null, completedPoints: null }),
    ]);
    expect(v.average).toBeNull();
  });

  it("drops the project key from a sprint's name", () => {
    expect(sprintShortName("CHK Sprint 3", "CHK")).toBe("Sprint 3");
    expect(sprintShortName("Sprint 3", "CHK")).toBe("Sprint 3");
    expect(sprintShortName("CHKX Sprint 3", "CHK")).toBe("CHKX Sprint 3");
    expect(sprintShortName("CHK", "CHK")).toBe("CHK");
  });
});

describe("workload", () => {
  const w = workload({ statuses, issues: data.issues, nameOf });

  it("sums the open points and issues of each person, unassigned included", () => {
    expect(w.rows).toEqual([
      /* Five backlog issues nobody owns: 3+8+5+8+2. */
      { assigneeId: null, points: 26, issues: 5 },
      /* Three open issues, two with points (8 and 3), one sub-task. */
      { assigneeId: "p-01", points: 11, issues: 3 },
      { assigneeId: "p-09", points: 7, issues: 3 },
      { assigneeId: "p-04", points: 2, issues: 2 },
    ]);
    expect(w.measure).toBe("points");
    expect(w.max).toBe(26);
  });

  it("agrees with the open tile", () => {
    const points = w.rows.reduce((n, r) => n + r.points, 0);
    const issues = w.rows.reduce((n, r) => n + r.issues, 0);
    const tiles = reportTiles({
      statuses,
      issues: data.issues,
      today: TODAY,
      dayOf,
    });
    expect([points, issues]).toEqual([tiles.open.points, tiles.open.issues]);
  });

  it("puts more points first, then more issues, then people before unassigned, then by name", () => {
    const issues = [
      issue({ assigneeId: "p-03", points: 3 }),
      issue({ assigneeId: "p-01", points: 3 }),
      issue({ assigneeId: "p-09", points: 3 }),
      issue({ assigneeId: "p-09", points: 0 }),
      issue({ assigneeId: null, points: 3 }),
    ];
    expect(
      workload({ statuses, issues, nameOf }).rows.map((r) => r.assigneeId),
    ).toEqual(["p-09", "p-01", "p-03", null]);
  });

  it("leaves out finished work and epics", () => {
    const rows = workload({
      statuses,
      issues: [
        finished(TODAY, { assigneeId: "p-01", points: 9 }),
        issue({ type: "EPIC", assigneeId: "p-01" }),
        issue({ assigneeId: "p-03", points: 2 }),
      ],
      nameOf,
    }).rows;
    expect(rows).toEqual([{ assigneeId: "p-03", points: 2, issues: 1 }]);
  });

  it("measures issues instead when nothing open has points", () => {
    const r = workload({
      statuses,
      issues: [
        issue({ assigneeId: "p-01" }),
        issue({ assigneeId: "p-01" }),
        issue({ assigneeId: "p-03" }),
      ],
      nameOf,
    });
    expect(r.measure).toBe("issues");
    expect(r.max).toBe(2);
    expect(r.rows.map((x) => x.assigneeId)).toEqual(["p-01", "p-03"]);
  });

  it("is empty, with a scale of one, when nothing is open", () => {
    const r = workload({ statuses, issues: [], nameOf });
    expect(r.rows).toEqual([]);
    expect(r.max).toBe(1);
  });
});

describe("breakdowns", () => {
  it("counts issues by the category of their status", () => {
    expect(statusBreakdown({ statuses, issues: data.issues })).toEqual({
      total: 22,
      counts: [
        { category: "TODO", count: 9 },
        { category: "IN_PROGRESS", count: 4 },
        { category: "DONE", count: 9 },
      ],
    });
  });

  it("lists every category, even one with nothing in it", () => {
    const b = statusBreakdown({ statuses, issues: [issue()] });
    expect(b.counts.map((c) => c.count)).toEqual([1, 0, 0]);
  });

  it("counts issues by type, in the order stories, tasks, bugs, sub-tasks", () => {
    expect(typeBreakdown(data.issues)).toEqual({
      total: 22,
      counts: [
        { type: "STORY", count: 9 },
        { type: "TASK", count: 5 },
        { type: "BUG", count: 4 },
        { type: "SUBTASK", count: 4 },
      ],
    });
  });

  it("leaves out a type with none, and epics altogether", () => {
    const b = typeBreakdown([
      issue({ type: "STORY" }),
      issue({ type: "EPIC" }),
    ]);
    expect(b).toEqual({ total: 1, counts: [{ type: "STORY", count: 1 }] });
  });

  it("agrees between the two, and with the open and done tiles", () => {
    const s = statusBreakdown({ statuses, issues: data.issues });
    const t = typeBreakdown(data.issues);
    expect(s.total).toBe(t.total);
    expect(t.counts.reduce((n, c) => n + c.count, 0)).toBe(t.total);
    expect(s.counts[0]!.count + s.counts[1]!.count).toBe(13);
  });
});
