"use client";

import Link from "next/link";
import { CheckCircle2, Scale } from "lucide-react";
import { AttentionMark, ButtonLink, Spinner } from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import type { ApiReviewFlags, ReviewCycleStage } from "@/lib/api/performance";
import { flaggedCount } from "./people-to-review";

const marks = (n: number) => `${String(n)} ${n === 1 ? "mark" : "marks"}`;

/**
 * Why the period cannot be published yet, or null. Mirrors `publishBlocker` in
 * the backend's review-flags module, which is the authority: publishing is
 * refused there whatever this says.
 */
export function publishLock(
  flags: ApiReviewFlags | null,
  stage: ReviewCycleStage | null,
): string | null {
  if (!flags) return null;
  const flagged = flaggedCount(flags);
  if (!flagged) return null;
  if (stage !== "CALIBRATION")
    return `The fairness check flagged ${marks(flagged)}. Move the period to calibration and decide on ${flagged === 1 ? "it" : "each one"} before publishing.`;
  const undecided = flags.counts.open + flags.counts.waiting;
  if (!undecided) return null;
  return `${marks(undecided)} flagged by the fairness check still ${undecided === 1 ? "needs" : "need"} a decision.`;
}

/**
 * The fairness check's place in the period: how many marks are flagged and how
 * many have a decision. Publishing waits on it, so it sits at the top of the
 * period page rather than behind a link.
 */
export function FairnessStatus({
  cycleId,
  stage,
  flags,
  loading,
  error,
  reload,
}: {
  cycleId: string;
  stage: ReviewCycleStage | null;
  flags: ApiReviewFlags | null;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}) {
  const href = `/performance/periods/${cycleId}/fairness?tab=people`;

  if (error)
    return (
      <LoadFailure
        subject="the fairness check"
        error={error}
        onRetry={reload}
      />
    );
  if (!flags) {
    return loading ? (
      <div className="flex items-center gap-2 text-body-sm text-muted">
        <Spinner size="sm" />
        Checking marks against the evidence
      </div>
    ) : null;
  }

  const flagged = flaggedCount(flags);
  const { decided, waiting, open, unclear } = flags.counts;
  const unchecked =
    unclear > 0
      ? ` ${String(unclear)} couldn’t be checked: not enough evidence.`
      : "";

  if (!flagged) {
    return (
      <Status
        tone="success"
        headline="No marks are flagged by the fairness check."
        detail={`Every mark is within ${String(flags.rules.gapBp / 100)} points of what the evidence suggests.${unchecked}`}
        action={
          <Link
            href={href}
            className="text-muted underline-offset-2 hover:underline"
          >
            See the full check
          </Link>
        }
      />
    );
  }

  if (stage !== "CALIBRATION") {
    return (
      <Status
        tone="warning"
        headline={`The fairness check flagged ${marks(flagged)}.`}
        detail="The period goes through calibration before it can be published, and each one gets a decision there: let it stand, change it, or ask the manager."
        action={<Open href={href} label="See them" />}
      />
    );
  }

  if (open + waiting === 0) {
    return (
      <Status
        tone="success"
        headline={`Every flagged mark has a decision (${String(decided)} of ${String(flagged)}).`}
        detail="You can publish the results."
        action={<Open href={href} label="See decisions" />}
      />
    );
  }

  return (
    <Status
      tone="warning"
      headline={`${String(decided)} of ${String(flagged)} flagged marks decided${waiting ? `, ${String(waiting)} waiting on a manager` : ""}${open ? `, ${String(open)} to go` : ""}.`}
      detail="Publishing unlocks when every flagged mark has a decision. Their manager may have a good reason; the check flags, it doesn’t decide."
      action={<Open href={href} label="Review flagged marks" />}
    />
  );
}

/**
 * One line: what the check found, the rest behind a mark, and the way into it.
 *
 * It was a bordered panel with two paragraphs at the top of the period page,
 * over the figures somebody opened the page to read. The sentence that decides
 * what to do next is the headline; the reasoning is behind the mark.
 */
function Status({
  tone,
  headline,
  detail,
  action,
}: {
  tone: "warning" | "success";
  headline: string;
  detail: string;
  action?: React.ReactNode;
}) {
  const warning = tone === "warning";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-body-sm">
      <span className="inline-flex items-center gap-2">
        {warning ? (
          <Scale
            aria-hidden="true"
            className="size-4 shrink-0 text-warning-text"
          />
        ) : (
          <CheckCircle2
            aria-hidden="true"
            className="size-4 shrink-0 text-accent-text"
          />
        )}
        <span className="font-medium text-ink">{headline}</span>
        <AttentionMark tone={warning ? "attention" : "info"} text={detail} />
      </span>
      {action}
    </div>
  );
}

function Open({ href, label }: { href: string; label: string }) {
  return (
    <ButtonLink href={href} variant="secondary" size="sm" className="shrink-0">
      {label}
    </ButtonLink>
  );
}
