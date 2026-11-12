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
            ? "New ratings keep no record of the work behind them"
            : `The work behind a final rating is kept for ${plural(value)}`,
        detail:
          value === null
            ? "A record already kept stays until its own date."
            : "It applies to ratings made final from now on. A record already kept keeps its own date.",
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
          description={
            typeof months === "number"
              ? `The finished work behind each rating is kept for ${plural(months)} from the day the rating is made final, then removed.`
              : months === null
                ? "Nothing is kept. The finished work beside a rating is read as it stands, so it can change after the rating is final."
                : "How long the finished work behind a final rating is kept."
          }
        />
        <CardBody className="flex flex-col gap-4">
          {reading ? (
            <p className="text-body-sm text-muted">Reading the setting</p>
          ) : available ? (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <Field
                  label="Months"
                  help="A whole number from 1 to 120. Leave it empty to keep nothing."
                  className="w-40"
                  {...(typed !== null && text.trim() !== "" && !valid
                    ? { error: "A whole number of months, 1 to 120." }
                    : {})}
                >
                  <Input
                    inputMode="numeric"
                    value={text}
                    placeholder="Keep nothing"
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
                  Set this period
                </Button>
                {typeof months === "number" && (
                  <Button
                    variant="secondary"
                    disabled={!features.editable || saving}
                    onClick={() => void save(null)}
                  >
                    Stop keeping records
                  </Button>
                )}
              </div>
              {problem && (
                <p role="alert" className="text-body-sm text-danger-text">
                  {problem}
                </p>
              )}
              <p className="text-body-sm text-muted">
                How long is right is a decision for your company and its legal
                advice, so none is suggested. It applies to ratings made final
                from now on; a record already kept keeps the date it was given.
              </p>
              {!features.editable && (
                <p className="text-body-sm text-muted">
                  Read-only: changing this needs the Manage settings permission.
                </p>
              )}
            </>
          ) : failed ? (
            <p className="text-body-sm text-muted">
              The setting could not be read, so no control is shown rather than
              a guess. Reload the page to try again.
            </p>
          ) : (
            <p className="text-body-sm text-muted">
              {connected
                ? "This server has not been updated to offer this setting yet, so nothing is kept with a rating."
                : "How long work is kept with a rating is a company setting kept on the server, so there is nothing to set here."}
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="What is kept, and what is not" level={3} />
        <CardBody className="grid gap-6 text-body-sm text-body sm:grid-cols-2">
          <div>
            <p className="font-medium text-ink">Kept, for the period</p>
            <ul className="mt-2 list-disc pl-5">
              <li>Which tasks the person finished in the cycle</li>
              <li>When each was finished, and whether it met its due date</li>
              <li>Who set each one, when somebody else did</li>
              <li>Whether each sat under an objective</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-ink">Never kept</p>
            <ul className="mt-2 list-disc pl-5">
              <li>Task titles, descriptions, comments or files</li>
              <li>Time spent, or points</li>
              <li>Anything, for a company that has not set a period</li>
              <li>Anything, while Projects is switched off</li>
            </ul>
          </div>
          <p className="sm:col-span-2">
            It is read by the people who can read the review and the
            person&apos;s work: the person, their manager, an assigned appraiser
            and HR. It is evidence to read beside a rating and never changes a
            mark. A formal dispute of the rating keeps it a full period longer.
          </p>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={asking}
        onClose={() => setAsking(false)}
        title={
          question === null
            ? "Set the period?"
            : `Keep the work behind each final rating for ${plural(question)}?`
        }
        body="From now on, when a rating is made final, the tasks the person finished in the cycle are kept with it: which task, when it was finished, whether it met its due date and who set it. Task titles are not kept. Each record is removed that long after the rating was made final, and a formal dispute keeps it a full period longer. Ratings already final are not touched."
        confirmLabel="Start keeping it"
        loading={saving}
        onConfirm={() => question !== null && void save(question)}
      />
    </>
  );
}
