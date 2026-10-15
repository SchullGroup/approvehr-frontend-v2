"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton, SuccessMoment } from "@/components/ui";

/**
 * A decision somebody has just made on company money, said back at the top of
 * the list they made it from.
 *
 * ## Why this exists
 *
 * Approving an expense claim, a loan or a pay-early request is the one thing in
 * those screens that commits company money, and it used to end in a toast with a
 * title and nothing else, gone in six seconds, from a queue where the same
 * person may approve twenty. This stays until the next decision replaces it or
 * it is closed, and carries the figure, what is now true, and what is left for
 * the approver to do.
 *
 * It is the same compact moment the leave screen uses (`LeaveDecidedMoment`),
 * without leave's Undo: none of these three can be taken back by the approver,
 * so there is no Undo to offer and the card says what happens next instead.
 *
 * ## Replaced, not stacked
 *
 * Callers give it a `key` that changes with each decision, so approving a
 * second claim is a new moment in the same place and not a second card. That
 * remount is also what scrolls it into view: an approval can be made from a row
 * far down a long list, and the answer is at the top. `nearest` does nothing
 * when it is already on screen.
 *
 * The writing is the caller's, and lives in a pure function beside each screen
 * so every sentence can be tested without rendering anything.
 */
export function DecidedCard({
  title,
  lead,
  details,
  actions,
  onDismiss,
}: {
  title: string;
  lead?: string;
  details?: string[];
  actions?: ReactNode;
  onDismiss: () => void;
}) {
  const surface = useRef<HTMLDivElement>(null);

  useEffect(() => {
    surface.current?.scrollIntoView({ block: "nearest" });
  }, []);

  return (
    <div
      ref={surface}
      className="relative scroll-mt-24 rounded-lg border border-success-line bg-surface p-5"
    >
      {/* Right padding clears the close button, which sits over the corner. */}
      <SuccessMoment
        compact
        className="pr-9"
        title={title}
        {...(lead ? { lead } : {})}
        {...(details ? { details } : {})}
        {...(actions ? { actions } : {})}
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
