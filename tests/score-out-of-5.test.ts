import { describe, expect, it } from "vitest";
import {
  changeOutOf5Label,
  outOf5FromBp,
  outOf5Label,
  scoreWords,
} from "@/lib/api/performance";

/**
 * A score as a band word and a 1.0 to 5.0 figure (UAT 23 Nov, U88 / PERF-17).
 *
 * The report showed "Average mark 59.96%" with Meets Expectations running from
 * 37.51% to 62.5%, so a straight 3 on everything read as 50%: a bare pass. The
 * API now sends `scoreOutOf5` on the register and the history and `meanOutOf5`
 * on the distribution; `scoreWords` shows the company's band word beside it.
 */

describe("outOf5FromBp, the API's outOf5 as a change of unit", () => {
  it("gives the values the API gives", () => {
    /* modules/performance/scoring.ts: round((1 + 4 * bp / 10000) * 10) / 10 */
    expect(outOf5FromBp(0)).toBe(1);
    expect(outOf5FromBp(5000)).toBe(3);
    expect(outOf5FromBp(10000)).toBe(5);
    expect(outOf5FromBp(6250)).toBe(3.5);
    expect(outOf5FromBp(5996)).toBe(3.4);
    expect(outOf5FromBp(3751)).toBe(2.5);
  });

  it("always shows its one decimal", () => {
    expect(outOf5Label(3)).toBe("3.0");
    expect(outOf5Label(4.1)).toBe("4.1");
  });
});

describe("scoreWords", () => {
  it("is the band word and the API's figure", () => {
    expect(
      scoreWords({
        scoreBp: 5000,
        scoreOutOf5: 3,
        bandLabel: "Meets Expectations",
      }),
    ).toBe("Meets Expectations · 3.0");
  });

  it("is the figure alone where there is no band word", () => {
    expect(scoreWords({ scoreBp: 7750, scoreOutOf5: 4.1 })).toBe("4.1");
  });

  it("changes an older API's basis points to the same scale, never a percentage", () => {
    const words = scoreWords({
      scoreBp: 5996,
      bandLabel: "Meets Expectations",
    });
    expect(words).toBe("Meets Expectations · 3.4");
    expect(words).not.toContain("%");
  });

  it("is nothing where there is no score: absent is not a 1.0", () => {
    expect(scoreWords({ scoreBp: null, scoreOutOf5: null })).toBeNull();
    expect(scoreWords({ scoreBp: null })).toBeNull();
  });
});

describe("changeOutOf5Label", () => {
  it("is signed, on the same scale", () => {
    expect(changeOutOf5Label(2250)).toBe("+0.9");
    expect(changeOutOf5Label(-1250)).toBe("-0.5");
    expect(changeOutOf5Label(0)).toBe("No change");
  });
});
