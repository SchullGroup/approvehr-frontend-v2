"use client";

import { Button, Skeleton } from "@/components/ui";
import type { CriteriaPreview } from "@/lib/hiring/screening/model";
import { count } from "@/lib/hiring/screening/score";
import { FitBadge } from "@/components/hiring/screening/fit-badge";

/**
 * "This would score these applicants like so", before anything is saved.
 *
 * Asked for on request, never on every keystroke: it reads the advert's own
 * applicants, which for a big advert is real work. It says what it answers (the
 * draft as it was when asked) and when the draft has moved on since, so an old
 * preview is never read as a new one.
 */

const BANDS = ["0 to 19", "20 to 39", "40 to 59", "60 to 79", "80 to 100"];

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
          Shows how these criteria would score the people who have applied.
          Nothing is saved.
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
          <p className="text-body-sm text-body">
            This would score {count(preview.total)}{" "}
            {preview.total === 1 ? "applicant" : "applicants"} like so.{" "}
            {count(preview.scored)} would get a score
            {preview.waitingForText > 0
              ? `, ${count(preview.waitingForText)} are waiting for their CV text`
              : ""}
            {preview.noText > 0
              ? `, and ${count(preview.noText)} have no text and need a person to read the CV`
              : ""}
            .
          </p>

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
                The first {preview.rows.length}
              </p>
              <ul className="mt-1 divide-y divide-line">
                {preview.rows.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <span className="min-w-0 text-body-sm text-ink [overflow-wrap:anywhere]">
                      {row.name}
                    </span>
                    <FitBadge fit={row.fit} />
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
