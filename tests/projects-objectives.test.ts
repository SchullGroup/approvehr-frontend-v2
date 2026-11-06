import { describe, expect, it } from "vitest";
import type { ApiGoal } from "@/lib/api/performance";
import { closedLink, linkedTo } from "./support/objective-fixtures";
import { describeActivity, type HistoryLookup } from "@/lib/projects/history";
import {
  countsAsWork,
  flattenGroups,
  mayLinkIssue,
  objectiveGroups,
  objectiveLine,
  projectSourceHref,
  workIssueHref,
  readProjectSource,
  withCurrentGroup,
} from "@/lib/projects/objectives";

/**
 * Linking a task to an objective is optional and forgiving: which objectives are
 * offered (every one the person can see, a draft included, grouped by level), who
 * is offered the picker, and the one neutral line a link reads as.
 *
 * Nothing here is a fault. There is no refusal for the kind of objective, no
 * "not counted" line and no warning for a task that is not linked.
 */

const goal = (extra: Partial<ApiGoal> & { id: string }): ApiGoal =>
  ({
    title: "Objective",
    description: null,
    ownerId: "me",
    ownerName: "Chidi Nwosu",
    departmentId: null,
    departmentName: null,
    level: "personal",
    companyWide: false,
    parentId: null,
    parentTitle: null,
    status: "ON_TRACK",
    progress: 0,
    measuredProgress: null,
    dueQuarter: "2026-Q4",
    reviewCycleId: null,
    reviewCycleName: null,
    approval: "AGREED",
    approvalLabel: "Agreed",
    targetFrozen: true,
    submittedAt: null,
    agreedAt: null,
    approvalNote: null,
    revisionCount: 0,
    revisedAt: null,
    keyResults: [],
    childCount: 0,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...extra,
  }) as ApiGoal;

const company = goal({
  id: "g-company",
  title: "Grow online revenue",
  ownerId: null,
  ownerName: null,
  level: "company",
  companyWide: true,
});
const department = goal({
  id: "g-dept",
  title: "Engineering ships on time",
  ownerId: null,
  ownerName: null,
  level: "department",
  departmentName: "Engineering",
});
const mine = goal({
  id: "g-mine",
  title: "Lift checkout conversion",
  keyResults: [
    { id: "kr-1", label: "Conversion rate" },
    { id: "kr-2", label: "Cart errors" },
  ] as ApiGoal["keyResults"],
});
const draftMine = goal({
  id: "g-draft",
  title: "Learn the ledger",
  approval: "DRAFT",
});
const theirs = goal({
  id: "g-theirs",
  title: "Their objective",
  ownerId: "other",
  ownerName: "Ngozi Eze",
});
const closedOne = goal({ id: "g-done", title: "Old goal", status: "DONE" });

