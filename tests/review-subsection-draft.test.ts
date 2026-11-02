import { describe, expect, it } from "vitest";
import type {
  ApiAnswer,
  ApiFormQuestion,
  ApiSubsectionOnForm,
} from "@/lib/api/performance";
import {
  answerBodyFor,
  draftFrom,
  filled,
} from "@/app/(app)/performance/review-parts";
import {
  onRecordOf,
  savedAnswerStands,
  sigOf,
  startIndex,
} from "@/app/(focus)/performance/reviews/[id]/answer/focus-logic";
import {
  draftForPick,
  pickOptions,
  pickedValue,
} from "@/app/(focus)/performance/reviews/[id]/answer/focus-question";
import type { ApiRatingScale } from "@/lib/api/performance";

/**
 * How a subsection question's answer becomes a request, and back.
 *
 * A subsection's pick is its choice's **id**: two choices can share a label and a
 * choice can be archived after somebody picked it. Every way of getting that wrong
 * is well typed (`choiceValue` and `choiceOptionId` are both optional strings), and
 * the API refuses the wrong one by name, which a person meets as "Not saved" on a
 * question they answered.
 */

const scale: ApiRatingScale = {
  source: "default",
  max: 5,
  levels: [
    { level: 1, label: "Unsatisfactory", meaning: "" },
    { level: 2, label: "Below Expectations", meaning: "" },
    { level: 3, label: "Meets Expectations", meaning: "" },
    { level: 4, label: "Exceeds Expectations", meaning: "" },
    { level: 5, label: "Exceptional", meaning: "" },
  ],
};

const CHOICES = [
  { id: "o1", label: "Delighted" },
  { id: "o2", label: "Satisfied" },
];

