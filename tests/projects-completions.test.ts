import { describe, expect, it } from "vitest";
import type { ApiGoal } from "@/lib/api/performance";
import {
  ancestorsOf,
  byPerson,
  byProject,
  completedUnder,
  completionOf,
  completionsBetween,
  summarise,
  type Completion,
  type CompletionContext,
} from "@/lib/projects/completions";
import {
  PEOPLE_PAGE,
  demoCompletedWork,
  demoTeamCompleted,
  demoWorkRecord,
  demoWorkThisCycle,
  ledBy,
  maySeeWorkOf,
  type DirectoryEntry,
} from "@/lib/projects/completions-demo";
import { sampleBook } from "@/lib/projects/demo-book";
import {
  periodAfter,
  periodAround,
  periodBefore,
} from "@/lib/projects/work-periods";
import type { Issue } from "@/lib/projects/types";

/**
 * What the completed-work screens are made of: periods, the finished-task
 * definition, the sums, and the demo's answers for each person who might ask.
 *
 * Nothing in this file is a score. A completion is a finished top-level task,
 * linked to an objective or not, and the figures are counts.
 */

const TODAY = "2026-11-06";
const NOW = "2026-11-06T12:00:00.000Z";
const TZ = "Africa/Lagos";

const DIRECTORY: DirectoryEntry[] = [
  ["p-01", "Adaeze Okonkwo", null],
  ["p-02", "Tunde Bakare", null],
  ["p-03", "Chidi Nwosu", "p-01"],
  ["p-04", "Ngozi Eze", "p-01"],
  ["p-05", "Halima Sani", "p-02"],
  ["p-06", "Amara Obi", "p-05"],
  ["p-07", "Musa Ibrahim", "p-02"],
  ["p-08", "Grace Effiong", "p-02"],
  ["p-09", "Emeka Anyanwu", "p-01"],
  ["p-10", "Sani Abdullahi", "p-02"],
].map(([id, name, managerId]) => ({
  id: id as string,
  name: name as string,
  jobTitle: "Role",
  departmentName: null,
  managerId: managerId as string | null,
}));

const book = sampleBook({
  today: TODAY,
  now: NOW,
  people: ["p-01", "p-03", "p-09", "p-04"],
});
const projects = Object.values(book.projects);

const goal = (over: Partial<ApiGoal> & { id: string }): ApiGoal =>
  ({
    title: over.id,
    ownerId: null,
    ownerName: null,
    departmentId: null,
    departmentName: null,
    level: "company",
    companyWide: true,
    parentId: null,
    status: "ON_TRACK",
    keyResults: [],
    ...over,
  }) as ApiGoal;

const GOALS: ApiGoal[] = [
  goal({ id: "demo-goal-company", title: "Company goal" }),
  goal({
    id: "demo-goal-dept-eng",
    title: "Engineering goal",
    level: "department",
    departmentName: "Engineering",
    parentId: "demo-goal-company",
  }),
  goal({
    id: "demo-goal-chidi-errors",
    title: "Chidi's KPI",
    level: "personal",
    ownerId: "p-03",
    ownerName: "Chidi Nwosu",
    parentId: "demo-goal-dept-eng",
    keyResults: [
      { id: "demo-kr-errors", label: "Payment error rate" },
      { id: "demo-kr-offline", label: "Screens that work offline" },
    ] as ApiGoal["keyResults"],
  }),
  goal({
    id: "demo-goal-eng",
    title: "Adaeze's KPI",
    level: "personal",
    ownerId: "p-01",
    ownerName: "Adaeze Okonkwo",
    parentId: "demo-goal-company",
  }),
  goal({
    id: "demo-goal-mine-handbook",
    title: "Publish the hiring handbook",
    level: "personal",
    ownerId: "p-06",
    status: "DONE",
  }),
  goal({
    id: "demo-goal-mine-offers",
    title: "Fill the two Lagos engineering roles",
    level: "personal",
    ownerId: "p-06",
    keyResults: [
      { id: "demo-kr-offers", label: "Offers accepted" },
    ] as ApiGoal["keyResults"],
  }),
];

const ctx: CompletionContext = {
  timeZone: TZ,
  goals: GOALS,
  nameOf: (id) => DIRECTORY.find((p) => p.id === id)?.name ?? "Someone",
};

const viewer = (id: string | null, editRecords = false) => ({
  id,
  editRecords,
});

