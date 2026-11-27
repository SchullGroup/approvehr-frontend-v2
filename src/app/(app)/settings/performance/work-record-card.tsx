"use client";

import { useState } from "react";
import { Button, ConfirmDialog, Field, Input, useToast } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { useFeatureSettings } from "@/lib/store/features";
import {
  LOADING,
  LOAD_FAILED,
  NOT_ON_SERVER,
  NO_SERVER,
  READ_ONLY,
} from "./setting-copy";

/**
 * How long the work behind a final rating is kept.
 *
 * ## One field, in the one card the Records tab is
 *
 * It is a section of that card, not a card of its own: a field called Months to
 * keep, with the rules behind an info icon beside its name, and a Save that
 * appears only once there is something to save. There is no "Kept for 12 months"
 * line above the field that holds 12, and no Stop button: clearing the field
 * stops keeping work, and saving a cleared field says so without asking, since it
 * keeps less and not more. Setting a period asks first, in one question.
 *
 * ## What it does
 *
 * A manager's rating is read beside the finished work the person did in the cycle, and that
 * list is read live, so a task reopened or deleted later changes what an old review shows. For a
 * company that sets a period here, the list as it stood on the day a rating was made final is
 * kept with it, and removed when the period ends. A rating that is disputed keeps it a full
 * period longer. It is evidence to read, and no score reads it.
 *
 * ## Nothing is kept until a company chooses, and no figure is suggested
 *
 * How long personal data about somebody's work may be held is a decision for the company and its
 * legal advice, and a suggested number would be the product making it for them. The box is empty
 * and the page says why. This is the same rule as how long rejected candidates are kept.
 *
 * ## What is not kept
 *
 * Task titles. A title can hold health or trade-union details, which the Nigeria Data Protection
 * Act names as sensitive, so a record holds which task, when it was finished, whether it met its
 * due date, whether it sat under an objective and who set it, and nothing somebody typed into it.
 *
 * ## Three states that are not "none chosen"
 *
 * `workEvidenceMonths` is `undefined` when the server has not said: an API one deploy behind, or no
 * server at all. That is not a company's answer, so no control is offered. `null` is a company's
 * own answer, "keep nothing", and is the state every company starts in.
 *
 * ## What a change touches
 *
 * Only ratings made final afterwards. A record already kept keeps the date it was given, and
 * clearing the period stops new records without removing any.
 */

const plural = (n: number): string =>
  `${String(n)} ${n === 1 ? "month" : "months"}`;

/** What is kept and what never is, behind the icon beside the field's name. */
const KEPT_INFO =
  "Kept: which tasks the person finished in the cycle, when, whether on time, and who set them. Never kept: task titles, descriptions, comments or files. Only people who can read the review see it, and it never changes a score. Check with your legal adviser how long to keep it.";

export function WorkRecordCard({ connected }: { connected: boolean }) {
  const features = useFeatureSettings();
  const toast = useToast();
  const months = features.workEvidenceMonths;
  const [typed, setTyped] = useState<string | null>(null);
  /* What was last put to the person, and whether it is on screen. Two things, because the dialog
     stays up for a moment as it leaves and is drawn from what it is given then: a title read from
     one nullable value would flip to a default sentence over a dialog that is going away. */
  const [question, setQuestion] = useState<number | null>(null);
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const reading = features.loading && months === undefined;
  const failed = !features.loading && features.error != null;
  const available = connected && months !== undefined;
  const saving = features.saving === "workEvidenceRetentionMonths";

  const text = typed ?? (typeof months === "number" ? String(months) : "");
  const next = text.trim() === "" ? null : Number(text);
  const valid =
    next !== null && Number.isInteger(next) && next >= 1 && next <= 120;
  const changed = next !== (months ?? null);

  async function save(value: number | null) {
    setProblem(null);
    try {
      await features.setWorkEvidenceMonths(value);
      setTyped(null);
      setAsking(false);
      toast.push({
        tone: "success",
        title:
          value === null
            ? "Work is no longer kept with final ratings"
            : `Work is kept with final ratings for ${plural(value)}`,
        detail:
          value === null
            ? "Records already kept stay until their own date."
            : "Applies to ratings made final from now on.",
      });
    } catch (error) {
      setProblem(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "That did not save. Try again.",
      );
      setAsking(false);
    }
  }

  /* Nothing to press until something has changed: a figure that is valid, or a
     box that was emptied, which is how work stops being kept. */
  const canSave =
    features.editable && changed && (valid || next === null) && !saving;

  return (
    <>
      <div className="flex flex-col gap-3 px-5 py-4">
        {reading ? (
          <p className="text-body-sm text-muted">{LOADING}</p>
        ) : available ? (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <Field
                label="Months to keep"
                help={KEPT_INFO}
                className="w-40"
                {...(typed !== null && text.trim() !== "" && !valid
                  ? { error: "Enter a whole number from 1 to 120." }
                  : {})}
              >
                <Input
                  inputMode="numeric"
                  value={text}
                  placeholder="Not kept"
                  disabled={!features.editable}
                  onChange={(event) => setTyped(event.target.value)}
                />
              </Field>
              {canSave && (
                <Button
                  variant="accent"
                  onClick={() => {
                    /* Keeping less is one press; keeping more asks first. */
                    if (next === null) {
                      void save(null);
                      return;
                    }
                    setQuestion(next);
                    setAsking(true);
                  }}
                >
                  Save
                </Button>
              )}
            </div>
            {problem && (
              <p role="alert" className="text-body-sm text-danger-text">
                {problem}
              </p>
            )}
            {!features.editable && (
              <p className="text-body-sm text-muted">{READ_ONLY}</p>
            )}
          </>
        ) : failed ? (
          <p className="text-body-sm text-muted">{LOAD_FAILED}</p>
        ) : (
          <p className="text-body-sm text-muted">
            {connected ? NOT_ON_SERVER : NO_SERVER}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={asking}
        onClose={() => setAsking(false)}
        title={
          question === null
            ? "Keep work with final ratings?"
            : `Keep work with final ratings for ${plural(question)}?`
        }
        body={null}
        confirmLabel="Keep it"
        loading={saving}
        onConfirm={() => question !== null && void save(question)}
      />
    </>
  );
}
