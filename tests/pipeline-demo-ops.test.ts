import { describe, expect, it } from "vitest";
import {
  applyBulk,
  boardOf,
  createReason,
  createTag,
  deleteTag,
  deleteTemplate,
  duplicateTemplate,
  idsMatching,
  leaveTalentPool,
  makeDefaultTemplate,
  moveApp,
  queryCards,
  rejectApp,
  saveTemplate,
  setTagged,
  setTalentPool,
  talentList,
  updateReason,
  type DemoApp,
  type DemoBook,
  type DemoStage,
} from "@/lib/hiring/pipeline/demo-ops";

/**
 * The demo's pipeline rules, on a small book built here.
 *
 * The demo has no server, so these functions are what answers "can this person be
 * moved" and "who matches these filters". The point of testing them apart from the
 * screens is that the demo must refuse what the API refuses and in the same
 * words: a demo that lets somebody drag a candidate into Hired teaches a flow the
 * real product will not allow.
 */

const stage = (
  id: string,
  name: string,
  order: number,
  type: DemoStage["type"],
  requiresScorecards = false,
): DemoStage => ({
  id,
  requisitionId: "r1",
  name,
  order,
  type,
  requiresScorecards,
});

const app = (n: number, over: Partial<DemoApp> = {}): DemoApp => ({
  id: `a${String(n).padStart(2, "0")}`,
  requisitionId: "r1",
  candidateId: `c${String(n).padStart(2, "0")}`,
  name: `Person ${String(n)}`,
  email: `p${String(n)}@example.com`,
  reference: `APP-${String(n).padStart(8, "0")}`,
  source: "linkedin",
  flagged: false,
  duplicate: false,
  tagIds: [],
  talentPool: false,
  stageId: "s-applied",
  createdAt: `2026-08-${String(n).padStart(2, "0")}T09:00:00.000Z`,
  stageEnteredAt: `2026-08-${String(n).padStart(2, "0")}T09:00:00.000Z`,
  outcome: "IN_PROGRESS",
  rejection: null,
  history: [],
  ...over,
});

const book = (apps: DemoApp[]): DemoBook => ({
  stages: [
    stage("s-applied", "Applied", 0, "APPLIED"),
    stage("s-interview", "Interview", 1, "INTERVIEW", true),
    stage("s-hired", "Hired", 2, "HIRED"),
    stage("s-rejected", "Rejected", 3, "REJECTED"),
  ],
  apps,
  tags: [
    { id: "t1", name: "Strong CV" },
    { id: "t2", name: "Call back" },
  ],
  reasons: [
    { id: "x1", label: "Over the band", active: true },
    { id: "x2", label: "Cannot start in time", active: true },
  ],
  templates: [
    {
      id: "tpl1",
      name: "Standard",
      isDefault: true,
      stages: [
        {
          id: "1",
          name: "Applied",
          type: "APPLIED",
          requiresScorecards: false,
        },
        { id: "2", name: "Hired", type: "HIRED", requiresScorecards: false },
      ],
    },
  ],
  queue: {},
  unscored: [],
});

const many = (count: number) =>
  Array.from({ length: count }, (_, i) => app(i + 1));

