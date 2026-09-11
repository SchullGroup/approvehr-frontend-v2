"use client";

import { useState } from "react";
import { Button, Field, Modal, Textarea } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiReview } from "@/lib/api/performance";

/**
 * Answering a rating — one act the subject does for themselves, one HR does
 * about them.
 *
 * Two acts, one dialog, and the difference between them is the whole reason the
 * dialog exists rather than a pair of bare buttons:
 *
 * | | Acknowledge | Dispute |
 * |---|---|---|
 * | Who does it | the person the rating is about | HR |
 * | What it records | that they were shown it | that they do not accept it |
 * | The comment | optional | **required** |
 * | What happens to the mark | nothing | **nothing** |
 *
 * **Acknowledging is not agreeing**, and every line of copy here keeps those
 * apart. An acknowledgement that reads as consent is worth less than nothing to
 * a company defending a decision later: the employee can say they only ticked a
 * box, and they would be right.
 *
 * **Disputing is HR's to record, not the subject's** — `review-screen.tsx`
 * only ever opens this dialog in "dispute" mode for somebody who is not the
 * review's own subject, so every string below is written in the third person
 * about `review.subjectName`. Somebody who does not accept a rating says so to
 * HR, and this is where HR writes it down.
 *
 * The comment is required on a dispute at ten characters, which is the API's own
 * floor — a dispute with no grounds cannot be answered, which helps the employee
 * least of all. It is optional on an acknowledgement because somebody with
 * nothing to add should not have to invent something to get past a form.
 *
 * The dispute copy says plainly that the rating stands. It has to: somebody who
 * expects disputing to remove the mark will be told otherwise by the record
 * rather than by the screen, and finding out afterwards is the version that
 * becomes a grievance.
 */

/** The API's floor for a dispute. Same number, so no refusal surprises anybody. */
const MIN_DISPUTE = 10;

export type SignOffAct = "acknowledge" | "dispute";

export function SignOffDialog({
  act,
  review,
  onClose,
  onConfirm,
}: {
  act: SignOffAct;
  review: ApiReview;
  onClose: () => void;
  onConfirm: (comment?: string) => Promise<void>;
}) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const disputing = act === "dispute";
  const trimmed = comment.trim();
  const ready = disputing ? trimmed.length >= MIN_DISPUTE : true;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setFailed(null);
    try {
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
      title={
        disputing
          ? `Record that ${review.subjectName} does not accept this`
          : "Acknowledge this rating"
      }
      description={
        disputing
          ? `${review.subjectName}'s rating for ${review.cycleName} stays as it is. The dispute goes on the record beside it.`
          : `A record that you were shown your rating for ${review.cycleName}.`
      }
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={disputing ? "accent" : "approve"}
            loading={busy}
            disabled={!ready}
            onClick={() => void submit()}
          >
            {disputing ? "Record the dispute" : "I have seen this"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body-sm leading-relaxed text-body">
          {disputing
            ? "The mark does not change. Whoever finalised it and whoever wrote it are both told, and somebody has to answer what is written here: that is what makes it a dispute rather than an argument."
            : "This records that you have seen this rating and when. It is not a record that you agree with it, and nothing here says it is."}
        </p>

        <Field
          label={disputing ? "What the dispute is over" : "Anything to add"}
          required={disputing}
          help={
            disputing
              ? "Be specific. A dispute with no grounds cannot be answered, which helps them least of all."
              : "Optional. Leave it blank if you have nothing to add."
          }
        >
          <Textarea
            rows={5}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </Field>

        {disputing && !ready && trimmed.length > 0 && (
          <p className="text-body-sm text-body">
            Say what the dispute is over — a sentence at least.
          </p>
        )}

        <p className="text-body-sm text-muted">
          {disputing
            ? "This can be recorded once, and cannot be swapped for an acknowledgement afterwards."
            : "You can do this once, and it cannot be swapped for a dispute afterwards."}
        </p>

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
