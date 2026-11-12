import { describe, expect, it } from "vitest";
import type { ApiPin } from "@/lib/api/work-pins";
import type { SharedColleague } from "@/lib/api/shared-projects";
import {
  flagLine,
  flaggedCount,
  mergePins,
  noteCounter,
  noteProblem,
  orderBySharedProjects,
  pinCountLine,
  pinFacts,
  pinHref,
  pinnedLine,
  reasonProblem,
  reasonReady,
  sharedLabel,
} from "@/lib/performance/work-in-answers";

/**
 * Using your own finished work in a review: the words and the small decisions.
 *
 * What is proved: the limit is said truthfully at every count; a note is wrong only when it is over
 * the limit; a pin reads as quiet facts in a fixed order, with on time and late the same quiet word,
 * "Set by" only when somebody else set it, and nothing at all about a due date that was never set; the
 * link opens the task by its id; the list an answer carries is what the server held less what was taken
 * off plus what was added, once each; "Shared N projects" is never "Shared 0"; colleagues who shared a
 * project come first, most shared first, and nobody is added, dropped or chosen; a flag's reason is
 * judged against the API's bounds; and a count is nothing for none, never a nought.
 */

const TZ = "Africa/Lagos";

const pin = (over: Partial<ApiPin> = {}): ApiPin => ({
  id: "pin1",
  issueId: "i1",
  key: "PLT-12",
  type: "TASK",
  personal: false,
  projectId: "p1",
  doneAt: "2026-11-04T10:00:00.000Z",
  finishedOn: "2026-11-04",
  dueDate: "2026-11-05",
  timing: "ON_TIME",
  linked: true,
  setBy: null,
  note: null,
  pinnedAt: "2026-11-05T09:00:00.000Z",
  ...over,
});

describe("the limit, said", () => {
  it("is five at nought and says so", () => {
    expect(pinCountLine(0)).toBe("Up to 5 on each answer.");
  });
  it("counts as it goes", () => {
    expect(pinCountLine(1)).toBe("1 of 5 added.");
    expect(pinCountLine(4)).toBe("4 of 5 added.");
  });
  it("says what to do at the limit, and never claims room it does not have", () => {
    expect(pinCountLine(5)).toBe("5 of 5 added. Unpin one to add another.");
    expect(pinCountLine(7)).toBe("7 of 5 added. Unpin one to add another.");
  });
});

describe("the note", () => {
  it("is fine empty, and fine at the limit", () => {
    expect(noteProblem("")).toBeNull();
    expect(noteProblem("x".repeat(280))).toBeNull();
  });
  it("is wrong only past the limit, measured trimmed", () => {
    expect(noteProblem("x".repeat(281))).toBe(
      "Keep the note to 280 characters.",
    );
    expect(noteProblem(`  ${"x".repeat(280)}  `)).toBeNull();
  });
  it("shows a counter only when it is near the limit", () => {
    expect(noteCounter(10)).toBeNull();
    expect(noteCounter(239)).toBeNull();
    expect(noteCounter(240)).toBe("240 of 280 characters");
    expect(noteCounter(300)).toBe("300 of 280 characters");
  });
});

describe("what a pin says about the work", () => {
  it("lists the quiet facts in the order a reader looks for them", () => {
    expect(
      pinFacts(
        pin({
          personal: true,
          setBy: { id: "pat", name: "Pat Projects" },
        }),
        TZ,
      ),
    ).toEqual([
      "Personal",
      "Finished 4 Nov 2026",
      "On time",
      "Set by Pat Projects",
      "Under an objective",
    ]);
  });

  it("says late as quietly as on time", () => {
    expect(pinFacts(pin({ timing: "LATE" }), TZ)).toContain("Late");
    expect(pinFacts(pin({ timing: "ON_TIME" }), TZ)).toContain("On time");
  });

  it("says nothing of a due date that was never set, of an objective that was never linked, or of a setter that is the person", () => {
    expect(
      pinFacts(pin({ timing: "NO_DUE_DATE", linked: false, setBy: null }), TZ),
    ).toEqual(["Finished 4 Nov 2026"]);
  });

  it("reads the day in the company's zone: late in the evening is not a day out", () => {
    /* 23:30 in Lagos on the 4th is 22:30Z. A zone-blind reader prints the 4th too, and one that
       reads a bare date as an instant in a western zone prints the 3rd. */
    expect(
      pinFacts(pin({ doneAt: "2026-11-04T22:30:00.000Z" }), "Africa/Lagos")[0],
    ).toBe("Finished 4 Nov 2026");
    expect(
      pinFacts(pin({ doneAt: "2026-11-04T23:30:00.000Z" }), "Africa/Lagos")[0],
    ).toBe("Finished 5 Nov 2026");
  });

  it("falls back to the company's own day, as a day, when the instant did not arrive", () => {
    expect(
      pinFacts(
        pin({ doneAt: "", finishedOn: "2026-11-04" }),
        "America/Adak",
      )[0],
    ).toBe("Finished 4 Nov 2026");
    expect(pinFacts(pin({ doneAt: "", finishedOn: "" }), TZ)).toEqual([
      "On time",
      "Under an objective",
    ]);
  });
});

