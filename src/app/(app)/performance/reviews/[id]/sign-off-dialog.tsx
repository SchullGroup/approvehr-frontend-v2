"use client";

import { useState } from "react";
import { Button, Field, Modal, Textarea } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiReview } from "@/lib/api/performance";

/**
 * The employee's answer to their own rating.
 *
 * Two acts, one dialog, and the difference between them is the whole reason the
 * dialog exists rather than a pair of bare buttons:
 *
 * | | Acknowledge | Dispute |
 * |---|---|---|
 * | What it records | that they were shown it | that they do not accept it |
 * | The comment | optional | **required** |
 * | What happens to the mark | nothing | **nothing** |
 * | What happens next | nothing | HR has a record to answer |
 *
 * **Acknowledging is not agreeing**, and every line of copy here keeps those
 * apart. An acknowledgement that reads as consent is worth less than nothing to
 * a company defending a decision later: the employee can say they only ticked a
 * box, and they would be right.
 *
 * The comment is required on a dispute at ten characters, which is the API's own
 * floor — HR cannot answer "I disagree" with no grounds, and a dispute nobody can
 * act on helps the employee least of all. It is optional on an acknowledgement
 * because somebody with nothing to add should not have to invent something to
 * get past a form.
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
      title={disputing ? "Say you do not accept this" : "Acknowledge this rating"}
      description={
        disputing
          ? `Your rating for ${review.cycleName} stays as it is. The dispute goes on the record beside it.`
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
            ? "The mark does not change. Whoever finalised it and whoever wrote it are both told, and somebody has to answer what you say here — that is what makes it a dispute rather than an argument."
            : "This records that you have seen this rating and when. It is not a record that you agree with it, and nothing here says it is."}
        </p>

        <Field
          label={disputing ? "What you disagree with" : "Anything to add"}
          required={disputing}
          help={
            disputing
              ? "Be specific. A dispute with no grounds cannot be answered, which helps you least of all."
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
            Say what you disagree with — a sentence at least.
          </p>
        )}

        <p className="text-body-sm text-muted">
          {disputing
            ? "You can do this once, and it cannot be swapped for an acknowledgement afterwards."
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
