import { describe, expect, it } from "vitest";
import { finalisedCopy } from "@/app/(app)/performance/reviews/[id]/sign-off-copy";

/**
 * What is said when a rating is made final.
 *
 * Tested because it is one-way and evidential, so each sentence has to be true
 * of what was recorded. The one that is easiest to get wrong is "has been told"
 * when the API said it could not tell them, so the only line is the one that
 * says they were not, and it is said only for that.
 */

describe("a rating was made final", () => {
  const base = { subjectName: "Chidi Nwosu" };

  it("says whose rating, and nothing more when they were told", () => {
    const copy = finalisedCopy({ ...base, subjectNotified: true });
    expect(copy.title).toBe("Chidi Nwosu's rating is final");
    expect(copy.details).toEqual([]);
  });

  it("says they could not be told, and to tell them, when the API says so", () => {
    const copy = finalisedCopy({ ...base, subjectNotified: false });
    expect(copy.details).toEqual([
      "Chidi could not be told in the app. Tell them yourself.",
    ]);
    expect(copy.details.join(" ")).not.toMatch(/has been told/);
  });

  it("says nothing about telling them when the API did not answer either way", () => {
    const copy = finalisedCopy({ ...base, subjectNotified: undefined });
    expect(copy.details).toEqual([]);
  });

  it("says nothing it said before: not the rating, not that it cannot be changed", () => {
    const everything = JSON.stringify([
      finalisedCopy({ ...base, subjectNotified: true }),
      finalisedCopy({ ...base, subjectNotified: false }),
    ]);
    expect(everything).not.toMatch(/cannot be changed|record|kept|answer/i);
    expect(everything).not.toMatch(/!/);
  });
});
