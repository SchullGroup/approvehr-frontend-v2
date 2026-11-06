import { describe, expect, it } from "vitest";
import type { ApiChoiceOption } from "@/lib/api/performance";
import {
  ANSWER_KINDS,
  KIND_BADGE,
  WRITTEN_NEVER_COUNTS,
  answerKindOf,
  choicesOf,
  directCounts,
  kindLine,
  kindOptionLabel,
  recordedWords,
  subsectionOptionLabel,
} from "@/lib/performance/answer-kind";
import {
  WRITTEN_ANSWER_BLANK,
  WRITTEN_ANSWER_COUNTER_FROM,
  WRITTEN_ANSWER_MAX_LENGTH,
  WRITTEN_ANSWER_TOO_LONG,
  writtenAnswerCounter,
  writtenAnswerIsOver,
  writtenAnswerProblem,
} from "@/lib/performance/question-limits";

/**
 * A subsection answered in the person's own words, read without mounting anything.
 *
 * It is the one kind that is never scored, so what is worth a test is every place a
 * screen could quietly treat it as one of the others: a picker that does not offer
 * it, a sentence that promises it a share of the mark, a row that calls it rated,
 * a limit that lets a paste through that the server then refuses. Each of those is a
 * well-typed string.
 */

const WORDS = (length: number) => "w".repeat(length);

describe("the fourth way a subsection can be answered", () => {
  it("comes after the other three, which is the order every picker offers them in", () => {
    expect(ANSWER_KINDS).toEqual(["RATING", "BOOLEAN", "CHOICE", "TEXT"]);
  });

  it("is named In their own words in a picker, and Written on a row", () => {
    expect(kindOptionLabel("TEXT", 5)).toBe("In their own words");
    expect(KIND_BADGE.TEXT).toBe("Written");
  });

  it("does not name the scale, which it does not have", () => {
    /* A level is the only one whose picker option carries the scale, because it is
       the only one with a ceiling. */
    expect(kindOptionLabel("TEXT", 5)).not.toMatch(/\d/);
    expect(kindOptionLabel("TEXT", 10)).toBe(kindOptionLabel("TEXT", 5));
  });

  it("is what a subsection says it is, never what a missing kind means", () => {
    expect(answerKindOf({ answerKind: "TEXT" })).toBe("TEXT");
    expect(answerKindOf({})).toBe("RATING");
  });
});

describe("the one sentence for what a written answer is", () => {
  it("says it is read by people and never counts towards the mark", () => {
    expect(WRITTEN_NEVER_COUNTS).toBe(
      "A written answer is read by people and never counts towards the mark.",
    );
  });

  it("is what explains the kind under its picker, and nothing is added to it", () => {
    expect(kindLine("TEXT", 5)).toBe(WRITTEN_NEVER_COUNTS);
    expect(kindLine("TEXT", 10)).toBe(WRITTEN_NEVER_COUNTS);
  });

  it("does not promise a target, a gap or a score, which words cannot have", () => {
    for (const word of [/target/i, /gap/i, /heatmap/i, /scores?\b/i, /%/]) {
      expect(kindLine("TEXT", 5)).not.toMatch(word);
    }
  });

  it("is not said of the kinds that do count", () => {
    for (const kind of ["RATING", "BOOLEAN", "CHOICE"] as const) {
      expect(kindLine(kind, 5)).not.toContain("never counts");
    }
  });
});

describe("what a written answer counts towards", () => {
  const sections = [
    null,
    { name: "Core competency", weightBp: 4000 },
    { name: "Key result area", weightBp: null },
    { name: "Core competency", weightBp: undefined },
  ];

  it("is nothing, in every state its section can be in, and so says nothing", () => {
    /* A line quoting the section's weight beside a written answer would promise it
       a share of the mark it can never move, and a warning about an unweighted
       section would warn about something that could not have counted anyway. */
    for (const section of sections) {
      expect(directCounts({ kind: "TEXT", section })).toBeNull();
    }
  });

  it("is still said for the kinds that do count, so the silence above is the kind and not a broken helper", () => {
    for (const section of sections.slice(0, 3)) {
      expect(directCounts({ kind: "BOOLEAN", section })).not.toBeNull();
    }
  });
});

