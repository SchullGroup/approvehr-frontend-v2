"use client";

import { Check, Send } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * The Approve step's footer buttons (U78, PAY-22).
 *
 * Entering this step used to email the approvers on its own, so a preparer who
 * pressed Continue only to look had already asked for approval, and nothing on
 * the screen said so. Asking is now its own button, "Send for approval", which
 * the preparer presses when the run is ready. A preparer who cannot approve
 * sees only that, not a greyed Approve; one who can approve sees Approve alone.
 */
export function ApproveActions({
  settled,
  canApprove,
  canPrepare,
  canSend,
  ready,
  busy,
  onApprove,
  onSend,
}: {
  /** Approved or paid: nothing to press here. */
  settled: boolean;
  canApprove: boolean;
  canPrepare: boolean;
  /** Asking needs the server; there is nobody to tell offline. */
  canSend: boolean;
  /** A run exists and nothing blocks it. */
  ready: boolean;
  busy: "approve" | "send" | null;
  onApprove: () => void;
  onSend: () => void;
}) {
  if (settled) return null;
  /* Only somebody who cannot approve is asked to send it on: whoever holds the approval permission approves
     the run themselves, and a "Send for approval" beside Approve would be asking somebody else to do what
     they can do now. */
  const offersSend = canPrepare && canSend && !canApprove;
  /* Approve is offered only to somebody who can approve. A reader who can
     neither approve nor send sees neither, not a button that can only fail. */
  const offersApprove = canApprove;
  return (
    <span className="flex flex-wrap items-center gap-2">
      {offersSend && (
        <Button
          variant="accent"
          className="max-sm:min-h-11"
          onClick={onSend}
          loading={busy === "send"}
          disabled={!ready || busy !== null}
        >
          {busy !== "send" && <Send aria-hidden="true" className="size-4" />}
          Send for approval
        </Button>
      )}
      {offersApprove && (
        <Button
          variant="approve"
          className="max-sm:min-h-11"
          onClick={onApprove}
          loading={busy === "approve"}
          disabled={!ready || busy !== null}
        >
          {busy !== "approve" && (
            <Check aria-hidden="true" className="size-4" />
          )}
          Approve this run
        </Button>
      )}
    </span>
  );
}

/** What the preparer is told after asking: how many were told, by the server's count. */
export function sentForApprovalDetail(told: number): string {
  if (told === 1) return "1 approver was told.";
  if (told > 1) return `${String(told)} approvers were told.`;
  return "Nobody new was told: anybody told before now sees these figures.";
}
