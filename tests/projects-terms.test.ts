import { describe, expect, it } from "vitest";
import {
  BREAKDOWN_TYPES,
  CATEGORY_LABEL,
  COMPLETE_CYCLE,
  CYCLE,
  DEFAULT_TYPE,
  EFFORT,
  EMPTY,
  FILTER_TYPES,
  INITIATIVE,
  LATER,
  NEW_CYCLE,
  NEW_INITIATIVE,
  NEW_TASK,
  NOUNS,
  PICKABLE_TYPES,
  PROJECTS_FEATURE_LINE,
  PROJECTS_SUBTITLE,
  REPORT_TITLE,
  START_CYCLE,
  SWIMLANE_LABEL,
  TAB_LABEL,
  TYPE_LABEL,
  WORK_TYPES,
  count,
  cycleName,
  displayType,
  nounFor,
  LEVEL_LABEL,
  LEVEL_SENTENCE,
  READ_ONLY_PROGRAM,
  readOnlyProject,
} from "@/lib/projects/terms";
import { ISSUE_TYPES, PICKABLE_ISSUE_TYPES } from "@/lib/projects/types";
import { applyFilter, EMPTY_FILTER } from "@/lib/projects/filters";
import { nextSprintDraft } from "@/lib/projects/sprints";
import { PROJECT_VIEWS, viewById } from "@/app/(app)/projects/[id]/views";
import type { Issue, Sprint } from "@/lib/projects/types";

/**
 * The friendly vocabulary, as data. `lib/projects/terms.ts` is where Kene's
 * words live; these hold the rules around them: a count reads right for one,
 * the type picker never offers two entries with the same name, a stored STORY
 * reads as a Task, and the tab words changed while the `?view=` ids did not.
 */

describe("count", () => {
  it("writes one in the singular and everything else in the plural, including none", () => {
    expect(count(0, "task")).toBe("0 tasks");
    expect(count(1, "task")).toBe("1 task");
    expect(count(2, "task")).toBe("2 tasks");
    expect(count(1, "subtask")).toBe("1 subtask");
    expect(count(3, "problem")).toBe("3 problems");
    expect(count(1, "initiative")).toBe("1 initiative");
    expect(count(2, "initiative")).toBe("2 initiatives");
    expect(count(1, "cycle")).toBe("1 cycle");
    expect(count(4, "cycle")).toBe("4 cycles");
    expect(count(2, "stage")).toBe("2 stages");
  });

  it("does not put an s on effort, which has no plural", () => {
    expect(count(1, "effort")).toBe("1 effort");
    expect(count(5, "effort")).toBe("5 effort");
  });

  it("gives the noun alone in the right number", () => {
    expect(nounFor(1, "task")).toBe("task");
    expect(nounFor(0, "task")).toBe("tasks");
    expect(nounFor(1, "cycle")).toBe("cycle");
  });

  it("builds every noun's four forms from its words", () => {
    for (const [key, noun] of Object.entries(NOUNS)) {
      expect(noun.One, key).toBe(
        noun.one[0]!.toUpperCase() + noun.one.slice(1),
      );
      expect(noun.Many, key).toBe(
        noun.many[0]!.toUpperCase() + noun.many.slice(1),
      );
    }
  });
});