describe("what a person may link a task to", () => {
  const groups = objectiveGroups(
    [theirs, draftMine, mine, department, company, closedOne],
    { meId: "me", assigneeId: "me" },
  );

  it("groups every objective the person can see by level: company, department, personal", () => {
    expect(groups.map((g) => g.label)).toEqual([
      "Company",
      "Department",
      "Personal",
    ]);
  });

  it("includes a draft and somebody else's personal KPI, never filtering by approval or owner", () => {
    const labels = flattenGroups(groups).map((o) => o.label);
    expect(labels).toContain("Learn the ledger");
    expect(labels).toContain("Their objective (Ngozi Eze)");
  });

  it("names the level on shared ones", () => {
    const labels = flattenGroups(groups).map((o) => o.label);
    expect(labels).toContain("Grow online revenue (Company)");
    expect(labels).toContain(
      "Engineering ships on time (Department · Engineering)",
    );
  });

  it("puts the assignee's own KPIs first among the personal ones", () => {
    const personal = groups.find((g) => g.level === "personal")!;
    expect(personal.options[0]!.title).not.toBe("Their objective");
    expect(personal.options.at(-1)!.title).toBe("Their objective");
  });

  it("offers a closed objective too, marked closed, so an old link can be chosen", () => {
    const row = flattenGroups(groups).find((o) => o.id === "g-done")!;
    expect(row.closed).toBe(true);
  });

  it("carries each objective's measures, for narrowing a link to one", () => {
    const row = flattenGroups(groups).find((o) => o.id === "g-mine")!;
    expect(row.measures).toEqual([
      { id: "kr-1", label: "Conversion rate" },
      { id: "kr-2", label: "Cart errors" },
    ]);
  });

  it("keeps a saved link visible when the person cannot list it", () => {
    const kept = withCurrentGroup(
      groups,
      { goalId: "g-gone", objective: null },
      [],
      "me",
    );
    const row = flattenGroups(kept).find((o) => o.id === "g-gone")!;
    expect(row.label).toBe("A linked objective");
    expect(
      flattenGroups(
        withCurrentGroup(groups, { goalId: "g-mine" }, [mine], "me"),
      ).filter((o) => o.id === "g-mine"),
    ).toHaveLength(1);
  });

  it("is empty, not an error, when there is nothing to choose from", () => {
    expect(objectiveGroups([], { meId: "me" })).toEqual([]);
  });
});

describe("who is offered the picker", () => {
  const issue = { type: "TASK" as const, assigneeIds: ["me"] };
  const base = {
    meId: "me",
    canManageProject: false,
    editRecords: false,
    leadsAssignee: false,
  };

  it("the assignee, the project's lead or HR, the assignee's manager and HR may", () => {
    expect(mayLinkIssue({ ...base, issue })).toBe(true);
    expect(
      mayLinkIssue({ ...base, issue, meId: "x", canManageProject: true }),
    ).toBe(true);
    expect(
      mayLinkIssue({ ...base, issue, meId: "x", leadsAssignee: true }),
    ).toBe(true);
    expect(mayLinkIssue({ ...base, issue, meId: "x", editRecords: true })).toBe(
      true,
    );
  });

  it("anybody else is offered nothing", () => {
    expect(mayLinkIssue({ ...base, issue, meId: "x" })).toBe(false);
    expect(mayLinkIssue({ ...base, issue, meId: null })).toBe(false);
  });

  it("the API's own answer wins, either way", () => {
    expect(
      mayLinkIssue({
        ...base,
        issue: { ...issue, canLinkObjective: false },
      }),
    ).toBe(false);
    expect(
      mayLinkIssue({
        ...base,
        meId: "x",
        issue: { ...issue, canLinkObjective: true },
      }),
    ).toBe(true);
  });

  it("only a top-level task is linkable: not an initiative, not a subtask", () => {
    expect(countsAsWork({ type: "TASK" })).toBe(true);
    expect(countsAsWork({ type: "STORY" })).toBe(true);
    expect(countsAsWork({ type: "BUG" })).toBe(true);
    expect(countsAsWork({ type: "EPIC" })).toBe(false);
    expect(countsAsWork({ type: "SUBTASK" })).toBe(false);
    expect(
      mayLinkIssue({
        ...base,
        issue: { type: "SUBTASK", assigneeIds: ["me"] },
      }),
    ).toBe(false);
  });
});

