"use client";

import { useState } from "react";
import {
  Button,
  Callout,
  Field,
  Modal,
  Select,
  TextLink,
  Textarea,
} from "@/components/ui";
import type { RejectionReason } from "@/lib/hiring/pipeline/model";

/**
 * Turning somebody down, with a reason from the company's own list.
 *
 * One dialog for one person and for forty. Both ask the same two things: why
 * (one of the reasons the company set up, so a year of rejections can be read
 * as a pattern rather than as free text), and an optional note.
 *
 * ## It is a person's decision
 *
 * Nothing here says the system rejected anybody. The words are "You are
 * rejecting", the reason is theirs, and the record carries their name.
 *
 * ## Nothing is sent unless somebody says so
 *
 * Rejecting records a decision. It does not email anyone. A decline email is a
 * separate, explicit tick in this dialog — off every time it opens — and it only
 * appears when the server can send one.
 */

export type RejectChoice = {
  reasonId: string;
  note: string | null;
};

export function RejectDialog({
  open,
  onClose,
  subject,
  reasons,
  busy = false,
  error = null,
  onConfirm,
  extra,
  title,
  confirmLabel = "Reject",
}: {
  open: boolean;
  onClose: () => void;
  /** Who, in words: "Ada Okafor" or "42 people". */
  subject: string;
  reasons: readonly RejectionReason[];
  busy?: boolean;
  /** The last refusal, in the API's words. */
  error?: string | null;
  onConfirm: (choice: RejectChoice) => void;
  /** Anything that belongs under the note: the decline-email choice. */
  extra?: React.ReactNode;
  /** The screen's own word for it, where it is not "reject": the queue turns people down. */
  title?: string;
  confirmLabel?: string;
}) {
  const [reasonId, setReasonId] = useState("");
  const [note, setNote] = useState("");
  const [wasOpen, setWasOpen] = useState(false);

  /* Each time it opens it starts blank. Derived while rendering rather than in
     an effect, so there is no frame showing the last person's note. */
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setReasonId("");
      setNote("");
    }
  }

  const active = reasons.filter((reason) => reason.active);
  const none = active.length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={title ?? `Reject ${subject}?`}
      description="The decision is yours and is recorded under your name, with the reason you choose."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={none || reasonId === ""}
            onClick={() =>
              onConfirm({
                reasonId,
                note: note.trim() === "" ? null : note.trim(),
              })
            }
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {none ? (
          <Callout tone="warning" title="There are no reasons to choose from">
            The company has not set any up, or has switched them all off. Add
            some in{" "}
            <TextLink href="/hiring/settings/rejection-reasons">
              Hiring settings
            </TextLink>
            , then come back.
          </Callout>
        ) : (
          <Field label="Reason" required>
            <Select
              value={reasonId}
              onChange={(event) => setReasonId(event.target.value)}
            >
              <option value="">Choose a reason</option>
              {active.map((reason) => (
                <option key={reason.id} value={reason.id}>
                  {reason.label}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field
          label="Note"
          optional
          help="Only your team sees this. It is not sent to the person."
        >
          <Textarea
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>

        {extra}

        {error && (
          <p role="alert" className="text-body-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
