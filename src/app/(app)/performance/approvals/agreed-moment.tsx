"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { IconButton, SuccessMoment } from "@/components/ui";
import type { ApiGoal } from "@/lib/api/performance";
import { agreedCopy } from "../objective-copy";

/** The agreement somebody has just made, kept until the next decision or until it is closed. */
export type Agreement = {
  goal: ApiGoal;
  /** Counts agreements, so a second one is a new moment and not the same one. */
  n: number;
};

/**
 * Agreeing an objective, said back.
 *
 * It was a toast reading `"X" agreed` — gone in six seconds, from a screen
 * where the same person may agree a dozen, and silent about the one thing that
 * agreeing does: it fixes the target. This stays above the queue, in the place
 * the card it answers has just left, until the next decision replaces it or it
 * is closed.
 *
 * There is no Undo, because there is none to offer: the only way back through a
 * frozen target is a revision, which asks for a reason and belongs on the
 * objective rather than on a button beside a confirmation.
 *
 * It does not say the owner was told. The API notifies them and does not report
 * whether it reached them.
 */
export function AgreedMoment({
  agreement,
  onDismiss,
}: {
  agreement: Agreement;
  onDismiss: () => void;
}) {
  const surface = useRef<HTMLDivElement>(null);

  /* Agreed from a card far down a long queue, the answer is at the top.
     `nearest` does nothing when it is already in view. */
  useEffect(() => {
    surface.current?.scrollIntoView({ block: "nearest" });
  }, []);

  const copy = agreedCopy(agreement.goal);

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