describe("periods", () => {
  it("a week runs Monday to Sunday and is labelled by its Monday", () => {
    const week = periodAround("week", "2026-11-06"); // a Friday
    expect(week.start).toBe("2026-11-02");
    expect(week.end).toBe("2026-11-09");
    expect(week.label).toBe("Week of 2 Nov 2026");
    expect(periodAround("week", "2026-11-08").start).toBe("2026-11-02"); // Sunday
    expect(periodAround("week", "2026-11-09").start).toBe("2026-11-09");
  });

  it("a month and a quarter are whole calendar months, and the day is a single day", () => {
    expect(periodAround("month", "2026-11-06")).toMatchObject({
      start: "2026-11-01",
      end: "2026-12-01",
      label: "November 2026",
    });
    expect(periodAround("quarter", "2026-11-06")).toMatchObject({
      start: "2026-10-01",
      end: "2027-01-01",
      label: "Q4 2026",
    });
    expect(periodAround("day", "2026-11-06").label).toBe("Fri 6 Nov 2026");
  });

  it("steps back and forward across a year end", () => {
    const quarter = periodAround("quarter", "2026-11-06");
    expect(periodAfter(quarter).label).toBe("Q1 2027");
    expect(periodBefore(quarter).label).toBe("Q3 2026");
    const month = periodAround("month", "2026-01-15");
    expect(periodBefore(month).label).toBe("December 2025");
  });
});

describe("what counts as finished work", () => {
  const data = projects.find((p) => p.project.key === "CHK")!;
  const done = data.issues.find((i) => i.id === "is-chk-i11")!;
  const as = (over: Partial<Issue>): Issue => ({ ...done, ...over });

  it("a finished top-level task counts, linked or not", () => {
    expect(completionOf(done, data, ctx)).not.toBeNull();
    expect(
      completionOf(as({ goalId: "demo-goal-company" }), data, ctx)?.objective
        ?.title,
    ).toBe("Company goal");
    expect(completionOf(done, data, ctx)?.objective).toBeNull();
  });

  it("an initiative, a subtask, an unassigned task and an unfinished one do not", () => {
    expect(completionOf(as({ type: "EPIC" }), data, ctx)).toBeNull();
    expect(completionOf(as({ type: "SUBTASK" }), data, ctx)).toBeNull();
    expect(
      completionOf(as({ assigneeId: null, assigneeIds: [] }), data, ctx),
    ).toBeNull();
    expect(completionOf(as({ doneAt: null }), data, ctx)).toBeNull();
  });

  it("Effort never changes a figure", () => {
    const light = completionOf(as({ points: 1 }), data, ctx)!;
    const heavy = completionOf(as({ points: 13 }), data, ctx)!;
    expect(summarise([light])).toEqual(summarise([heavy]));
  });

  it("a task with no due date is neither on time nor late", () => {
    const none = completionOf(as({ dueDate: null }), data, ctx)!;
    expect(none.onTime).toBeNull();
    expect(summarise([none])).toMatchObject({
      finished: 1,
      withDueDate: 0,
      onTime: 0,
      late: 0,
    });
  });

  it("on time means finished on or before the due day", () => {
    const day = completionOf(done, data, ctx)!.doneDay;
    expect(completionOf(as({ dueDate: day }), data, ctx)!.onTime).toBe(true);
    expect(completionOf(as({ dueDate: "2000-01-01" }), data, ctx)!.onTime).toBe(
      false,
    );
  });

  it("a project's own link is what a task shows when it has none, and its own wins", () => {
    const withDefault = {
      project: { ...data.project, goalId: "demo-goal-dept-eng" },
    };
    expect(completionOf(done, withDefault, ctx)?.objective?.goalId).toBe(
      "demo-goal-dept-eng",
    );
    expect(
      completionOf(as({ goalId: "demo-goal-company" }), withDefault, ctx)
        ?.objective?.goalId,
    ).toBe("demo-goal-company");
  });

  it("names the measure a task is narrowed to", () => {
    const row = completionOf(
      as({ goalId: "demo-goal-chidi-errors", keyResultId: "demo-kr-errors" }),
      data,
      ctx,
    )!;
    expect(row.objective).toMatchObject({
      keyResultId: "demo-kr-errors",
      keyResultTitle: "Payment error rate",
      level: "personal",
    });
  });

  it("a closed objective is a plain fact on the row", () => {
    const row = completionOf(
      as({ goalId: "demo-goal-mine-handbook" }),
      data,
      ctx,
    )!;
    expect(row.objective?.closed).toBe(true);
  });
});

