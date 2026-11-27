import type { ApiReviewFlags, ReviewCycleStage } from "@/lib/api/performance";
import { flaggedCount } from "./people-to-review";

const marks = (n: number) => `${String(n)} ${n === 1 ? "score" : "scores"}`;

/**
 * How many flagged scores still wait for a decision before the period can be
 * published, or 0. Only meaningful at calibration, which is where decisions are
 * made; at any other stage nothing is "waiting" yet.
 */
export function undecidedScores(
  flags: ApiReviewFlags | null,
  stage: ReviewCycleStage | null,
): number {
  if (!flags || stage !== "CALIBRATION") return 0;
  if (!flaggedCount(flags)) return 0;
  return flags.counts.open + flags.counts.waiting;
}

/**
 * Why the period cannot be published yet, or null. Mirrors `publishBlocker` in
 * the backend's review-flags module, which is the authority: publishing is
 * refused there whatever this says.
 */
export function publishLock(
  flags: ApiReviewFlags | null,
  stage: ReviewCycleStage | null,
): string | null {
  if (!flags) return null;
  const flagged = flaggedCount(flags);
  if (!flagged) return null;
  if (stage !== "CALIBRATION")
    return `The fairness check flagged ${marks(flagged)}. Move the period to score review and decide on ${flagged === 1 ? "it" : "each one"} before publishing.`;
  const undecided = undecidedScores(flags, stage);
  if (!undecided) return null;
  return `${marks(undecided)} flagged by the fairness check still ${undecided === 1 ? "needs" : "need"} a decision.`;
}
