"use client";

import { useState } from "react";
import {
  Button,
  Field,
  FieldRow,
  Input,
  Skeleton,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type {
  AssessmentCurrent,
  AssessmentEntry,
  ScreeningSubject,
} from "@/lib/hiring/screening/model";
import { numberOf } from "@/lib/hiring/screening/assessment-file";
import { useAssessmentHistory } from "@/lib/hiring/screening/use-screening";
import { formatDateShort } from "@/lib/time";

/**
 * A person's assessment results: what each test says now, where every value came
 * from, and a form to type one in.
 *
 * ## A result is a mark and what it was out of
 *
 * 42 out of 60 and 70 out of 100 are the same result, so the pass mark reads both as
 * a percentage and this shows the percentage beside the mark. A person who sat two
 * tests has two results, each under its own name.
 *
 * ## Nothing is lost
 *
 * A newer result replaces the one in use and the older value stays in the history,
 * with who brought it and whether it came from a file or was typed, so a figure on a
 * list can always be traced to its source.
 */

const pad = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

/** "42 out of 60 (70%)", or "58.5%" when the mark was already a percentage. */
export function resultWords(result: {
  score: number | null;
  max: number | null;
  percent: number | null;
}): string {
  if (result.score === null) return "removed";
  if (result.max === null) return `${pad(result.score)}%`;
  return `${pad(result.score)} out of ${pad(result.max)}${
    result.percent !== null ? ` (${pad(result.percent)}%)` : ""
  }`;
}

export function AssessmentRecord({
  subject,
  canEdit,
}: {
  subject: ScreeningSubject;
  /** Typing a result needs the permission to manage hiring. */
  canEdit: boolean;
}) {
  const history = useAssessmentHistory(subject);
  const toast = useToast();
  const [test, setTest] = useState("");
  const [score, setScore] = useState("");
  const [max, setMax] = useState("");
  const [taken, setTaken] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const typed = score.trim() !== "";
  const scoreValue = numberOf(score);
  const maxValue = max.trim() === "" ? null : numberOf(max);
  const maxBad = max.trim() !== "" && (maxValue === null || maxValue <= 0);
  const ceiling = maxValue === null ? 100 : maxValue;
  const scoreBad =
    typed && (scoreValue === null || (!maxBad && scoreValue > ceiling));
  const bad = scoreBad || maxBad;

  async function save() {
    if (scoreValue === null || bad) return;
    setSaving(true);
    setProblem(null);
    try {
      await history.enter({
        test: test.trim() === "" ? null : test.trim(),
        score: scoreValue,
        max: maxValue,
        takenOn: taken === "" ? null : taken,
      });
      setTest("");
      setScore("");
      setMax("");
      setTaken("");
      toast.push({ title: "Assessment result saved", tone: "success" });
    } catch (error) {
      setProblem(
        error instanceof ApiError
          ? (error.fieldErrors[0]?.message ?? error.message)
          : "The result was not saved. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="Assessment results" className="flex flex-col gap-3">
      <h4 className="text-body-sm font-semibold text-ink">
        Assessment results
      </h4>

      {history.loading ? (
        <Skeleton className="h-10 w-full" />
      ) : history.error ? (
        <p role="alert" className="text-body-sm text-danger-text">
          {history.error.message}
        </p>
      ) : history.current.length > 0 ? (
        <>
          <ul className="flex flex-col gap-1.5">
            {history.current.map((result) => (
              <li key={result.test} className="text-body-sm text-body">
                <CurrentLine result={result} />
              </li>
            ))}
          </ul>
          {history.entries.length > history.current.length && (
            <div>
              <p className="text-meta font-semibold text-faint">History</p>
              <ul className="divide-y divide-line">
                {history.entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap justify-between gap-2 py-1.5 text-meta text-muted"
                  >
                    <span>
                      <EntryLine entry={entry} />
                    </span>
                    <span>{formatDateShort(entry.at, "Africa/Lagos")}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : history.entries.length > 0 ? (
        <p className="text-body-sm text-muted">
          No result is in use now: the one that was here was removed. It is in
          the history.
        </p>
      ) : (
        <p className="text-body-sm text-muted">
          No assessment result yet. It can come from an import for the whole
          advert, or be typed in below.
        </p>
      )}

      {canEdit && (
        <div className="flex flex-col gap-3 rounded-md border border-line p-3">
          <FieldRow>
            <Field
              label="Score"
              help="A number. 0 to 100 unless you say what it is out of."
              {...(scoreBad
                ? {
                    error: `A number from 0 to ${pad(ceiling)}.`,
                  }
                : {})}
            >
              <Input
                inputMode="decimal"
                value={score}
                onChange={(event) => setScore(event.target.value)}
              />
            </Field>
            <Field
              label="Out of"
              optional
              help="What the test was marked out of."
              {...(maxBad ? { error: "A number more than 0." } : {})}
            >
              <Input
                inputMode="decimal"
                value={max}
                onChange={(event) => setMax(event.target.value)}
              />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field
              label="Test"
              optional
              help="Leave empty for the default name, Assessment."
            >
              <Input
                value={test}
                maxLength={80}
                onChange={(event) => setTest(event.target.value)}
              />
            </Field>
            <Field label="Date taken" optional>
              <Input
                type="date"
                value={taken}
                onChange={(event) => setTaken(event.target.value)}
              />
            </Field>
          </FieldRow>
          {problem && (
            <p role="alert" className="text-body-sm text-danger-text">
              {problem}
            </p>
          )}
          <div>
            <Button
              variant="secondary"
              size="sm"
              loading={saving}
              disabled={!typed || bad}
              onClick={() => void save()}
            >
              Save the result
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function CurrentLine({ result }: { result: AssessmentCurrent }) {
  return (
    <>
      <span className="font-medium text-ink">{result.test}:</span>{" "}
      <span className="tabular font-semibold text-ink">
        {resultWords(result)}
      </span>
      {result.takenOn
        ? `, taken ${formatDateShort(result.takenOn, "Africa/Lagos")}`
        : ""}
      {", "}
      {result.source === "IMPORT" ? "from an import" : "typed in"}.
    </>
  );
}

function EntryLine({ entry }: { entry: AssessmentEntry }) {
  return (
    <>
      {entry.test}:{" "}
      {entry.cleared
        ? "removed"
        : `${resultWords(entry)}, ${entry.source === "IMPORT" ? "imported" : "typed in"}`}
      {entry.by ? ` by ${entry.by}` : ""}
    </>
  );
}