describe("the words themselves", () => {
  it("are the ones Kene's table names", () => {
    expect(NOUNS.task.one).toBe("task");
    expect(NOUNS.problem.one).toBe("problem");
    expect(NOUNS.subtask.one).toBe("subtask");
    expect(INITIATIVE.one).toBe("initiative");
    expect(CYCLE.one).toBe("cycle");
    expect(NOUNS.stage.one).toBe("stage");
    expect(NOUNS.limit.one).toBe("limit");
    expect(EFFORT.one).toBe("effort");
    expect(LATER).toBe("Later");
    expect(NEW_TASK).toBe("New task");
    expect(NEW_INITIATIVE).toBe("New initiative");
    expect(NEW_CYCLE).toBe("New cycle");
    expect(START_CYCLE).toBe("Start cycle");
    expect(COMPLETE_CYCLE).toBe("Complete cycle");
  });

  it("name the charts Cycle progress and Pace, and the empty screens in the new words", () => {
    expect(REPORT_TITLE.cycleProgress).toBe("Cycle progress");
    expect(REPORT_TITLE.pace).toBe("Pace");
    expect(REPORT_TITLE.breakdown).toBe("Task breakdown");
    expect(EMPTY.noTasks).toBe("No tasks yet");
    expect(EMPTY.noInitiatives).toBe("No initiatives yet");
    expect(EMPTY.noCycles).toBe("No cycles yet");
    expect(EMPTY.noActiveCycle).toBe("No active cycle");
    expect(EMPTY.laterIsEmpty).toBe("Later is empty.");
  });

  it("keep sentence case and no exclamation marks", () => {
    const sentences = [
      NEW_TASK,
      NEW_INITIATIVE,
      NEW_CYCLE,
      START_CYCLE,
      COMPLETE_CYCLE,
      PROJECTS_SUBTITLE,
      PROJECTS_FEATURE_LINE,
      ...Object.values(TAB_LABEL),
      ...Object.values(TYPE_LABEL),
      ...Object.values(SWIMLANE_LABEL),
      ...Object.values(CATEGORY_LABEL),
      ...Object.values(REPORT_TITLE),
      ...Object.values(EMPTY),
    ];
    for (const text of sentences) {
      expect(text, text).not.toContain("!");
      // Sentence case: no word after the first starts with a capital.
      const [, ...rest] = text.split(" ");
      expect(
        rest.filter((w) => /^[A-Z]/.test(w)),
        text,
      ).toEqual([]);
    }
  });

  it("name the lanes by initiative, not epic", () => {
    expect(SWIMLANE_LABEL.epic).toBe("Lanes by initiative");
  });
});

describe("the types", () => {
  it("show a stored STORY as a Task, so nothing is called Story", () => {
    expect(TYPE_LABEL.STORY).toBe("Task");
    expect(TYPE_LABEL.TASK).toBe("Task");
    expect(TYPE_LABEL.BUG).toBe("Problem");
    expect(TYPE_LABEL.SUBTASK).toBe("Subtask");
    expect(TYPE_LABEL.EPIC).toBe("Initiative");
    expect(displayType("STORY")).toBe("TASK");
    expect(displayType("TASK")).toBe("TASK");
    expect(displayType("BUG")).toBe("BUG");
    expect(displayType("EPIC")).toBe("EPIC");
  });

  it("have a label for every stored type", () => {
    for (const type of ISSUE_TYPES) {
      expect(TYPE_LABEL[type], type).toBeTruthy();
    }
  });

  it("offer Task, Problem, Initiative in the picker, and never two entries with one name", () => {
    expect(PICKABLE_TYPES.map((t) => TYPE_LABEL[t])).toEqual([
      "Task",
      "Problem",
      "Initiative",
    ]);
    expect(PICKABLE_ISSUE_TYPES).toEqual(PICKABLE_TYPES);
    for (const list of [PICKABLE_TYPES, WORK_TYPES, FILTER_TYPES]) {
      const labels = list.map((t) => TYPE_LABEL[t]);
      expect(new Set(labels).size, labels.join(", ")).toBe(labels.length);
      expect(list as readonly string[]).not.toContain("STORY");
    }
    expect(WORK_TYPES.map((t) => TYPE_LABEL[t])).toEqual(["Task", "Problem"]);
    expect(FILTER_TYPES.map((t) => TYPE_LABEL[t])).toEqual([
      "Initiative",
      "Task",
      "Problem",
      "Subtask",
    ]);
  });

  it("make a new item a TASK", () => {
    expect(DEFAULT_TYPE).toBe("TASK");
  });

  it("break a report down by name, with STORY counted under Task", () => {
    expect(BREAKDOWN_TYPES.map((t) => TYPE_LABEL[t])).toEqual([
      "Task",
      "Problem",
      "Subtask",
    ]);
  });

  it("find a stored STORY when the Task filter is used", () => {
    const base = {
      id: "i",
      projectId: "p",
      key: "K-1",
      number: 1,
      title: "t",
      description: "",
      statusId: "s1",
      priority: "MEDIUM",
      points: null,
      assigneeId: null,
      assigneeIds: [],
      labels: [],
      parentId: null,
      epicId: null,
      sprintId: null,
      rank: "a",
    } as unknown as Issue;
    const story = { ...base, id: "a", type: "STORY" } as Issue;
    const task = { ...base, id: "b", type: "TASK" } as Issue;
    const bug = { ...base, id: "c", type: "BUG" } as Issue;
    const kept = applyFilter(
      [story, task, bug],
      { ...EMPTY_FILTER, type: "TASK" },
      null,
    );
    expect(kept.map((i) => i.id)).toEqual(["a", "b"]);
  });
});

