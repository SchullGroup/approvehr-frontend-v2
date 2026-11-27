import type { ReviewCycleStage } from "@/lib/api/performance";

/**
 * Moving a running period to its next stage, and what is honestly said about it.
 *
 * ## What a stage move actually does
 *
 * Less than its buttons implied. Answering a review is allowed in **any running
 * stage** (`assertMayAnswer` on the API), so a button that said "Open manager
 * reviews" opened nothing: managers could already write. And the toast after the
 * move into the score review ("Nothing more is asked of anyone") was false while
 * reviews were still unsent, because those can still be sent until the results
 * are shared. The buttons are "Move to manager review" and "Move to score review"
 * for that reason: they name the act, and they ask first.
 *
 * What a move does do: it changes the stage everybody sees, it **stops new
 * objectives being added or agreed** for the period, and it cannot be undone
 * ("A cycle cannot go back ... People have already answered against where it
 * is now"). Those are the three things said, before the press and after it.
 *
 * `PUBLISHED` is deliberately not a destination here: sharing the results is its
 * own act with its own confirmation, and the API refuses `stage: PUBLISHED`.
 */
export const STAGE_AFTER: Partial<Record<ReviewCycleStage, ReviewCycleStage>> =
  {
    SELF: "MANAGER",
    MANAGER: "CALIBRATION",
  };

export type StageMoveTarget = "MANAGER" | "CALIBRATION";

export type StageMoveWords = {
  /** The button. A verb phrase, so it does not read like a link. */
  button: string;
  title: string;
  confirm: string;
  body: string;
  /** What the toast says once it has happened. */
  done: { title: (period: string) => string; detail: string };
};

const LASTS =
  "Nobody can add or agree objectives for this period from then on. It cannot be moved back.";

export const STAGE_MOVE: Record<StageMoveTarget, StageMoveWords> = {
  MANAGER: {
    button: "Move to manager review",
    title: "Move to manager review?",
    confirm: "Move it",
    body: `Managers can already write their reviews in any running period, so this opens nothing new. It changes the stage everybody sees. ${LASTS}`,
    done: {
      title: (period) => `${period} moved to manager review`,
      detail: "The stage is now manager review. Reviews already sent are kept.",
    },
  },
  CALIBRATION: {
    button: "Move to score review",
    title: "Move to score review?",
    confirm: "Move it",
    body: `Reviews not yet sent can still be sent, and nothing is shared with anybody until you share the results. ${LASTS}`,
    done: {
      title: (period) => `${period} moved to score review`,
      detail:
        "Reviews not yet sent can still be sent. Nothing is shared until you share the results.",
    },
  },
};

/** The words for moving a period out of `stage`, or null when there is no move. */
export function moveWordsFor(stage: ReviewCycleStage): StageMoveWords | null {
  const next = STAGE_AFTER[stage];
  return next === "MANAGER" || next === "CALIBRATION" ? STAGE_MOVE[next] : null;
}
