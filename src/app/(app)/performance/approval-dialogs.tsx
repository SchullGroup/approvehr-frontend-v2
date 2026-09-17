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

export type ApprovalAct = "send_back" | "reject" | "revise";

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
  }
> = {
  send_back: {
    title: (title) => `Send "${title}" back?`,
    consequence:
      "They can change it and send it again. Nothing is agreed and nothing is refused: the objective carries the fact that somebody looked at it and asked for a change.",
    label: "Send it back",
    tone: "accent",
    help: "They will read this. Say what would make it agreeable.",
  },
  reject: {
    title: (title) => `Refuse "${title}"?`,
    consequence:
      "This is final. A refused objective cannot be sent again: the answer to one is a different objective, so the refusal stays on the record rather than being written over.",
    label: "Refuse it",
    tone: "danger",
    help: "This reason is the record of the refusal. Nothing else explains it later.",
  },
  revise: {
    title: (title) => `Reopen "${title}"?`,
    consequence:
      "The target stops being frozen and has to be agreed again. Who reopened it, when and why is recorded: a target that moved with no record of why is what makes a rating impossible to defend.",
    label: "Reopen it",
    tone: "accent",
    help: "Say what changed. This is the only account of why the target moved.",
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

        <Field label="Why" required help={spec.help}>
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
          <p
            role="status"
            className="rounded-md border border-danger-line bg-danger-soft px-3.5 py-2.5 text-body-sm text-ink"
          >
            {failed}
          </p>
        )}
      </div>
    </Modal>
  );
}
