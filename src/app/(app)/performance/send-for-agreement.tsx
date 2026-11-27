"use client";

import { useState } from "react";
import { Button, Modal, SuccessMoment, useToast } from "@/components/ui";
import type { ApiGoal, ApiObjectiveSubmitted } from "@/lib/api/performance";
import { sentToAgreeCopy, type MomentCopy } from "./objective-copy";

/**
 * What an objective lacks that a person sending it may not have noticed, in one
 * neutral line, or null when it lacks neither.
 */
export function missingWords(
  goal: Pick<ApiGoal, "keyResults" | "reviewCycleId" | "childCount">,
): string | null {
  /* One with objectives under it is measured by them, so it is not short of a
     target. */
  const noTarget = goal.keyResults.length === 0 && (goal.childCount ?? 0) === 0;
  const noPeriod = goal.reviewCycleId === null;
  if (noTarget && noPeriod) return "No target and no appraisal period yet.";
  if (noTarget) return "No target yet.";
  if (noPeriod) return "No appraisal period yet.";
  return null;
}

/**
 * Sending an objective to be agreed: the confirmation, and then what it did.
 *
 * It used to be a confirmation that closed on success with a toast reading
 * `"X" sent to be agreed`. What is worth saying was not in it: how many people
 * it went to. So the dialog stays after the write and turns into that
 * statement, the same way the resignation dialog does, and closes on "Done".
 *
 * ## The question is the title
 *
 * Sending is reversible, since it can be sent back, so the dialog asks the
 * question and nothing else: no account of who agrees it and no restating of
 * what agreement fixes. The one line it may carry is a fact about what the
 * objective lacks (no target, no period), said neutrally and only when true.
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

  /* One neutral line, and only when something is missing. It is a fact about
     the objective and not a reason to stop: an objective with children under
     it is measured by them, and a shared one need not belong to a period. */
  const missing = missingWords(shown);

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
      ) : missing ? (
        <p className="text-body-sm text-muted">{missing}</p>
      ) : null}
    </Modal>
  );
}
