import { describe, expect, it } from "vitest";
import {
  acknowledgedCopy,
  finalisedCopy,
} from "@/app/(app)/performance/reviews/[id]/sign-off-copy";

/**
 * What is said when a rating is made final, and when its subject acknowledges it.
 *
 * Tested because both are one-way and evidential, so each sentence has to be
 * true of what was recorded. The two that are easiest to get wrong are "has been
 * told" when the API said it could not tell them, and an acknowledgement that
 * reads as agreement.
 */

describe("a rating was made final", () => {
  const base = {
    subjectName: "Chidi Nwosu",
    cycleName: "H1 2026",
    ratingLabel: "Meets Expectations",
  };

  it("says whose rating, and carries the mark of record", () => {
    const copy = finalisedCopy({ ...base, subjectNotified: true });
    expect(copy.title).toBe("Chidi Nwosu's rating is final");
    expect(copy.lead).toBe(
      'The mark of record for H1 2026 is "Meets Expectations".',
    );
  });

  it("says they have been told only when the API said it told them", () => {
    expect(finalisedCopy({ ...base, subjectNotified: true }).details).toEqual([
      "Chidi has been told, and is asked to acknowledge it.",
      "It cannot be re-marked.",
      "Their answer will show on this page once they give it.",
    ]);
  });

  it("says they could not be told, and to tell them, when the API says so", () => {
    const copy = finalisedCopy({ ...base, subjectNotified: false });
    expect(copy.details).toEqual([
      "Chidi could not be told in the app. Tell them yourself.",
      "It cannot be re-marked.",
    ]);
    expect(copy.details.join(" ")).not.toMatch(/has been told/);
    /* No promise of an answer from somebody who has nowhere to give one. */
    expect(copy.details.join(" ")).not.toMatch(/answer/);
  });

  it("says nothing about telling them when the API did not answer either way", () => {
    const copy = finalisedCopy({ ...base, subjectNotified: undefined });
    expect(copy.details.join(" ")).not.toMatch(/told/i);
    expect(copy.details).toHaveLength(2);
    expect(copy.details[1]).toMatch(/answer/);
  });

  it("says a form with no overall mark gave none, and does not invent one", () => {
    const copy = finalisedCopy({
      ...base,
      ratingLabel: null,
      subjectNotified: true,
    });
    expect(copy.lead).toBe(
      "H1 2026 carries no overall mark, so Chidi reads the answers.",
    );
  });
});

describe("a rating was acknowledged", () => {
  const base = {
    cycleName: "H1 2026",
    ratingLabel: "Meets Expectations",
    day: "2026-10-09",
    commented: false,
  };

  it("carries the mark and the day it was recorded", () => {
    const copy = acknowledgedCopy(base);
    expect(copy.title).toBe("Your acknowledgement is recorded");
    expect(copy.lead).toBe(
      'Your rating for H1 2026 was "Meets Expectations", and you saw it on 9 Oct 2026.',
    );
  });

  it("says it records that they saw it, not that they agree", () => {
    const copy = acknowledgedCopy(base);
    expect(copy.details).toEqual([
      "It is kept with the appraisal, with the date.",
      "It records that you saw your rating, not that you agree with it.",
      "You can do this once, so it is final.",
    ]);
  });

  it("mentions the comment only when one was written", () => {
    expect(acknowledgedCopy({ ...base, commented: true }).details).toContain(
      "Your comment is saved with it.",
    );
    expect(acknowledgedCopy(base).details.join(" ")).not.toMatch(/comment/);
  });

  it("does not invent a mark for a form that gave none", () => {
    expect(acknowledgedCopy({ ...base, ratingLabel: null }).lead).toBe(
      "You saw your appraisal for H1 2026 on 9 Oct 2026.",
    );
  });

  it("does not say anyone was told, because the API does not report it", () => {
    expect(JSON.stringify(acknowledgedCopy(base))).not.toMatch(/told/i);
  });
});

describe("the voice", () => {
  it("has no exclamation marks and no celebration", () => {
    const everything = JSON.stringify([
      finalisedCopy({
        subjectName: "A B",
        cycleName: "C",
        ratingLabel: "D",
        subjectNotified: true,
      }),
      acknowledgedCopy({
        cycleName: "C",
        ratingLabel: "D",
        day: "2026-10-09",
        commented: true,
      }),
    ]);
    expect(everything).not.toMatch(/!/);
    expect(everything).not.toMatch(/congratulations|success/i);
  });
});
