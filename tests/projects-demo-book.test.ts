import { describe, expect, it } from "vitest";
import {
  BOOK_MAX_AGE_DAYS,
  EMPTY_BOOK,
  ProjectRuleError,
  addCommentToBook,
  bookIsStale,
  completeSprintInBook,
  createIssue,
  createProject,
  createSprintInBook,
  deleteIssueInBook,
  deleteProject,
  deleteSprintInBook,
  editCommentInBook,
  patchIssueInBook,
  removeCommentFromBook,
  sampleBook,
  setMembers,
  setStatuses,
  startSprintInBook,
  updateProject,
  type Ctx,
  type DemoBook,
} from "@/lib/projects/demo-book";
import { SAMPLE_PROJECT_ID } from "@/lib/projects/sample";
import {
  canCreateProject,
  canDeleteComment,
  canManageProject,
  canSeeProject,
  canWorkInProject,
  type Actor,
} from "@/lib/projects/access";
import {
  bodySegments,
  encodeMentions,
  mentionQueryAt,
  mentionedIds,
} from "@/lib/projects/mentions";
import { nextSprintDraft, startBlocker } from "@/lib/projects/sprints";
import { addDays } from "@/lib/projects/dates";

const TODAY = "2026-10-15";
const NOW = "2026-10-15T12:00:00.000Z";
const PEOPLE = ["p-01", "p-03", "p-09", "p-04"];

let counter = 0;
const ctx = (actorId: string | null = "p-03"): Ctx => ({
  actorId,
  now: NOW,
  makeId: () => `id-${(counter += 1)}`,
});

const book = (): DemoBook =>
  sampleBook({ today: TODAY, now: NOW, people: PEOPLE });
const chk = (b: DemoBook) => b.projects[SAMPLE_PROJECT_ID]!;
const issueByKey = (b: DemoBook, key: string) =>
  chk(b).issues.find((i) => i.key === key)!;
const refusal = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    if (error instanceof ProjectRuleError) return error.message;
    throw error;
  }
  throw new Error("expected a refusal");
};

describe("the demo book", () => {
  it("opens with the sample project, its counter and its history", () => {
    const b = book();
    expect(Object.keys(b.projects)).toEqual([SAMPLE_PROJECT_ID]);
    expect(b.counters[SAMPLE_PROJECT_ID]).toBe(26);
    expect(b.anchor).toBe(TODAY);
    expect(b.activity[issueByKey(b, "CHK-10").id]![0]!.field).toBe("created");
  });

  it("is stale after a fortnight, and when it has no anchor", () => {
    const b = book();
    expect(bookIsStale(b, TODAY)).toBe(false);
    expect(bookIsStale(b, addDays(TODAY, BOOK_MAX_AGE_DAYS))).toBe(false);
    expect(bookIsStale(b, addDays(TODAY, BOOK_MAX_AGE_DAYS + 1))).toBe(true);
    expect(bookIsStale(EMPTY_BOOK, TODAY)).toBe(true);
  });
});

describe("creating a project", () => {
  const input = {
    name: "Mobile App v3",
    key: "mob",
    type: "KANBAN" as const,
    departmentId: null,
    description: "  Rebuild the app.  ",
    seedMembersFromDepartment: false,
    memberIds: ["p-03"],
  };

  it("makes the creator the lead and a member, with the default workflow", () => {
    const { book: next, project } = createProject(book(), input, ctx("p-01"));
    expect(project.key).toBe("MOB");
    expect(project.leadId).toBe("p-01");
    expect(project.memberIds).toEqual(["p-01", "p-03"]);
    expect(project.description).toBe("Rebuild the app.");
    expect(
      project.statuses.map((s) => [s.name, s.category, s.wipLimit]),
    ).toEqual([
      ["To Do", "TODO", null],
      ["In Progress", "IN_PROGRESS", 5],
      ["In Review", "IN_PROGRESS", 3],
      ["Done", "DONE", null],
    ]);
    expect(next.projects[project.id]!.issues).toEqual([]);
    expect(next.counters[project.id]).toBe(0);
  });

  it("refuses a bad key, a taken key and a missing name in the API's words", () => {
    expect(
      refusal(() => createProject(book(), { ...input, key: "M" }, ctx())),
    ).toMatch(/2 to 6/);
    expect(
      refusal(() => createProject(book(), { ...input, key: "chk" }, ctx())),
    ).toBe("Another project already uses CHK.");
    expect(
      refusal(() => createProject(book(), { ...input, name: "  " }, ctx())),
    ).toMatch(/name/);
  });
});

