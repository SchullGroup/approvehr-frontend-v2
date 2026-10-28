import { describe, expect, it } from "vitest";
import type { ApiChoiceOption } from "@/lib/api/performance";
import {
  GIVE_A_LABEL,
  KIND_BADGE,
  SCORE_RANGE,
  TOO_FEW_CHOICES,
  answerKindOf,
  choiceProblems,
  choicesOf,
  directCounts,
  draftsFrom,
  kindLine,
  payloadFrom,
  recordedWords,
  repeatedLabels,
  sameChoices,
  scoreBp,
  scoreText,
  type ChoiceDraft,
} from "@/lib/performance/answer-kind";

/**
 * The rules behind how a subsection is answered, read without mounting anything.
 *
 * Each of these is a decision about a value that a screen would otherwise make for
 * itself, slightly differently: what a missing kind means, which choices a
 * subsection really has, how a typed score becomes whole basis points, and what
 * the editor sends back.
 */

const option = (over: Partial<ApiChoiceOption> = {}): ApiChoiceOption => ({
  id: "o1",
  label: "Meets",
  scoreBp: 6000,
  sortOrder: 0,
  ...over,
});

describe("what a subsection that does not say is", () => {
  it("is a level, because that is what the API means by it", () => {
    expect(answerKindOf({})).toBe("RATING");
    expect(answerKindOf({ answerKind: undefined })).toBe("RATING");
  });

  it("is whatever it says when it says", () => {
    expect(answerKindOf({ answerKind: "BOOLEAN" })).toBe("BOOLEAN");
    expect(answerKindOf({ answerKind: "CHOICE" })).toBe("CHOICE");
    expect(answerKindOf({ answerKind: "RATING" })).toBe("RATING");
  });
});

describe("the choices a subsection really has", () => {
  const listed = [
    option({ id: "b", label: "Meets", sortOrder: 1 }),
    option({ id: "a", label: "Exceeds", sortOrder: 0 }),
  ];

  it("are its live choices in sort order, when it is answered by picking", () => {
    expect(
      choicesOf({ answerKind: "CHOICE", choiceOptions: listed }).map(
        (one) => one.id,
      ),
    ).toEqual(["a", "b"]);
  });

  it("are none at all when it is answered another way, however many are listed", () => {
    /* A subsection switched away from picking before its first rating keeps its
       old choices and the API still lists them. Reading them without asking the
       kind would offer a pick-list on a yes-or-no subsection. */
    expect(choicesOf({ answerKind: "BOOLEAN", choiceOptions: listed })).toEqual(
      [],
    );
    expect(choicesOf({ answerKind: "RATING", choiceOptions: listed })).toEqual(
      [],
    );
    expect(choicesOf({ choiceOptions: listed })).toEqual([]);
  });

  it("are none when a pick-a-list subsection has not been given any", () => {
    expect(choicesOf({ answerKind: "CHOICE" })).toEqual([]);
    expect(choicesOf({ answerKind: "CHOICE", choiceOptions: [] })).toEqual([]);
  });

  it("does not reorder the list it was given", () => {
    const before = [...listed];
    choicesOf({ answerKind: "CHOICE", choiceOptions: listed });
    expect(listed).toEqual(before);
  });
});

describe("a score as a person types it", () => {
  it("is whole basis points, from a percentage with up to two decimals", () => {
    expect(scoreBp("60")).toBe(6000);
    expect(scoreBp("33.33")).toBe(3333);
    expect(scoreBp("0")).toBe(0);
    expect(scoreBp("100")).toBe(10000);
    expect(scoreBp("0.01")).toBe(1);
    expect(scoreBp(" 40 ")).toBe(4000);
  });

  it("is refused, never clamped, when it is not a score", () => {
    /* Typing 150 and being quietly saved as 100 would be a number nobody chose. */
    for (const typed of [
      "150",
      "100.01",
      "101",
      "-5",
      "",
      "  ",
      "abc",
      "33.333",
      ".5",
      "7.",
      "1e2",
    ]) {
      expect(scoreBp(typed), JSON.stringify(typed)).toBeNull();
    }
  });

  it("comes back as the same score it went out as, for every one there is", () => {
    for (let bp = 0; bp <= 10000; bp += 1) {
      expect(scoreBp(scoreText(bp)), String(bp)).toBe(bp);
    }
  });

  it("is shown without a trailing zero", () => {
    expect(scoreText(6000)).toBe("60");
    expect(scoreText(3333)).toBe("33.33");
    expect(scoreText(5050)).toBe("50.5");
  });
});

