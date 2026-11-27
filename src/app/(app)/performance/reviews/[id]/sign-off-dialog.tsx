"use client";

import { useState } from "react";
import { Button, Field, Modal, Textarea } from "@/components/ui";
import { ApiError } from "@/lib/api/client";

/**
 * Answering a rating: the one act the person it is about does for themselves.
 *
 * They record that they were shown it. **Acknowledging is not agreeing**, and
 * the screen that opens this says so once, behind the mark beside the button.
 * An acknowledgement that reads as consent is worth less than nothing to a
 * company defending a decision later, so that sentence is not dropped, only said
 * where it is read rather than again here.
 *
 * ## Disputing was here and is deliberately gone
 *
 * This dialog used to offer a second act: a formal "I do not accept this",
 * comment required, recorded beside a mark that did not move. It was removed
 * at the product owner's instruction and the whole write path went with it —
 * this dialog, the button that opened it, `useSignOff().dispute` and the API
 * wrapper.
 *
 * Two things follow, and neither is an oversight:
 *
 * - **`ApiReview.disputed` is still read, everywhere it was.** Reviews
 *   disputed before this change exist, and a record of what somebody formally
 *   refused to accept is the last thing a performance module should stop
 *   displaying. The badge, the line under the rating, the register filter and
 *   the cycle report all still show them. What is gone is the ability to raise
 *   a new one, which is exactly what was asked for.
 * - **The API still accepts `POST /performance/reviews/:id/dispute`.** Nothing
 *   in this product calls it, and a frontend cannot close an endpoint. Until
 *   the backend refuses it, the capability exists over the wire — see
 *   `docs/backend/no-employee-dispute.md`.
 *
 * The comment stays optional. Somebody with nothing to add should not have to
 * invent something to get past a form.
 *
 * ## It closes when it is done
 *
 * It used to turn into a four-line statement of what was recorded. What was
 * recorded is now one small line under the rating, with its date, so the dialog
 * is the question and nothing else: the optional comment and one button. The
 * caller says "Acknowledged" in a toast.
 */
export function SignOffDialog({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  /**
   * Records it. Resolves to whether it was, and a `false` is a failure the
   * caller has already said so in a toast. The dialog stays on its question.
   */
  onConfirm: (comment?: string) => Promise<boolean>;
}) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setFailed(null);
    try {
      const trimmed = comment.trim();
      const done = await onConfirm(trimmed.length > 0 ? trimmed : undefined);
      if (done) onClose();
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
      open
      onClose={onClose}
      title="Acknowledge this rating"
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="approve"
            loading={busy}
            onClick={() => void submit()}
          >
            I have seen this
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Anything to add (optional)">
          <Textarea
            rows={3}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
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