describe("creating an issue", () => {
  it("numbers it after the counter, even if the last issue was deleted", () => {
    let b = book();
    const last = issueByKey(b, "CHK-26");
    b = deleteIssueInBook(b, last.id, NOW);
    const { issue } = createIssue(
      b,
      SAMPLE_PROJECT_ID,
      { type: "TASK", title: "Next one" },
      ctx(),
    );
    expect(issue.key).toBe("CHK-27");
  });

  it("writes a created row and counts it", () => {
    const b = book();
    const { book: next, issue } = createIssue(
      b,
      SAMPLE_PROJECT_ID,
      { type: "BUG", title: "Layout jumps", priority: "HIGH" },
      ctx("p-09"),
    );
    expect(next.activity[issue.id]).toHaveLength(1);
    expect(next.activity[issue.id]![0]!.field).toBe("created");
    expect(next.counters[SAMPLE_PROJECT_ID]).toBe(27);
    expect(issue.reporterId).toBe("p-09");
  });

  it("refuses an empty summary, an orphan sub-task and a non-member assignee", () => {
    const b = book();
    expect(
      refusal(() =>
        createIssue(b, SAMPLE_PROJECT_ID, { type: "TASK", title: " " }, ctx()),
      ),
    ).toMatch(/summary/);
    expect(
      refusal(() =>
        createIssue(
          b,
          SAMPLE_PROJECT_ID,
          { type: "SUBTASK", title: "x" },
          ctx(),
        ),
      ),
    ).toMatch(/sub-task belongs to/);
    expect(
      refusal(() =>
        createIssue(
          b,
          SAMPLE_PROJECT_ID,
          { type: "TASK", title: "x", assigneeId: "p-06" },
          ctx(),
        ),
      ),
    ).toMatch(/members/);
  });
});

describe("changing an issue", () => {
  it("records who changed what, once per field, and none for rank", () => {
    const b = book();
    const issue = issueByKey(b, "CHK-14");
    const { book: next } = patchIssueInBook(
      b,
      issue.id,
      { priority: "LOW", points: 8, rank: 50 },
      ctx("p-03"),
    );
    const rows = next.activity[issue.id]!.slice(1);
    expect(rows.map((r) => r.field).sort()).toEqual(["points", "priority"]);
    expect(rows.every((r) => r.actorId === "p-03" && r.at === NOW)).toBe(true);
  });

  it("refuses to assign somebody who is not a member", () => {
    const b = book();
    const issue = issueByKey(b, "CHK-14");
    expect(
      refusal(() =>
        patchIssueInBook(b, issue.id, { assigneeId: "p-06" }, ctx()),
      ),
    ).toMatch(/Only members/);
    expect(
      patchIssueInBook(b, issue.id, { assigneeId: null }, ctx()).issue
        .assigneeId,
    ).toBeNull();
  });

  it("deletes an issue, its sub-tasks, its comments and its history", () => {
    const b = book();
    const parent = issueByKey(b, "CHK-10");
    expect(b.comments[parent.id]).toHaveLength(2);
    const next = deleteIssueInBook(b, parent.id, NOW);
    expect(chk(next).issues).toHaveLength(chk(b).issues.length - 4);
    expect(next.comments[parent.id]).toBeUndefined();
    expect(next.activity[parent.id]).toBeUndefined();
  });
});

describe("comments", () => {
  it("adds a comment by the actor and removes it again", () => {
    const b = book();
    const issue = issueByKey(b, "CHK-14");
    const { book: next, comment } = addCommentToBook(
      b,
      issue.id,
      "  Looking at this now  ",
      ctx("p-09"),
    );
    expect(comment.authorId).toBe("p-09");
    expect(comment.body).toBe("Looking at this now");
    expect(next.comments[issue.id]).toHaveLength(1);
    expect(removeCommentFromBook(next, comment.id).comments[issue.id]).toEqual(
      [],
    );
  });

  it("counts comments on the issue, and edits only the author's own", () => {
    const b = book();
    const issue = issueByKey(b, "CHK-14");
    expect(issue.commentCount).toBe(0);
    const { book: posted, comment } = addCommentToBook(
      b,
      issue.id,
      "First",
      ctx("p-09"),
    );
    expect(issueByKey(posted, "CHK-14").commentCount).toBe(1);
    const edited = editCommentInBook(
      posted,
      comment.id,
      "  Second  ",
      ctx("p-09"),
    );
    expect(edited.comment.body).toBe("Second");
    expect(edited.comment.editedAt).toBe(NOW);
    expect(
      refusal(() =>
        editCommentInBook(posted, comment.id, "Hijacked", ctx("p-03")),
      ),
    ).toMatch(/Only the person who wrote/);
    const removed = removeCommentFromBook(edited.book, comment.id);
    expect(issueByKey(removed, "CHK-14").commentCount).toBe(0);
  });

  it("refuses an empty comment", () => {
    const b = book();
    expect(
      refusal(() =>
        addCommentToBook(b, issueByKey(b, "CHK-14").id, "   ", ctx()),
      ),
    ).toMatch(/Write something/);
  });
});

