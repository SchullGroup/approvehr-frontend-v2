"use client";

import { useState } from "react";
import { Button, Field, Modal, SuccessMoment, Textarea } from "@/components/ui";
import {
  ratingWordsFrom,
  showsOverallMark,
  type ApiReviewDetail,
} from "@/lib/api/performance";
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
 *
 * ## HR can add a recommendation here, before the person is told
 *
 * Optional, and offered only where the caller says the reader is HR
 * (`canRecommend`, the records permission): the API refuses a recommendation from
 * anybody else and leaves the rating not final, so a box that anybody saw would be
 * a box that could cost somebody their finalise. It says who will read it before
 * anybody types, because it travels with the rating. A form is a new form every
 * time the dialog opens, so what was typed and cancelled is not still there.
 */
export function FinaliseDialog({
  open,
  review,
  canRecommend = false,
  onClose,
  onConfirm,
}: {
  open: boolean;
  review: ApiReviewDetail;
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
            cycleName: review.cycleName,
            ratingLabel:
              review.rating === null ? null : ratingWords(review.rating),
            subjectNotified: outcome.subjectNotified,
            markShown: showsOverallMark(review),
            recommended: typed.length > 0,
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
          lead={made.lead}
          details={made.details}
          actions={
            <Button variant="accent" onClick={onClose}>
              Done
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-body-sm leading-relaxed text-body">
            {review.subjectName} will be told, and will be asked to acknowledge
            it.{" "}
            {review.rating === null
              ? showsOverallMark(review)
                ? "This form has no overall mark, so they will read the answers."
                : "They will read the answers."
              : `Their rating becomes "${ratingWords(review.rating)}".`}{" "}
            It cannot be changed afterwards.
          </p>

          {canRecommend && (
            <div className="flex flex-col gap-2">
              <Field
                label="Your recommendation (optional)"
                {...(over > 0
                  ? {
                      error: `That is ${String(over)} characters over. Keep it to ${RECOMMENDATION_LIMIT.toLocaleString("en-NG")}.`,
                    }
                  : {})}
              >
                <Textarea
                  rows={4}
                  value={recommendation}
                  onChange={(event) => setRecommendation(event.target.value)}
                />
              </Field>
              {/* Said on the page and not behind the help icon: that the person
                  reads it is the consequence of writing it, and a consequence
                  behind a hover is one that gets agreed to unread. */}
              <p className="text-meta text-muted">
                {firstName(review.subjectName)} will read it with their rating.
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/** The API's limit on HR's recommendation, in characters. */
const RECOMMENDATION_LIMIT = 2000;

const firstName = (name: string): string => name.split(" ")[0] ?? name;