describe("the sums", () => {
  const rows = completionsBetween(
    projects,
    { fromDay: "2026-10-01", toDay: "2027-01-01" },
    ctx,
  );

  it("counts finished, with a due date, on time, late and linked, and they add up", () => {
    const s = summarise(rows);
    expect(s.finished).toBe(rows.length);
    expect(s.onTime + s.late).toBe(s.withDueDate);
    expect(s.withDueDate).toBeLessThanOrEqual(s.finished);
    expect(s.linked).toBe(rows.filter((r) => r.objective).length);
    expect(s.linked).toBeGreaterThan(0);
    expect(s.linked).toBeLessThan(s.finished);
  });

  it("groups by project, busiest first, and by person, in name order", () => {
    const projectsCount = byProject(rows);
    expect(projectsCount.reduce((n, p) => n + p.finished, 0)).toBe(rows.length);
    expect(projectsCount[0]!.finished).toBeGreaterThanOrEqual(
      projectsCount.at(-1)!.finished,
    );
    const people = byPerson(rows);
    expect(people.map((p) => p.personName)).toEqual(
      [...people.map((p) => p.personName)].sort((a, b) => a.localeCompare(b)),
    );
  });

  it("is newest first", () => {
    const days = rows.map((r) => r.doneAt);
    expect([...days].sort().reverse()).toEqual(days);
  });
});

describe("the demo book exercises every case", () => {
  it("has finished work linked and not linked, at all three levels", () => {
    const all = completionsBetween(
      projects,
      { fromDay: "2000-01-01", toDay: "2100-01-01" },
      ctx,
    );
    const levels = new Set(
      all.filter((r) => r.objective).map((r) => r.objective!.level),
    );
    expect(levels).toEqual(new Set(["company", "department", "personal"]));
    expect(all.some((r) => r.objective === null)).toBe(true);
    expect(all.some((r) => r.objective?.closed)).toBe(true);
    expect(all.some((r) => r.onTime === false)).toBe(true);
    expect(all.some((r) => r.onTime === null)).toBe(true);
  });

  it("only ever counts top-level work", () => {
    const keys = new Set(
      completionsBetween(
        projects,
        { fromDay: "2000-01-01", toDay: "2100-01-01" },
        ctx,
      ).map((r) => r.id),
    );
    for (const data of projects) {
      for (const issue of data.issues) {
        if (issue.type === "EPIC" || issue.type === "SUBTASK") {
          expect(keys.has(issue.id)).toBe(false);
        }
      }
    }
  });
});

describe("who may open whose work", () => {
  it("the person, their line manager, and HR; nobody else", () => {
    expect(maySeeWorkOf(viewer("p-03"), "p-03", DIRECTORY)).toBe(true);
    expect(maySeeWorkOf(viewer("p-01"), "p-03", DIRECTORY)).toBe(true);
    expect(maySeeWorkOf(viewer("p-77", true), "p-03", DIRECTORY)).toBe(true);
    expect(maySeeWorkOf(viewer("p-09"), "p-03", DIRECTORY)).toBe(false);
    expect(maySeeWorkOf(viewer("p-02"), "p-03", DIRECTORY)).toBe(false);
    expect(maySeeWorkOf(viewer(null), "p-03", DIRECTORY)).toBe(false);
  });

  it("a manager leads their direct reports and nobody more", () => {
    expect(ledBy("p-01", DIRECTORY).map((p) => p.id)).toEqual([
      "p-03",
      "p-04",
      "p-09",
    ]);
    expect(ledBy("p-03", DIRECTORY)).toEqual([]);
    expect(ledBy(null, DIRECTORY)).toEqual([]);
  });
});

