import { describe, expect, it } from "vitest";
import type { ApiGoal } from "@/lib/api/performance";
import { describeActivity, type HistoryLookup } from "@/lib/projects/history";
import {
  bridgeApplies,
  issueObjectiveOptions,
  mayClearIssueObjective,
  mayLinkIssueObjective,
  projectObjectiveOptions,
  projectSourceHref,
  readProjectSource,
  weeklyTaskLine,
  withCurrent,
} from "@/lib/projects/objectives";

/**
 * Which objectives each picker may offer, who may link what, and the one line the
 * weekly-task bridge gets.
 *
 * The rules are the API's (`assertMayLinkGoal`, `assertProjectGoal`,
 * `ownObjectiveFor`): an issue links only to its assignee's own agreed
 * objectives, a project to any objective its lead can read. These tests pin the
 * screen to that so it never offers a choice the API will refuse.
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

const mine = goal({ id: "g-mine", title: "Lift checkout conversion" });
const mineToo = goal({ id: "g-mine-2", title: "Cut support tickets" });
const draft = goal({
  id: "g-draft",
  title: "Learn the ledger",
  approval: "DRAFT",
});
const awaiting = goal({
  id: "g-wait",
  title: "Waiting to be agreed",
  approval: "AWAITING_APPROVAL",
});
const someoneElses = goal({
  id: "g-theirs",
  title: "Their objective",
  ownerId: "ngozi",
  ownerName: "Ngozi Eze",
});
const company = goal({
  id: "g-co",
  title: "Grow online revenue",
  ownerId: null,
  ownerName: null,
  level: "company",
  companyWide: true,
  /* A company objective has no one to agree it: it stays a draft. */
  approval: "DRAFT",
});
const department = goal({
  id: "g-dept",
  title: "Halve onboarding time",
  ownerId: null,
  ownerName: null,
  level: "department",
  departmentId: "d1",
  departmentName: "People",
  approval: "DRAFT",
});

const ALL = [someoneElses, draft, mineToo, company, awaiting, mine, department];

describe("what an issue may be linked to", () => {
  it("offers only the assignee's own agreed objectives", () => {
    const options = issueObjectiveOptions(ALL, "me");
    expect(options.map((o) => o.id)).toEqual(["g-mine-2", "g-mine"]);
  });

  it("never offers a draft, one awaiting agreement, somebody else's, or a company one", () => {
    const ids = issueObjectiveOptions(ALL, "me").map((o) => o.id);
    for (const refused of ["g-draft", "g-wait", "g-theirs", "g-co", "g-dept"]) {
      expect(ids).not.toContain(refused);
    }
  });

  it("offers nothing to somebody with no staff record", () => {
    expect(issueObjectiveOptions(ALL, null)).toEqual([]);
  });

  it("offers nothing when none is agreed, rather than a list of refusals", () => {
    expect(issueObjectiveOptions([draft, awaiting], "me")).toEqual([]);
  });
});

describe("what a project may be linked to", () => {
  it("offers agreed objectives and the company and department ones, whatever their approval says", () => {
    const ids = projectObjectiveOptions(ALL, "lead").map((o) => o.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "g-co",
        "g-dept",
        "g-mine",
        "g-mine-2",
        "g-theirs",
      ]),
    );
  });

  it("leaves out a personal objective that is not agreed yet", () => {
    const ids = projectObjectiveOptions(ALL, "lead").map((o) => o.id);
    expect(ids).not.toContain("g-draft");
    expect(ids).not.toContain("g-wait");
  });

  it("says whose a personal one is, and what level a shared one is", () => {
    const labels = Object.fromEntries(
      projectObjectiveOptions(ALL, "lead").map((o) => [o.id, o.label]),
    );
    expect(labels["g-co"]).toBe("Grow online revenue (Company)");
    expect(labels["g-dept"]).toBe(
      "Halve onboarding time (Department · People)",
    );
    expect(labels["g-theirs"]).toBe("Their objective (Ngozi Eze)");
  });

  it("does not put a person's name on their own objective", () => {
    const labels = projectObjectiveOptions([mine], "me").map((o) => o.label);
    expect(labels).toEqual(["Lift checkout conversion"]);
  });

  it("marks the shared ones, which file under a KPI beneath", () => {
    const shared = Object.fromEntries(
      projectObjectiveOptions(ALL, "lead").map((o) => [o.id, o.shared]),
    );
    expect(shared["g-co"]).toBe(true);
    expect(shared["g-mine"]).toBe(false);
  });
});