describe("a column", () => {
  it("is newest first, a page at a time, with the count of the whole column", () => {
    const b = book(many(7));
    const first = queryCards(b, {
      requisitionId: "r1",
      column: "stage:s-applied",
      filters: {},
      cursor: null,
      pageSize: 3,
    });
    expect(first.cards.map((c) => c.name)).toEqual([
      "Person 7",
      "Person 6",
      "Person 5",
    ]);
    expect(first.total).toBe(7);
    expect(first.next).not.toBeNull();

    const second = queryCards(b, {
      requisitionId: "r1",
      column: "stage:s-applied",
      filters: {},
      cursor: first.next,
      pageSize: 3,
    });
    expect(second.cards.map((c) => c.name)).toEqual([
      "Person 4",
      "Person 3",
      "Person 2",
    ]);
    const last = queryCards(b, {
      requisitionId: "r1",
      column: "stage:s-applied",
      filters: {},
      cursor: second.next,
      pageSize: 3,
    });
    expect(last.cards.map((c) => c.name)).toEqual(["Person 1"]);
    expect(last.next).toBeNull();
  });

  it("does not shift under somebody paging when a newer person arrives", () => {
    const b = book(many(4));
    const first = queryCards(b, {
      requisitionId: "r1",
      column: "stage:s-applied",
      filters: {},
      cursor: null,
      pageSize: 2,
    });
    const later = book([...b.apps, app(20)]);
    const second = queryCards(later, {
      requisitionId: "r1",
      column: "stage:s-applied",
      filters: {},
      cursor: first.next,
      pageSize: 2,
    });
    expect(second.cards.map((c) => c.name)).toEqual(["Person 2", "Person 1"]);
  });

  it("reads the two endings by outcome, whether or not they are stages", () => {
    const b = book([
      app(1, { outcome: "HIRED", stageId: "s-hired" }),
      app(2, { outcome: "REJECTED", stageId: "s-rejected" }),
      app(3, { outcome: "WITHDRAWN", stageId: "s-rejected" }),
      app(4),
    ]);
    const rejected = queryCards(b, {
      requisitionId: "r1",
      column: "stage:s-rejected",
      filters: {},
      cursor: null,
      pageSize: 10,
    });
    expect(rejected.cards.map((c) => c.name).sort()).toEqual([
      "Person 2",
      "Person 3",
    ]);
    const bare = {
      ...b,
      stages: b.stages.filter((s) => s.type !== "REJECTED"),
    };
    const byOutcome = queryCards(bare, {
      requisitionId: "r1",
      column: "outcome:REJECTED",
      filters: {},
      cursor: null,
      pageSize: 10,
    });
    expect(byOutcome.total).toBe(2);
  });

  it("holds only people still in the process in a stage they pass through", () => {
    const b = book([
      app(1),
      app(2, { outcome: "REJECTED", stageId: "s-applied" }),
    ]);
    const applied = queryCards(b, {
      requisitionId: "r1",
      column: "stage:s-applied",
      filters: {},
      cursor: null,
      pageSize: 10,
    });
    expect(applied.cards.map((c) => c.name)).toEqual(["Person 1"]);
  });
});

describe("the board", () => {
  it("has a column for every stage and the true count in each", () => {
    const board = boardOf(book(many(30)), "r1", {}, 10);
    expect(board.columns.map((c) => c.label)).toEqual([
      "Applied",
      "Interview",
      "Hired",
      "Rejected",
    ]);
    const applied = board.columns[0];
    expect(applied?.total).toBe(30);
    expect(applied?.cards).toHaveLength(10);
    expect(applied?.next).not.toBeNull();
  });
});

describe("filters", () => {
  const b = book([
    app(1, { name: "Ada Okafor", tagIds: ["t1"], flagged: true }),
    app(2, { name: "Bola Adeyemi", source: "referral", duplicate: true }),
    app(3, { name: "Chidi Nwosu", talentPool: true }),
  ]);
  const ids = (filters: Parameters<typeof idsMatching>[3]) =>
    idsMatching(b, "r1", "stage:s-applied", filters);

  it("search needs every word, in the name or the email", () => {
    expect(ids({ q: "ada" })).toEqual(["a01"]);
    expect(ids({ q: "bola adeyemi" })).toEqual(["a02"]);
    expect(ids({ q: "ada bola" })).toEqual([]);
    expect(ids({ q: "p3@example" })).toEqual(["a03"]);
  });

  it("tag, source, needs a look, duplicates and the talent pool narrow it", () => {
    expect(ids({ tagId: "t1" })).toEqual(["a01"]);
    expect(ids({ source: "referral" })).toEqual(["a02"]);
    expect(ids({ flagged: true })).toEqual(["a01"]);
    expect(ids({ duplicate: true })).toEqual(["a02"]);
    expect(ids({ talentPool: true })).toEqual(["a03"]);
  });

  it("dates are the day they entered, inclusive at both ends", () => {
    expect(ids({ from: "2026-08-02", to: "2026-08-02" })).toEqual(["a02"]);
    expect(ids({ from: "2026-08-02" })).toEqual(["a03", "a02"]);
    expect(ids({ to: "2026-08-01" })).toEqual(["a01"]);
  });
});

