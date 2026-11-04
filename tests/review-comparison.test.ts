import { describe, expect, it } from "vitest";
import type { ApiFormQuestion } from "@/lib/api/performance";
import { comparisonRows } from "@/lib/performance/review-comparison";
import {
  evidenceLine,
  leftOutLabels,
  leftOutNote,
  setAtNote,
} from "@/lib/performance/score-wording";

/**
 * How a person's self review and their manager's review line up, and the
 * sentences under each part of the mark.
 *
 * Neither works anything out. The first decides which answer sits beside which,
 * and the second names which parts a weight went to and what was counted.
 */

const question = (
  id: string,
  prompt: string,
  order = 0,
  over: Partial<ApiFormQuestion> = {},
): ApiFormQuestion => ({
  id,
  competencyId: null,
  prompt,
  kind: "TEXT",
  required: true,
  options: [],
  allowCustom: false,
  order,
  answer: null,
  ...over,
});

describe("comparisonRows", () => {
  it("puts a question that was asked of both in one row, with both forms' copies", () => {
    const manager = [question("q1", "Teamwork", 1)];
    const self = [question("q1", "Teamwork", 1)];
    const rows = comparisonRows(manager, self);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.manager).toBe(manager[0]);
    expect(rows[0]?.self).toBe(self[0]);
  });

  it("matches by the question and not by its words", () => {
    /* Two different questions that happen to share a prompt are two rows. */
    const rows = comparisonRows(
      [question("a", "How was it?", 1)],
      [question("b", "How was it?", 2)],
    );
    expect(
      rows.map((row) => [row.id, row.manager !== null, row.self !== null]),
    ).toEqual([
      ["a", true, false],
      ["b", false, true],
    ]);
  });

  it("keeps a question only one of them was asked, with nothing on the other side", () => {
    const rows = comparisonRows(
      [question("m", "Only the manager", 1)],
      [question("s", "Only the person", 2)],
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === "m")?.self).toBeNull();
    expect(rows.find((row) => row.id === "s")?.manager).toBeNull();
  });

  it("is in the period's order, not the order the forms arrived in", () => {
    const rows = comparisonRows(
      [question("c", "Third", 3), question("a", "First", 1)],
      [question("b", "Second", 2), question("a", "First", 1)],
    );
    expect(rows.map((row) => row.prompt)).toEqual(["First", "Second", "Third"]);
  });

  it("keeps the manager's order where questions share a position, and the person's after", () => {
    const rows = comparisonRows(
      [question("m1", "M1"), question("m2", "M2")],
      [question("s1", "S1"), question("m1", "M1")],
    );
    expect(rows.map((row) => row.id)).toEqual(["m1", "m2", "s1"]);
  });

  it("is empty when neither form has a question", () => {
    expect(comparisonRows([], [])).toEqual([]);
  });
});

const part = (
  component: string,
  label: string,
  weightBp: number,
  effectiveWeightBp: number,
  included: boolean,
  evidenceCount = 1,
) =>
  ({
    component,
    label,
    weightBp,
    effectiveWeightBp,
    included,
    evidenceCount,
  }) as Parameters<typeof setAtNote>[0];

describe("which parts gave up a weight", () => {
  const parts = [
    part("OBJECTIVES", "Delivery against objectives", 500, 0, false, 0),
    part("TASKS", "Weekly tasks", 0, 0, false, 0),
    part("CORE_COMPETENCY", "Core competencies", 4000, 5000, true, 4),
    part(
      "BEHAVIOURAL_COMPETENCY",
      "Behavioural competencies",
      4000,
      5000,
      true,
      4,
    ),
    part("LEADERSHIP", "Leadership", 500, 0, false, 2),
    part("SELF_ASSESSMENT", "Self-assessment", 1000, 0, false, 0),
  ];

  it("names the parts that were weighted and left out", () => {
    expect(leftOutLabels(parts)).toEqual([
      "Delivery against objectives",
      "Leadership",
      "Self-assessment",
    ]);
  });

  it("does not name one weighted at nothing, which gave up nothing", () => {
    expect(leftOutLabels(parts)).not.toContain("Weekly tasks");
  });

  it("names nobody when everything counts", () => {
    expect(
      leftOutLabels([
        part("CORE_COMPETENCY", "Core competencies", 10000, 10000, true),
      ]),
    ).toEqual([]);
  });
});

describe("why the parts that count are counting for more than the company set", () => {
  it("names the parts that were left out, once, in a list", () => {
    expect(
      leftOutNote([
        "Delivery against objectives",
        "Leadership",
        "Self-assessment",
      ]),
    ).toBe(
      "Delivery against objectives, Leadership and Self-assessment were left out, so the other parts share their weight and count for more than the company set.",
    );
  });

  it("says was and its for one, and were and their for several", () => {
    expect(leftOutNote(["Delivery against objectives"])).toBe(
      "Delivery against objectives was left out, so the other parts share its weight and count for more than the company set.",
    );
    expect(leftOutNote(["Leadership", "Self-assessment"])).toBe(
      "Leadership and Self-assessment were left out, so the other parts share their weight and count for more than the company set.",
    );
  });

  it("says nothing when nothing was left out, because every part counts for what was set", () => {
    expect(leftOutNote([])).toBeNull();
  });
});

describe("what the company set, beside a part counting for something else", () => {
  it("says what was set, and nothing about why, which is said once above the list", () => {
    expect(
      setAtNote(
        part("CORE_COMPETENCY", "Core competencies", 4000, 5000, true, 4),
      ),
    ).toBe("Set at 40% by the company.");
  });

  it("says nothing where the part counts for what the company set, which the badge already says", () => {
    expect(
      setAtNote(part("CORE_COMPETENCY", "Core competencies", 4000, 4000, true)),
    ).toBeNull();
  });

  it("says nothing for a part that is itself left out, whose reason is its own", () => {
    expect(
      setAtNote(part("LEADERSHIP", "Leadership", 500, 0, false, 2)),
    ).toBeNull();
  });
});

describe("what was counted, by name", () => {
  it.each([
    ["OBJECTIVES", 1, "Based on 1 agreed objective"],
    ["OBJECTIVES", 3, "Based on 3 agreed objectives"],
    ["TASKS", 1, "Based on 1 graded task"],
    ["TASKS", 5, "Based on 5 graded tasks"],
    ["CORE_COMPETENCY", 4, "Based on 4 ratings"],
    ["LEADERSHIP", 1, "Based on 1 rating"],
    ["SELF_ASSESSMENT", 4, "Based on 4 ratings"],
  ] as const)("%s with %i reads %s", (component, evidenceCount, expected) => {
    expect(evidenceLine({ component, evidenceCount })).toBe(expected);
  });

  it("says nothing was recorded rather than counting none", () => {
    expect(
      evidenceLine({ component: "CORE_COMPETENCY", evidenceCount: 0 }),
    ).toBe("Nothing recorded for this");
  });
});