describe("who pinned it, and where it opens", () => {
  it("says whose choice it was and when", () => {
    expect(pinnedLine("Chidi Nwosu", "2026-11-05T09:00:00.000Z", TZ)).toBe(
      "Pinned by Chidi Nwosu on 5 Nov 2026",
    );
    expect(pinnedLine("you", "2026-11-05T09:00:00.000Z", TZ)).toBe(
      "Pinned by you on 5 Nov 2026",
    );
  });
  it("says only when, when it is not known whose choice it was", () => {
    expect(pinnedLine(null, "2026-11-05T09:00:00.000Z", TZ)).toBe(
      "Pinned on 5 Nov 2026",
    );
    expect(pinnedLine(null, "", TZ)).toBe("Pinned");
  });
  it("opens the task by its id, encoded", () => {
    expect(pinHref({ issueId: "i1" })).toBe("/projects/tasks/i1");
    expect(pinHref({ issueId: "a/b c" })).toBe("/projects/tasks/a%2Fb%20c");
  });
});

describe("what an answer carries", () => {
  const a = pin({ id: "a" });
  const b = pin({ id: "b", issueId: "i2" });
  const c = pin({ id: "c", issueId: "i3" });

  it("is what the server held, then what was added", () => {
    expect(mergePins([a], [b], new Set()).map((p) => p.id)).toEqual(["a", "b"]);
  });
  it("leaves out what was taken off, whether the server held it or it was added here", () => {
    expect(
      mergePins([a, b], [c], new Set(["a", "c"])).map((p) => p.id),
    ).toEqual(["b"]);
  });
  it("holds each pin once, so a review read again that now includes an added pin does not double it", () => {
    expect(mergePins([a, b], [b], new Set()).map((p) => p.id)).toEqual([
      "a",
      "b",
    ]);
  });
  it("is empty for none", () => {
    expect(mergePins([], [], new Set())).toEqual([]);
  });
});

describe("shared projects", () => {
  it("says how many, singular and plural, and never nought", () => {
    expect(sharedLabel(1)).toBe("Shared 1 project");
    expect(sharedLabel(2)).toBe("Shared 2 projects");
    expect(sharedLabel(12)).toBe("Shared 12 projects");
  });

  const people = [
    { id: "a", name: "Ada" },
    { id: "b", name: "Bola" },
    { id: "c", name: "Chidi" },
    { id: "d", name: "Dayo" },
    { id: "e", name: "Efe" },
  ];
  const colleagues: SharedColleague[] = [
    { employeeId: "d", name: "Dayo", sharedProjects: 3 },
    { employeeId: "b", name: "Bola", sharedProjects: 1 },
    { employeeId: "e", name: "Efe", sharedProjects: 3 },
  ];

  it("puts those who shared a project first, most shared first, ties in their own order", () => {
    expect(
      orderBySharedProjects(people, colleagues).map((one) => one.person.id),
    ).toEqual(["d", "e", "b", "a", "c"]);
  });

  it("carries each person's count, and nought for everybody else", () => {
    const ordered = orderBySharedProjects(people, colleagues);
    expect(ordered.map((one) => one.shared)).toEqual([3, 3, 1, 0, 0]);
  });

  it("leaves the list exactly as it came when the server said nothing", () => {
    expect(
      orderBySharedProjects(people, null).map((one) => one.person.id),
    ).toEqual(["a", "b", "c", "d", "e"]);
    expect(
      orderBySharedProjects(people, []).map((one) => one.person.id),
    ).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("neither adds nor drops anybody: a colleague who is not on the list is not invented", () => {
    const ordered = orderBySharedProjects(people, [
      ...colleagues,
      { employeeId: "zz", name: "Not listed", sharedProjects: 9 },
    ]);
    expect(ordered).toHaveLength(5);
    expect(ordered.map((one) => one.person.id)).not.toContain("zz");
  });

  it("does not change the list it is given", () => {
    const copy = people.map((one) => ({ ...one }));
    orderBySharedProjects(people, colleagues);
    expect(people).toEqual(copy);
  });
});

describe("a flag's reason", () => {
  it("is not a problem while it is empty, but it is not ready", () => {
    expect(reasonProblem("")).toBeNull();
    expect(reasonProblem("   ")).toBeNull();
    expect(reasonReady("")).toBe(false);
  });
  it("is too short under three characters, measured trimmed", () => {
    expect(reasonProblem("ab")).toBe(
      "Say a little more, at least 3 characters.",
    );
    expect(reasonProblem("  a ")).toBe(
      "Say a little more, at least 3 characters.",
    );
    expect(reasonReady("ab")).toBe(false);
    expect(reasonProblem("abc")).toBeNull();
    expect(reasonReady("abc")).toBe(true);
  });
  it("is too long past 280", () => {
    expect(reasonProblem("x".repeat(281))).toBe("Keep it to 280 characters.");
    expect(reasonReady("x".repeat(281))).toBe(false);
    expect(reasonReady("x".repeat(280))).toBe(true);
  });
});

describe("how a flag reads", () => {
  it("says who, when and what they said", () => {
    expect(
      flagLine(
        { reason: "Not mine", flaggedAt: "2026-11-06T09:00:00.000Z" },
        "Chidi Nwosu",
        TZ,
      ),
    ).toBe("Flagged by Chidi Nwosu on 6 Nov 2026: Not mine");
    expect(flagLine({ reason: "Wrong day", flaggedAt: "" }, "you", TZ)).toBe(
      "Flagged by you: Wrong day",
    );
  });
  it("counts in the heading only when there is something to count", () => {
    expect(flaggedCount(0)).toBeNull();
    expect(flaggedCount(1)).toBe("1 flagged as wrong");
    expect(flaggedCount(3)).toBe("3 flagged as wrong");
  });
});
