import type { ReviewCycleStage } from "@/lib/api/performance";

/**
 * Moving a running period to its next stage, and what is honestly said about it.
 *
 * ## What a stage move actually does
 *
 * Less than its buttons implied. Answering a review is allowed in **any running
 * stage** (`assertMayAnswer` on the API), so the move to manager reviews opens
 * nothing: managers could already write. And "nothing more is asked of anyone"
 * was false while reviews were still unsent, because those can still be sent
 * until the results are shared.
 *
 * What a move does do: it changes the stage everybody sees, it **stops new
 * objectives being added or agreed** for the period, and it cannot be undone
 * ("A cycle cannot go back ... People have already answered against where it
 * is now"). The move asks first and says those last two; the toast afterwards
 * says only that it happened.
 *
 * `PUBLISHED` is deliberately not a destination here: sharing the results is its
 * own act with its own confirmation, and the API refuses `stage: PUBLISHED`.
 */
export type StageMoveTarget = "MANAGER" | "CALIBRATION";

export const STAGE_AFTER: Partial<Record<ReviewCycleStage, StageMoveTarget>> = {
  SELF: "MANAGER",
  MANAGER: "CALIBRATION",
};

export type StageMoveWords = {
  /** The button. A verb phrase, so it does not read like a link. */
  button: string;
  title: string;
  confirm: string;
  body: string;
  /** What the toast says once it has happened. */
  done: (period: string) => string;
};

const LASTS =
  "Nobody can add or agree objectives for this period from then on. It cannot be moved back.";

export const STAGE_MOVE: Record<StageMoveTarget, StageMoveWords> = {
  MANAGER: {
    button: "Open manager reviews",
    title: "Open manager reviews?",
    confirm: "Move it",
    body: LASTS,
    done: (period) => `${period} moved to manager reviews`,
  },
  CALIBRATION: {
    button: "Move to score review",
    title: "Move to score review?",
    confirm: "Move it",
    body: LASTS,
    done: (period) => `${period} moved to score review`,
  },
};

/** The words for moving a period out of `stage`, or null when there is no move. */
export function moveWordsFor(stage: ReviewCycleStage): StageMoveWords | null {
  const next = STAGE_AFTER[stage];
  return next ? STAGE_MOVE[next] : null;
}
