"use client";

import { useState } from "react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Field,
  Input,
  useToast,
} from "@/components/ui";
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

  return (
    <>
      <Card>
        <CardHeader
          title="Work kept with a final rating"
          level={3}
          info="Kept: which tasks the person finished in the cycle, when, whether on time, and who set them. Never kept: task titles, descriptions, comments or files. Only people who can read the review see it, and it never changes a score. Check with your legal adviser how long to keep it."
        />
        <CardBody className="flex flex-col gap-4">
          {reading ? (
            <p className="text-body-sm text-muted">{LOADING}</p>
          ) : available ? (
            <>
              <p className="text-body-sm text-ink">
                {typeof months === "number"
                  ? `Kept for ${plural(months)} after a rating is final.`
                  : "Not kept."}
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <Field
                  label="Months to keep"
                  className="w-40"
                  {...(typed !== null && text.trim() !== "" && !valid
                    ? { error: "Enter a whole number from 1 to 120." }
                    : {})}
                >
                  <Input
                    inputMode="numeric"
                    value={text}
                    placeholder="1 to 120"
                    disabled={!features.editable}
                    onChange={(event) => setTyped(event.target.value)}
                  />
                </Field>
                <Button
                  variant="accent"
                  disabled={!features.editable || !changed || !valid || saving}
                  onClick={() => {
                    if (next === null) return;
                    setQuestion(next);
                    setAsking(true);
                  }}
                >
                  {valid && next !== null ? `Keep for ${plural(next)}` : "Save"}
                </Button>
                {typeof months === "number" && (
                  <Button
                    variant="secondary"
                    disabled={!features.editable || saving}
                    onClick={() => void save(null)}
                  >
                    Stop keeping work
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
        </CardBody>
      </Card>

      <ConfirmDialog
        open={asking}
        onClose={() => setAsking(false)}
        title={
          question === null
            ? "Keep work with final ratings?"
            : `Keep work with final ratings for ${plural(question)}?`
        }
        body="When a rating is made final, the tasks the person finished in the cycle are kept with it: when each was finished, whether on time, and who set it. Task titles aren't kept. A disputed rating keeps it one period longer. Ratings already final don't change."
        confirmLabel="Keep it"
        loading={saving}
        onConfirm={() => question !== null && void save(question)}
      />
    </>
  );
}
