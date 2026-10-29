import { describe, expect, it } from "vitest";
import type {
  ApiFormQuestion,
  ApiRatingScale,
  ApiSubsectionOnForm,
} from "@/lib/api/performance";
import {
  answerWords,
  isLivePick,
  isSubsectionQuestion,
  levelWords,
  questionKind,
  selfAnswerWords,
  subsectionLevels,
  type SubsectionQuestion,
} from "@/lib/performance/subsection-answer";

/**
 * A directly rated subsection, asked on a review form.
 *
 * What `tsc` cannot see here: a flag with nothing behind it drawing a scale
 * nobody set, the company's five words stuck on a subsection that has ten levels,
 * a pick matched by its label, and an absent answer turning into a figure.
 */

const scale: ApiRatingScale = {
  source: "default",
  max: 5,
  levels: [
    { level: 1, label: "Unsatisfactory", meaning: "Well short." },
    { level: 2, label: "Below Expectations", meaning: "Some way short." },
    { level: 3, label: "Meets Expectations", meaning: "What was agreed." },
    { level: 4, label: "Exceeds Expectations", meaning: "More than agreed." },
    { level: 5, label: "Exceptional", meaning: "Far beyond." },
  ],
};

const CHOICES = [
  { id: "o1", label: "Delighted" },
  { id: "o2", label: "Satisfied" },
];

const subsection = (
  over: Partial<ApiSubsectionOnForm> = {},
): ApiSubsectionOnForm => ({
  name: "Adaptability",
  answerKind: "RATING",
  scaleMax: 5,
  choices: [],
  ...over,
});

const ordinary = (over: Partial<ApiFormQuestion> = {}): ApiFormQuestion => ({
  id: "q1",
  competencyId: null,
  prompt: "What went well?",
  kind: "TEXT",
  required: true,
  options: [],
  allowCustom: false,
  order: 0,
  answer: null,
  ...over,
});

const direct = (
  inner: Partial<ApiSubsectionOnForm> = {},
  over: Partial<ApiFormQuestion> = {},
): SubsectionQuestion =>
  ({
    ...ordinary({ prompt: "Adaptability", kind: inner.answerKind ?? "RATING" }),
    answersSubsection: true,
    subsection: subsection(inner),
    ...over,
  }) as SubsectionQuestion;

describe("which questions are a subsection's own answer", () => {
  it("is one the API flagged and gave a subsection to", () => {
    expect(isSubsectionQuestion(direct())).toBe(true);
  });

  it("is not an ordinary question, and a server that predates it sends none of the fields", () => {
    expect(isSubsectionQuestion(ordinary())).toBe(false);
    expect(isSubsectionQuestion(ordinary({ answersSubsection: false }))).toBe(
      false,
    );
  });

  it("is not a flag with nothing behind it: no scale and no choices to draw from", () => {
    /* Without the subsection a level has no ceiling and a pick has nothing to
       pick from. It falls back to the ordinary question it would have been. */
    expect(
      isSubsectionQuestion(
        ordinary({ kind: "RATING", answersSubsection: true }),
      ),
    ).toBe(false);
  });
});

describe("the kind a question is drawn as", () => {
  it("is an ordinary question's own", () => {
    expect(questionKind(ordinary({ kind: "TEXT" }))).toBe("TEXT");
    expect(questionKind(ordinary({ kind: "CHOICE" }))).toBe("CHOICE");
  });

  it("is the subsection's, which is the one the contract names", () => {
    /* The two should agree. If they ever do not, the subsection's is believed. */
    expect(
      questionKind(direct({ answerKind: "BOOLEAN" }, { kind: "RATING" })),
    ).toBe("BOOLEAN");
    expect(
      questionKind(direct({ answerKind: "CHOICE", choices: CHOICES })),
    ).toBe("CHOICE");
  });
});

describe("the levels a subsection offers", () => {
  it("are the company's words where its scale is this one, level for level", () => {
    const levels = subsectionLevels(5, scale);
    expect(levels.map((entry) => entry.level)).toEqual([1, 2, 3, 4, 5]);
    expect(levels.map((entry) => entry.words)).toEqual([
      "Unsatisfactory",
      "Below Expectations",
      "Meets Expectations",
      "Exceeds Expectations",
      "Exceptional",
    ]);
    expect(levels[2]?.meaning).toBe("What was agreed.");
  });

  it("are exactly the subsection's own number of them, however many words the company has", () => {
    expect(subsectionLevels(7, scale)).toHaveLength(7);
    expect(subsectionLevels(10, scale)).toHaveLength(10);
    expect(subsectionLevels(3, scale)).toHaveLength(3);
    expect(subsectionLevels(2, scale)).toHaveLength(2);
  });

  it("carry no company word where the scales are not the same size", () => {
    /* "Exceptional" on a 4 of 10 would be the screen inventing a claim. */
    for (const max of [3, 7, 10]) {
      expect(
        subsectionLevels(max, scale).every((entry) => entry.words === null),
      ).toBe(true);
    }
  });

  it("carry no company word where the scale is the right size but not numbered 1 to N", () => {
    const shifted: ApiRatingScale = {
      ...scale,
      levels: scale.levels.map((entry) => ({
        ...entry,
        level: entry.level - 1,
      })),
    };
    expect(
      subsectionLevels(5, shifted).every((entry) => entry.words === null),
    ).toBe(true);
  });
});

