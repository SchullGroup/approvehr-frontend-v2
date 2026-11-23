import { describe, expect, it } from "vitest";
import { asOwnForm, inSecondPerson } from "@/lib/performance/own-words";
import type { ApiReviewDetail } from "@/lib/api/performance";

/**
 * The person's own form asks "you" (UAT 23 Nov, L9 / PERF-28): it read
 * "Overall, how well did they deliver?" on Halima's self-review.
 */
describe("a self-review's questions", () => {
  it("turn the pronouns round and nothing else", () => {
    expect(inSecondPerson("Overall, how well did they deliver?")).toBe(
      "Overall, how well did you deliver?",
    );
    expect(
      inSecondPerson("They're clear about their goals; what helped them?"),
    ).toBe("You're clear about your goals; what helped you?");
    expect(inSecondPerson("Did they push themselves?")).toBe(
      "Did you push yourself?",
    );
    expect(inSecondPerson("What did the team theorise?")).toBe(
      "What did the team theorise?",
    );
  });

  it("are changed on a self-review only, and keep their ids", () => {
    const question = {
      id: "q-1",
      prompt: "How well did they deliver?",
    } as ApiReviewDetail["questions"][number];
    const self = asOwnForm({ kind: "SELF", questions: [question] });
    expect(self.questions[0]).toMatchObject({
      id: "q-1",
      prompt: "How well did you deliver?",
    });
    const manager = asOwnForm({ kind: "MANAGER", questions: [question] });
    expect(manager.questions[0]?.prompt).toBe("How well did they deliver?");
  });
});
