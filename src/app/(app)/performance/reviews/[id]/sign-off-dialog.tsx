"use client";

import { useState } from "react";
import { Button, Field, Modal, Textarea } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiReview } from "@/lib/api/performance";

/**
 * The employee's answer to their own rating.
 *
 * One act: they record that they were shown it. **Acknowledging is not
 * agreeing**, and every line of copy here keeps those apart. An
 * acknowledgement that reads as consent is worth less than nothing to a
 * company defending a decision later — the employee can say they only ticked a
 * box, and they would be right.
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
 *   displaying. The badge, the answer card, the register filter and the cycle
 *   report all still show them. What is gone is the ability to raise a new
 *   one, which is exactly what was asked for.
 * - **The API still accepts `POST /performance/reviews/:id/dispute`.** Nothing
 *   in this product calls it, and a frontend cannot close an endpoint. Until
 *   the backend refuses it, the capability exists over the wire — see
 *   `docs/backend/no-employee-dispute.md`.
 *
 * The comment stays optional. Somebody with nothing to add should not have to
 * invent something to get past a form, and with disputing gone there is no
 * longer a second act whose comment was compulsory.
 */
export function SignOffDialog({
  review,
  onClose,
  onConfirm,
}: {
  review: ApiReview;
  onClose: () => void;
  onConfirm: (comment?: string) => Promise<void>;
}) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setFailed(null);
    try {
      const trimmed = comment.trim();
      await onConfirm(trimmed.length > 0 ? trimmed : undefined);
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
      description={`A record that you were shown your rating for ${review.cycleName}.`}
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
      <div className="flex flex-col gap-4">
        <p className="text-body-sm leading-relaxed text-body">
          This records that you have seen this rating and when. It is not a
          record that you agree with it, and nothing here says it is.
        </p>

        <Field
          label="Anything to add"
          help="Optional. Leave it blank if you have nothing to add."
        >
          <Textarea
            rows={5}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </Field>

        <p className="text-body-sm text-muted">You can do this once.</p>

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
