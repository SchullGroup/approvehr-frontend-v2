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
import type { ScreeningSubject } from "@/lib/hiring/screening/model";
import { parseScoreCell } from "@/lib/hiring/screening/assessment-file";
import { useAssessmentHistory } from "@/lib/hiring/screening/use-screening";
import { formatDateShort } from "@/lib/time";

/**
 * A person's assessment score: what it is, where each one came from, and a box to
 * type one in.
 *
 * The newest score is the one in use. The older ones stay, with who brought them
 * and from which file, so a figure on a list can always be traced to its source.
 */
export function AssessmentRecord({
  subject,
  canEdit,
}: {
  subject: ScreeningSubject;
  /** Typing a score needs the permission to manage hiring. */
  canEdit: boolean;
}) {
  const history = useAssessmentHistory(subject);
  const toast = useToast();
  const [score, setScore] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const parsed = parseScoreCell(score);
  const typed = score.trim() !== "";
  const bad = typed && (parsed === null || parsed > 100);

  async function save() {
    if (parsed === null || parsed > 100) return;
    setSaving(true);
    setProblem(null);
    try {
      await history.enter(parsed, note.trim() === "" ? null : note.trim());
      setScore("");
      setNote("");
      toast.push({ title: "Assessment score saved", tone: "success" });
    } catch (error) {
      setProblem(
        error instanceof ApiError
          ? (error.fieldErrors[0]?.message ?? error.message)
          : "The score was not saved. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  const latest = history.entries[0];

  return (
    <section aria-label="Assessment score" className="flex flex-col gap-3">
      <h4 className="text-body-sm font-semibold text-ink">Assessment score</h4>

      {history.loading ? (
        <Skeleton className="h-10 w-full" />
      ) : history.error ? (
        <p role="alert" className="text-body-sm text-danger-text">
          {history.error.message}
        </p>
      ) : latest ? (
        <>
          <p className="text-body-sm text-body">
            <span className="tabular text-body-md font-semibold text-ink">
              {latest.score}
            </span>{" "}
            out of 100, from{" "}
            {latest.source === "IMPORT"
              ? `an import${latest.filename ? ` (${latest.filename})` : ""}`
              : "a score typed in"}
            .
          </p>
          {history.entries.length > 1 && (
            <ul className="divide-y divide-line">
              {history.entries.slice(1).map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap justify-between gap-2 py-1.5 text-meta text-muted"
                >
                  <span>
                    {entry.score},{" "}
                    {entry.source === "IMPORT" ? "imported" : "typed in"}
                    {entry.by ? ` by ${entry.by}` : ""}
                    {entry.note ? `. ${entry.note}` : ""}
                  </span>
                  <span>{formatDateShort(entry.at, "Africa/Lagos")}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-meta text-muted">
            Latest first: {formatDateShort(latest.at, "Africa/Lagos")}
            {latest.by ? `, ${latest.by}` : ""}.
          </p>
        </>
      ) : (
        <p className="text-body-sm text-muted">
          No assessment score yet. It can come from an import for the whole
          advert, or be typed in below.
        </p>
      )}

      {canEdit && (
        <div className="flex flex-col gap-3 rounded-md border border-line p-3">
          <FieldRow>
            <Field
              label="Type a score"
              help="0 to 100."
              {...(bad ? { error: "A number from 0 to 100." } : {})}
            >
              <Input
                inputMode="decimal"
                value={score}
                onChange={(event) => setScore(event.target.value)}
              />
            </Field>
            <Field label="Note" optional>
              <Input
                value={note}
                maxLength={200}
                onChange={(event) => setNote(event.target.value)}
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
              Save the score
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