describe("the list of choices, as the editor sends it", () => {
  const saved = [
    option({ id: "a", label: "Exceeds", scoreBp: 10000, sortOrder: 0 }),
    option({ id: "b", label: "Meets", scoreBp: 6000, sortOrder: 1 }),
  ];

  it("keeps the id of a choice the API already has, and gives a new one none", () => {
    const drafts: ChoiceDraft[] = [
      ...draftsFrom(saved),
      { key: "added-1", label: "Falls short", score: "20" },
    ];
    expect(payloadFrom(drafts)).toEqual([
      { id: "a", label: "Exceeds", scoreBp: 10000, sortOrder: 0 },
      { id: "b", label: "Meets", scoreBp: 6000, sortOrder: 1 },
      { label: "Falls short", scoreBp: 2000, sortOrder: 2 },
    ]);
  });

  it("numbers the rows by where they stand, not by the number they were stored with", () => {
    /* The API renumbers on every save, so the position in the editor is the
       order. A row moved to the top is sortOrder 0 whatever it was before. */
    const moved = draftsFrom(saved).reverse();
    expect(payloadFrom(moved)?.map((row) => [row.id, row.sortOrder])).toEqual([
      ["b", 0],
      ["a", 1],
    ]);
  });

  it("trims a label, and sends nothing at all if any score is not a score", () => {
    expect(
      payloadFrom([
        { key: "1", label: "  Meets  ", score: "60" },
        { key: "2", label: "Exceeds", score: "100" },
      ])?.[0]?.label,
    ).toBe("Meets");
    expect(
      payloadFrom([
        { key: "1", label: "Meets", score: "60" },
        { key: "2", label: "Exceeds", score: "ten" },
      ]),
    ).toBeNull();
  });

  it("is the same as what is saved only when nothing differs, order included", () => {
    expect(sameChoices(draftsFrom(saved), saved)).toBe(true);

    const relabelled = draftsFrom(saved);
    relabelled[0] = { ...relabelled[0]!, label: "Outstanding" };
    expect(sameChoices(relabelled, saved)).toBe(false);

    const rescored = draftsFrom(saved);
    rescored[1] = { ...rescored[1]!, score: "65" };
    expect(sameChoices(rescored, saved)).toBe(false);

    expect(sameChoices(draftsFrom(saved).reverse(), saved)).toBe(false);
    expect(sameChoices(draftsFrom(saved).slice(0, 1), saved)).toBe(false);
    expect(
      sameChoices(
        [...draftsFrom(saved), { key: "n", label: "New", score: "0" }],
        saved,
      ),
    ).toBe(false);
  });

  it("is not the same as what is saved while a score is half typed", () => {
    const halfTyped = draftsFrom(saved);
    halfTyped[0] = { ...halfTyped[0]!, score: "" };
    expect(sameChoices(halfTyped, saved)).toBe(false);
  });
});

