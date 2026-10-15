import type { LeaveRow, LeaveRowStatus } from "@/lib/api/leave";

/**
 * What a leave row offers the person reading it.
 *
 * Kept apart from the screen because the rule is the whole fix and is worth
 * testing without rendering a table three ways (desktop row, narrow list,
 * drawer), which is where it used to be written three times.
 *
 * ## Open means two statuses, not one
 *
 * `pending` is waiting on a first decision. `awaitingHr` is waiting on the
 * second: a department head has said yes, and somebody holding
 * `APPROVE_LEAVE_ALL` has to finish it. Both are *open*, and an open request
 * is decided, not undone. The screen used to test `status === "pending"` and
 * give everything else Undo, so for HR a request that was with HR offered only
 * "Undo" — which reopens it and wipes the department head's approval — while
 * the API would have taken Approve or Send back from them the whole time.
 *
 * ## Your own is nobody's to decide
 *
 * The API refuses a decision on your own request, whatever you hold ("You
 * cannot decide your own leave request. Somebody else has to."), and `reopen`
 * is the same check, so Undo on your own decided request fails the same way.
 * A button that can only produce that toast is not offered.
 */
export type LeaveRowActions =
  /** Approve and Send back. */
  | "decide"
  /** Take a decision back. Reopens the request, first approval included. */
  | "undo"
  /** Open, and the reader's own: a quiet line, not a button that fails. */
  | "somebodyElse"
  /** Nothing to offer. */
  | "none";

/** Still waiting on somebody — either step of the workflow. */
export const isOpen = (status: LeaveRowStatus): boolean =>
  status === "pending" || status === "awaitingHr";

export function leaveRowActions({
  status,
  canDecide,
  isOwn,
}: {
  status: LeaveRowStatus;
  /** Holds `APPROVE_LEAVE_ALL`. */
  canDecide: boolean;
  /** The request is the signed-in person's own. */
  isOwn: boolean;
}): LeaveRowActions {
  if (!canDecide) return "none";
  if (isOwn) return isOpen(status) ? "somebodyElse" : "none";
  return isOpen(status) ? "decide" : "undo";
}

/**
 * The "Waiting on a decision" tile.
 *
 * For somebody who can decide, both open statuses are waiting on them — a
 * request with HR is exactly as much theirs to do as a fresh one, and the tile
 * counted only the fresh ones (3, when 5 needed them). For everybody else the
 * screen shows only their own requests and the figure is unchanged: `pending`
 * alone, which is what it always said.
 *
 * `oldestDays` is whole days since the oldest of those was raised, from
 * `today` (`YYYY-MM-DD`, in the company's own zone), or null when none carries
 * a date.
 */
export function waitingOnDecision(
  requests: readonly Pick<LeaveRow, "status" | "requestedAt">[],
  canDecide: boolean,
  today: string,
): { count: number; oldestDays: number | null } {
  const waiting = requests.filter((r) =>
    canDecide ? isOpen(r.status) : r.status === "pending",
  );
  const oldestDays = waiting.reduce<number | null>((oldest, r) => {
    if (!r.requestedAt) return oldest;
    const days = Math.max(
      0,
      Math.round(
        (new Date(today).getTime() - new Date(r.requestedAt).getTime()) /
          86_400_000,
      ),
    );
    return oldest === null || days > oldest ? days : oldest;
  }, null);
  return { count: waiting.length, oldestDays };
}