describe("project settings", () => {
  it("renames and recolours, but refuses a board type change with a sprint active", () => {
    const b = book();
    const renamed = updateProject(
      b,
      SAMPLE_PROJECT_ID,
      { name: " Checkout ", color: "#0F766E" },
      NOW,
    );
    expect(chk(renamed).project.name).toBe("Checkout");
    expect(chk(renamed).project.color).toBe("#0F766E");
    expect(
      refusal(() =>
        updateProject(b, SAMPLE_PROJECT_ID, { type: "KANBAN" }, NOW),
      ),
    ).toMatch(/active sprint/);
  });

  it("refuses to take somebody off who still has open issues, naming them", () => {
    const b = book();
    const message = refusal(() =>
      setMembers(b, SAMPLE_PROJECT_ID, ["p-01", "p-03", "p-04"], NOW, (id) =>
        id === "p-09" ? "Emeka Anyanwu" : id,
      ),
    );
    expect(message).toContain("Emeka Anyanwu");
    expect(message).toMatch(/open/);
  });

  it("lets somebody go once their open issues are reassigned", () => {
    let b = book();
    for (const issue of chk(b).issues.filter((i) => i.assigneeId === "p-09")) {
      if (
        chk(b).project.statuses.find((s) => s.id === issue.statusId)
          ?.category !== "DONE"
      ) {
        b = patchIssueInBook(b, issue.id, { assigneeId: null }, ctx()).book;
      }
    }
    const next = setMembers(
      b,
      SAMPLE_PROJECT_ID,
      ["p-01", "p-03", "p-04"],
      NOW,
    );
    expect(chk(next).project.memberIds).not.toContain("p-09");
  });

  it("keeps the lead among the members when the lead changes or members are replaced", () => {
    const b = book();
    const changed = updateProject(
      b,
      SAMPLE_PROJECT_ID,
      { leadId: "p-06" },
      NOW,
    );
    expect(chk(changed).project.memberIds).toContain("p-06");
    /* Replacing the set without the lead still keeps the lead. */
    const replaced = setMembers(
      b,
      SAMPLE_PROJECT_ID,
      ["p-03", "p-09", "p-04", "p-06"],
      NOW,
    );
    expect(chk(replaced).project.memberIds).toEqual([
      "p-01",
      "p-03",
      "p-09",
      "p-04",
      "p-06",
    ]);
  });

  it("saves a reordered workflow keeping ids, and refuses removing a status with issues", () => {
    const b = book();
    const statuses = chk(b).project.statuses;
    const keep = statuses.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      wipLimit: s.wipLimit,
    }));
    const reordered = [keep[1]!, keep[0]!, keep[2]!, keep[3]!];
    const next = setStatuses(b, SAMPLE_PROJECT_ID, reordered, ctx());
    const saved = chk(next).project.statuses;
    expect(saved.map((s) => s.id)).toEqual(reordered.map((s) => s.id));
    expect(saved.map((s) => s.position)).toEqual([0, 1, 2, 3]);

    const removing = keep.filter((s) => s.name !== "Done");
    expect(
      refusal(() => setStatuses(b, SAMPLE_PROJECT_ID, removing, ctx())),
    ).toMatch(/Done status|issues are in Done/);
  });

  it("adds a status with a new id and allows removing an empty one", () => {
    const b = book();
    const statuses = chk(b).project.statuses;
    const withNew = [
      ...statuses.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        wipLimit: s.wipLimit,
      })),
      { name: "Blocked", category: "IN_PROGRESS" as const, wipLimit: null },
    ];
    const next = setStatuses(b, SAMPLE_PROJECT_ID, withNew, ctx());
    expect(chk(next).project.statuses).toHaveLength(5);
    const blocked = chk(next).project.statuses.find(
      (s) => s.name === "Blocked",
    )!;
    expect(blocked.id).toMatch(/^id-/);
    const without = withNew
      .filter((s) => s.name !== "Blocked")
      .map((s, i) => ({
        ...s,
        id: chk(next).project.statuses[i === 4 ? 0 : i]?.id,
      }));
    expect(() =>
      setStatuses(next, SAMPLE_PROJECT_ID, without.slice(0, 4), ctx()),
    ).not.toThrow();
  });

  it("deletes a project with everything under it", () => {
    const b = book();
    const next = deleteProject(b, SAMPLE_PROJECT_ID);
    expect(Object.keys(next.projects)).toEqual([]);
    expect(
      Object.keys(next.comments).flatMap((k) => next.comments[k]!),
    ).toEqual([]);
    expect(next.counters[SAMPLE_PROJECT_ID]).toBeUndefined();
  });
});

