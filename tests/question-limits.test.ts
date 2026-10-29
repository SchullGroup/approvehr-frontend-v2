import { describe, expect, it } from "vitest";
import {
  MAX_CHOICES,
  MAX_CHOICE_LENGTH,
  QUESTION_COUNTER_FROM,
  QUESTION_MAX_LENGTH,
  QUESTION_MIN_LENGTH,
  QUESTION_TOO_LONG,
  QUESTION_TOO_SHORT,
  questionCounter,
  questionWordingProblem,
} from "@/lib/performance/question-limits";

/**
 * The limits are the server's, written once. The sentences are its own, character
 * for character: `questionBody` in the backend's performance schemas says them, and
 * a refusal that reads one way from the form and another from the server is how two
 * screens stop agreeing.
 */

const of = (length: number) => "Q".repeat(Math.max(0, length - 1)) + "?";

describe("the numbers", () => {
  it("are the server's: 5 to 300 characters, ten choices of at most 120", () => {
    expect(QUESTION_MIN_LENGTH).toBe(5);
    expect(QUESTION_MAX_LENGTH).toBe(300);
    expect(MAX_CHOICES).toBe(10);
    expect(MAX_CHOICE_LENGTH).toBe(120);
  });

  it("show the count a quarter of the way before the end, not from the first letter", () => {
    expect(QUESTION_COUNTER_FROM).toBeLessThan(QUESTION_MAX_LENGTH);
    expect(QUESTION_COUNTER_FROM).toBeGreaterThan(QUESTION_MAX_LENGTH / 2);
  });
});

describe("a question's wording", () => {
  it.each([
    [0, QUESTION_TOO_SHORT],
    [4, QUESTION_TOO_SHORT],
    [5, null],
    [150, null],
    [300, null],
    [301, QUESTION_TOO_LONG],
    [1000, QUESTION_TOO_LONG],
  ])("of %i characters is refused with %s", (length, expected) => {
    expect(questionWordingProblem(of(length))).toBe(expected);
  });

  it("is measured trimmed, as the server measures it", () => {
    expect(questionWordingProblem("   ab   ")).toBe(QUESTION_TOO_SHORT);
    expect(questionWordingProblem(`  ${of(300)}  `)).toBeNull();
    expect(questionWordingProblem(`  ${of(301)}  `)).toBe(QUESTION_TOO_LONG);
  });

  it("says the server's own sentences", () => {
    expect(QUESTION_TOO_SHORT).toBe("Write the question out.");
    expect(QUESTION_TOO_LONG).toBe(
      "Keep the question short enough to read on a phone.",
    );
  });
});

describe("the count", () => {
  it("is absent until the question is getting long", () => {
    expect(questionCounter(of(0))).toBeNull();
    expect(questionCounter(of(QUESTION_COUNTER_FROM - 1))).toBeNull();
  });

  it("is there from the threshold, and keeps going past the limit", () => {
    expect(questionCounter(of(QUESTION_COUNTER_FROM))).toBe(
      "250 of 300 characters",
    );
    expect(questionCounter(of(300))).toBe("300 of 300 characters");
    expect(questionCounter(of(321))).toBe("321 of 300 characters");
  });

  it("counts what is trimmed, like the rule it belongs to", () => {
    expect(questionCounter(`   ${of(250)}   `)).toBe("250 of 300 characters");
  });
});