describe("the tabs", () => {
  it("say the new words while the ?view= ids stay the old ones", () => {
    expect({ ...TAB_LABEL }).toEqual({
      board: "Board",
      backlog: "Plan",
      roadmap: "Timeline",
      reports: "Progress",
      issues: "List",
      settings: "Settings",
    });
    expect(PROJECT_VIEWS.map((v) => [v.id, v.label])).toEqual(
      Object.entries(TAB_LABEL),
    );
  });

  it("still open the right tab for a link saved before the rename", () => {
    expect(viewById("backlog").label).toBe("Plan");
    expect(viewById("roadmap").label).toBe("Timeline");
    expect(viewById("reports").label).toBe("Progress");
    expect(viewById("issues").label).toBe("List");
    expect(viewById("nonsense").id).toBe("board");
  });
});

describe("a new cycle's name", () => {
  const sprint = (name: string, endDate: string | null = null): Sprint =>
    ({
      id: name,
      projectId: "p",
      name,
      goal: "",
      startDate: null,
      endDate,
      state: "PLANNED",
      committedPoints: null,
      completedPoints: null,
      closedAt: null,
      createdAt: "2026-10-01T00:00:00.000Z",
    }) as Sprint;
  const project = { key: "CHK" };

  it("is Cycle N, without the project key", () => {
    expect(cycleName(4)).toBe("Cycle 4");
    expect(nextSprintDraft(project, [], "2026-11-04").name).toBe("Cycle 1");
    expect(
      nextSprintDraft(
        project,
        [sprint("Cycle 1"), sprint("Cycle 2")],
        "2026-11-04",
      ).name,
    ).toBe("Cycle 3");
  });

  it("leaves a name somebody already gave a sprint alone, and numbers after what exists", () => {
    const legacy = [sprint("CHK Sprint 1"), sprint("CHK Sprint 2")];
    expect(legacy.map((s) => s.name)).toEqual(["CHK Sprint 1", "CHK Sprint 2"]);
    expect(nextSprintDraft(project, legacy, "2026-11-04").name).toBe("Cycle 3");
  });

  it("skips a name that is taken", () => {
    const sprints = [sprint("Cycle 3")];
    expect(nextSprintDraft(project, sprints, "2026-11-04").name).toBe(
      "Cycle 2",
    );
    const two = [sprint("Cycle 2"), sprint("Cycle 3")];
    expect(nextSprintDraft(project, two, "2026-11-04").name).toBe("Cycle 4");
  });
});

describe("how access is worded, once", () => {
  /* These sentences are copied from what the API sends when a read-only person
     tries to change something (`403 read_only`), so the quiet line on the screen
     and the refusal never disagree. If the API's words change, change terms.ts. */
  it("says on a project what the API says when it refuses a change", () => {
    expect(readOnlyProject("Operations")).toBe(
      "You can read this project through Operations, but you can't change it. Ask the program lead for read and write access.",
    );
    expect(readOnlyProject(null)).toBe(
      "You can read this project, but you can't change it. Ask its lead for access.",
    );
  });

  it("uses the level names everywhere: Read, Read and write, Lead", () => {
    expect(LEVEL_LABEL).toEqual({
      READ: "Read",
      WRITE: "Read and write",
      LEAD: "Lead",
    });
    /* Nothing asks for 'write access' alone, which is not a level anybody can be given. */
    for (const line of [
      readOnlyProject("Operations"),
      readOnlyProject(null),
      READ_ONLY_PROGRAM,
      ...Object.values(LEVEL_SENTENCE),
    ]) {
      expect(line).not.toMatch(/\bwrite access\b(?<!read and write access)/);
      expect(line).not.toMatch(/\bview\b/i);
    }
  });
});