describe("keeping the saved choice visible", () => {
  it("adds a saved objective that is no longer on offer, with its title when known", () => {
    const options = issueObjectiveOptions([mine], "me");
    const withDraft = withCurrent(options, "g-draft", ALL, "me");
    expect(withDraft.map((o) => o.id)).toEqual(["g-mine", "g-draft"]);
    expect(withDraft[1]!.label).toBe("Learn the ledger");
  });

  it("names one it has never heard of as a linked objective, never an id", () => {
    const withUnknown = withCurrent([], "g-gone", [], "me");
    expect(withUnknown).toEqual([
      { id: "g-gone", label: "A linked objective", shared: false },
    ]);
  });

  it("changes nothing when the saved one is already offered, or there is none", () => {
    const options = issueObjectiveOptions([mine], "me");
    expect(withCurrent(options, "g-mine", [mine], "me")).toEqual(options);
    expect(withCurrent(options, null, [mine], "me")).toEqual(options);
  });
});

describe("who may link and unlink", () => {
  const story = { type: "STORY", assigneeId: "me", goalId: "g-mine" } as const;

  it("lets only the assignee link an issue", () => {
    expect(mayLinkIssueObjective("me", story)).toBe(true);
    expect(mayLinkIssueObjective("lead", story)).toBe(false);
    expect(mayLinkIssueObjective(null, story)).toBe(false);
    expect(
      mayLinkIssueObjective("me", { type: "STORY", assigneeId: null }),
    ).toBe(false);
  });

  it("never offers a link on an epic or a sub-task, which never file", () => {
    expect(bridgeApplies({ type: "EPIC" })).toBe(false);
    expect(bridgeApplies({ type: "SUBTASK" })).toBe(false);
    expect(
      mayLinkIssueObjective("me", { type: "SUBTASK", assigneeId: "me" }),
    ).toBe(false);
    for (const type of ["STORY", "TASK", "BUG"] as const) {
      expect(bridgeApplies({ type })).toBe(true);
    }
  });

  it("lets the assignee, the lead or HR take a link off, and nobody else", () => {
    expect(mayClearIssueObjective("me", story, false)).toBe(true);
    expect(mayClearIssueObjective("lead", story, true)).toBe(true);
    expect(mayClearIssueObjective("other", story, false)).toBe(false);
  });

  it("has nothing to take off when there is no link", () => {
    expect(
      mayClearIssueObjective("lead", { ...story, goalId: null }, true),
    ).toBe(false);
  });
});

describe("the weekly-task line", () => {
  it("is silence when the API has nothing to say", () => {
    expect(weeklyTaskLine(null)).toBeNull();
  });

  it("says a task was filed, and graded when it was, and never claims a week", () => {
    expect(
      weeklyTaskLine({ state: "FILED", taskId: "t1", graded: false }),
    ).toBe("Filed as a weekly task");
    expect(weeklyTaskLine({ state: "FILED", taskId: "t1", graded: true })).toBe(
      "Filed as a weekly task, and graded",
    );
    expect(
      weeklyTaskLine({ state: "FILED", taskId: "t1", graded: false }),
    ).not.toMatch(/week\b.*\bthis\b|this week/i);
  });

  it("shows the API's own sentence for each of the three reasons", () => {
    for (const [reason, message] of [
      [
        "NO_OBJECTIVE",
        "Not counted toward a weekly task, link this issue or the project to an objective.",
      ],
      [
        "OBJECTIVE_NOT_USABLE",
        "Not counted toward a weekly task, the linked objective is not an agreed one that the assignee owns.",
      ],
      [
        "WEEK_CLOSED",
        "Not counted toward a weekly task, it was finished in a week that has closed.",
      ],
    ] as const) {
      expect(weeklyTaskLine({ state: "NOT_COUNTED", reason, message })).toBe(
        message,
      );
    }
  });

  it("falls back to a line that asserts no reason when the API sent no sentence", () => {
    expect(
      weeklyTaskLine({
        state: "NOT_COUNTED",
        reason: "NO_OBJECTIVE",
        message: "",
      }),
    ).toBe("Not counted toward a weekly task.");
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
