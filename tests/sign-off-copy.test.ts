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

  it("says whose rating, and carries the rating", () => {
    const copy = finalisedCopy({ ...base, subjectNotified: true });
    expect(copy.title).toBe("Chidi Nwosu's rating is final");
    expect(copy.lead).toBe('The rating for H1 2026 is "Meets Expectations".');
  });

  it("says they have been told only when the API said it told them", () => {
    expect(finalisedCopy({ ...base, subjectNotified: true }).details).toEqual([
      "Chidi has been told, and is asked to acknowledge it.",
      "It cannot be changed.",
      "Their answer will show on this page once they give it.",
    ]);
  });

  it("says they could not be told, and to tell them, when the API says so", () => {
    const copy = finalisedCopy({ ...base, subjectNotified: false });
    expect(copy.details).toEqual([
      "Chidi could not be told in the app. Tell them yourself.",
      "It cannot be changed.",
    ]);
    expect(copy.details.join(" ")).not.toMatch(/has been told/);
    /* No promise of an answer from somebody who has nowhere to give one. */
    expect(copy.details.join(" ")).not.toMatch(/answer/);
  });

  describe("the work kept with it", () => {
    const until = "1 Nov 2027";

    it("says how many tasks were kept and until when, when a record was", () => {
      const copy = finalisedCopy({
        ...base,
        subjectNotified: true,
        kept: { items: 7, total: 7, truncated: false, until },
      });
      expect(copy.details).toContain(
        "A record of the 7 tasks Chidi finished in this cycle is kept with it until 1 Nov 2027.",
      );
    });

    it("says one task, not 1 tasks", () => {
      const copy = finalisedCopy({
        ...base,
        subjectNotified: true,
        kept: { items: 1, total: 1, truncated: false, until },
      });
      expect(copy.details.join(" ")).toMatch(/the 1 task Chidi finished/);
    });

    it("says it holds the newest of more than it could, with the true total", () => {
      const copy = finalisedCopy({
        ...base,
        subjectNotified: true,
        kept: { items: 1000, total: 1432, truncated: true, until },
      });
      expect(copy.details.join(" ")).toMatch(
        /the newest 1000 tasks of the 1432 Chidi finished in this cycle is kept with it until 1 Nov 2027/,
      );
    });

    it("says an empty record is nothing recorded, and not a count of nought", () => {
      const copy = finalisedCopy({
        ...base,
        subjectNotified: true,
        kept: { items: 0, total: 0, truncated: false, until },
      });
      expect(copy.details).toContain(
        "A record of the work behind it is kept until 1 Nov 2027: no finished tasks were recorded for Chidi in this cycle.",
      );
      expect(copy.details.join(" ")).not.toMatch(/\b0 tasks\b/);
    });

    it("says nothing when nothing was kept, which is every company until it chooses a period", () => {
      for (const kept of [null, undefined]) {
        const copy = finalisedCopy({
          ...base,
          subjectNotified: true,
          ...(kept === undefined ? {} : { kept }),
        });
        expect(copy.details.join(" ")).not.toMatch(/record|kept/i);
      }
    });

    it("comes before the line that says it cannot be changed", () => {
      const copy = finalisedCopy({
        ...base,
        subjectNotified: true,
        kept: { items: 2, total: 2, truncated: false, until },
      });
      const at = (needle: string) =>
        copy.details.findIndex((line) => line.includes(needle));
      expect(at("A record of")).toBeGreaterThan(-1);
      expect(at("A record of")).toBeLessThan(at("It cannot be changed"));
    });
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
      "H1 2026 has no overall mark, so Chidi will read the answers.",
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
