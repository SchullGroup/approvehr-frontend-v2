"use client";

import { useState } from "react";
import { Button, Field, Modal, SuccessMoment, Textarea } from "@/components/ui";
import type { ApiReviewDetail } from "@/lib/api/performance";
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
 * The dialog now stays and says what was recorded, which is its title, and a
 * line only when somebody has to do something (the person could not be told in
 * the app). It closes on "Done". The caller must not toast a success of its own.
 *
 * ## One sentence
 *
 * The question says what will happen and that it cannot be undone, once. It
 * used to say the second thing again in the success view, and the first a third
 * time under the button on the page behind.
 *
 * ## HR can add a recommendation here, before the person is told
 *
 * Optional, and offered only where the caller says the reader is HR
 * (`canRecommend`, the records permission): the API refuses a recommendation from
 * anybody else and leaves the rating not final, so a box that anybody saw would be
 * a box that could cost somebody their finalise. That the person reads it with
 * their rating is the field's own help. A form is a new form every time the
 * dialog opens, so what was typed and cancelled is not still there.
 */
export function FinaliseDialog({
  open,
  review,
  scoreNow = null,
  canRecommend = false,
  onClose,
  onConfirm,
}: {
  open: boolean;
  review: ApiReviewDetail;
  /**
   * The period's score for this person as it stands now, "Meets Expectations ·
   * 3.1": the rating they will read once this is final. It is not this review's
   * own mark, which is one appraiser's. `null` where the page cannot read it, and
   * then the question names no figure rather than the wrong one (F42).
   */
  scoreNow?: string | null;
  /** Whether to offer HR's recommendation box. */
  canRecommend?: boolean;
  onClose: () => void;
  /**
   * Makes it final, with HR's recommendation when one was typed. Resolves to
   * whether the API could tell the person, or to `null` when it failed and the
   * caller has said so in a toast.
   */
  onConfirm: (
    recommendation?: string,
  ) => Promise<{ subjectNotified: boolean | undefined } | null>;
}) {
  const [busy, setBusy] = useState(false);
  /* What it said. While it is set the dialog shows it in place of the question,
     because this is the one act on the page that cannot be taken back and
     "Done" in a toast is not an account of it. */
  const [made, setMade] = useState<SignOffCopy | null>(null);
  const [recommendation, setRecommendation] = useState("");

  /* A fresh question each time it is opened, whether or not one was answered. */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      if (made) setMade(null);
      setRecommendation("");
    }
  }

  /* The API's limit, said before the press rather than as a refusal after it.
     Not a `maxLength` on the box, which would cut a paste short without a word. */
  const typed = canRecommend ? recommendation.trim() : "";
  const over = typed.length - RECOMMENDATION_LIMIT;

  const submit = async () => {
    setBusy(true);
    try {
      const outcome = await onConfirm(typed.length > 0 ? typed : undefined);
      if (outcome) {
        setMade(
          finalisedCopy({
            subjectName: review.subjectName,
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
        made ? "Rating is final" : `Make ${review.subjectName}'s rating final?`
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
              disabled={over > 0}
              onClick={() => void submit()}
            >
              Make it final
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
          {...(made.details.length > 0 ? { details: made.details } : {})}
          actions={
            <Button variant="accent" onClick={onClose}>
              Done
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-body-sm leading-relaxed text-body">
            {/* The rating they read is the period's score, the line their own
                record opens on, and not this review's mark: one appraiser's mark
                said as "their rating" made this question and their record
                disagree (F42). */}
            {scoreNow
              ? `${firstName(review.subjectName)} will be told their rating, "${scoreNow}".`
              : review.rating === null
                ? `${firstName(review.subjectName)} will read the answers.`
                : `${firstName(review.subjectName)} will be told their rating.`}{" "}
            This cannot be changed.
          </p>

          {canRecommend && (
            <Field
              label="Your recommendation (optional)"
              help={`${firstName(review.subjectName)} will read it with their rating.`}
              {...(over > 0
                ? {
                    error: `That is ${String(over)} characters over. Keep it to ${RECOMMENDATION_LIMIT.toLocaleString("en-NG")}.`,
                  }
                : {})}
            >
              <Textarea
                rows={3}
                value={recommendation}
                onChange={(event) => setRecommendation(event.target.value)}
              />
            </Field>
          )}
        </div>
      )}
    </Modal>
  );
}

/** The API's limit on HR's recommendation, in characters. */
const RECOMMENDATION_LIMIT = 2000;

const firstName = (name: string): string => name.split(" ")[0] ?? name;