describe("what the editor says is wrong before the API is asked", () => {
  it("says a list needs at least two choices, in the API's own words", () => {
    expect(choiceProblems([{ key: "1", label: "Meets", score: "60" }])).toEqual(
      [{ field: "count", message: TOO_FEW_CHOICES }],
    );
    expect(TOO_FEW_CHOICES).toBe(
      "A pick-a-list subsection needs at least two choices.",
    );
  });

  it("names the row with no label and the row with no score, each on its own row", () => {
    const problems = choiceProblems([
      { key: "x", label: "", score: "60" },
      { key: "y", label: "Meets", score: "150" },
    ]);
    expect(problems).toEqual([
      { field: "label", key: "x", message: GIVE_A_LABEL },
      { field: "score", key: "y", message: SCORE_RANGE },
    ]);
    expect(GIVE_A_LABEL).toBe("Give it a label.");
  });

  it("says nothing about a list that is fine", () => {
    expect(
      choiceProblems([
        { key: "1", label: "Exceeds", score: "100" },
        { key: "2", label: "Meets", score: "60" },
      ]),
    ).toEqual([]);
  });

  it("warns about two choices with one name, whatever case, and ignores blanks", () => {
    expect(
      repeatedLabels([
        { key: "1", label: "Meets", score: "60" },
        { key: "2", label: " meets ", score: "70" },
        { key: "3", label: "", score: "0" },
        { key: "4", label: "", score: "0" },
        { key: "5", label: "Exceeds", score: "100" },
      ]),
    ).toEqual(["Meets"]);
  });
});

describe("what an answer recorded on a subsection counts towards", () => {
  it("is a warning when the subsection is filed under no section", () => {
    expect(directCounts({ kind: "RATING", section: null })).toEqual({
      tone: "warning",
      text: "This subsection is not filed under a section, so a level recorded on it counts towards no part of the mark.",
    });
  });

  it("is a warning when its section is not weighted, and never says 0%", () => {
    const counts = directCounts({
      kind: "BOOLEAN",
      section: { name: "Key result area", weightBp: null },
    });
    expect(counts).toEqual({
      tone: "warning",
      text: "Key result area is not weighted, so an answer recorded on this counts towards no part of the mark.",
    });
    expect(counts?.text).not.toMatch(/0%/);
  });

  it("says what the section is worth when it is weighted, in the words of its kind", () => {
    expect(
      directCounts({
        kind: "CHOICE",
        section: { name: "Core competency", weightBp: 4000 },
      }),
    ).toEqual({
      tone: "muted",
      text: "Core competency is 40% of the mark, and an answer recorded here counts towards it.",
    });
    expect(
      directCounts({
        kind: "RATING",
        section: { name: "Core competency", weightBp: 2500 },
      })?.text,
    ).toContain("a level recorded here");
  });

  it("says nothing it cannot back up when the API has not said what the section is worth", () => {
    expect(
      directCounts({
        kind: "RATING",
        section: { name: "Core competency", weightBp: undefined },
      }),
    ).toBeNull();
  });
});

describe("the words for each kind", () => {
  it("call a level a level and the other two an answer", () => {
    expect(recordedWords("RATING")).toEqual({ a: "a level", the: "the level" });
    expect(recordedWords(undefined)).toEqual({
      a: "a level",
      the: "the level",
    });
    expect(recordedWords("BOOLEAN")).toEqual({
      a: "an answer",
      the: "the answer",
    });
    expect(recordedWords("CHOICE")).toEqual({
      a: "an answer",
      the: "the answer",
    });
  });

  it("say, for the two that have no level, where they are not shown", () => {
    /* HR is not left wondering where a yes-or-no subsection went in the gap list
       and the heatmap, which are about levels and are filtered to levels. */
    expect(kindLine("BOOLEAN", 5)).toContain(
      "left out of the gap list and the heatmap",
    );
    expect(kindLine("CHOICE", 5)).toContain(
      "left out of the gap list and the heatmap",
    );
    expect(kindLine("RATING", 5)).toContain("1 to 5");
    expect(kindLine("RATING", 5)).toContain("gap list and the heatmap");
    expect(kindLine("RATING", 5)).not.toContain("left out");
  });

  it("label the three on a row", () => {
    expect(KIND_BADGE).toEqual({
      RATING: "Rated",
      BOOLEAN: "Yes or no",
      CHOICE: "Pick one",
    });
  });
});
