import { describe, expect, it } from "vitest";
import type { Actor } from "@/lib/projects/access";
import { sampleBook } from "@/lib/projects/demo-book";
import { DEMO_ROLES } from "@/lib/projects/demo-programs";
import {
  programPeople,
  programRollup,
  programsFor,
  visibleProjects,
  weekOf,
  workPage,
  workRollup,
  workStagesOf,
  type Scene,
  type Viewer,
  type WorkBucket,
} from "@/lib/projects/programs";

/**
 * The demo's engine for programs: the rules the API applies, applied to the demo
 * book. These are the same questions the connected product answers, so a person
 * in the demo is shown what they would be shown for real: a program's counts are
 * of the projects *they* can open, a tile and the list it opens agree, and a
 * person on one project never sees its siblings.
 */

const TODAY = "2026-10-15"; /* a Thursday: the week runs 12 to 18 October */
const NOW = "2026-10-15T12:00:00.000Z";
const NAMES: Record<string, string> = {
  "p-01": "Adaeze",
  "p-02": "Tunde",
  "p-03": "Chidi",
  "p-04": "Ngozi",
  "p-05": "Fatima",
  "p-06": "Amara",
  "p-07": "Musa",
  "p-08": "Grace",
  "p-09": "Emeka",
  "p-10": "Halima",
};

const book = sampleBook({
  today: TODAY,
  now: NOW,
  people: ["p-01", "p-03", "p-09", "p-04"],
});
const scene: Scene = {
  programs: book.programs,
  access: book.programAccess,
  projects: Object.values(book.projects),
};

const viewer = (id: string | null, over: Partial<Actor> = {}): Viewer => ({
  actor: {
    employeeId: id,
    editRecords: false,
    leadsPeople: false,
    headsDepartment: false,
    ...over,
  },
  today: TODAY,
  dayOf: (instant) => instant.slice(0, 10),
  nameOf: (id) => (id ? (NAMES[id] ?? "Someone") : "Unassigned"),
});

const keys = (v: Viewer) =>
  visibleProjects(scene, v)
    .map((d) => d.project.key)
    .sort();

describe("the demo book holds the programs the plan asks for", () => {
  it("has Operations and Technology, led by Halima and Adaeze", () => {
    const names = Object.values(book.programs)
      .map((p) => p.name)
      .sort();
    expect(names).toEqual(["Operations", "Technology"]);
    expect(book.programs["pg-ops"]!.leadId).toBe(DEMO_ROLES.operationsLead);
    expect(book.programs["pg-tech"]!.leadId).toBe(DEMO_ROLES.technologyLead);
  });

  it("files Checkout Revamp under Technology and leaves Office move unassigned", () => {
    const where = Object.fromEntries(
      Object.values(book.projects).map((d) => [
        d.project.key,
        d.project.programId,
      ]),
    );
    expect(where).toEqual({
      CHK: "pg-tech",
      CNT: "pg-ops",
      HRO: "pg-ops",
      APP: "pg-tech",
      OFF: null,
    });
  });

  it("makes Content calendar a Kanban with five stages and Checkout Revamp the cycle-based one", () => {
    const cnt = book.projects["pj-cnt"]!;
    expect(cnt.project.type).toBe("KANBAN");
    expect(cnt.project.statuses).toHaveLength(5);
    expect(book.projects["pj-chk"]!.sprints.length).toBeGreaterThan(0);
  });

  it("gives every level somebody to hold it", () => {
    expect(book.programAccess["pg-ops"]).toEqual({
      "p-07": "READ",
      "p-08": "WRITE",
    });
  });
});

describe("who can open which project", () => {
  it("shows HR everything and a program lead the whole of their program", () => {
    expect(keys(viewer("p-05", { editRecords: true }))).toEqual([
      "APP",
      "CHK",
      "CNT",
      "HRO",
      "OFF",
    ]);
    /* Halima leads Operations and is on no other project. */
    expect(keys(viewer("p-10"))).toEqual(["CNT", "HRO"]);
  });

  it("shows read and read-and-write people the whole program, and the Master grant everything", () => {
    expect(keys(viewer("p-07"))).toEqual(["CNT", "HRO"]);
    expect(keys(viewer("p-08"))).toEqual(["CNT", "HRO", "OFF"]);
    expect(keys(viewer("p-06", { seesAll: true }))).toEqual([
      "APP",
      "CHK",
      "CNT",
      "HRO",
      "OFF",
    ]);
  });

  it("shows a project-only member that project and none of its siblings", () => {
    /* Emeka is on Checkout Revamp, in Technology with Mobile app. */
    expect(keys(viewer("p-09"))).toEqual(["CHK"]);
  });

  it("shows an outsider nothing", () => {
    expect(keys(viewer("p-99"))).toEqual([]);
    expect(programsFor(scene, viewer("p-99"))).toEqual([]);
  });

  it("marks each card with what the person may do there", () => {
    const grace = Object.fromEntries(
      visibleProjects(scene, viewer("p-08")).map((d) => [
        d.project.key,
        [d.project.access, d.project.canWrite, d.project.canManage],
      ]),
    );
    expect(grace["CNT"]).toEqual(["WRITE", true, false]);
    const musa = visibleProjects(scene, viewer("p-07"))[0]!.project;
    expect([musa.access, musa.canWrite, musa.canManage]).toEqual([
      "READ",
      false,
      false,
    ]);
  });
});

