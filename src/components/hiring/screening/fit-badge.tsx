import {
  ArrowDownToLine,
  ClipboardList,
  Gauge,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import type {
  FitSummary,
  ScreeningSummary,
} from "@/lib/hiring/screening/model";
import { STALE_NOTE, statusWords } from "@/lib/hiring/screening/score";

/**
 * A fit score, wherever a person sits in a list.
 *
 * ## The number is always written
 *
 * A bar, a colour or a position is decoration. The figure and the status are in the
 * text, so nothing here depends on seeing a colour and a screen reader hears the
 * same thing a sighted person reads: "Fit score 72 out of 100".
 *
 * ## A score is advice
 *
 * Nothing here is red, and nothing says anybody has been turned down. Somebody
 * with no readable CV is amber because they need a person to read the CV, which is
 * a thing to do, not a verdict.
 */

/** The badge for a list row or a table cell. */
export function FitBadge({
  fit,
  size = "sm",
}: {
  fit: FitSummary;
  size?: "sm" | "md";
}) {
  const words = statusWords(fit);
  const scored = fit.status === "SCORED" && fit.score !== null;
  return (
    <Badge
      tone={fit.stale && scored ? "info" : words.tone}
      size={size}
      icon={
        scored ? (
          <Gauge />
        ) : fit.status === "NO_TEXT" || fit.status === "COULD_NOT_READ" ? (
          <TriangleAlert />
        ) : (
          <ClipboardList />
        )
      }
      title={`${words.detail}${fit.stale ? ` ${STALE_NOTE}` : ""}`}
    >
      {words.label}
      {scored && <span className="sr-only"> out of 100</span>}
      {fit.stale && scored && (
        <span className="font-normal"> (older version)</span>
      )}
    </Badge>
  );
}

/**
 * A small bar with the number beside it, for a card on the board.
 *
 * The bar is decoration (`aria-hidden`); the text is the reading. A person with no
 * score gets the status in words and no bar at all, never an empty one that would
 * read as zero.
 */
export function FitBar({
  fit,
  className,
}: {
  fit: FitSummary;
  className?: string;
}) {
  const words = statusWords(fit);
  const scored = fit.status === "SCORED" && fit.score !== null;
  if (!scored) {
    return (
      <p
        className={cn("text-meta text-muted", className)}
        title={words.detail}
        data-testid="fit-bar"
      >
        {words.label}
      </p>
    );
  }
  const score = fit.score ?? 0;
  return (
    <div className={cn("min-w-0", className)} data-testid="fit-bar">
      <p
        className="flex items-baseline justify-between gap-2 text-meta text-body"
        title={`${words.detail}${fit.stale ? ` ${STALE_NOTE}` : ""}`}
      >
        <span className="font-medium text-ink">
          Fit <span className="tabular">{score}</span>
        </span>
        <span className="tabular text-muted">out of 100</span>
      </p>
      <div
        aria-hidden="true"
        className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-sunken"
      >
        <div
          className={cn(
            "h-full rounded-full",
            fit.stale ? "bg-info" : "bg-accent",
          )}
          style={{ width: `${String(score)}%` }}
        />
      </div>
      {fit.stale && (
        <p className="mt-1 text-meta text-info-text">
          Older version, new score on its way
        </p>
      )}
    </div>
  );
}

/**
 * The assessment result as a badge, or nothing while there is none (never a 0).
 *
 * It is a percentage of what the test was marked out of, so tests with different
 * maximums read the same way.
 */
export function AssessmentBadge({
  score,
}: {
  score: number | null | undefined;
}) {
  if (score === null || score === undefined) return null;
  return (
    <Badge
      tone="info"
      size="sm"
      icon={<ClipboardList />}
      title="Assessment result, as a percentage of what the test is marked out of"
    >
      Assessment {score}%
    </Badge>
  );
}

/**
 * "Below the pass mark". It is a place to look, not a decision: the title says what
 * happens next, and that a person decides.
 */
export function BelowBadge({ below }: { below: boolean }) {
  if (!below) return null;
  return (
    <Badge
      tone="warning"
      size="sm"
      icon={<ArrowDownToLine />}
      title="Below this advert's pass mark. A person decides what happens next."
    >
      Below the pass mark
    </Badge>
  );
}

/** Everything a row says about screening, in the order it reads. */
export function ScreeningBadges({
  summary,
  bar = false,
}: {
  summary: ScreeningSummary | null | undefined;
  /** A bar under the number: for a card, not a row. */
  bar?: boolean;
}) {
  if (!summary) return null;
  return (
    <>
      {bar ? null : <FitBadge fit={summary.fit} />}
      <AssessmentBadge score={summary.assessment} />
      <BelowBadge below={summary.belowPassMark} />
    </>
  );
}
