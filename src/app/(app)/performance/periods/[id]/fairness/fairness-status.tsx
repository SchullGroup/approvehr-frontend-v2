"use client";

import Link from "next/link";
import { CheckCircle2, Scale } from "lucide-react";
import { ButtonLink, Spinner } from "@/components/ui";
import { useCan } from "@/lib/permissions";
import { useSession } from "@/lib/store/session";
import { useReviewFlags } from "@/lib/store/performance";
import { flaggedCount } from "./people-to-review";

/**
 * Inline fairness status for the period page during calibration.
 *
 * The old approach — a "Fairness check" link in the page header — was easy
 * to skip. This replaces it with a block that *demands* attention:
 *
 * - Flagged people  → amber warning with count and a direct link
 * - No flags        → green confirmation so HR knows it was checked
 * - Loading         → quiet spinner, no layout shift
 *
 * Rendered only during the CALIBRATION stage, where the check is actionable.
 * Once published the CalibrationAudit block (below the register) carries the
 * audit trail instead.
 */
export function FairnessStatus({ cycleId }: { cycleId: string }) {
  const allowed = useCan("VIEW_FAIRNESS");
  const { isConnected } = useSession();
  const review = useReviewFlags(cycleId, allowed && isConnected);

  if (!allowed || !isConnected) return null;

  const flagged = flaggedCount(review.flags);
  const href = `/performance/periods/${cycleId}/fairness`;

  if (review.loading && !review.flags) {
    return (
      <div className="flex items-center gap-2 text-body-sm text-muted">
        <Spinner size="sm" />
        Checking marks against the evidence
      </div>
    );
  }

  if (flagged > 0) {
    return (
      <div className="flex items-start gap-4 rounded-lg border border-warning-border bg-warning-subtle px-5 py-4">
        <Scale
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-warning-text"
        />
        <div className="min-w-0 flex-1">
          <p className="text-body-sm font-medium text-warning-text">
            {flagged === 1
              ? "1 person's mark differs from what their record suggests"
              : `${flagged} people's marks differ from what their records suggest`}
          </p>
          <p className="mt-1 text-body-sm text-body">
            Review {flagged === 1 ? "them" : "each one"} in the fairness check
            before publishing. Their manager may have a good reason — the check
            flags, it doesn&apos;t decide.
          </p>
        </div>
        <ButtonLink
          href={href}
          variant="secondary"
          size="sm"
          className="shrink-0"
        >
          Open fairness check
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-success-border bg-success-subtle px-5 py-4">
      <CheckCircle2
        aria-hidden="true"
        className="size-4 shrink-0 text-success-text"
      />
      <p className="flex-1 text-body-sm text-success-text">
        Every mark is within range of what the evidence suggests.
      </p>
      <Link
        href={href}
        className="shrink-0 text-body-sm text-muted underline-offset-2 hover:underline"
      >
        See the full check
      </Link>
    </div>
  );
}
