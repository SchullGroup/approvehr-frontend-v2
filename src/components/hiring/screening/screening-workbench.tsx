"use client";

import { FileSpreadsheet, ListChecks } from "lucide-react";
import {
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Callout,
} from "@/components/ui";
import { CriteriaPanel } from "@/components/hiring/screening/criteria-panel";
import { PassMarkPanel } from "@/components/hiring/screening/pass-mark-panel";
import { RescoreBar } from "@/components/hiring/screening/rescore-progress";
import { count } from "@/lib/hiring/screening/score";
import {
  useBelowCount,
  useRescore,
} from "@/lib/hiring/screening/use-screening";

/**
 * An advert's screening, in the order it is done: what to look for, where the line
 * is, and the scores that come from outside.
 *
 * ## Advice, then a person
 *
 * The first thing on the page says what screening is for, because the people
 * setting it up are also the people who will be tempted to treat a number as an
 * answer: it puts the likeliest people first and flags the rest for a person to
 * look at. Nobody is rejected by it.
 *
 * ## One re-score, shared
 *
 * Saving criteria and saving a pass mark both start the same kind of work on the
 * API, so there is one progress bar for the page and both panels tell it to watch.
 */
export function ScreeningWorkbench({ postingId }: { postingId: string }) {
  const rescore = useRescore(postingId);
  const below = useBelowCount(postingId);
  const belowHref = `/hiring/postings/${postingId}/below-pass-mark`;

  return (
    <div className="flex flex-col gap-6">
      <Callout tone="info" title="Screening is advice for a person">
        Criteria and a pass mark put the likeliest people first and flag the
        rest to be looked at. They are matched on what you write below, and
        every score shows its reasons. Nobody is rejected until a person
        confirms it.
      </Callout>

      <RescoreBar progress={rescore.progress} />

      <CriteriaPanel postingId={postingId} rescore={rescore} />

      <PassMarkPanel
        postingId={postingId}
        rescore={rescore}
        belowHref={belowHref}
      />

      <Card>
        <CardHeader
          title="Assessment scores"
          description="A boot camp or a test sends back a spreadsheet. Import it here, or type one score on a person's record."
        />
        <CardBody className="flex flex-wrap items-center gap-3">
          <ButtonLink
            href={`/hiring/postings/${postingId}/assessment-scores`}
            variant="secondary"
            size="sm"
          >
            <FileSpreadsheet aria-hidden="true" className="size-3.5" />
            Import assessment scores
          </ButtonLink>
          <p className="text-meta text-muted">
            Each score feeds the sort and the pass mark. The history is kept on
            the person&apos;s record.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Below the pass mark"
          description="The people flagged for a person to confirm."
        />
        <CardBody className="flex flex-wrap items-center gap-3">
          <ButtonLink href={belowHref} variant="secondary" size="sm">
            <ListChecks aria-hidden="true" className="size-3.5" />
            {below.count
              ? `Review ${count(below.count.below)} below the pass mark`
              : "Review who is below the pass mark"}
          </ButtonLink>
          {below.count && (
            <p className="text-meta text-muted">
              Of {count(below.count.total)} waiting.
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