describe("a program card", () => {
  it("counts only what the person can open", () => {
    const ops = (v: Viewer) =>
      programsFor(scene, v).find((p) => p.name === "Operations")!;
    const all = ops(viewer("p-10"));
    const mine = ops(viewer("p-04")); /* Ngozi: Content calendar only */
    expect(all.projectCount).toBe(2);
    expect(mine.projectCount).toBe(1);
    expect(mine.openTaskCount).toBeLessThan(all.openTaskCount);
    expect(mine.access).toBeNull();
  });

  it("tells the lead the size of the list and nobody else", () => {
    const find = (v: Viewer) =>
      programsFor(scene, v).find((p) => p.name === "Operations")!;
    expect(find(viewer("p-10")).accessCount).toBe(2);
    expect(find(viewer("p-07")).accessCount).toBeNull();
  });

  it("offers a new project to the lead and read-and-write leaders, never to read", () => {
    const find = (v: Viewer) =>
      programsFor(scene, v).find((p) => p.name === "Operations")!;
    expect(find(viewer("p-10")).canCreateProject).toBe(true);
    expect(find(viewer("p-07", { leadsPeople: true })).canCreateProject).toBe(
      false,
    );
    expect(find(viewer("p-08")).canCreateProject).toBe(false);
    expect(find(viewer("p-08", { leadsPeople: true })).canCreateProject).toBe(
      true,
    );
  });

  it("hides an archived program from lists unless asked", () => {
    const archived: Scene = {
      ...scene,
      programs: {
        ...scene.programs,
        "pg-ops": { ...scene.programs["pg-ops"]!, archivedAt: NOW },
      },
    };
    const v = viewer("p-10");
    expect(programsFor(archived, v).map((p) => p.name)).toEqual([]);
    expect(programsFor(archived, v, true).map((p) => p.name)).toEqual([
      "Operations",
    ]);
  });
});

describe("who sees a program's people", () => {
  it("lists them with their level", () => {
    const people = programPeople(scene, viewer("p-10"), "pg-ops")!;
    expect(people.lead).toEqual({ id: "p-10", name: "Halima" });
    expect(people.people.map((p) => [p.name, p.level])).toEqual([
      ["Grace", "WRITE"],
      ["Musa", "READ"],
    ]);
  });
});

describe("the rollup", () => {
  it("is the sum of its projects", () => {
    const rollup = programRollup(scene, viewer("p-10"), "pg-ops", NOW)!;
    const sum = (k: "total" | "open" | "overdue") =>
      rollup.projects.reduce((n, p) => n + p[k], 0);
    expect(rollup.totals.total).toBe(sum("total"));
    expect(rollup.totals.open).toBe(sum("open"));
    expect(rollup.totals.overdue).toBe(sum("overdue"));
    expect(
      rollup.totals.byCategory.TODO +
        rollup.totals.byCategory.IN_PROGRESS +
        rollup.totals.byCategory.DONE,
    ).toBe(rollup.totals.total);
  });

  it("runs the week from Monday to the next Monday", () => {
    expect(weekOf(TODAY)).toEqual({ start: "2026-10-12", end: "2026-10-19" });
    expect(weekOf("2026-10-18")).toEqual({
      start: "2026-10-12",
      end: "2026-10-19",
    });
    expect(weekOf("2026-10-19")).toEqual({
      start: "2026-10-19",
      end: "2026-10-26",
    });
  });

  it("gives a project-only member the counts of their project alone", () => {
    const rollup = programRollup(scene, viewer("p-04"), "pg-ops", NOW)!;
    expect(rollup.projects.map((p) => p.key)).toEqual(["CNT"]);
  });

  it("answers nothing for a program the person cannot see", () => {
    expect(programRollup(scene, viewer("p-99"), "pg-ops", NOW)).toBeNull();
  });

  it("lists the busiest ten and rolls the rest up", () => {
    const rollup = programRollup(scene, viewer("p-10"), "pg-ops", NOW)!;
    expect(rollup.workload.people.length).toBeLessThanOrEqual(10);
    const opens = rollup.workload.people.map((p) => p.open);
    expect([...opens].sort((a, b) => b - a)).toEqual(opens);
  });
});

