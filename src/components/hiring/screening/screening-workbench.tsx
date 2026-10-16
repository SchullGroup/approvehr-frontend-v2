"use client";

import { FileSpreadsheet, ListChecks } from "lucide-react";
import {
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
} from "@/components/ui";
import { CriteriaPanel } from "@/components/hiring/screening/criteria-panel";
import { PassMarkPanel } from "@/components/hiring/screening/pass-mark-panel";
import { RescoreBar } from "@/components/hiring/screening/rescore-progress";
import { count } from "@/lib/hiring/screening/score";
import { useScreeningGateway } from "@/lib/hiring/screening/use-gateway";
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
 *
 * ## Only what the server can do
 *
 * The pass mark, the assessment scores and the list below the pass mark are drawn
 * only where the server has them. A server with criteria and scores and nothing
 * more is shown the criteria and the scores, not three cards that would fail.
 */
export function ScreeningWorkbench({ postingId }: { postingId: string }) {
  const gateway = useScreeningGateway();
  const rescore = useRescore(postingId);
  const belowHref = `/hiring/postings/${postingId}/below-pass-mark`;

  return (
    <div className="flex flex-col gap-6">
      <Callout tone="info" title="Screening is advice for a person">
        Criteria
        {gateway.supports.passMark ? " and a pass mark" : ""} put the likeliest
        people first
        {gateway.supports.passMark ? " and flag the rest to be looked at" : ""}.
        They are matched on what you write below, and every score shows its
        reasons. Nobody is rejected until a person confirms it.
      </Callout>

      <RescoreBar progress={rescore.progress} onRestart={rescore.restart} />

      <CriteriaPanel postingId={postingId} rescore={rescore} />

      {gateway.supports.passMark && (
        <PassMarkPanel
          postingId={postingId}
          rescore={rescore}
          belowHref={belowHref}
        />
      )}

      {gateway.supports.assessment && (
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
              Each score feeds the sort and the pass mark. The history is kept
              on the person&apos;s record.
            </p>
          </CardBody>
        </Card>
      )}

      {gateway.supports.below && (
        <BelowCard postingId={postingId} href={belowHref} />
      )}
    </div>
  );
}

function BelowCard({ postingId, href }: { postingId: string; href: string }) {
  const below = useBelowCount(postingId);
  return (
    <Card>
      <CardHeader
        title="Below the pass mark"
        description="The people flagged for a person to confirm."
      />
      <CardBody className="flex flex-wrap items-center gap-3">
        <ButtonLink href={href} variant="secondary" size="sm">
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
  );
}