const answer = (over: Partial<ApiAnswer> = {}): ApiAnswer => ({
  ratingValue: null,
  textValue: null,
  choiceValue: null,
  boolValue: null,
  attachment: null,
  answeredAt: "2026-10-20T10:00:00Z",
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
  inner: Partial<ApiSubsectionOnForm>,
  over: Partial<ApiFormQuestion> = {},
): ApiFormQuestion =>
  ordinary({
    id: "q-adapt",
    competencyId: "c-adapt",
    prompt: "Adaptability",
    kind: inner.answerKind ?? "RATING",
    answersSubsection: true,
    subsection: {
      name: "Adaptability",
      answerKind: "RATING",
      scaleMax: 5,
      choices: [],
      ...inner,
    },
    ...over,
  });

describe("reading a saved answer into the box", () => {
  it("holds a subsection's pick as the id of the choice, never as the label saved beside it", () => {
    const question = direct(
      { answerKind: "CHOICE", choices: CHOICES },
      { answer: answer({ choiceOptionId: "o2", choiceValue: "Satisfied" }) },
    );
    expect(draftFrom(question)).toMatchObject({ choice: "o2" });
  });

  it("still holds an ordinary pick as the text of the option", () => {
    const question = ordinary({
      kind: "CHOICE",
      options: ["Yes please", "No thanks"],
      answer: answer({ choiceValue: "Yes please" }),
    });
    expect(draftFrom(question)).toMatchObject({ choice: "Yes please" });
  });

  it("holds a level and a yes or no as the ordinary kinds do", () => {
    expect(
      draftFrom(
        direct(
          { answerKind: "RATING" },
          { answer: answer({ ratingValue: 4 }) },
        ),
      ),
    ).toMatchObject({ rating: "4" });
    expect(
      draftFrom(
        direct(
          { answerKind: "BOOLEAN" },
          { answer: answer({ boolValue: false }) },
        ),
      ),
    ).toMatchObject({ bool: "no" });
  });

  it("holds nothing for a subsection nobody has answered, which is not a nought", () => {
    expect(draftFrom(direct({ answerKind: "RATING" }))).toEqual({});
  });
});

describe("whether a subsection question has been answered", () => {
  it("needs a level, a yes or no, or a pick that is still on the list", () => {
    expect(filled(direct({ answerKind: "RATING" }), {})).toBe(false);
    expect(filled(direct({ answerKind: "RATING" }), { rating: "3" })).toBe(
      true,
    );
    expect(filled(direct({ answerKind: "BOOLEAN" }), { bool: "no" })).toBe(
      true,
    );
    const pick = direct({ answerKind: "CHOICE", choices: CHOICES });
    expect(filled(pick, {})).toBe(false);
    expect(filled(pick, { choice: "o1" })).toBe(true);
  });

  it("does not count a pick that was taken off the list since, which the API would refuse at send", () => {
    const pick = direct({ answerKind: "CHOICE", choices: CHOICES });
    expect(filled(pick, { choice: "o9" })).toBe(false);
  });

  it("still counts an ordinary pick by its text, whatever the list says", () => {
    expect(
      filled(ordinary({ kind: "CHOICE", options: ["a", "b"] }), {
        choice: "a",
      }),
    ).toBe(true);
  });

  it("does not call a taken-off pick the saved answer standing, so the person is told to answer again", () => {
    const pick = direct(
      { answerKind: "CHOICE", choices: CHOICES },
      { answer: answer({ choiceOptionId: "o9", choiceValue: "Furious" }) },
    );
    const saved = draftFrom(pick);
    expect(savedAnswerStands(pick, { choice: "" }, saved)).toBe(false);
    expect(filled(pick, onRecordOf(pick, undefined, saved))).toBe(false);
  });

  it("opens the form on the first required question with no answer, a subsection's included", () => {
    const review = {
      questions: [
        ordinary({
          id: "a",
          answer: answer({ textValue: "done" }),
        }),
        direct({ answerKind: "RATING" }, { id: "b" }),
        ordinary({ id: "c" }),
      ],
    };
    expect(startIndex(review, { mark: "", summary: "", step: 0 })).toBe(2);
  });
});

describe("what is sent for it", () => {
  it("is the level, as a number", () => {
    expect(
      answerBodyFor(direct({ answerKind: "RATING" }), { rating: "4" }),
    ).toEqual({
      questionId: "q-adapt",
      ratingValue: 4,
    });
  });

  it("is the yes or the no, as a boolean", () => {
    const question = direct({ answerKind: "BOOLEAN" });
    expect(answerBodyFor(question, { bool: "yes" })).toEqual({
      questionId: "q-adapt",
      boolValue: true,
    });
    expect(answerBodyFor(question, { bool: "no" })).toEqual({
      questionId: "q-adapt",
      boolValue: false,
    });
  });

  it("is the id of the choice, and neither the label nor `choiceValue`", () => {
    const body = answerBodyFor(
      direct({ answerKind: "CHOICE", choices: CHOICES }),
      { choice: "o2" },
    );
    expect(body).toEqual({ questionId: "q-adapt", choiceOptionId: "o2" });
    expect(body).not.toHaveProperty("choiceValue");
  });

  it("is still the text of the option for an ordinary pick, and never an id", () => {
    const body = answerBodyFor(
      ordinary({ kind: "CHOICE", options: ["Yes please"] }),
      { choice: "Yes please" },
    );
    expect(body).toEqual({ questionId: "q1", choiceValue: "Yes please" });
    expect(body).not.toHaveProperty("choiceOptionId");
  });

  it("is nothing for a box with nothing in it, so a saved answer is never blanked", () => {
    expect(answerBodyFor(direct({ answerKind: "RATING" }), {})).toBeNull();
    expect(
      answerBodyFor(direct({ answerKind: "CHOICE", choices: CHOICES }), {}),
    ).toBeNull();
  });

  it("tells one pick from another when the draft is compared with what was saved", () => {
    expect(sigOf({ choice: "o1" })).not.toBe(sigOf({ choice: "o2" }));
  });
});

describe("the options the page-by-page form offers for it", () => {
  it("are a level for each of the subsection's own, whatever the company's scale runs to", () => {
    const options = pickOptions(direct({ scaleMax: 7 }), scale);
    expect(options?.map((option) => option.value)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
    ]);
    /* The company has five words; seven levels carry none of them. */
    expect(options?.map((option) => option.label)).toEqual([
      "1 of 7",
      "2 of 7",
      "3 of 7",
      "4 of 7",
      "5 of 7",
      "6 of 7",
      "7 of 7",
    ]);
  });

  it("are the company's words where its scale is this subsection's", () => {
    const options = pickOptions(direct({ scaleMax: 5 }), scale);
    expect(options?.map((option) => option.label)).toEqual([
      "Unsatisfactory",
      "Below Expectations",
      "Meets Expectations",
      "Exceeds Expectations",
      "Exceptional",
    ]);
  });

  it("keep a tenth level in the list, with no key to press for it", () => {
    const options = pickOptions(direct({ scaleMax: 10 }), scale) ?? [];
    expect(options).toHaveLength(10);
    expect(options[8]?.key).toBe("9");
    expect(options[9]?.key).toBe("");
    expect(options[9]?.value).toBe("10");
  });

  it("are the subsection's choices, by id, with labels and no scores", () => {
    const options = pickOptions(
      direct({ answerKind: "CHOICE", choices: CHOICES }),
      scale,
    );
    expect(options).toEqual([
      { value: "o1", label: "Delighted", key: "A" },
      { value: "o2", label: "Satisfied", key: "B" },
    ]);
  });

  it("keep two choices that share a name as two options", () => {
    const options = pickOptions(
      direct({
        answerKind: "CHOICE",
        choices: [
          { id: "a", label: "Meets" },
          { id: "b", label: "Meets" },
        ],
      }),
      scale,
    );
    expect(options?.map((option) => option.value)).toEqual(["a", "b"]);
  });

  it("do not drop a choice past the twenty-sixth, which has no letter", () => {
    const many = Array.from({ length: 30 }, (_, index) => ({
      id: `o${String(index)}`,
      label: `Choice ${String(index)}`,
    }));
    const options =
      pickOptions(direct({ answerKind: "CHOICE", choices: many }), scale) ?? [];
    expect(options).toHaveLength(30);
    expect(options[25]?.key).toBe("Z");
    expect(options[26]?.key).toBe("");
  });

  it("are yes and no for a yes-or-no subsection", () => {
    expect(
      pickOptions(direct({ answerKind: "BOOLEAN" }), scale)?.map(
        (option) => option.value,
      ),
    ).toEqual(["yes", "no"]);
  });

  it("make the draft a pick makes in the field the kind names, and read it back from there", () => {
    expect(draftForPick(direct({ answerKind: "RATING" }), "4")).toEqual({
      rating: "4",
    });
    expect(draftForPick(direct({ answerKind: "BOOLEAN" }), "yes")).toEqual({
      bool: "yes",
    });
    const pick = direct({ answerKind: "CHOICE", choices: CHOICES });
    expect(draftForPick(pick, "o2")).toEqual({ choice: "o2" });
    expect(pickedValue(pick, { choice: "o2" })).toBe("o2");
  });

  it("leave an ordinary question's options exactly as they were", () => {
    expect(
      pickOptions(ordinary({ kind: "CHOICE", options: ["x", "y"] }), scale),
    ).toEqual([
      { value: "x", label: "x", key: "A" },
      { value: "y", label: "y", key: "B" },
    ]);
    expect(
      pickOptions(ordinary({ kind: "RATING" }), scale)?.map((o) => o.label),
    ).toEqual([
      "Unsatisfactory",
      "Below Expectations",
      "Meets Expectations",
      "Exceeds Expectations",
      "Exceptional",
    ]);
    expect(pickOptions(ordinary({ kind: "TEXT" }), scale)).toBeNull();
  });
});
