"use client";

import { useState } from "react";
import { Button, Modal, SuccessMoment, useToast } from "@/components/ui";
import type { ApiGoal, ApiObjectiveSubmitted } from "@/lib/api/performance";
import { sentToAgreeCopy, type MomentCopy } from "./objective-copy";

/**
 * Sending an objective to be agreed: the confirmation, and then what it did.
 *
 * It used to be a confirmation that closed on success with a toast reading
 * `"X" sent to be agreed`. What is worth saying was not in it: that the target
 * is now out of the sender's hands, how many people it went to, and that
 * agreement will freeze it. So the dialog stays after the write and turns into
 * that statement, the same way the resignation dialog does, and closes on
 * "Done".
 *
 * ## The case it does not celebrate
 *
 * If the API addressed it to nobody else, the dialog closes and says so in a
 * warning toast instead of drawing a check. See `sentToAgreeCopy`.
 *
 * ## No second announcement
 *
 * The caller's `send` must not toast a success of its own: this decides between
 * the moment and the notice. Failures stay as the caller's toast, and leave the
 * dialog on the question so it can be tried again.
 */
export function SendForAgreementDialog({
  goal,
  viewerId,
  send,
  onClose,
}: {
  /** The objective being sent, or null while closed. */
  goal: ApiGoal | null;
  viewerId: string | null;
  /**
   * Does the write. Resolves to the API's answer — `undefined` in demo mode,
   * where there is none — or `null` when it failed and the caller has said so.
   */
  send: (goal: ApiGoal) => Promise<{
    value: ApiObjectiveSubmitted | undefined;
  } | null>;
  onClose: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  /* What it said, kept for as long as the dialog stays open on it. */
  const [sent, setSent] = useState<MomentCopy | null>(null);

  /* The dialog stays mounted for its exit, long after the caller has cleared
     `goal`, so the title and the body read the last real one. */
  const [shown, setShown] = useState(goal);
  if (goal && goal !== shown) setShown(goal);

  /* A fresh question each time it is opened after one was sent. */
  const open = goal !== null;
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && sent) setSent(null);
  }

  if (!shown) return null;

  const submit = async () => {
    setBusy(true);
    try {
      const outcome = await send(shown);
      if (!outcome) return;
      const answered = outcome.value?.sentTo;
      const result = sentToAgreeCopy({
        goal: shown,
        sentTo: Array.isArray(answered) ? answered : undefined,
        viewerId,
      });
      if (result.kind === "notice") {
        toast.push({
          title: result.said.title,
          tone: result.said.tone ?? "success",
          ...(result.said.detail ? { detail: result.said.detail } : {}),
        });
        onClose();
        return;
      }
      setSent(result.copy);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={sent ? "Sent to be agreed" : `Send "${shown.title}" to be agreed?`}
      size="sm"
      footer={
        sent ? undefined : (
          <>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={busy}
              onClick={() => void submit()}
            >
              Send it
            </Button>
          </>
        )
      }
    >
      {sent ? (
        <SuccessMoment
          /* Under the dialog's own `h2`, not beside it. */
          headingLevel={3}
          align="center"
          /* The button that was just pressed has left with the footer, so
             focus goes to what replaced it. */
          focusHeading
          title={sent.title}
          lead={sent.lead}
          details={sent.details}
          actions={
            <Button variant="accent" onClick={onClose}>
              Done
            </Button>
          }
        />
      ) : (
        <div className="text-body-sm leading-relaxed text-body">
          {/* What is worth confirming is not the sending — that can be sent
              back. It is what agreement does, because the next press is
              somebody else's and there is no dialog in front of that one: the
              target freezes and a measure can no longer be added at all.
              Anybody who still means to add one has to know before this click
              rather than after theirs. */}
          <p>
            {shown.ownerName
              ? `It goes to whoever agrees ${shown.ownerName}'s objectives — their manager, or somebody who can edit records. Nobody agrees their own.`
              : "It goes to somebody who can agree it. Nobody agrees their own."}
          </p>
          <p className="mt-2">
            Once it is agreed the target is fixed: the title, the period and
            every measure&rsquo;s target stop moving, and no new measure can be
            added. Progress still moves. Changing what was asked for after that
            takes a recorded revision.
          </p>
          {shown.keyResults.length === 0 && (
            <p className="mt-2 text-warning-text">
              It has no measure on it, so it will be scored on a figure somebody
              states by hand. Add one first if it should be measured.
            </p>
          )}
          {shown.reviewCycleId === null && (
            <p className="mt-2 text-warning-text">
              It is not in an appraisal period, so agreeing it counts towards
              nobody&rsquo;s mark — and the period is one of the fields that
              freezes, so it cannot be added afterwards.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