describe("the Work record in the demo", () => {
  const record = (
    id: string,
    kind: "week" | "month" | "quarter" | "day",
    day: string,
  ) =>
    demoWorkRecord({
      projects,
      subject: DIRECTORY.find((p) => p.id === id)!,
      period: periodAround(kind, day),
      ctx,
    });

  it("counts every finished top-level task, with and without a link", () => {
    const q = record("p-03", "quarter", TODAY);
    expect(q.summary.finished).toBeGreaterThan(0);
    const linked = q.byObjective.filter((o) => o.goalId !== null);
    const unlinked = q.byObjective.find((o) => o.goalId === null);
    expect(linked.length).toBeGreaterThan(0);
    expect(unlinked?.title).toBe("Not linked to an objective");
    expect(q.byObjective.reduce((n, o) => n + o.finished, 0)).toBe(
      q.summary.finished,
    );
    expect(q.summary.linkedToObjective).toBe(
      linked.reduce((n, o) => n + o.finished, 0),
    );
  });

  it("files nothing for a grade: no rate, nothing graded, nothing waiting", () => {
    const q = record("p-03", "quarter", TODAY);
    expect(q.summary.completionRate).toBeNull();
    expect(q.summary.graded).toBe(0);
    for (const day of q.days) {
      for (const issue of day.issues) {
        expect(issue.grade).toBeNull();
        expect(issue.waitingForGrade).toBe(false);
      }
    }
  });

  it("every row says what it is linked to, or null, never a gap message", () => {
    const q = record("p-03", "quarter", TODAY);
    for (const day of q.days) {
      for (const issue of day.issues) {
        expect(
          issue.objective === null ||
            typeof issue.objective?.title === "string",
        ).toBe(true);
      }
    }
  });

  it("an empty period is empty, not zeros pretending to be a result", () => {
    const q = record("p-03", "week", "2025-03-03");
    expect(q.summary.finished).toBe(0);
    expect(q.days).toEqual([]);
    expect(q.byObjective).toEqual([]);
  });

  it("the period is what the person asked for", () => {
    const month = record("p-03", "month", "2026-03-10");
    expect(month.period.label).toBe("March 2026");
    for (const day of month.days)
      expect(day.date.startsWith("2026-03")).toBe(true);
  });
});

describe("the manager's Completed view in the demo", () => {
  const team = (
    viewerId: string | null,
    kind: "week" | "month" | "quarter",
    day: string,
  ) =>
    demoTeamCompleted({
      projects,
      viewerId,
      directory: DIRECTORY,
      kind,
      day,
      ctx,
    });

  it("lists only the people the viewer leads, with finished work, grouped by person", () => {
    const view = team("p-01", "quarter", TODAY);
    expect(view.people.length).toBeGreaterThan(0);
    for (const person of view.people) {
      expect(["p-03", "p-04", "p-09"]).toContain(person.employee.id);
      expect(person.items.every((i) => i.personId === person.employee.id)).toBe(
        true,
      );
      expect(person.summary.finished).toBe(person.itemsTotal);
    }
  });

  it("a person who leads nobody gets nobody, and HR is not a manager by being HR", () => {
    expect(team("p-03", "quarter", TODAY).people).toEqual([]);
    expect(team("p-06", "quarter", TODAY).people).toEqual([]);
  });

  it("carries no grade anywhere on a row", () => {
    const view = team("p-01", "quarter", TODAY);
    for (const person of view.people) {
      for (const item of person.items) {
        expect("grade" in item).toBe(false);
        expect(item.projectName).not.toBe("");
        expect(item.doneAt).not.toBe("");
      }
    }
  });

  it("steps by period and the rows follow", () => {
    const now = team("p-01", "quarter", TODAY);
    const before = team("p-01", "quarter", "2026-08-15");
    expect(now.period.label).toBe("Q4 2026");
    expect(before.period.label).toBe("Q3 2026");
    const ids = new Set(now.people.flatMap((p) => p.items.map((i) => i.id)));
    for (const person of before.people) {
      for (const item of person.items) expect(ids.has(item.id)).toBe(false);
    }
  });

  it("a page holds at most the people page size", () => {
    expect(PEOPLE_PAGE).toBeGreaterThanOrEqual(10);
  });
});

describe("Work this cycle, in the demo", () => {
  const work = (subjectId: string, from: string | null, to: string | null) =>
    demoWorkThisCycle({
      projects,
      subjectId,
      from,
      to,
      today: TODAY,
      ctx,
    });

  it("covers the review period and reads as totals, by project, on time and linked", () => {
    const w = work("p-03", "2026-01-01", "2026-06-30");
    expect(w.summary.finished).toBeGreaterThan(2);
    expect(w.total).toBe(w.summary.finished);
    expect(w.byProject.reduce((n, p) => n + p.finished, 0)).toBe(
      w.summary.finished,
    );
    expect(w.summary.onTime + w.summary.late).toBe(w.summary.withDueDate);
    expect(w.summary.linked).toBeGreaterThan(0);
    expect(
      w.items.every(
        (i) => i.doneDay >= "2026-01-01" && i.doneDay <= "2026-06-30",
      ),
    ).toBe(true);
  });

  it("an earlier period holds an earlier person's closed objective", () => {
    const w = work("p-06", "2025-07-01", "2025-12-31");
    expect(w.items.some((i) => i.objective?.closed)).toBe(true);
    expect(w.items.some((i) => i.objective === null)).toBe(true);
  });

  it("a person with nothing in the period has nothing, not a zero score", () => {
    const w = work("p-09", "2026-01-01", "2026-06-30");
    expect(w.summary.finished).toBe(0);
    expect(w.items).toEqual([]);
  });

  it("caps the list and says so", () => {
    const w = demoWorkThisCycle({
      projects,
      subjectId: "p-03",
      from: "2000-01-01",
      to: "2100-01-01",
      today: TODAY,
      ctx,
      cap: 2,
    });
    expect(w.items).toHaveLength(2);
    expect(w.capped).toBe(true);
    expect(w.total).toBeGreaterThan(2);
  });
});

