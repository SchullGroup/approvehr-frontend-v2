"use client";

import { ArrowRight } from "lucide-react";
import { ButtonLink, Callout } from "@/components/ui";
import type { ApiApplication } from "@/lib/api/careers";
import { count } from "@/lib/hiring/screening/score";
import { useBelowCount } from "@/lib/hiring/screening/use-screening";

/**
 * What the queue says about screening when it is looking at one advert.
 *
 * Two things a person at this list would want to know and cannot see from a row:
 * that the advert has no criteria yet (so nobody has a score, and what to do about
 * it), and how many people are below the pass mark (so where to go to look at
 * them). Neither is said when it is not true, and nothing here says anybody has
 * been turned down.
 */
export function PostingScreeningNote({
  postingId,
  rows,
}: {
  postingId: string;
  /** The rows on screen, to tell "no criteria" from "not loaded". */
  rows: readonly ApiApplication[];
}) {
  const below = useBelowCount(postingId);
  const screening = rows.map((row) => row.screening).filter(Boolean);
  const noCriteria =
    screening.length > 0 &&
    screening.every((summary) => summary?.fit.status === "NO_CRITERIA");

  if (noCriteria) {
    return (
      <Callout tone="info" title="This advert has no screening criteria yet">
        <div className="flex flex-col items-start gap-2">
          <p>
            Nobody here has a score. Add what you are looking for and everybody
            who has applied is scored, with the reasons shown.
          </p>
          <ButtonLink
            href={`/hiring/postings/${postingId}?tab=screening`}
            variant="secondary"
            size="sm"
          >
            Add criteria
          </ButtonLink>
        </div>
      </Callout>
    );
  }

  if (below.count && below.count.below > 0) {
    return (
      <Callout tone="neutral" title="Some are below the pass mark">
        <div className="flex flex-col items-start gap-2">
          <p>
            {count(below.count.below)}{" "}
            {below.count.below === 1 ? "person is" : "people are"} below this
            advert&apos;s pass mark. Nobody is rejected until a person confirms it.
          </p>
          <ButtonLink
            href={`/hiring/postings/${postingId}/below-pass-mark`}
            variant="secondary"
            size="sm"
          >
            Review them
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </ButtonLink>
        </div>
      </Callout>
    );
  }
  return null;
}
