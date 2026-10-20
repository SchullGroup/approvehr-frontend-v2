import type { ScoreSummary } from "./model";

/**
 * The interview score: what a scorecard's weights actually do.
 *
 * The API owns this arithmetic and sends the figure; this is the same sum, written
 * here for two things the API cannot do: show a person the score their own ratings
 * come to **as they type them**, and make the offline demo's figures.
 *
 * 1. A **scorecard** is the weighted mean of its ratings:
 *    `Σ(score × weight) ÷ Σ(weight)`. One with no ratings has **no** score; it is
 *    not zero and it drags nobody down.
 * 2. An **interview** is the plain mean of its scorecards' scores: each panelist
 *    counts once, however many things they rated.
 * 3. An **application** is the plain mean of its interviews' scores: each
 *    interview counts once, however big its panel.
 * 4. Only what has been **submitted** counts, for interviews that happened or are
 *    going to.
 *
 * Every figure is carried as an integer number of ten-thousandths of a point and
 * each step rounds half up exactly once, so a mean is a number somebody can
 * reproduce by hand.
 *
 * No React, no state.
 */

const SCALE = 10_000;

export type Rating = { competency: string; score: number; weight: number };

const unitsOf = (weight: number): number => Math.round(weight * SCALE);

const divideHalfUp = (numerator: number, denominator: number): number =>
  Math.floor((2 * numerator + denominator) / (2 * denominator));

/** One scorecard's figure in ten-thousandths, or `null` when it rated nothing. */
export function scorecardBp(ratings: readonly Rating[]): number | null {
  let weighted = 0;
  let total = 0;
  for (const rating of ratings) {
    const weight = unitsOf(rating.weight);
    weighted += rating.score * weight;
    total += weight;
  }
  if (total <= 0) return null;
  return divideHalfUp(weighted * SCALE, total);
}

export function meanBp(figures: readonly number[]): number | null {
  if (figures.length === 0) return null;
  return divideHalfUp(
    figures.reduce((sum, figure) => sum + figure, 0),
    figures.length,
  );
}

/** Ten-thousandths of a point as the two-place number a screen shows. */
export const toScore = (bp: number | null): number | null =>
  bp === null ? null : divideHalfUp(bp, 100) / 100;

/** What a scorecard's ratings come to, to two places, or `null`. */
export const scoreOfRatings = (ratings: readonly Rating[]): number | null =>
  toScore(scorecardBp(ratings));

export type ScoredInterview = {
  id: string;
  kind: string;
  status: string;
  scorecards: {
    interviewerId: string;
    submitted: boolean;
    recommendation: string | null;
    ratings: readonly Rating[];
  }[];
};

const COUNTED = new Set(["SCHEDULED", "COMPLETED"]);

export function summarise(
  interviews: readonly ScoredInterview[],
): ScoreSummary {
  const recommendations = { STRONG_YES: 0, YES: 0, NO: 0, STRONG_NO: 0 };
  const byCompetency = new Map<
    string,
    { name: string; weighted: number; total: number; ratings: number }
  >();
  let submitted = 0;

  const lines = interviews
    .filter((interview) => COUNTED.has(interview.status))
    .map((interview) => {
      const cards = interview.scorecards
        .filter((card) => card.submitted)
        .map((card) => {
          submitted += 1;
          if (card.recommendation && card.recommendation in recommendations) {
            recommendations[
              card.recommendation as keyof typeof recommendations
            ] += 1;
          }
          for (const rating of card.ratings) {
            const key = rating.competency.trim().toLowerCase();
            const entry = byCompetency.get(key) ?? {
              name: rating.competency.trim(),
              weighted: 0,
              total: 0,
              ratings: 0,
            };
            const weight = unitsOf(rating.weight);
            entry.weighted += rating.score * weight;
            entry.total += weight;
            entry.ratings += 1;
            byCompetency.set(key, entry);
          }
          const bp = scorecardBp(card.ratings);
          return {
            interviewerId: card.interviewerId,
            composite: toScore(bp),
            bp,
            recommendation: card.recommendation,
          };
        });
      const bp = meanBp(
        cards.flatMap((card) => (card.bp === null ? [] : [card.bp])),
      );
      return {
        interviewId: interview.id,
        kind: interview.kind,
        composite: toScore(bp),
        bp,
        scorecards: cards.map((card) => ({
          interviewerId: card.interviewerId,
          composite: card.composite,
          recommendation: card.recommendation,
        })),
      };
    });

  const overall = meanBp(
    lines.flatMap((line) => (line.bp === null ? [] : [line.bp])),
  );
  return {
    outOf: 5,
    composite: toScore(overall),
    interviews: lines.map((line) => ({
      interviewId: line.interviewId,
      kind: line.kind,
      composite: line.composite,
      scorecards: line.scorecards,
    })),
    recommendations,
    byCompetency: [...byCompetency.values()]
      .filter((entry) => entry.total > 0)
      .map((entry) => ({
        competency: entry.name,
        average:
          toScore(divideHalfUp(entry.weighted * SCALE, entry.total)) ?? 0,
        ratings: entry.ratings,
      }))
      .sort((a, b) => a.competency.localeCompare(b.competency)),
    scorecardsSubmitted: submitted,
  };
}
