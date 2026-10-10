"use client";

import { useState } from "react";
import { Button, Field, Modal, Textarea } from "@/components/ui";

const COPY = {
  requester: {
    title: "Send it back",
    description: (what: string) =>
      `${what} goes back to them. They see what you write here.`,
    placeholder: "Two people are already off that week. Can you move it?",
    missing: "Write a line so they know what to change.",
  },
  record: {
    title: "Decline",
    description: (what: string) =>
      `Declining “${what}”. What you write here is kept with the decision.`,
    placeholder: "We stay open on Workers' Day and pay the holiday rate.",
    missing: "Write a line so whoever looks at this later knows why.",
  },
} as const;

/**
 * Ask why, before sending something back.
 *
 * The API refuses a decline with no note — `POST /leave/requests/:id/decide`
 * and `POST /approvals/:id/decide` both answer "Say why, so they know what to
 * change." That refusal is right, and the way to honour it is to ask before
 * sending rather than to report a validation error afterwards, or to paper over
 * it with a canned note like "Sent back from the approvals inbox", which is what
 * both screens used to do. A reason nobody wrote is a reason nobody can act on.
 *
 * Shared by `/people/leave` and `/approvals` because it is the same decision in
 * two places — the same reason those two screens read one store.
 */
export function DeclineDialog({
  open,
  what,
  reader = "requester",
  onClose,
  onConfirm,
}: {
  open: boolean;
  /** What is going back, named in the sentence the approver reads. */
  what: string;
  /** `record` when nobody raised the row, so the note is kept rather than sent. */
  reader?: "requester" | "record";
  onClose: () => void;
  onConfirm: (note: string) => Promise<void> | void;
}) {
  const copy = COPY[reader];
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setNote("");
    setError(null);
    onClose();
  }

  async function confirm() {
    const reason = note.trim();
    if (reason.length === 0) {
      setError(copy.missing);
      return;
    }
    setBusy(true);
    try {
      await onConfirm(reason);
      setNote("");
      setError(null);
      onClose();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "That did not work.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={copy.title}
      description={copy.description(what)}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="accent"
            onClick={() => void confirm()}
            loading={busy}
          >
            {copy.title}
          </Button>
        </div>
      }
    >
      <Field label="Why" required error={error ?? undefined}>
        <Textarea
          rows={3}
          value={note}
          placeholder={copy.placeholder}
          onChange={(e) => {
            const next = e.target.value;
            setNote(next);
            setError(null);
          }}
        />
      </Field>
    </Modal>
  );
}