describe("how a written subsection reads in the places that name one", () => {
  it("is the name, a comma and the row's word in lower case, in a picker", () => {
    expect(subsectionOptionLabel("Communication", "TEXT")).toBe(
      "Communication, written",
    );
  });

  it("uses the words of the row badge", () => {
    expect(
      subsectionOptionLabel("X", "TEXT").toLowerCase().endsWith("written"),
    ).toBe(true);
    expect(KIND_BADGE.TEXT.toLowerCase()).toBe("written");
  });

  it("calls what is recorded on it an answer, never a level", () => {
    expect(recordedWords("TEXT")).toEqual({
      a: "an answer",
      the: "the answer",
    });
  });
});

describe("the choices a written subsection really has", () => {
  const listed: ApiChoiceOption[] = [
    { id: "a", label: "Meets", scoreBp: 6000, sortOrder: 0 },
    { id: "b", label: "Exceeds", scoreBp: 10000, sortOrder: 1 },
  ];

  it("are none at all, however many the API still lists", () => {
    /* A subsection switched to words before its first rating keeps the choices it
       had, and the API still lists them. Reading them without asking the kind
       would offer a pick-list on a box to write in. */
    expect(choicesOf({ answerKind: "TEXT", choiceOptions: listed })).toEqual(
      [],
    );
  });
});

describe("the limit on a written answer", () => {
  it("is the server's: 1 to 4,000 characters, and the count from the last 500", () => {
    expect(WRITTEN_ANSWER_MAX_LENGTH).toBe(4000);
    expect(WRITTEN_ANSWER_COUNTER_FROM).toBe(3500);
  });

  it("says the server's own sentence for an answer that is too long, character for character", () => {
    /* `writtenAnswerTooLong` in the API's performance schemas. */
    expect(WRITTEN_ANSWER_TOO_LONG).toBe("Keep it to 4000 characters.");
  });

  it.each([
    [0, WRITTEN_ANSWER_BLANK],
    [1, null],
    [2000, null],
    [4000, null],
    [4001, WRITTEN_ANSWER_TOO_LONG],
    [9000, WRITTEN_ANSWER_TOO_LONG],
  ])("an answer of %i characters is refused with %s", (length, expected) => {
    expect(writtenAnswerProblem(WORDS(length))).toBe(expected);
  });

  it("is not an answer when it is nothing but spaces, which is how the server measures it", () => {
    expect(writtenAnswerProblem("   ")).toBe(WRITTEN_ANSWER_BLANK);
    expect(writtenAnswerProblem(" \n\t ")).toBe(WRITTEN_ANSWER_BLANK);
    expect(WRITTEN_ANSWER_BLANK).toBe("Write the answer in words.");
  });

  it("measures the trimmed answer, so spaces round 4,000 characters do not count against it", () => {
    expect(writtenAnswerProblem(`   ${WORDS(4000)}   `)).toBeNull();
    expect(writtenAnswerProblem(`   ${WORDS(4001)}   `)).toBe(
      WRITTEN_ANSWER_TOO_LONG,
    );
    expect(writtenAnswerIsOver(`  ${WORDS(4000)}  `)).toBe(false);
    expect(writtenAnswerIsOver(`  ${WORDS(4001)}  `)).toBe(true);
  });

  it("is over only past the limit, and not at it", () => {
    expect(writtenAnswerIsOver(WORDS(4000))).toBe(false);
    expect(writtenAnswerIsOver(WORDS(4001))).toBe(true);
    expect(writtenAnswerIsOver("")).toBe(false);
  });
});

describe("the count under a written answer", () => {
  it("is absent until the answer is getting long", () => {
    expect(writtenAnswerCounter("")).toBeNull();
    expect(
      writtenAnswerCounter(WORDS(WRITTEN_ANSWER_COUNTER_FROM - 1)),
    ).toBeNull();
  });

  it("is there from the threshold, with thousands separators, and keeps going past the limit", () => {
    expect(writtenAnswerCounter(WORDS(WRITTEN_ANSWER_COUNTER_FROM))).toBe(
      "3,500 of 4,000 characters",
    );
    expect(writtenAnswerCounter(WORDS(4000))).toBe("4,000 of 4,000 characters");
    expect(writtenAnswerCounter(WORDS(4021))).toBe("4,021 of 4,000 characters");
  });

  it("counts what is trimmed, like the rule it belongs to", () => {
    expect(writtenAnswerCounter(`   ${WORDS(3600)}   `)).toBe(
      "3,600 of 4,000 characters",
    );
  });
});