describe("a level in words", () => {
  it("is the company's word where its scale is this one", () => {
    expect(levelWords(4, 5, scale)).toBe("Exceeds Expectations");
  });

  it("is the number and the ceiling where it is not, and never a bare digit", () => {
    expect(levelWords(4, 10, scale)).toBe("4 of 10");
    expect(levelWords(2, 3, scale)).toBe("2 of 3");
  });
});

describe("a pick that is still on the list", () => {
  const q = direct({ answerKind: "CHOICE", choices: CHOICES });

  it("is found by its id", () => {
    expect(isLivePick(q, "o2")).toBe(true);
  });

  it("is not one that was taken off since, nor nothing", () => {
    expect(isLivePick(q, "o9")).toBe(false);
    expect(isLivePick(q, "")).toBe(false);
    expect(isLivePick(q, null)).toBe(false);
    expect(isLivePick(q, undefined)).toBe(false);
  });
});

describe("an answer in words", () => {
  it("reads a level in the company's words, or against the subsection's own ceiling", () => {
    expect(answerWords(direct(), { ratingValue: 4 }, scale)).toBe(
      "Exceeds Expectations",
    );
    expect(
      answerWords(direct({ scaleMax: 10 }), { ratingValue: 4 }, scale),
    ).toBe("4 of 10");
  });

  it("is no answer for no level, and a level below 1 is not a rating of nought", () => {
    expect(answerWords(direct(), { ratingValue: null }, scale)).toBeNull();
    expect(answerWords(direct(), {}, scale)).toBeNull();
    expect(answerWords(direct(), { ratingValue: 0 }, scale)).toBeNull();
  });

  it("reads a yes and a no, and keeps a no apart from no answer", () => {
    const q = direct({ answerKind: "BOOLEAN" });
    expect(answerWords(q, { boolValue: true }, scale)).toBe("Yes");
    expect(answerWords(q, { boolValue: false }, scale)).toBe("No");
    expect(answerWords(q, { boolValue: null }, scale)).toBeNull();
    expect(answerWords(q, {}, scale)).toBeNull();
  });

  it("reads a pick by its id, with its label", () => {
    const q = direct({ answerKind: "CHOICE", choices: CHOICES });
    expect(answerWords(q, { choiceOptionId: "o2" }, scale)).toBe("Satisfied");
  });

  it("reads a pick by the label saved with it, which the choice may have been renamed from since", () => {
    const q = direct({
      answerKind: "CHOICE",
      choices: [{ id: "o2", label: "Happy" }],
    });
    expect(
      answerWords(q, { choiceOptionId: "o2", choiceLabel: "Satisfied" }, scale),
    ).toBe("Satisfied");
    /* Nothing saved yet, so it is the choice as the form has it. */
    expect(answerWords(q, { choiceOptionId: "o2" }, scale)).toBe("Happy");
  });

  it("reads a pick since taken off the list by the label saved with it, and says nothing without one", () => {
    const q = direct({ answerKind: "CHOICE", choices: CHOICES });
    expect(
      answerWords(q, { choiceOptionId: "o9", choiceLabel: "Furious" }, scale),
    ).toBe("Furious");
    expect(answerWords(q, { choiceOptionId: "o9" }, scale)).toBeNull();
    expect(answerWords(q, { choiceOptionId: null }, scale)).toBeNull();
  });

  it("never matches a pick on a label that two choices share", () => {
    const twins = direct({
      answerKind: "CHOICE",
      choices: [
        { id: "a", label: "Meets" },
        { id: "b", label: "Meets" },
      ],
    });
    expect(answerWords(twins, { choiceOptionId: "b" }, scale)).toBe("Meets");
    expect(isLivePick(twins, "b")).toBe(true);
  });
});

describe("the subject's own answer, beside their manager's control", () => {
  const own = (over: object) => ({
    ratingValue: null,
    boolValue: null,
    choiceOptionId: null,
    choiceValue: null,
    answeredAt: "2026-10-20T10:00:00Z",
    ...over,
  });

  it("is nothing when they have not sent theirs: null, and absent", () => {
    expect(selfAnswerWords(direct({}, { selfAnswer: null }), scale)).toBeNull();
    expect(selfAnswerWords(direct(), scale)).toBeNull();
  });

  it("is nothing when the answer has no value in it, which is not a nought", () => {
    expect(
      selfAnswerWords(direct({}, { selfAnswer: own({}) }), scale),
    ).toBeNull();
  });

  it("is their level, their yes or no, or their pick", () => {
    expect(
      selfAnswerWords(
        direct({}, { selfAnswer: own({ ratingValue: 3 }) }),
        scale,
      ),
    ).toBe("Meets Expectations");
    expect(
      selfAnswerWords(
        direct({ scaleMax: 10 }, { selfAnswer: own({ ratingValue: 7 }) }),
        scale,
      ),
    ).toBe("7 of 10");
    expect(
      selfAnswerWords(
        direct(
          { answerKind: "BOOLEAN" },
          { selfAnswer: own({ boolValue: false }) },
        ),
        scale,
      ),
    ).toBe("No");
    expect(
      selfAnswerWords(
        direct(
          { answerKind: "CHOICE", choices: CHOICES },
          {
            selfAnswer: own({ choiceOptionId: "o1", choiceValue: "Delighted" }),
          },
        ),
        scale,
      ),
    ).toBe("Delighted");
  });

  it("uses the label saved with their pick when that choice has since been taken off", () => {
    expect(
      selfAnswerWords(
        direct(
          { answerKind: "CHOICE", choices: CHOICES },
          { selfAnswer: own({ choiceOptionId: "o9", choiceValue: "Furious" }) },
        ),
        scale,
      ),
    ).toBe("Furious");
  });
});