describe("sprints", () => {
  const sprintOf = (b: DemoBook, name: string) =>
    chk(b).sprints.find((s) => s.name === name)!;

  it("will not start a sprint while another is active, or one with no issues", () => {
    const b = book();
    const four = sprintOf(b, "CHK Sprint 4");
    expect(startBlocker(four, chk(b).sprints, chk(b).issues)).toMatch(
      /Complete the active sprint/,
    );
    expect(refusal(() => startSprintInBook(b, four.id, {}))).toMatch(
      /active sprint/,
    );
  });

  it("completes a sprint, moves unfinished issues to the backlog and records the points", () => {
    const b = book();
    const three = sprintOf(b, "CHK Sprint 3");
    const next = completeSprintInBook(b, three.id, null, { name: "x" }, ctx());
    const closed = sprintOf(next, "CHK Sprint 3");
    expect(closed.state).toBe("CLOSED");
    expect(closed.completedPoints).toBe(3 + 5 + 1);
    expect(closed.closedAt).toBe(NOW);
    const stuck = chk(next).issues.filter((i) => i.sprintId === three.id);
    /* Only what was finished stays behind, sub-tasks of unfinished work included in the move. */
    expect(stuck.every((i) => i.doneAt !== null)).toBe(true);
    expect(issueByKey(next, "CHK-10").sprintId).toBeNull();
    expect(issueByKey(next, "CHK-27" as string)).toBeUndefined();
  });

  it("can move unfinished work into a planned sprint or a new one", () => {
    const b = book();
    const three = sprintOf(b, "CHK Sprint 3");
    const four = sprintOf(b, "CHK Sprint 4");
    const toPlanned = completeSprintInBook(
      b,
      three.id,
      four.id,
      { name: "x" },
      ctx(),
    );
    expect(issueByKey(toPlanned, "CHK-10").sprintId).toBe(four.id);

    const toNew = completeSprintInBook(
      b,
      three.id,
      "new",
      { name: "CHK Sprint 5", startDate: "2026-10-29", endDate: "2026-11-11" },
      ctx(),
    );
    const created = chk(toNew).sprints.find((s) => s.name === "CHK Sprint 5")!;
    expect(created.state).toBe("PLANNED");
    expect(issueByKey(toNew, "CHK-10").sprintId).toBe(created.id);
  });

  it("starts a planned sprint once the active one is closed, fixing the committed points", () => {
    let b = book();
    const three = sprintOf(b, "CHK Sprint 3");
    b = completeSprintInBook(
      b,
      three.id,
      sprintOf(b, "CHK Sprint 4").id,
      { name: "x" },
      ctx(),
    );
    const four = sprintOf(b, "CHK Sprint 4");
    const started = startSprintInBook(b, four.id, {
      name: "CHK Sprint 4 (go)",
    });
    const live = sprintOf(started, "CHK Sprint 4 (go)");
    expect(live.state).toBe("ACTIVE");
    expect(live.committedPoints).toBeGreaterThan(0);
  });

  it("creates and deletes a planned sprint, returning its issues to the backlog", () => {
    let b = book();
    const created = createSprintInBook(
      b,
      SAMPLE_PROJECT_ID,
      { name: "" },
      ctx(),
    );
    b = created.book;
    expect(created.sprint.name).toBe("CHK Sprint 5");
    const four = sprintOf(b, "CHK Sprint 4");
    const next = deleteSprintInBook(b, four.id, NOW);
    expect(chk(next).sprints.some((s) => s.id === four.id)).toBe(false);
    expect(issueByKey(next, "CHK-17").sprintId).toBeNull();
    expect(
      refusal(() => deleteSprintInBook(b, sprintOf(b, "CHK Sprint 3").id, NOW)),
    ).toMatch(/planned sprint/);
  });

  it("drafts the next sprint after the last one's end", () => {
    const b = book();
    const draft = nextSprintDraft(chk(b).project, chk(b).sprints, TODAY);
    expect(draft.name).toBe("CHK Sprint 5");
    expect(draft.startDate).toBe(addDays(TODAY, 22));
    expect(draft.endDate).toBe(addDays(draft.startDate, 13));
    expect(nextSprintDraft(chk(b).project, [], TODAY).startDate).toBe(TODAY);
  });

  it("will not give a Kanban project sprints", () => {
    const { book: b, project } = createProject(
      book(),
      {
        name: "Flow",
        key: "FLW",
        type: "KANBAN",
        departmentId: null,
        description: "",
        seedMembersFromDepartment: false,
        memberIds: [],
      },
      ctx("p-01"),
    );
    expect(
      refusal(() => createSprintInBook(b, project.id, { name: "x" }, ctx())),
    ).toMatch(/Kanban/);
  });
});

