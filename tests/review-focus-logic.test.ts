import { describe, expect, it } from "vitest";
import type { ApiFormQuestion } from "@/lib/api/performance";
import {
  onRecordOf,
  savedAnswerStands,
  sigOf,
  startIndex,
} from "@/app/(focus)/performance/reviews/[id]/answer/focus-logic";

/**
 * The decisions behind the one-question-at-a-time review page.
 *
 * Tested because each is the kind of thing that is right in a demo and wrong
 * for somebody who comes back tomorrow: which page it reopens on, and — the one
 * a real run found — what a person is told is on the record after emptying a
 * box whose answer is already saved.
 */

const question = (
  id: string,
  over: Partial<ApiFormQuestion> = {},
): ApiFormQuestion => ({
  id,
  competencyId: null,
  prompt: `Question ${id}`,
  kind: "TEXT",
  required: true,
  options: [],
  allowCustom: false,
  order: 0,
  answer: null,
  ...over,
});

const answered = (text: string): ApiFormQuestion["answer"] =>
  ({
    textValue: text,
    ratingValue: null,
    choiceValue: null,
    boolValue: null,
    attachment: null,
  }) as unknown as ApiFormQuestion["answer"];

const none = { mark: "", summary: "", step: 0 };

describe("startIndex", () => {
  it("opens a review with nothing in it on the introduction", () => {
    const review = { questions: [question("a"), question("b")] };
    expect(startIndex(review, none)).toBe(0);
  });

  it("goes to the first required question that has no answer", () => {
    const review = {
      questions: [
        question("a", { answer: answered("done") }),
        question("b"),
        question("c"),
      ],
    };
    expect(startIndex(review, none)).toBe(2); // intro, a, b
  });

  it("skips an optional question nobody answered", () => {
    const review = {
      questions: [
        question("a", { answer: answered("done") }),
        question("b", { required: false }),
        question("c"),
      ],
    };
    expect(startIndex(review, none)).toBe(3); // intro, a, b, c
  });

  it("goes to the overall mark once every required question has an answer", () => {
    const review = {
      questions: [
        question("a", { answer: answered("done") }),
        question("b", { required: false }),
      ],
    };
    expect(startIndex(review, none)).toBe(3); // intro, a, b, mark
  });

  it("goes back to the page this browser remembers, clamped to the last one", () => {
    const review = { questions: [question("a"), question("b")] };
    expect(startIndex(review, { ...none, step: 2 })).toBe(2);
    expect(startIndex(review, { ...none, step: 99 })).toBe(5); // intro a b mark note check
  });

  it("treats a remembered mark or note as having started", () => {
    const review = { questions: [question("a"), question("b")] };
    expect(startIndex(review, { ...none, summary: "a line" })).toBe(1);
  });
});

describe("what is on the record", () => {
  const q = question("a");
  const saved = { text: "what I saved" };

  it("is the box when the box holds an answer", () => {
    expect(onRecordOf(q, { text: "a new one" }, saved)).toEqual({
      text: "a new one",
    });
  });

  it("is the saved answer when the box has been emptied", () => {
    expect(onRecordOf(q, { text: "" }, saved)).toEqual(saved);
    expect(onRecordOf(q, { text: "   " }, saved)).toEqual(saved);
  });

  it("is the saved answer when the box was never touched", () => {
    expect(onRecordOf(q, undefined, saved)).toEqual(saved);
  });

  it("says the saved answer stands only when the box is empty and one is saved", () => {
    expect(savedAnswerStands(q, { text: "" }, saved)).toBe(true);
    expect(savedAnswerStands(q, { text: "new" }, saved)).toBe(false);
    expect(savedAnswerStands(q, undefined, saved)).toBe(false);
    expect(savedAnswerStands(q, { text: "" }, {})).toBe(false);
  });
});

describe("sigOf", () => {
  it("tells a change from no change", () => {
    expect(sigOf({ text: "a" })).toBe(sigOf({ text: "a" }));
    expect(sigOf({ text: "a" })).not.toBe(sigOf({ text: "b" }));
    expect(sigOf({})).toBe(sigOf({ text: undefined }));
  });
});
