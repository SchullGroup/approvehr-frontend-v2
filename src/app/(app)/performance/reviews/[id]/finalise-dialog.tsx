"use client";

import { useState } from "react";
import { Button, Modal, SuccessMoment } from "@/components/ui";
import { ratingWordsFrom, type ApiReviewDetail } from "@/lib/api/performance";
import { useRatingScale } from "@/lib/store/performance";
import { finalisedCopy, type SignOffCopy } from "./sign-off-copy";

/**
 * Finalising, behind a confirmation that names what it does — and then an
 * account of what it did.
 *
 * The same shape as approving a payroll run, and for the same reason: after it,
 * what the person is told is fixed. The confirmation names the person and the
 * mark rather than asking "are you sure" — an irreversible act with a generic
 * dialog in front of it is an irreversible act nobody read.
 *
 * It used to close on success with a toast reading "{name} has been told their
 * rating", which was a claim the API had not made: `finalise` reports whether
 * the person could be told, and for somebody with no sign-in they could not.
 * The dialog now stays and turns into a statement of what was recorded, says
 * "told" only when the API did, and closes on "Done". The caller must not toast
 * a success of its own.
 */
export function FinaliseDialog({
  open,
  review,
  onClose,
  onConfirm,
}: {
  open: boolean;
  review: ApiReviewDetail;
  onClose: () => void;
  /**
   * Makes it final. Resolves to whether the API could tell the person, or to
   * `null` when it failed and the caller has said so in a toast.
   */
  onConfirm: () => Promise<{ subjectNotified: boolean | undefined } | null>;
}) {
  /* Its own read of the same cached scale rather than a prop. This dialog
     quotes the mark somebody is about to make final, and quoting it in the
     default words while the screen behind it uses the company's would be the
     picker-versus-record split all over again, inside one screen. */
  const { scale } = useRatingScale();
  const ratingWords = ratingWordsFrom(scale.levels);

  const [busy, setBusy] = useState(false);
  /* What it said. While it is set the dialog shows it in place of the question,
     because this is the one act on the page that cannot be taken back and
     "Done" in a toast is not an account of it. */
  const [made, setMade] = useState<SignOffCopy | null>(null);

  /* A fresh question each time it is opened after one was answered. */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && made) setMade(null);
  }

  const submit = async () => {
    setBusy(true);
    try {
      const outcome = await onConfirm();
      if (outcome) {
        setMade(
          finalisedCopy({
            subjectName: review.subjectName,
            cycleName: review.cycleName,
            ratingLabel:
              review.rating === null ? null : ratingWords(review.rating),
            subjectNotified: outcome.subjectNotified,
          }),
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        made ? "Rating of record" : `Make this ${review.subjectName}'s rating?`
      }
      size="sm"
      footer={
        made ? undefined : (
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
              Make this the rating
            </Button>
          </>
        )
      }
    >
      {made ? (
        <SuccessMoment
          /* Under the dialog's own `h2`, not beside it. */
          headingLevel={3}
          align="center"
          /* The button that was just pressed has left with the footer, so
             focus goes to what replaced it. */
          focusHeading
          title={made.title}
          lead={made.lead}
          details={made.details}
          actions={
            <Button variant="accent" onClick={onClose}>
              Done
            </Button>
          }
        />
      ) : (
        <div className="text-body-sm leading-relaxed text-body">
          <span>
            {review.subjectName} will be told, and will be asked to acknowledge
            it.{" "}
            {review.rating === null
              ? "This form carries no overall mark, so what they read is the answers."
              : `The mark of record becomes "${ratingWords(review.rating)}".`}{" "}
            It cannot be re-marked afterwards.
          </span>
        </div>
      )}
    </Modal>
  );
}
