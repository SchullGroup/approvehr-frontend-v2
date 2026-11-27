"use client";

import { useState } from "react";
import { Button, Field, Modal, Textarea } from "@/components/ui";
import { ApiError } from "@/lib/api/client";

/**
 * The reason on an approval decision.
 *
 * Two of the moves on an objective require one: declining it, and reopening an
 * agreed target. One dialog serves both because the *requirement* is the same:
 * without a reason the record says that somebody said no and nothing about why,
 * which is not feedback and is not evidence either. What differs is the
 * question in the title and the word on the button, and that is all there is to
 * read: the consequence is what the title already says, and the person who
 * wrote the objective sees the reason where they read the rest.
 *
 * The API's floor is three characters. This asks for the same and no more: a
 * longer minimum invented here would refuse something the server accepts, and a
 * shorter one would show a refusal that arrives from the server instead.
 */

const MIN_REASON = 3;

export type ApprovalAct = "decline" | "revise";

/** What each act is called, as the question and as the button. */
const ACTS: Record<
  ApprovalAct,
  {
    title: (title: string) => string;
    label: string;
    /** Green is the approval colour, so neither of these carries it. */
    tone: "accent" | "danger";
    /** The field's label; "Why" unless the act calls it something else. */
    field?: string;
  }
> = {
  /* The queue's one way to say no (owner, 24 Nov 2026): the objective goes back
     to whoever wrote it, who can change it and send it again. */
  decline: {
    title: (title) => `Decline "${title}"?`,
    label: "Decline",
    tone: "accent",
    field: "Feedback",
  },
  revise: {
    title: (title) => `Reopen "${title}"?`,
    label: "Reopen it",
    tone: "accent",
  },
};

export function ApprovalReasonDialog({
  act: actProp,
  goalTitle: goalTitleProp,
  open,
  onClose,
  onConfirm,
}: {
  /** `null` while closed — see the freeze below for why. */
  act: ApprovalAct | null;
  /** `null` while closed — see the freeze below for why. */
  goalTitle: string | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  /* Remembers the last real act and title: the caller clears its props to
     null the instant it closes this, but the modal has to stay mounted with
     real content so `Modal` below can animate its own close off the real
     `open`. */
  const [act, setAct] = useState(actProp);
  if (actProp && actProp !== act) setAct(actProp);
  const [goalTitle, setGoalTitle] = useState(goalTitleProp);
  if (goalTitleProp && goalTitleProp !== goalTitle) setGoalTitle(goalTitleProp);

  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  /* Blank on every open: the dialog stays mounted for its exit, and the
     feedback typed for one objective must never be offered for the next. */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setReason("");
      setFailed(null);
    }
  }

  if (!act || goalTitle === null) return null;

  const spec = ACTS[act];
  const ready = reason.trim().length >= MIN_REASON;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setFailed(null);
    try {
      await onConfirm(reason.trim());
    } catch (error) {
      setFailed(
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={spec.title(goalTitle)}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={spec.tone}
            loading={busy}
            disabled={!ready}
            onClick={() => void submit()}
          >
            {spec.label}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={spec.field ?? "Why"} required>
          <Textarea
            rows={4}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>

        {failed && (
          <p role="status" className="text-body-sm text-danger-text">
            {failed}
          </p>
        )}
      </div>
    </Modal>
  );
}