describe("moving somebody", () => {
  it("puts them in the stage and says when", () => {
    const result = moveApp(book(many(1)), "a01", "s-interview");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const moved = result.book.apps[0];
    expect(moved?.stageId).toBe("s-interview");
    expect(moved?.history.at(-1)?.kind).toBe("STAGE_MOVED");
  });

  it("refuses Hired in the API's own words: people are hired by an accepted offer", () => {
    const result = moveApp(book(many(1)), "a01", "s-hired");
    expect(result).toEqual({
      ok: false,
      error:
        "Nobody is moved into Hired directly. Make an offer and record that they accepted it.",
    });
  });

  it("refuses Rejected, which needs a reason", () => {
    const result = moveApp(book(many(1)), "a01", "s-rejected");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Use Reject/);
  });

  it("refuses to take somebody out of an interview that nobody scored", () => {
    const b = {
      ...book([app(1, { name: "Ada Okafor", stageId: "s-interview" })]),
      unscored: ["a01"],
    };
    const result = moveApp(b, "a01", "s-applied");
    expect(result).toEqual({
      ok: false,
      error:
        "Ada Okafor has an interview with no scorecard yet. Submit it before they leave Interview.",
    });
  });

  it("will not move somebody who has left the process", () => {
    const b = book([app(1, { name: "Ada Okafor", outcome: "REJECTED" })]);
    const result = moveApp(b, "a01", "s-interview");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/no longer in the process/);
  });

  it("treats a move to where they already are as nothing to do", () => {
    const b = book(many(1));
    const result = moveApp(b, "a01", "s-applied");
    expect(result.ok && result.book === b).toBe(true);
  });
});

describe("rejecting somebody", () => {
  it("records the reason and the note, and puts them in the Rejected column", () => {
    const result = rejectApp(
      book(many(1)),
      "a01",
      "x1",
      " Wants twice the band ",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const gone = result.book.apps[0];
    expect(gone?.outcome).toBe("REJECTED");
    expect(gone?.stageId).toBe("s-rejected");
    expect(gone?.rejection).toMatchObject({
      label: "Over the band",
      note: "Wants twice the band",
    });
  });

  it("needs a reason from the list, and one that is switched on", () => {
    expect(rejectApp(book(many(1)), "a01", "nope", null).ok).toBe(false);
    const off = updateReason(book(many(1)), "x2", { active: false });
    if (!off.ok) throw new Error("unexpected");
    const result = rejectApp(off.book, "a01", "x2", null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/switched off/);
  });
});

describe("a bulk action", () => {
  it("tells done from skipped from refused, and names each refusal", () => {
    const b = {
      ...book([
        app(1),
        app(2, { stageId: "s-interview" }),
        app(3, { outcome: "REJECTED", stageId: "s-rejected" }),
      ]),
      unscored: [] as string[],
    };
    const { outcome } = applyBulk(b, ["a01", "a02", "a03"], {
      type: "move",
      stageId: "s-interview",
    });
    expect(outcome.requested).toBe(3);
    expect(outcome.done).toBe(1);
    expect(outcome.skipped).toBe(1);
    expect(outcome.refused).toHaveLength(1);
    expect(outcome.refused[0]).toMatchObject({ id: "a03", name: "Person 3" });
    expect(outcome.refused[0]?.reason).toMatch(/no longer in the process/);
  });

  it("running the same tag twice tags once and skips the rest", () => {
    const b = book(many(3));
    const once = applyBulk(b, ["a01", "a02", "a03"], {
      type: "tag",
      tagId: "t1",
    });
    expect(once.outcome.done).toBe(3);
    const twice = applyBulk(once.book, ["a01", "a02", "a03"], {
      type: "tag",
      tagId: "t1",
    });
    expect(twice.outcome).toMatchObject({ done: 0, skipped: 3 });
  });

  it("never sends an email: a demo has none to send", () => {
    const { outcome } = applyBulk(book(many(2)), ["a01", "a02"], {
      type: "reject",
      reasonId: "x1",
      note: null,
      sendEmail: false,
    });
    expect(outcome.emailed).toBeNull();
  });
});

describe("tags and the talent pool", () => {
  it("a tag is added once and taken off again", () => {
    const on = setTagged(book(many(1)), "a01", "t1", true);
    if (!on.ok) throw new Error("unexpected");
    expect(on.book.apps[0]?.tagIds).toEqual(["t1"]);
    const off = setTagged(on.book, "a01", "t1", false);
    if (!off.ok) throw new Error("unexpected");
    expect(off.book.apps[0]?.tagIds).toEqual([]);
  });

  it("deleting a tag takes it off everybody", () => {
    const b = book([
      app(1, { tagIds: ["t1"] }),
      app(2, { tagIds: ["t1", "t2"] }),
    ]);
    const result = deleteTag(b, "t1");
    if (!result.ok) throw new Error("unexpected");
    expect(result.book.apps.map((a) => a.tagIds)).toEqual([[], ["t2"]]);
    expect(result.book.tags.map((t) => t.id)).toEqual(["t2"]);
  });

  it("names are kept short and not repeated", () => {
    expect(createTag(book([]), "  ").ok).toBe(false);
    const dup = createTag(book([]), "strong cv");
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error).toMatch(/already a tag/);
  });

  it("the pool lists people once, with every role they have been in", () => {
    const b = book([
      app(1, { candidateId: "c1", talentPool: true }),
      app(2, { candidateId: "c1", requisitionId: "r2", stageId: "s-applied" }),
      app(3, { candidateId: "c3" }),
    ]);
    const page = talentList(
      b,
      { cursor: null, pageSize: 10 },
      (id) => `Role ${id}`,
    );
    expect(page.total).toBe(1);
    expect(page.entries[0]?.applications.map((a) => a.role).sort()).toEqual([
      "Role r1",
      "Role r2",
    ]);
  });

  it("taking somebody out leaves their applications alone", () => {
    const b = book([app(1, { candidateId: "c1", talentPool: true })]);
    const result = leaveTalentPool(b, "c1");
    if (!result.ok) throw new Error("unexpected");
    expect(result.book.apps[0]?.talentPool).toBe(false);
    expect(result.book.apps[0]?.outcome).toBe("IN_PROGRESS");
    expect(setTalentPool(result.book, "a01", true).ok).toBe(true);
  });
});

