import { describe, expect, it } from "vitest";
import {
  meanBp,
  scoreOfRatings,
  scorecardBp,
  summarise,
  toScore,
} from "@/lib/hiring/comms/score";

/**
 * The interview score, worked out by hand.
 *
 * Every expected figure below is arithmetic somebody can do on paper, because that
 * is the whole point of carrying the sum in whole ten-thousandths of a point: a
 * score that cannot be reproduced is a score nobody can defend to a candidate.
 */

const r = (score: number, weight = 1, competency = "x") => ({
  competency,
  score,
  weight,
});

describe("one scorecard", () => {
  it("is the weighted mean of its ratings", () => {
    /* (5 x 2 + 3 x 1) / 3 = 4.3333 */
    expect(scorecardBp([r(5, 2), r(3, 1)])).toBe(43333);
    expect(scoreOfRatings([r(5, 2), r(3, 1)])).toBe(4.33);
  });

  it("is the plain mean when every weight is 1", () => {
    expect(scoreOfRatings([r(4), r(5), r(3)])).toBe(4);
  });

  it("has no score at all when nothing was rated, which is not a zero", () => {
    expect(scorecardBp([])).toBeNull();
    expect(scoreOfRatings([])).toBeNull();
  });

  it("rounds half up, once", () => {
    /* (4 + 5) / 2 = 4.5 exactly; 4.5 stays 4.5. (1 + 2 + 2) / 3 = 1.6667 */
    expect(scoreOfRatings([r(4), r(5)])).toBe(4.5);
    expect(scorecardBp([r(1), r(2), r(2)])).toBe(16667);
    expect(toScore(16667)).toBe(1.67);
    /* 2.345 is a tie at two places and goes up. */
    expect(toScore(23450)).toBe(2.35);
  });
});

describe("an application", () => {
  const card = (
    interviewerId: string,
    ratings: ReturnType<typeof r>[],
    recommendation: string | null = null,
    submitted = true,
  ) => ({ interviewerId, submitted, recommendation, ratings });

  it("is the mean of its interviews, each counted once however big its panel", () => {
    const out = summarise([
      {
        id: "i1",
        kind: "Panel",
        status: "COMPLETED",
        /* 4.3333 and 4.0 average to 4.1667 */
        scorecards: [
          card("a", [r(5, 2), r(3, 1)], "STRONG_YES"),
          card("b", [r(4)], "YES"),
        ],
      },
      {
        id: "i2",
        kind: "Screen",
        status: "COMPLETED",
        scorecards: [card("c", [r(2)])],
      },
    ]);
    /* The panel is 4.1667 and the phone screen is 2: (4.1667 + 2) / 2 = 3.0833 */
    expect(out.composite).toBe(3.08);
    expect(out.interviews[0]?.composite).toBe(4.17);
    expect(out.scorecardsSubmitted).toBe(3);
  });

  it("counts only what was handed in, for interviews that took place or will", () => {
    const out = summarise([
      {
        id: "i1",
        kind: "Panel",
        status: "COMPLETED",
        scorecards: [card("a", [r(4)]), card("b", [r(1)], null, false)],
      },
      {
        id: "i2",
        kind: "Panel",
        status: "CANCELLED",
        scorecards: [card("c", [r(1)])],
      },
      {
        id: "i3",
        kind: "Panel",
        status: "NO_SHOW",
        scorecards: [card("d", [r(1)])],
      },
    ]);
    expect(out.composite).toBe(4);
    expect(out.scorecardsSubmitted).toBe(1);
  });

  it("is null, never 0, while nothing has been scored", () => {
    expect(summarise([]).composite).toBeNull();
    expect(
      summarise([
        {
          id: "i1",
          kind: "Panel",
          status: "COMPLETED",
          scorecards: [card("a", [], "YES")],
        },
      ]).composite,
    ).toBeNull();
  });

  it("tallies recommendations beside the score, not inside it", () => {
    const out = summarise([
      {
        id: "i1",
        kind: "Panel",
        status: "COMPLETED",
        scorecards: [
          card("a", [r(4)], "STRONG_YES"),
          card("b", [r(4)], "NO"),
          card("c", [r(4)], null),
        ],
      },
    ]);
    expect(out.recommendations).toEqual({
      STRONG_YES: 1,
      YES: 0,
      NO: 1,
      STRONG_NO: 0,
    });
    expect(out.composite).toBe(4);
  });

  it("breaks the score down by what was rated, with the same weights, ignoring case", () => {
    const out = summarise([
      {
        id: "i1",
        kind: "Panel",
        status: "COMPLETED",
        scorecards: [
          card("a", [r(5, 2, "Technical"), r(3, 1, "Communication")]),
          card("b", [r(4, 1, "technical")]),
        ],
      },
    ]);
    /* Technical: (5 x 2 + 4 x 1) / 3 = 4.6667 across two ratings. */
    expect(out.byCompetency).toEqual([
      { competency: "Communication", average: 3, ratings: 1 },
      { competency: "Technical", average: 4.67, ratings: 2 },
    ]);
  });

  it("takes the mean of figures in ten-thousandths, half up", () => {
    expect(meanBp([])).toBeNull();
    expect(meanBp([43333, 40000])).toBe(41667);
  });
});
