"use client";

import { useState } from "react";
import { Button, Field, Modal, Textarea } from "@/components/ui";

/**
 * Keeping somebody in the running, with a reason.
 *
 * The pass mark flagged them; a person who reads their application and thinks they
 * should stay is allowed to say so, and the reason is required because it is kept
 * and audited: "why was this person kept when their score was low" is a fair
 * question a year later, and the answer should be in the record.
 */

export const KEEP_MIN = 3;

export function KeepDialog({
  open,
  onClose,
  name,
  busy,
  error,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  busy: boolean;
  error: string | null;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [wasOpen, setWasOpen] = useState(false);

  /* Starts blank each time, derived while rendering so there is no frame showing
     the last person's reason. */
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setReason("");
  }

  const trimmed = reason.trim();
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={`Keep ${name} in the running?`}
      description="They come off this list and stay with the other applicants to be read. Your reason is kept with your name."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={busy}
            disabled={trimmed.length < KEEP_MIN}
            onClick={() => onConfirm(trimmed)}
          >
            Keep in the running
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field
          label="Why they stay"
          required
          help="A few words. For example: strong portfolio, the CV undersells them."
        >
          <Textarea
            rows={3}
            maxLength={300}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        {error && (
          <p role="alert" className="text-body-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
