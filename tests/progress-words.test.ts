import { describe, expect, it } from "vitest";
import type { ApiProgressStep } from "@/lib/api/performance";
import {
  answeredIn,
  answeredLine,
  hasStarted,
  stepLine,
} from "@/lib/performance/progress-words";

/**
 * What an appraisal's progress says (F31). After one answer and Save and close,
 * the Overview still said "Step 1 of 2: Questions" beside Start, and the team
 * list said "Done 1 of 2 steps" for a form that had not been sent.
 */
const step = (
  label: string,
  total: number,
  answered: number,
  done: boolean,
): ApiProgressStep => ({ key: label, label, total, answered, done });

describe("a person who has begun", () => {
  const begun = [step("Questions", 2, 1, false), step("Core", 3, 0, false)];

  it("has started, though no step is done", () => {
    expect(hasStarted(begun)).toBe(true);
  });

  it("has not started with nothing answered and nothing done", () => {
    expect(
      hasStarted([step("Questions", 2, 0, false), step("Core", 3, 0, false)]),
    ).toBe(false);
  });

  it("is told how much of the step is answered", () => {
    expect(stepLine(begun)).toBe("Step 1 of 2: Questions, 1 of 2 answered");
  });

  it("is told only the step when nothing in it is answered", () => {
    expect(stepLine([step("Questions", 2, 0, false)])).toBe(
      "Step 1 of 1: Questions",
    );
  });

  it("has the next step after a done one", () => {
    expect(
      stepLine([step("Questions", 2, 2, true), step("Core", 3, 1, false)]),
    ).toBe("Step 2 of 2: Core, 1 of 3 answered");
  });

  it("has no line when every step is done, or there are none", () => {
    expect(stepLine([step("Questions", 2, 2, true)])).toBeNull();
    expect(stepLine([])).toBeNull();
  });
});

describe("what is answered across the steps", () => {
  it("adds up questions, not steps", () => {
    expect(
      answeredIn([step("Questions", 2, 1, false), step("Core", 3, 3, true)]),
    ).toEqual({ answered: 4, total: 5 });
  });

  it("says it under a person, and nothing for nobody who has answered nothing", () => {
    expect(
      answeredLine([step("Questions", 2, 1, false), step("Core", 3, 0, false)]),
    ).toBe("1 of 5 answered");
    expect(answeredLine([step("Questions", 2, 0, false)])).toBeNull();
    expect(answeredLine([])).toBeNull();
  });
});
