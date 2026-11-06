import { describe, expect, it } from "vitest";
import type {
  ApiAnswer,
  ApiFormQuestion,
  ApiRatingScale,
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
} from "@/app/(focus)/performance/reviews/[id]/answer/focus-question";

/**
 * How a written subsection question's answer becomes a request, and back.
 *
 * Its answer is `textValue`, the same field an ordinary written question uses, and
 * it is not a pick: sent as a choice's id it would be refused by name, and held as
 * one it would be called unanswered for ever. Blank is not an answer, so a required
 * written question is not done on the strength of a box of spaces. Every way of
 * getting that wrong is well typed, and the API refuses the wrong one, which a
 * person meets as "Not saved" on a question they answered.
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

const answer = (over: Partial<ApiAnswer> = {}): ApiAnswer => ({
  ratingValue: null,
  textValue: null,
  choiceValue: null,
  boolValue: null,
  attachment: null,
  answeredAt: "2026-10-20T10:00:00Z",
  ...over,
});

const base = (over: Partial<ApiFormQuestion> = {}): ApiFormQuestion => ({
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

const written = (over: Partial<ApiFormQuestion> = {}): ApiFormQuestion =>
  base({
    id: "q-comm",
    competencyId: "c-comm",
    prompt: "Communication",
    answersSubsection: true,
    subsection: {
      name: "Communication",
      answerKind: "TEXT",
      scaleMax: 5,
      choices: [],
    } satisfies ApiSubsectionOnForm,
    ...over,
  });

describe("reading a saved written answer into the box", () => {
  it("holds the words as text, exactly as an ordinary written question does", () => {
    const question = written({
      answer: answer({ textValue: "Clear and early." }),
    });
    expect(draftFrom(question)).toMatchObject({ text: "Clear and early." });
    expect(draftFrom(question)).toEqual(
      draftFrom(base({ answer: answer({ textValue: "Clear and early." }) })),
    );
  });

  it("holds no pick, no level and no yes or no for it", () => {
    const held = draftFrom(
      written({ answer: answer({ textValue: "Clear and early." }) }),
    );
    expect(held.choice).toBeUndefined();
    expect(held.rating).toBeUndefined();
    expect(held.bool).toBeUndefined();
  });

  it("holds nothing for one nobody has answered, which is not an empty answer", () => {
    expect(draftFrom(written())).toEqual({});
  });
});

describe("whether a written subsection question has been answered", () => {
  it("needs words", () => {
    expect(filled(written(), {})).toBe(false);
    expect(filled(written(), { text: "Good." })).toBe(true);
  });

  it("is not answered by nothing, nor by spaces", () => {
    expect(filled(written(), { text: "" })).toBe(false);
    expect(filled(written(), { text: "   " })).toBe(false);
    expect(filled(written(), { text: "\n\t\n" })).toBe(false);
  });

  it("is not answered by a level, a yes or no or a pick in the draft", () => {
    expect(filled(written(), { rating: "4", bool: "yes", choice: "o1" })).toBe(
      false,
    );
  });

  it("agrees with an ordinary written question about every one of these", () => {
    for (const held of [
      {},
      { text: "" },
      { text: "  " },
      { text: "x" },
    ] as const) {
      expect(filled(written(), held)).toBe(filled(base(), held));
    }
  });

  it("opens the form on the first required question with no words, a written subsection's included", () => {
    const review = {
      questions: [
        base({ id: "a", answer: answer({ textValue: "done" }) }),
        written({ id: "b" }),
        base({ id: "c" }),
      ],
    };
    expect(startIndex(review, { mark: "", summary: "", step: 0 })).toBe(2);
  });

  it("opens past it once it has words: on the page after the questions", () => {
    const review = {
      questions: [written({ answer: answer({ textValue: "Done." }) })],
    };
    /* 0 is the introduction and 1 the question, so 2 is the closing note. */
    expect(startIndex(review, { mark: "", summary: "", step: 0 })).toBe(2);
  });

  it("opens on the introduction while there is nothing yet", () => {
    const review = { questions: [written()] };
    expect(startIndex(review, { mark: "", summary: "", step: 0 })).toBe(0);
  });
});

describe("what is sent for it", () => {
  it("is the words, trimmed, in `textValue` and nothing else", () => {
    const body = answerBodyFor(written(), { text: "  Clear and early.  " });
    expect(body).toEqual({
      questionId: "q-comm",
      textValue: "Clear and early.",
    });
  });

  it("never carries a level, a yes or no, a choice's id or a choice's label", () => {
    const body = answerBodyFor(written(), {
      text: "Clear.",
      rating: "4",
      bool: "yes",
      choice: "o1",
    });
    expect(body).not.toHaveProperty("ratingValue");
    expect(body).not.toHaveProperty("boolValue");
    expect(body).not.toHaveProperty("choiceOptionId");
    expect(body).not.toHaveProperty("choiceValue");
    expect(body).toEqual({ questionId: "q-comm", textValue: "Clear." });
  });

  it("keeps the paragraphs somebody wrote", () => {
    const text = "First point.\n\nSecond point.";
    expect(answerBodyFor(written(), { text })).toEqual({
      questionId: "q-comm",
      textValue: text,
    });
  });

  it("is nothing for a box with nothing in it, so a saved answer is never blanked", () => {
    expect(answerBodyFor(written(), {})).toBeNull();
    expect(answerBodyFor(written(), { text: "" })).toBeNull();
    expect(answerBodyFor(written(), { text: "   " })).toBeNull();
  });

  it("is what an ordinary written question sends for the same words", () => {
    const held = { text: "Same words." };
    expect(answerBodyFor(written(), held)).toEqual({
      ...answerBodyFor(base(), held),
      questionId: "q-comm",
    });
  });

  it("tells one set of words from another when the draft is compared with what was saved", () => {
    expect(sigOf({ text: "one" })).not.toBe(sigOf({ text: "two" }));
  });
});

describe("what the page-by-page form does with it", () => {
  it("has nothing to pick, so it is a box to write in", () => {
    expect(pickOptions(written(), scale)).toBeNull();
  });

  it("is a box to write in for an ordinary written question too, which is the same path", () => {
    expect(pickOptions(base(), scale)).toBeNull();
  });

  it("makes a pick the draft of a pick, which a written question never gets", () => {
    /* Nothing offers it a pick, so this only matters as a guard: were one to arrive,
       it is not held as words. */
    expect(draftForPick(written(), "o1")).toEqual({ choice: "o1" });
  });
});

describe("what is on the record when the box has been emptied", () => {
  it("is the saved words, because a saved answer cannot be taken back, only replaced", () => {
    const question = written({
      answer: answer({ textValue: "Saved words." }),
    });
    const saved = draftFrom(question);
    expect(onRecordOf(question, { text: "" }, saved)).toEqual(saved);
    expect(onRecordOf(question, { text: "   " }, saved)).toEqual(saved);
    expect(savedAnswerStands(question, { text: "" }, saved)).toBe(true);
  });

  it("is what is in the box while it holds words, and no saved answer stands behind it", () => {
    const question = written({
      answer: answer({ textValue: "Saved words." }),
    });
    const saved = draftFrom(question);
    expect(onRecordOf(question, { text: "New words." }, saved)).toEqual({
      text: "New words.",
    });
    expect(savedAnswerStands(question, { text: "New words." }, saved)).toBe(
      false,
    );
  });

  it("is nothing standing when nothing was ever saved", () => {
    const question = written();
    expect(savedAnswerStands(question, { text: "" }, draftFrom(question))).toBe(
      false,
    );
  });
});
