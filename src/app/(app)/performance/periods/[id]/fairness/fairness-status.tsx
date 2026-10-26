"use client";

import Link from "next/link";
import { CheckCircle2, Scale } from "lucide-react";
import { ButtonLink, Spinner } from "@/components/ui";
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
      <Banner tone="success">
        <p className="font-medium">
          No marks are flagged by the fairness check.
        </p>
        <p className="mt-1 text-body">
          Every mark is within {String(flags.rules.gapBp / 100)} points of what
          the evidence suggests.{unchecked}
        </p>
        <Link
          href={href}
          className="mt-2 inline-block text-muted underline-offset-2 hover:underline"
        >
          See the full check
        </Link>
      </Banner>
    );
  }

  if (stage !== "CALIBRATION") {
    return (
      <Banner tone="warning" action={<Open href={href} label="See them" />}>
        <p className="font-medium">
          The fairness check flagged {marks(flagged)}.
        </p>
        <p className="mt-1 text-body">
          The period goes through calibration before it can be published, and
          each one gets a decision there: let it stand, change it, or ask the
          manager.
        </p>
      </Banner>
    );
  }

  if (open + waiting === 0) {
    return (
      <Banner
        tone="success"
        action={<Open href={href} label="See decisions" />}
      >
        <p className="font-medium">
          Every flagged mark has a decision ({String(decided)} of{" "}
          {String(flagged)}).
        </p>
        <p className="mt-1 text-body">You can publish the results.</p>
      </Banner>
    );
  }

  return (
    <Banner
      tone="warning"
      action={<Open href={href} label="Review flagged marks" />}
    >
      <p className="font-medium">
        {String(decided)} of {String(flagged)} flagged marks decided
        {waiting ? `, ${String(waiting)} waiting on a manager` : ""}
        {open ? `, ${String(open)} to go` : ""}.
      </p>
      <p className="mt-1 text-body">
        Publishing unlocks when every flagged mark has a decision. Their manager
        may have a good reason; the check flags, it doesn’t decide.
      </p>
    </Banner>
  );
}

function Banner({
  tone,
  action,
  children,
}: {
  tone: "warning" | "success";
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const warning = tone === "warning";
  return (
    <div
      className={
        warning
          ? "flex flex-wrap items-start gap-4 rounded-lg border border-warning-line bg-warning-soft px-5 py-4"
          : "flex flex-wrap items-start gap-4 rounded-lg border border-success-line bg-success-soft px-5 py-4"
      }
    >
      {warning ? (
        <Scale
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-warning-text"
        />
      ) : (
        <CheckCircle2
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-success-text"
        />
      )}
      <div
        className={`min-w-0 flex-1 text-body-sm ${warning ? "text-warning-text" : "text-success-text"}`}
      >
        {children}
      </div>
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
