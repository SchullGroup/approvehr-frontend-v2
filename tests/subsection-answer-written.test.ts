import { describe, expect, it } from "vitest";
import type {
  ApiFormQuestion,
  ApiRatingScale,
  ApiSelfAnswer,
  ApiSubsectionOnForm,
} from "@/lib/api/performance";
import {
  answerWords,
  isSubsectionQuestion,
  questionKind,
  selfAnswerWords,
  type SubsectionQuestion,
} from "@/lib/performance/subsection-answer";

/**
 * A subsection answered in the person's own words, asked on a review form.
 *
 * What `tsc` cannot see here: a written answer read as a pick (and so as nothing),
 * a box of spaces called an answer, the person's own words turned into a figure or
 * into "No answer", and a flag with no subsection behind it drawing a box the
 * subsection never asked for.
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

const subsection = (
  over: Partial<ApiSubsectionOnForm> = {},
): ApiSubsectionOnForm => ({
  name: "Communication",
  answerKind: "TEXT",
  scaleMax: 5,
  choices: [],
  ...over,
});

const direct = (over: Partial<ApiFormQuestion> = {}): SubsectionQuestion =>
  ({
    id: "q1",
    competencyId: "c1",
    prompt: "Communication",
    kind: "TEXT",
    required: true,
    options: [],
    allowCustom: false,
    order: 0,
    answer: null,
    answersSubsection: true,
    subsection: subsection(),
    ...over,
  }) as SubsectionQuestion;

describe("which question a written subsection is", () => {
  it("is one the API flagged and gave a subsection to, like any other", () => {
    expect(isSubsectionQuestion(direct())).toBe(true);
  });

  it("is drawn as the subsection's own kind", () => {
    expect(questionKind(direct())).toBe("TEXT");
  });

  it("is the subsection's kind even if the question's own kind says otherwise", () => {
    expect(questionKind(direct({ kind: "RATING" }))).toBe("TEXT");
  });

  it("is an ordinary question, with a box to write in, when the flag has nothing behind it", () => {
    const flagged = {
      ...direct(),
      subsection: undefined,
    } as unknown as ApiFormQuestion;
    expect(isSubsectionQuestion(flagged)).toBe(false);
    expect(questionKind(flagged)).toBe("TEXT");
  });
});

describe("a written answer in words", () => {
  const written = (text: string | null | undefined) =>
    answerWords(direct(), { text }, scale);

  it("is the words as they were written", () => {
    expect(written("Clear and early, and kind with it.")).toBe(
      "Clear and early, and kind with it.",
    );
  });

  it("keeps the paragraphs and does not shorten them", () => {
    const long = `${"a".repeat(2000)}\n\n${"b".repeat(1500)}`;
    expect(written(long)).toBe(long);
  });

  it("is trimmed, because spaces round the words are not words", () => {
    expect(written("  Good.  \n")).toBe("Good.");
  });

  it("is no answer for nothing, for spaces and for an absent field, and never a figure", () => {
    expect(written(null)).toBeNull();
    expect(written(undefined)).toBeNull();
    expect(written("")).toBeNull();
    expect(written("   \n\t ")).toBeNull();
    expect(answerWords(direct(), {}, scale)).toBeNull();
  });

  it("does not read the words of one kind out of another kind's fields", () => {
    /* A level, a yes or no and a pick on a written subsection are not its answer. */
    expect(
      answerWords(
        direct(),
        { ratingValue: 4, boolValue: true, choiceOptionId: "o1" },
        scale,
      ),
    ).toBeNull();
  });

  it("is never read from the text of a subsection answered another way", () => {
    const rated = direct({ subsection: subsection({ answerKind: "RATING" }) });
    expect(answerWords(rated, { text: "Some words" }, scale)).toBeNull();
    const yesNo = direct({
      subsection: subsection({ answerKind: "BOOLEAN" }),
    });
    expect(answerWords(yesNo, { text: "Some words" }, scale)).toBeNull();
  });
});

describe("the person's own written answer, beside their manager's box", () => {
  const own = (over: Partial<ApiSelfAnswer> = {}): ApiSelfAnswer => ({
    ratingValue: null,
    boolValue: null,
    choiceOptionId: null,
    choiceValue: null,
    textValue: null,
    answeredAt: "2026-10-20T10:00:00Z",
    ...over,
  });
  const of = (selfAnswer: ApiSelfAnswer | null | undefined) =>
    selfAnswerWords(direct({ selfAnswer }), scale);

  it("is their words, in full, once they have sent theirs", () => {
    expect(of(own({ textValue: "I shipped it on time." }))).toBe(
      "I shipped it on time.",
    );
    const long = "x".repeat(4000);
    expect(of(own({ textValue: long }))).toBe(long);
  });

  it("is nothing when they have not sent theirs: null, and absent", () => {
    expect(of(null)).toBeNull();
    expect(of(undefined)).toBeNull();
  });

  it("is nothing when their answer has no words in it, and that is not a nought or No answer", () => {
    expect(of(own())).toBeNull();
    expect(of(own({ textValue: "" }))).toBeNull();
    expect(of(own({ textValue: "   " }))).toBeNull();
  });

  it("is nothing when the server does not send the field, which is one that predates it", () => {
    const older: Partial<ApiSelfAnswer> = own({ textValue: "ignored" });
    delete older.textValue;
    expect(of(older as ApiSelfAnswer)).toBeNull();
  });

  it("does not turn a level, a yes or no or a pick on their answer into words they did not write", () => {
    expect(
      of(own({ ratingValue: 4, boolValue: true, choiceValue: "Delighted" })),
    ).toBeNull();
  });
});
