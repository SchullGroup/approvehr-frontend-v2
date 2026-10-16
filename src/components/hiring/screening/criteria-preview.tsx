"use client";

import { Button, Skeleton } from "@/components/ui";
import type { CriteriaPreview, PreviewRow } from "@/lib/hiring/screening/model";
import { count } from "@/lib/hiring/screening/score";

/**
 * "This would score these applicants like so", before anything is saved.
 *
 * It is tried on a sample: the newest applicants whose CV has been read, because a
 * CV nobody has read has no words to try a draft on. So it says how many it was
 * tried on and how many there were to choose from, and never reads as a count of
 * everybody. Each person shows the score they have now and the one the draft would
 * give, in words, so a change is a sentence and not a colour.
 *
 * Asked for on request, never on every keystroke, and it says when the draft has
 * moved on since it was made, so an old preview is never read as a new one.
 */

const BANDS = Array.from({ length: 10 }, (_, index) =>
  index === 9
    ? "90 to 100"
    : `${String(index * 10)} to ${String(index * 10 + 9)}`,
);

/** "72, up 12 from 60": the draft's score and what it did, in words. */
export function changeWords(row: PreviewRow): string {
  if (row.next === null) {
    return row.current === null
      ? "No score either way"
      : `No score with these. They have ${String(row.current)} now`;
  }
  if (row.current === null) return `Fit ${String(row.next)}, with no score now`;
  if (row.change === 0) return `Fit ${String(row.next)}, no change`;
  const by = Math.abs(row.change ?? 0);
  return `Fit ${String(row.next)}, ${(row.change ?? 0) > 0 ? "up" : "down"} ${String(by)} from ${String(row.current)}`;
}

export function CriteriaPreviewPanel({
  status,
  preview,
  message,
  outOfDate,
  onRun,
  disabled,
}: {
  status: "idle" | "loading" | "ready" | "failed";
  preview: CriteriaPreview | null;
  message: string | null;
  /** The draft changed after this was asked. */
  outOfDate: boolean;
  onRun: () => void;
  /** The draft is not complete enough to preview. */
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          loading={status === "loading"}
          disabled={disabled}
          onClick={onRun}
        >
          {status === "ready"
            ? "Preview again"
            : "Preview on current applicants"}
        </Button>
        <p className="text-meta text-muted">
          Tries these criteria on some of the people who have applied. Nothing
          is saved.
        </p>
      </div>

      {status === "loading" && !preview && (
        <div>
          <Skeleton className="h-24 w-full" />
          <span className="sr-only-focusable">Working out the preview</span>
        </div>
      )}

      {status === "failed" && message && (
        <p role="alert" className="text-body-sm text-danger-text">
          {message}
        </p>
      )}

      {preview && (
        <div
          className={outOfDate ? "opacity-70" : undefined}
          data-testid="criteria-preview"
        >
          {outOfDate && (
            <p className="mb-2 text-body-sm text-warning-text">
              You changed the criteria after this was made. Preview again to see
              the new picture.
            </p>
          )}
          {preview.sampled === 0 ? (
            <p className="text-body-sm text-body">
              Nobody can be tried on yet: no applicant has a CV that has been
              read. Once some have, this shows how the criteria would score
              them.
            </p>
          ) : (
            <p className="text-body-sm text-body">
              Tried on the newest {count(preview.sampled)} of{" "}
              {count(preview.available)}{" "}
              {preview.available === 1 ? "applicant" : "applicants"} whose CV
              has been read. {count(preview.scored)} would get a score
              {preview.notScorable > 0
                ? `, and ${count(preview.notScorable)} would not, because there is too little in the CV to judge`
                : ""}
              {preview.mean !== null
                ? `. The average would be ${String(preview.mean)}`
                : ""}
              .
            </p>
          )}

          {preview.scored > 0 && (
            <ul
              className="mt-3 flex flex-col gap-1.5"
              aria-label="Scores by band"
            >
              {BANDS.map((band, index) => {
                const n = preview.bands[index] ?? 0;
                const widest = Math.max(1, ...preview.bands);
                return (
                  <li
                    key={band}
                    className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-3 text-meta"
                  >
                    <span className="text-muted">{band}</span>
                    <span
                      aria-hidden="true"
                      className="h-2 overflow-hidden rounded-full bg-sunken"
                    >
                      <span
                        className="block h-full rounded-full bg-accent"
                        style={{ width: `${String((n / widest) * 100)}%` }}
                      />
                    </span>
                    <span className="tabular text-right text-body">
                      {count(n)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {preview.rows.length > 0 && (
            <>
              <p className="mt-4 text-meta font-semibold text-faint">
                Each person tried
              </p>
              <ul className="mt-1 divide-y divide-line">
                {preview.rows.map((row) => (
                  <li key={row.id} className="flex flex-col gap-0.5 py-2">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="min-w-0 text-body-sm font-medium text-ink [overflow-wrap:anywhere]">
                        {row.name}
                      </span>
                      <span className="tabular text-body-sm text-body">
                        {changeWords(row)}
                      </span>
                    </span>
                    {row.reasons && (
                      <span className="text-meta text-muted">
                        {row.reasons}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
