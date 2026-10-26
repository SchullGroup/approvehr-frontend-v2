"use client";

import { useState } from "react";
import { Button, Callout, ProgressMeter, Spinner } from "@/components/ui";
import type { RescoreProgress } from "@/lib/hiring/screening/model";
import { count } from "@/lib/hiring/screening/score";

/**
 * "Re-scoring 1,240 of 4,210", while it happens.
 *
 * Saving criteria starts a re-score of everybody who has applied, and for a big
 * advert that takes a while. The bar is a real one (done out of total) when the API
 * says both, and a quiet "Working on it" when it only says it is running. Nothing
 * here blocks anything: a person keeps editing, reading and deciding, and the
 * scores on screen move to the new version as they are ready.
 */

const CAUSE: Record<NonNullable<RescoreProgress["cause"]>, string> = {
  CRITERIA: "Re-scoring after the criteria changed",
  PASS_MARK: "Working out who is below the new pass mark",
  CV_TEXT: "Scoring CVs as their text is read",
};

export function RescoreBar({
  progress,
  onRestart,
}: {
  progress: RescoreProgress;
  /** Present only where the API offers to score everybody again. */
  onRestart?: (() => Promise<void>) | null | undefined;
}) {
  const [restarting, setRestarting] = useState(false);

  if (!progress.running) {
    if (!progress.failure) return null;
    return (
      <Callout tone="warning" title="The last re-score stopped part way">
        <div className="flex flex-col items-start gap-2">
          <p>
            {progress.failure} Some scores may be from an older version until it
            has run again.
          </p>
          {onRestart && (
            <Button
              variant="secondary"
              size="sm"
              loading={restarting}
              onClick={() => {
                setRestarting(true);
                void onRestart().finally(() => setRestarting(false));
              }}
            >
              Score everybody again
            </Button>
          )}
        </div>
      </Callout>
    );
  }
  const heading = progress.cause ? CAUSE[progress.cause] : "Re-scoring";
  const known = progress.total > 0;
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-2 rounded-lg border border-info-line bg-info-soft p-4"
    >
      {known ? (
        <ProgressMeter
          label={`${heading}: ${count(progress.done)} of ${count(progress.total)}`}
          value={progress.done}
          max={progress.total}
          valueLabel={`${count(progress.done)} of ${count(progress.total)}`}
          tone="info"
        />
      ) : (
        <p className="flex items-center gap-2 text-body-sm font-medium text-info-text">
          <Spinner size="sm" label="Working" />
          {heading}
        </p>
      )}
      <p className="text-meta text-info-text">
        {progress.cause === "PASS_MARK"
          ? "You can keep working. Nobody's score changes and nobody is rejected: this only decides who is flagged for a person to look at."
          : "You can keep working. Scores change to the new version as they are ready, and anybody still waiting is marked as scored with an older version."}
      </p>
    </div>
  );
}
