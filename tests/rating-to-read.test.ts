import { describe, expect, it } from "vitest";
import { ratingToRead, ratingWordsFrom } from "@/lib/api/performance";

/**
 * The rating a person reads for a final review is one line (F42).
 *
 * A manager's overall rating is one appraiser's mark. The rating the person is told
 * is the period's score of record, and their record already opened on it ("Meets
 * Expectations · 3.1") while the Overview, the dialog that made it final and the
 * receipt they keep each said "Exceeds Expectations", the one appraiser's mark. Two
 * screens said different things about the same period for the same person.
 *
 * `ratingToRead` is the one place that decides which line is printed. The
 * question asked before a rating is made final says whose mark is whose; that is
 * `tests/finalise-dialog-score-of-record.test.tsx`.
 */

const words = ratingWordsFrom(null);
const SCORE = { bandLabel: "Meets Expectations", scoreOutOf5: 3.1 };

describe("ratingToRead", () => {
  it("is the score of record, and not the appraiser's mark beside it", () => {
    /* Mara marked him 4 of 5, Exceeds Expectations. His score is 3.1. */
    expect(ratingToRead({ rating: 4, outcome: SCORE }, words)).toBe(
      "Meets Expectations · 3.1",
    );
  });

  it("reads whatever part of the score the API sent", () => {
    expect(
      ratingToRead(
        {
          rating: 4,
          outcome: { bandLabel: "Meets Expectations", scoreOutOf5: null },
        },
        words,
      ),
    ).toBe("Meets Expectations");
    expect(
      ratingToRead(
        { rating: 4, outcome: { bandLabel: null, scoreOutOf5: 3.1 } },
        words,
      ),
    ).toBe("3.1");
  });

  it("is the appraiser's mark from an API that does not send the score on its list rows", () => {
    expect(ratingToRead({ rating: 4 }, words)).toBe("Exceeds Expectations");
  });

  it("is the review's own rating where there is no score of record to read", () => {
    /* A self-review, and a rating that is not final: `outcome` is null. */
    expect(ratingToRead({ rating: 3, outcome: null }, words)).toBe(
      "Meets Expectations",
    );
    /* A person nothing was recorded for: the API sends an outcome with no figure. */
    expect(
      ratingToRead(
        { rating: 4, outcome: { bandLabel: null, scoreOutOf5: null } },
        words,
      ),
    ).toBe("Exceeds Expectations");
  });

  it("is nothing where there is neither, and never a zero", () => {
    expect(ratingToRead({ rating: null }, words)).toBeNull();
    expect(
      ratingToRead(
        { rating: null, outcome: { bandLabel: null, scoreOutOf5: null } },
        words,
      ),
    ).toBeNull();
  });
});
