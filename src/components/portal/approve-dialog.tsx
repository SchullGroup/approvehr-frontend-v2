"use client";

import { useState } from "react";
import { Button, Field, Modal, Textarea } from "@/components/ui";

/**
 * Approve something, with a note if there is one to leave.
 *
 * The other half of `DeclineDialog`, and deliberately the same shape: a title, one
 * sentence of what is about to happen, one field, two buttons. Declining has to say
 * why and approving does not, so the note here is **optional** and an empty one is a
 * plain approval. What it asks for is the point of the dialog: a manager who
 * approves with "covered by Kemi that week" has said something HR, who decide the
 * second step, would otherwise have to ask.
 *
 * A refusal from the server is shown **in the dialog and the dialog stays open**,
 * with what was typed still there: `onConfirm` throws and the sentence is its
 * message. Closing on a failure would throw away the note and report the failure
 * somewhere the person is no longer looking.
 */
export function ApproveDialog({
  open,
  what,
  maxLength,
  onClose,
  onConfirm,
}: {
  open: boolean;
  /** What is being approved, named in the sentence the approver reads. */
  what: string;
  /** The server's limit on a note, so the field says so before it refuses. */
  maxLength?: number;
  onClose: () => void;
  /** Receives the note, or `undefined` when there is none. Throw to refuse. */
  onConfirm: (note: string | undefined) => Promise<void> | void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setNote("");
    setError(null);
    onClose();
  }

  async function confirm() {
    setBusy(true);
    try {
      const trimmed = note.trim();
      await onConfirm(trimmed.length > 0 ? trimmed : undefined);
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
      title="Approve"
      description={`Approving “${what}”. A note is optional and is kept with the decision.`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="approve"
            onClick={() => void confirm()}
            loading={busy}
          >
            Approve
          </Button>
        </div>
      }
    >
      <Field label="Note" optional error={error ?? undefined}>
        <Textarea
          rows={3}
          value={note}
          {...(maxLength ? { maxLength } : {})}
          placeholder="Covered by Kemi that week."
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