describe("who may do what", () => {
  const actor = (over: Partial<Actor> = {}): Actor => ({
    employeeId: "p-03",
    editRecords: false,
    leadsPeople: false,
    headsDepartment: false,
    ...over,
  });
  const project = { leadId: "p-01", memberIds: ["p-01", "p-03"] };

  it("lets team leads, department heads and EDIT_RECORDS holders create projects", () => {
    expect(canCreateProject(actor())).toBe(false);
    expect(canCreateProject(actor({ leadsPeople: true }))).toBe(true);
    expect(canCreateProject(actor({ headsDepartment: true }))).toBe(true);
    expect(canCreateProject(actor({ editRecords: true }))).toBe(true);
  });

  it("shows a project to its members and lead, and to EDIT_RECORDS holders, nobody else", () => {
    expect(canSeeProject(actor(), project)).toBe(true);
    expect(canSeeProject(actor({ employeeId: "p-01" }), project)).toBe(true);
    expect(canSeeProject(actor({ employeeId: "p-09" }), project)).toBe(false);
    expect(
      canSeeProject(actor({ employeeId: "p-09", editRecords: true }), project),
    ).toBe(true);
    expect(canSeeProject(actor({ employeeId: null }), project)).toBe(false);
    expect(canWorkInProject(actor({ employeeId: "p-09" }), project)).toBe(
      false,
    );
  });

  it("lets only the lead and EDIT_RECORDS holders manage", () => {
    expect(canManageProject(actor({ employeeId: "p-01" }), project)).toBe(true);
    expect(canManageProject(actor(), project)).toBe(false);
    expect(canManageProject(actor({ editRecords: true }), project)).toBe(true);
    expect(canManageProject(actor({ employeeId: null }), project)).toBe(false);
  });

  it("lets a comment be deleted by its author, the lead, or EDIT_RECORDS", () => {
    const comment = { authorId: "p-03" };
    expect(canDeleteComment(actor(), project, comment)).toBe(true);
    expect(
      canDeleteComment(actor({ employeeId: "p-09" }), project, comment),
    ).toBe(false);
    expect(
      canDeleteComment(actor({ employeeId: "p-01" }), project, comment),
    ).toBe(true);
    expect(
      canDeleteComment(
        actor({ employeeId: "p-09", editRecords: true }),
        project,
        comment,
      ),
    ).toBe(true);
  });
});

describe("mentions", () => {
  it("stores a picked name as <@id>, longest name first", () => {
    const text = "@Ada Okafor and @Ada can look";
    const out = encodeMentions(text, { "Ada Okafor": "p-01", Ada: "p-02" });
    expect(out).toBe("<@p-01> and <@p-02> can look");
  });

  it("does not swallow a longer word that starts with a name", () => {
    expect(encodeMentions("@Adam", { Ada: "p-01" })).toBe("@Adam");
  });

  it("reads the ids back, once each, in order", () => {
    expect(mentionedIds("hi <@p-03> and <@p-01>, again <@p-03>")).toEqual([
      "p-03",
      "p-01",
    ]);
  });

  it("splits a body into text and mentions without touching HTML", () => {
    expect(bodySegments("a <script> <@p-01> b")).toEqual([
      { kind: "text", text: "a <script> " },
      { kind: "mention", employeeId: "p-01" },
      { kind: "text", text: " b" },
    ]);
  });

  it("finds the @query at the caret", () => {
    expect(mentionQueryAt("ping @ad", 8)).toEqual({ start: 5, query: "ad" });
    expect(mentionQueryAt("@", 1)).toEqual({ start: 0, query: "" });
    expect(mentionQueryAt("email a@b.com", 13)).toBeNull();
    expect(mentionQueryAt("ping @ada lovelace", 18)).toBeNull();
  });
});