describe("the Master overview", () => {
  it("carries a row per program, the Unassigned bucket, and the grant's own flag", () => {
    const overview = workRollup(scene, viewer("p-06", { seesAll: true }), NOW);
    expect(overview.master).toBe(true);
    expect(overview.programs.map((p) => p.name)).toEqual([
      "Operations",
      "Technology",
    ]);
    expect(overview.unassigned.projects).toBe(1);
    const sum = overview.programs.reduce((n, p) => n + p.open, 0);
    expect(overview.totals.open).toBe(sum + overview.unassigned.open);
  });

  it("does not call HR a holder of the grant, however much HR can read", () => {
    const hr = workRollup(scene, viewer("p-05", { editRecords: true }), NOW);
    expect(hr.master).toBe(false);
    expect(hr.totals.total).toBeGreaterThan(0);
  });
});

describe("a page of work", () => {
  const v = viewer("p-06", { seesAll: true });
  const total = workPage(scene, v, { limit: 200 }).total;

  it("holds every task of every project the person can open, and no initiative", () => {
    const all = workPage(scene, v, { limit: 200 }).rows;
    expect(all).toHaveLength(total);
    expect(all.every((r) => r.type !== "EPIC")).toBe(true);
    expect(new Set(all.map((r) => r.id)).size).toBe(all.length);
  });

  it("agrees with the tile it opens, for every bucket", () => {
    const tiles = workRollup(scene, v, NOW).totals;
    for (const bucket of [
      "open",
      "overdue",
      "dueThisWeek",
      "doneThisWeek",
    ] as WorkBucket[]) {
      expect(workPage(scene, v, { bucket, limit: 200 }).total, bucket).toBe(
        tiles[bucket],
      );
    }
  });

  it("pages without repeating or skipping a row", () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 40; i++) {
      const page = workPage(scene, v, { limit: 7 }, cursor);
      seen.push(...page.rows.map((r) => r.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(seen).toHaveLength(total);
    expect(new Set(seen).size).toBe(total);
  });

  it("narrows by program, by stage category, by person and by text", () => {
    const ops = workPage(scene, v, { programId: "pg-ops", limit: 200 });
    expect(ops.rows.every((r) => r.programId === "pg-ops")).toBe(true);
    const done = workPage(scene, v, { category: ["DONE"], limit: 200 });
    expect(done.rows.every((r) => r.statusCategory === "DONE")).toBe(true);
    const grace = workPage(scene, v, { assigneeId: "p-08", limit: 200 });
    expect(
      grace.rows.every((r) => r.assignees.some((a) => a.id === "p-08")),
    ).toBe(true);
    const nobody = workPage(scene, v, { assigneeId: "none", limit: 200 });
    expect(nobody.rows.every((r) => r.assignees.length === 0)).toBe(true);
    const text = workPage(scene, v, { q: "newsletter", limit: 200 });
    expect(text.total).toBeGreaterThan(0);
    expect(text.rows.every((r) => /newsletter/i.test(r.title))).toBe(true);
  });

  it("names the project's own stage and the category that compares", () => {
    const row = workPage(scene, v, { q: "Newsletter, week 46" }).rows[0]!;
    expect(row.statusName).toBe("Drafting");
    expect(row.statusCategory).toBe("IN_PROGRESS");
    expect(row.projectKey).toBe("CNT");
    expect(row.programName).toBe("Operations");
  });

  it("puts tasks with no deadline last, in either direction", () => {
    for (const order of ["asc", "desc"] as const) {
      const rows = workPage(scene, v, { sort: "due", order, limit: 200 }).rows;
      const firstNone = rows.findIndex((r) => r.dueDate === null);
      expect(firstNone).toBeGreaterThan(-1);
      expect(rows.slice(firstNone).every((r) => r.dueDate === null)).toBe(true);
    }
  });

  it("shows a person only the work in projects they can open", () => {
    const emeka = workPage(scene, viewer("p-09"), { limit: 200 });
    expect(new Set(emeka.rows.map((r) => r.projectKey))).toEqual(
      new Set(["CHK"]),
    );
    expect(workPage(scene, viewer("p-99"), {}).total).toBe(0);
  });

  it("limits the unassigned filter to projects in no program", () => {
    const loose = workPage(scene, v, { unassigned: true, limit: 200 });
    expect(new Set(loose.rows.map((r) => r.projectKey))).toEqual(
      new Set(["OFF"]),
    );
  });
});

describe("filtering work by a stage's name", () => {
  const hr = viewer("p-10", { editRecords: true });

  it("lists each stage name once, ordered by category", () => {
    const stages = workStagesOf(
      visibleProjects(scene, hr).map((d) => d.project),
    );
    const lower = stages.map((s) => s.name.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
    const rank = { TODO: 0, IN_PROGRESS: 1, DONE: 2 } as const;
    const ranks = stages.map((s) => rank[s.category]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(stages.every((s) => s.projectCount >= 1)).toBe(true);
  });

  it("finds only the tasks in a stage of that name, in any case, not its whole category", () => {
    const all = workPage(scene, hr, { limit: 200 }).rows;
    const named = all.find(
      (row) =>
        row.statusCategory === "IN_PROGRESS" &&
        all.some(
          (other) =>
            other.statusCategory === "IN_PROGRESS" &&
            other.statusName.toLowerCase() !== row.statusName.toLowerCase(),
        ),
    );
    expect(named).toBeDefined();
    const name = named!.statusName;
    const rows = workPage(scene, hr, {
      stage: [name.toUpperCase()],
      limit: 200,
    }).rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(
      rows.every((r) => r.statusName.toLowerCase() === name.toLowerCase()),
    ).toBe(true);
    const category = workPage(scene, hr, {
      category: ["IN_PROGRESS"],
      limit: 200,
    });
    expect(category.total).toBeGreaterThan(rows.length);
  });
});

describe("the Archive", () => {
  const hr = viewer("p-10", { editRecords: true });
  /* The scene with one project archived, and with one of the other projects' tasks
     finished long ago and one finished yesterday. */
  const live = visibleProjects(scene, hr).map((d) => d.project);
  const target = live[0]!;
  const other = scene.projects.find(
    (d) =>
      d.project.id !== target.id &&
      d.project.programId !== target.programId &&
      d.project.statuses.some((s) => s.category === "DONE") &&
      d.issues.some((i) => i.type !== "EPIC"),
  )!;
  const doneStatus = other.project.statuses.find((s) => s.category === "DONE")!;
  const [oldTask, newTask] = other.issues.filter((i) => i.type !== "EPIC");
  const shelved: Scene = {
    ...scene,
    projects: scene.projects.map((d) =>
      d.project.id === target.id
        ? {
            ...d,
            project: { ...d.project, archived: true, archivedAt: NOW },
          }
        : d.project.id === other.project.id
          ? {
              ...d,
              issues: d.issues.map((i) =>
                i.id === oldTask!.id
                  ? {
                      ...i,
                      statusId: doneStatus.id,
                      doneAt: "2026-09-01T09:00:00.000Z",
                    }
                  : i.id === newTask?.id
                    ? {
                        ...i,
                        statusId: doneStatus.id,
                        doneAt: "2026-10-14T09:00:00.000Z",
                      }
                    : i,
              ),
            }
          : d,
    ),
  };

  it("takes an archived project's tasks out of the live lists and their counts", () => {
    const rows = workPage(shelved, hr, { limit: 200 }).rows;
    expect(rows.some((r) => r.projectId === target.id)).toBe(false);
    const rollup = workRollup(shelved, hr, NOW);
    expect(rollup.totals.total).toBe(
      workPage(shelved, hr, { limit: 200 }).total,
    );
    /* A list about that one project still shows them. */
    const own = workPage(shelved, hr, { projectId: target.id, limit: 200 });
    expect(own.total).toBeGreaterThan(0);
  });

  it("holds them under the Archive, each saying why", () => {
    const page = workPage(shelved, hr, { archive: true, limit: 200 });
    const byProject = page.rows.filter((r) => r.projectId === target.id);
    expect(byProject.length).toBeGreaterThan(0);
    expect(byProject.every((r) => r.archivedBecause === "project")).toBe(true);
    const old = page.rows.find((r) => r.id === oldTask!.id);
    expect(old?.archivedBecause).toBe("done");
    /* Finished yesterday is still under Done, not the Archive. */
    expect(newTask).toBeDefined();
    expect(page.rows.some((r) => r.id === newTask!.id)).toBe(false);
  });

  it("narrows to one reason", () => {
    const done = workPage(shelved, hr, {
      archive: true,
      reason: "done",
      limit: 200,
    });
    expect(done.rows.map((r) => r.id)).toContain(oldTask!.id);
    expect(done.rows.every((r) => r.archivedBecause === "done")).toBe(true);
  });

  it("puts an archived program's tasks under the Archive too", () => {
    const programId = other.project.programId!;
    expect(programId).toBeTruthy();
    const programShelved: Scene = {
      ...shelved,
      programs: {
        ...shelved.programs,
        [programId]: { ...shelved.programs[programId]!, archivedAt: NOW },
      },
    };
    const liveRows = workPage(programShelved, hr, { limit: 200 }).rows;
    expect(liveRows.some((r) => r.programId === programId)).toBe(false);
    const archived = workPage(programShelved, hr, {
      archive: true,
      reason: "program",
      limit: 200,
    }).rows;
    expect(archived.length).toBeGreaterThan(0);
    expect(archived.every((r) => r.programId === programId)).toBe(true);
  });
});
