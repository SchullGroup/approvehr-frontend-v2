"use client";

import { useState } from "react";
import { Button, Field, Modal, Textarea } from "@/components/ui";
import { ApiError } from "@/lib/api/client";

/**
 * The reason on an approval decision.
 *
 * Three of the five moves on an objective require one — sending it back,
 * refusing it, and reopening an agreed target — and one dialog serves all three
 * because the *requirement* is the same in each: without a reason the record says
 * that somebody said no and nothing about why, which is not feedback and is not
 * evidence either. What differs is the consequence, and that is a prop, because
 * the sentence a person reads before they commit is the only place the difference
 * shows up.
 *
 * The API's floor is three characters. This asks for the same and no more: a
 * longer minimum invented here would refuse something the server accepts, and a
 * shorter one would show a refusal that arrives from the server instead.
 */

const MIN_REASON = 3;

export type ApprovalAct = "send_back" | "decline" | "reject" | "revise";

/** What each act does, in the words the person deciding needs before they click. */
const ACTS: Record<
  ApprovalAct,
  {
    title: (title: string) => string;
    consequence: string;
    label: string;
    /** Green is the approval colour, so none of these three carry it. */
    tone: "accent" | "danger";
    help: string;
    /** The field's label; "Why" unless the act calls it something else. */
    field?: string;
  }
> = {
  send_back: {
    title: (title) => `Send "${title}" back?`,
    consequence:
      "They can change it and send it again. Nothing is agreed or refused yet. The objective just records that you looked at it and asked for a change.",
    label: "Send it back",
    tone: "accent",
    help: "They will read this. Say what would make it agreeable.",
  },
  /* The queue's one way to say no (owner, 24 Nov 2026). The same send-back as
     above, worded as the button the approver pressed: the objective goes back
     to whoever wrote it, who can change it and send it again. */
  decline: {
    title: (title) => `Decline "${title}"?`,
    consequence:
      "It goes back to whoever wrote it, with your feedback. They can change it and send it again, and it comes back here.",
    label: "Decline",
    tone: "accent",
    help: "They will read this. Say what would make it agreeable.",
    field: "Feedback",
  },
  reject: {
    title: (title) => `Refuse "${title}"?`,
    consequence:
      "This is final. A refused objective cannot be sent again. If it should be done differently, they need to create a new objective, and the refusal stays on record.",
    label: "Refuse it",
    tone: "danger",
    help: "This reason is the only record of why it was refused.",
  },
  revise: {
    title: (title) => `Reopen "${title}"?`,
    consequence:
      "The objective can be changed again, but it has to be agreed again afterwards. Who reopened it, when and why is recorded.",
    label: "Reopen it",
    tone: "accent",
    help: "Say what changed. This is the only record of why the objective changed.",
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
        <p className="text-body-sm leading-relaxed text-body">
          {spec.consequence}
        </p>

        <Field label={spec.field ?? "Why"} required help={spec.help}>
          <Textarea
            rows={4}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>

        {!ready && reason.length > 0 && (
          <p className="text-body-sm text-body">
            Say why in a few words. The person who wrote this will read it.
          </p>
        )}

        {failed && (
          <p role="status" className="text-body-sm text-danger-text">
            {failed}
          </p>
        )}
      </div>
    </Modal>
  );
}