describe("rejection reasons", () => {
  it("at least one stays on", () => {
    const first = updateReason(book([]), "x1", { active: false });
    if (!first.ok) throw new Error("unexpected");
    const last = updateReason(first.book, "x2", { active: false });
    expect(last.ok).toBe(false);
    if (!last.ok) expect(last.error).toMatch(/At least one reason/);
  });

  it("are not repeated", () => {
    const dup = createReason(book([]), "over the band");
    expect(dup.ok).toBe(false);
  });
});

describe("templates", () => {
  const stages = [
    {
      id: "1",
      name: "Applied",
      type: "APPLIED" as const,
      requiresScorecards: false,
    },
    {
      id: "2",
      name: "Rejected",
      type: "REJECTED" as const,
      requiresScorecards: false,
    },
  ];

  it("a good one is saved, and the first is the default", () => {
    const empty = { ...book([]), templates: [] };
    const result = saveTemplate(empty, { id: null, name: "Fast", stages });
    expect(result.ok && result.value.isDefault).toBe(true);
  });

  it("a bad one is refused with the first problem, in words", () => {
    const result = saveTemplate(book([]), {
      id: null,
      name: "Bad",
      stages: stages.slice(0, 1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/somewhere to end/);
  });

  it("two templates cannot share a name", () => {
    const result = saveTemplate(book([]), {
      id: null,
      name: "standard",
      stages,
    });
    expect(result.ok).toBe(false);
  });

  it("a copy is not the default, and is named as a copy", () => {
    const result = duplicateTemplate(book([]), "tpl1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("Standard copy");
      expect(result.value.isDefault).toBe(false);
    }
  });

  it("the default cannot be deleted until another is", () => {
    const first = deleteTemplate(book([]), "tpl1");
    expect(first.ok).toBe(false);
    const two = duplicateTemplate(book([]), "tpl1");
    if (!two.ok) throw new Error("unexpected");
    const moved = makeDefaultTemplate(two.book, two.value.id);
    if (!moved.ok) throw new Error("unexpected");
    expect(deleteTemplate(moved.book, "tpl1").ok).toBe(true);
  });
});