describe("Completed work under an objective or KPI, in the demo", () => {
  const under = (id: string, viewerId: string, editRecords = false) => {
    const g = GOALS.find((x) => x.id === id)!;
    return demoCompletedWork({
      projects,
      goal: g,
      goals: GOALS,
      from: null,
      to: null,
      mayShow: (personId) =>
        maySeeWorkOf(viewer(viewerId, editRecords), personId, DIRECTORY),
      ctx,
    });
  };

  it("a department objective lists the tasks linked to it, grouped by person", () => {
    const w = under("demo-goal-dept-eng", "p-01");
    expect(w.groups.length).toBeGreaterThan(1);
    for (const g of w.groups) {
      for (const item of g.items) {
        expect(item.objective?.goalId).toBe("demo-goal-dept-eng");
        expect(item.personId).toBe(g.personId);
      }
    }
  });

  it("a personal KPI lists its own linked tasks and the owner's tasks linked above it, marked", () => {
    const w = under("demo-goal-chidi-errors", "p-01");
    const items = w.groups.flatMap((g) => g.items);
    expect(items.every((i) => i.personId === "p-03")).toBe(true);
    const direct = items.filter(
      (i) => i.objective?.goalId === "demo-goal-chidi-errors",
    );
    const above = items.filter(
      (i) => i.objective?.goalId !== "demo-goal-chidi-errors",
    );
    expect(direct.length).toBeGreaterThan(0);
    expect(direct.every((i) => i.linkedAt === undefined)).toBe(true);
    expect(above.length).toBeGreaterThan(0);
    expect(above.every((i) => i.linkedAt === "department")).toBe(true);
  });

  it("a KPI whose parent is the company shows tasks linked at the company level, marked", () => {
    const w = under("demo-goal-eng", "p-01");
    const items = w.groups.flatMap((g) => g.items);
    expect(items.some((i) => i.linkedAt === "company")).toBe(true);
    expect(items.some((i) => i.objective?.goalId === "demo-goal-eng")).toBe(
      true,
    );
  });

  it("a task linked to somebody else's KPI is never pulled under this one", () => {
    const w = under("demo-goal-eng", "p-01");
    for (const item of w.groups.flatMap((g) => g.items)) {
      expect(item.personId).toBe("p-01");
    }
  });

  it("shows nobody's work to a person who may not see it", () => {
    expect(under("demo-goal-chidi-errors", "p-09").groups).toEqual([]);
    expect(under("demo-goal-chidi-errors", "p-03").groups).toHaveLength(1);
    expect(under("demo-goal-chidi-errors", "p-77", true).groups).toHaveLength(
      1,
    );
  });

  it("walks up the goals above one, nearest first", () => {
    const chain = ancestorsOf(
      GOALS.find((g) => g.id === "demo-goal-chidi-errors")!,
      GOALS,
    );
    expect(chain.map((g) => g.id)).toEqual([
      "demo-goal-dept-eng",
      "demo-goal-company",
    ]);
    const loop = [
      goal({ id: "a", parentId: "b" }),
      goal({ id: "b", parentId: "a" }),
    ];
    expect(ancestorsOf(loop[0]!, loop).map((g) => g.id)).toEqual(["b", "a"]);
  });

  it("completedUnder leaves a task with no link out entirely", () => {
    const stray: Completion = {
      id: "x",
      key: "X-1",
      title: "x",
      projectId: "p",
      projectName: "P",
      personal: false,
      personId: "p-03",
      personName: "Chidi",
      doneAt: "2026-01-01T00:00:00.000Z",
      doneDay: "2026-01-01",
      dueDate: null,
      onTime: null,
      objective: null,
    };
    expect(
      completedUnder(
        [stray],
        GOALS.find((g) => g.id === "demo-goal-chidi-errors")!,
        GOALS,
      ),
    ).toEqual([]);
  });
});
