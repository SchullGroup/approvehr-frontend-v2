"use client";

import { useEffect, useRef } from "react";
import { Undo2, X } from "lucide-react";
import { Button, IconButton, SuccessMoment } from "@/components/ui";
import type { LeaveRow } from "@/lib/api/leave";
import { useEmployeeLeaveBalances } from "@/lib/store/leave-api";
import { leaveDecidedCopy, type LeaveStage } from "./leave-decided-copy";

/** The decision somebody has just made, kept until the next one or until it is closed. */
export type LeaveDecision = {
  request: LeaveRow;
  stage: LeaveStage;
  /** Counts decisions, so a second approval of the same person is a new moment. */
  n: number;
};

/**
 * Approving leave, said back.
 *
 * It used to be a toast with a title and nothing else — "Chidi's leave
 * approved" — gone in six seconds, from a screen where the same person may
 * approve twenty. This stays, at the top of the list, until the next decision
 * replaces it or it is closed; carries the days and the dates, what that does to
 * the person's balance, and Undo in the one place somebody looks for it; and does
 * not say "approved" for a first approval that is still waiting on HR.
 *
 * The balance is read here, after the decision, rather than taken from the list
 * behind it: the list holds balances for the people it shows, which is not
 * necessarily this one, and a figure from before the decision would be a figure
 * from before.
 */
export function LeaveDecidedMoment({
  decision,
  onUndo,
  onDismiss,
}: {
  decision: LeaveDecision;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  /* The year the leave falls in, which is not always this one. */
  const { balances } = useEmployeeLeaveBalances(
    decision.request.employeeId,
    Number(decision.request.from.slice(0, 4)),
  );
  const surface = useRef<HTMLDivElement>(null);

  /* An approval can be made from a drawer, or from a row far down a long list;
     either way the answer is at the top. `nearest` does nothing when it is
     already in view. */
  useEffect(() => {
    surface.current?.scrollIntoView({ block: "nearest" });
  }, []);

  const copy = leaveDecidedCopy({
    request: decision.request,
    stage: decision.stage,
    balances,
  });

  return (
    <div
      ref={surface}
      className="relative scroll-mt-24 rounded-lg border border-success-line bg-surface p-5"
    >
      {/* Right padding clears the close button, which sits over the corner. */}
      <SuccessMoment
        compact
        className="pr-9"
        title={copy.title}
        lead={copy.lead}
        details={copy.details}
        actions={
          <Button variant="ghost" size="sm" onClick={onUndo}>
            <Undo2 aria-hidden="true" className="size-3.5" />
            Undo
          </Button>
        }
      />
      <IconButton
        label="Close"
        size="sm"
        onClick={onDismiss}
        className="absolute right-3 top-3"
      >
        <X aria-hidden="true" className="size-4" />
      </IconButton>
    </div>
  );
}