describe("the one line a link reads as", () => {
  it("is nothing at all for a task that is not linked", () => {
    expect(
      objectiveLine({ goalId: null, keyResultId: null, objective: null }),
    ).toBeNull();
  });

  it("says what it is linked to, and the measure when narrowed", () => {
    expect(
      objectiveLine(
        {
          goalId: "g-mine",
          keyResultId: "kr-1",
          objective: null,
        },
        [mine],
      ),
    ).toBe("Linked to Lift checkout conversion (Conversion rate)");
    expect(
      objectiveLine({ goalId: "g-mine", keyResultId: null, objective: null }, [
        mine,
      ]),
    ).toBe("Linked to Lift checkout conversion");
  });

  it("prefers what the API said about it", () => {
    expect(
      objectiveLine({
        goalId: "g1",
        keyResultId: null,
        objective: linkedTo("From the API"),
      }),
    ).toBe("Linked to From the API");
  });

  it("says a closed objective is closed, in plain text", () => {
    expect(
      objectiveLine({ goalId: "g-done", keyResultId: null, objective: null }, [
        closedOne,
      ]),
    ).toBe("Linked objective is closed");
    expect(
      objectiveLine({
        goalId: "g1",
        keyResultId: null,
        objective: closedLink("X"),
      }),
    ).toBe("Linked objective is closed");
  });

  it("does not guess a name it was not given", () => {
    expect(
      objectiveLine({ goalId: "g1", keyResultId: null, objective: null }),
    ).toBe("Linked to an objective");
  });

  it("never uses the old words", () => {
    const lines = [
      objectiveLine({ goalId: "g-done", keyResultId: null, objective: null }, [
        closedOne,
      ]),
      objectiveLine({ goalId: "g1", keyResultId: null, objective: null }),
    ].join(" ");
    expect(lines).not.toMatch(/not counted|weekly task|waiting|!/i);
  });
});

describe("reading a task's project source", () => {
  it("reads the key and project, and nothing else", () => {
    expect(
      readProjectSource({ key: "CHK-2", projectId: "p1", extra: 1 }),
    ).toEqual({ key: "CHK-2", projectId: "p1" });
  });

  it("keeps the key and drops the project once it is deleted", () => {
    expect(readProjectSource({ key: "CHK-2", projectId: null })).toEqual({
      key: "CHK-2",
      projectId: null,
    });
  });

  it("is no tag for null, absent, or something that is not a key", () => {
    expect(readProjectSource(null)).toBeNull();
    expect(readProjectSource(undefined)).toBeNull();
    expect(readProjectSource("CHK-2")).toBeNull();
    expect(readProjectSource({ projectId: "p1" })).toBeNull();
    expect(readProjectSource({ key: "  ", projectId: "p1" })).toBeNull();
    expect(readProjectSource({ key: 4, projectId: "p1" })).toBeNull();
  });

  it("links to the issue in its project, and to nothing once the project is gone", () => {
    expect(projectSourceHref({ key: "CHK-2", projectId: "p1" })).toBe(
      "/projects/p1?issue=CHK-2",
    );
    expect(projectSourceHref({ key: "CHK-2", projectId: null })).toBeNull();
  });
});

describe("an objective in an issue's history", () => {
  const lookup: HistoryLookup = {
    statusName: () => null,
    personName: () => "Someone",
    sprintName: () => null,
    issueKey: () => null,
  };

  it("says an objective, never the id", () => {
    const text = describeActivity(
      {
        field: "goalId",
        from: null,
        to: "01a13f60-4bf7-737a-ab67-fcd9e27e1308",
      },
      lookup,
    );
    expect(text).toEqual({
      verb: "changed objective",
      from: "none",
      to: "an objective",
    });
  });

  it("uses the title where the screen has it", () => {
    const text = describeActivity(
      { field: "goalId", from: "g1", to: null },
      { ...lookup, goalTitle: (id) => (id === "g1" ? "Grow revenue" : null) },
    );
    expect(text).toMatchObject({ from: "Grow revenue", to: "none" });
  });
});

describe("workIssueHref", () => {
  it("opens a MY-n task by id, and a board issue on its board", () => {
    expect(workIssueHref({ id: "i-9", key: "MY-4", projectId: "p-mine" })).toBe(
      "/projects/tasks/i-9",
    );
    expect(workIssueHref({ id: "i-1", key: "PAY-1", projectId: "p-1" })).toBe(
      "/projects/p-1?issue=PAY-1",
    );
  });
});
