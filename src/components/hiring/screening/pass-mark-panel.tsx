"use client";

import { useState } from "react";
import { ListChecks } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Checkbox,
  Field,
  FieldRow,
  Input,
  Select,
  Skeleton,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { ApiError } from "@/lib/api/client";
import type { PassMark, PassMarkCount } from "@/lib/hiring/screening/model";
import { count } from "@/lib/hiring/screening/score";
import {
  usePassMark,
  usePassMarkCount,
  type useRescore,
} from "@/lib/hiring/screening/use-screening";

/**
 * The pass mark: who is shown to a person first.
 *
 * ## It flags. It never rejects.
 *
 * A pass mark here has two independent, optional parts, a fit score and an
 * assessment result, and anybody below either is **flagged** for a person to look
 * at. Knockout answers flag the same way, unless somebody turns that off. The
 * flagged people go to one list, and a person confirms there, in bulk and with a
 * reason, before anybody is turned down. The screen says so at the top and again in
 * the confirmation, because the person pressing Save should know what it will and
 * will not do.
 *
 * ## The assessment mark is a percentage, of one test
 *
 * A test marked out of 60 and one marked out of 100 are held to the same line
 * because both are read as a percentage. When an advert has results from more than
 * one test the mark is told which one to read; with none chosen it reads the one
 * entered last.
 *
 * ## The number is shown before it is saved
 *
 * "412 of 4,210 would be below the pass mark" is asked of the API for what is in
 * the boxes now, once typing pauses, and says when it is still answering an
 * earlier figure. Saving then shows the same number in the confirmation.
 *
 * People with no score yet are not counted as below: they are named as a separate
 * figure, because a missing score is not a low one.
 */

/** A whole number within a range, or `null` for a blank, or `"bad"`. */
function parseBound(text: string, max: number): number | null | "bad" {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(trimmed)) return "bad";
  const value = Number(trimmed);
  return value >= 0 && value <= max ? value : "bad";
}

const show = (value: number | null): string =>
  value === null ? "" : String(value);

export function PassMarkPanel({
  postingId,
  rescore,
  belowHref,
}: {
  postingId: string;
  rescore: ReturnType<typeof useRescore>;
  /** The list of people below it. */
  belowHref: string;
}) {
  const passMark = usePassMark(postingId);
  if (passMark.error && !passMark.mark) {
    return (
      <LoadFailure
        subject="the pass mark"
        error={passMark.error}
        onRetry={passMark.reload}
      />
    );
  }
  if (!passMark.mark) {
    return (
      <Card>
        <CardBody>
          <Skeleton className="h-32 w-full" />
          <span className="sr-only-focusable">Loading the pass mark</span>
        </CardBody>
      </Card>
    );
  }
  return (
    <PassMarkForm
      key={`${String(passMark.mark.version ?? "none")}:${passMark.mark.updatedAt ?? "none"}`}
      postingId={postingId}
      mark={passMark.mark}
      save={passMark.save}
      rescore={rescore}
      belowHref={belowHref}
    />
  );
}

function PassMarkForm({
  postingId,
  mark,
  save,
  rescore,
  belowHref,
}: {
  postingId: string;
  mark: PassMark;
  save: ReturnType<typeof usePassMark>["save"];
  rescore: ReturnType<typeof useRescore>;
  belowHref: string;
}) {
  const toast = useToast();
  const [fit, setFit] = useState(show(mark.fitMin));
  const [assessment, setAssessment] = useState(show(mark.assessmentMin));
  const [test, setTest] = useState(mark.assessmentTest ?? "");
  const [flagKnockouts, setFlagKnockouts] = useState(mark.flagKnockouts);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const fitValue = parseBound(fit, 100);
  const assessmentValue = parseBound(assessment, mark.assessmentMax);
  const valid = fitValue !== "bad" && assessmentValue !== "bad";
  const input = {
    fitMin: fitValue === "bad" ? null : fitValue,
    assessmentMin: assessmentValue === "bad" ? null : assessmentValue,
    assessmentTest: test === "" ? null : test,
    flagKnockouts,
  };
  const dirty =
    input.fitMin !== mark.fitMin ||
    input.assessmentMin !== mark.assessmentMin ||
    input.assessmentTest !== mark.assessmentTest ||
    input.flagKnockouts !== mark.flagKnockouts;
  /* The saved test is offered even when nobody has a result in it yet. */
  const tests =
    mark.assessmentTest !== null &&
    !mark.tests.some((known) => known.name === mark.assessmentTest)
      ? [
          ...mark.tests,
          {
            key: mark.assessmentTest,
            name: mark.assessmentTest,
            applicants: 0,
          },
        ]
      : mark.tests;

  const counted = usePassMarkCount(postingId, input);

  async function confirm() {
    setSaving(true);
    setRefusal(null);
    try {
      await save(input);
      setConfirming(false);
      rescore.watch();
      toast.push({
        title: "Pass mark saved",
        tone: "success",
        detail:
          "People below it are being flagged for a person to look at. Nobody is rejected.",
      });
    } catch (error) {
      setConfirming(false);
      setRefusal(
        error instanceof ApiError
          ? (error.fieldErrors[0]?.message ?? error.message)
          : "The pass mark was not saved. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  const none =
    mark.fitMin === null && mark.assessmentMin === null && !mark.flagKnockouts;

  return (
    <Card>
      <CardHeader
        title="Pass mark"
        description="People below it are listed for somebody to look at. It flags. It never rejects."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {dirty && (
              <Badge tone="warning" size="sm" dot>
                Not saved
              </Badge>
            )}
            <Button
              variant="accent"
              size="sm"
              disabled={!dirty || !valid || saving}
              onClick={() => setConfirming(true)}
            >
              Save pass mark
            </Button>
          </div>
        }
      />
      <CardBody className="flex flex-col gap-5">
        <FieldRow>
          <Field
            label="Fit score, at least"
            optional
            help="0 to 100. Leave empty for no fit pass mark."
            {...(fitValue === "bad"
              ? { error: "A number from 0 to 100." }
              : {})}
          >
            <Input
              inputMode="decimal"
              value={fit}
              placeholder="50"
              onChange={(event) => setFit(event.target.value)}
            />
          </Field>
          <Field
            label="Assessment result, at least (%)"
            optional
            help={`0 to ${String(mark.assessmentMax)}, as a percentage of what the test is marked out of. Leave empty for none.`}
            {...(assessmentValue === "bad"
              ? { error: `A number from 0 to ${String(mark.assessmentMax)}.` }
              : {})}
          >
            <Input
              inputMode="decimal"
              value={assessment}
              placeholder="60"
              onChange={(event) => setAssessment(event.target.value)}
            />
          </Field>
        </FieldRow>

        {tests.length > 0 && (
          <Field
            label="Which test the assessment mark reads"
            help="With more than one test on this advert, choose the one the pass mark is about."
          >
            <Select
              value={test}
              onChange={(event) => setTest(event.target.value)}
            >
              <option value="">The one entered last</option>
              {tests.map((known) => (
                <option key={known.key} value={known.name}>
                  {known.name}
                  {known.applicants > 0
                    ? ` (${count(known.applicants)} ${known.applicants === 1 ? "result" : "results"})`
                    : ""}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div>
          <h4 className="text-body-sm font-semibold text-ink">
            Answers that flag somebody on their own
          </h4>
          <Checkbox
            className="mt-1"
            label="A wrong answer to a knockout question flags somebody"
            checked={flagKnockouts}
            onChange={() => setFlagKnockouts((on) => !on)}
          />
          {flagKnockouts && mark.knockouts.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-body-sm text-body">
              {mark.knockouts.map((rule) => (
                <li key={rule.id}>
                  {rule.question}{" "}
                  <span className="text-muted">
                    (flagged when the answer is {rule.flagWhen})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Count
          counted={counted}
          valid={valid}
          dirty={dirty}
          none={none && !dirty}
        />

        {refusal && (
          <p role="alert" className="text-body-sm text-danger-text">
            {refusal}
          </p>
        )}

        <div>
          <ButtonLink href={belowHref} variant="secondary" size="sm">
            <ListChecks aria-hidden="true" className="size-3.5" />
            See who is below the pass mark
          </ButtonLink>
        </div>
      </CardBody>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Set this pass mark?"
        confirmLabel="Set the pass mark"
        tone="primary"
        loading={saving}
        body={
          counted.count && counted.current
            ? `${count(counted.count.below)} of ${count(counted.count.total)} would be flagged as below the pass mark. Nobody is rejected. They go to a list, and a person confirms there before anybody is turned down.`
            : "People below the pass mark are flagged for a person to look at. Nobody is rejected. They go to a list, and a person confirms there before anybody is turned down."
        }
        onConfirm={() => void confirm()}
      />
    </Card>
  );
}

function Count({
  counted,
  valid,
  dirty,
  none,
}: {
  counted: ReturnType<typeof usePassMarkCount>;
  valid: boolean;
  dirty: boolean;
  none: boolean;
}) {
  if (!valid) {
    return (
      <p className="text-body-sm text-muted">
        Fix the figures above to see how many people it would flag.
      </p>
    );
  }
  const data: PassMarkCount | null = counted.count;
  if (counted.error && !data) {
    return (
      <p role="alert" className="text-body-sm text-danger-text">
        {counted.error.message}
      </p>
    );
  }
  if (!data) {
    return (
      <div>
        <Skeleton className="h-10 w-full" />
        <span className="sr-only-focusable">Counting</span>
      </div>
    );
  }
  return (
    <div
      className={counted.current ? "" : "opacity-60"}
      aria-live="polite"
      aria-busy={!counted.current}
      data-testid="pass-mark-count"
    >
      <p className="text-body-sm font-medium text-ink">
        {dirty ? "If you saved this, " : none ? "" : "Right now, "}
        {count(data.below)} of {count(data.total)}{" "}
        {data.total === 1 ? "person" : "people"} {dirty ? "would be" : "are"}{" "}
        below the pass mark.
      </p>
      {data.below > 0 && <Reasons data={data} />}
      {data.kept > 0 && (
        <p className="mt-1 text-meta text-muted">
          {count(data.kept)} {data.kept === 1 ? "is" : "are"} under it but{" "}
          {data.kept === 1 ? "has" : "have"} been kept in the running by a
          person, so {data.kept === 1 ? "is" : "are"} not counted.
        </p>
      )}
      {data.noAssessment > 0 && (
        <p className="mt-1 text-meta text-muted">
          {count(data.noAssessment)} {data.noAssessment === 1 ? "has" : "have"}{" "}
          no assessment result yet. A missing result is not a low one, so{" "}
          {data.noAssessment === 1 ? "that person is" : "they are"} not counted
          as below on it.
        </p>
      )}
      {data.notScored > 0 && (
        <p className="mt-1 text-meta text-muted">
          {count(data.notScored)} {data.notScored === 1 ? "has" : "have"} no
          score yet. {data.notScored === 1 ? "That person is" : "They are"} not
          counted as below the pass mark: a missing score is not a low one.
        </p>
      )}
      {data.below === 0 && none && (
        <Callout tone="neutral" className="mt-2">
          There is no pass mark. Nobody is flagged for a score or a result.
        </Callout>
      )}
      {!counted.current && <span className="sr-only">Updating the count</span>}
    </div>
  );
}

/** Why they are below, in a line: each reason on its own, and a word if they overlap. */
function Reasons({ data }: { data: PassMarkCount }) {
  const parts = [
    data.byReason.fit > 0 ? `${count(data.byReason.fit)} on fit score` : null,
    data.byReason.assessment > 0
      ? `${count(data.byReason.assessment)} on assessment score`
      : null,
    data.byReason.knockout > 0
      ? `${count(data.byReason.knockout)} on a flagged answer`
      : null,
  ].filter((part): part is string => part !== null);
  const overlap =
    data.byReason.fit + data.byReason.assessment + data.byReason.knockout >
    data.below;
  return (
    <p className="mt-1 text-meta text-muted">
      {parts.join(", ")}.
      {overlap
        ? ` Some are below for more than one reason, so these add up to more than ${count(data.below)}.`
        : ""}
    </p>
  );
}
