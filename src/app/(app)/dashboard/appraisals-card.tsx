"use client";

import { ClipboardList } from "lucide-react";
import {
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Spinner,
} from "@/components/ui";
import { StartPeriodButton } from "@/app/(app)/performance";
import { PeriodStatus } from "@/app/(app)/performance/period-status";
import { periodInPlay } from "@/lib/api/performance";
import { useCan } from "@/lib/permissions";
import { useAppraisals } from "@/lib/store/performance";

/**
 * Appraisals, as one card instead of a button in the corner.
 *
 * ## What this replaced
 *
 * A single control — "Start an appraisal period" — in the dashboard's page
 * header, beside the greeting. The product owner's word for it was
 * *scattered*, and that is exactly right: the header is where the page's own
 * identity lives, and hanging one module's action off it says nothing about
 * whether a period is running, how far along it is, or whether starting
 * another would be sensible. Somebody pressed it to find out.
 *
 * The rule this keeps is the module's own, from the barrel in
 * `app/(app)/performance/index.ts`: *the same action should be reachable from
 * every screen somebody might be on when the thought occurs.* That rule was
 * never an argument for a bare button — it is an argument for the same
 * `StartPeriodButton`, which is what this renders. One dialog, several doors;
 * this door now has a room behind it.
 *
 * ## Three states, and the third is the one that was missing
 *
 * | State | What the card says |
 * |---|---|
 * | No period ever run | what an appraisal period is for, and the button |
 * | One running | how far along it is, and a way in |
 * | Only finished ones | when the last one closed, and the button |
 *
 * `PeriodStatus` is the middle one and is the same component `/performance`
 * renders — self-reviews in, manager reviews in, marks final, signed off, every
 * figure from `GET /performance/cycles/:id/report`. Nothing is computed here.
 * A second implementation of a score is how two screens come to disagree about
 * the same person, which is the rule that whole module is built on.
 *
 * ## It draws nothing rather than an empty frame
 *
 * Absent when the company has appraisals switched off (the catalogue's
 * `feature` gate), and absent when the reader can neither run a period nor see
 * a report — a card headed "Appraisals" with one sentence saying they cannot
 * see it is worse than the space it takes.
 */
export function AppraisalsCard() {
  const appraisals = useAppraisals();
  /* The same permission `/performance` uses to decide whether the register and
     the report are readable at all. Without it there is a period running and
     nothing this card could honestly say about it. */
  const canSeeCompany = useCan("EDIT_RECORDS");
  const canRun = useCan("MANAGE_SETTINGS");

  if (appraisals.loading) {
    return (
      <Card className="h-full">
        <CardHeader title="Appraisals" level={3} />
        <CardBody className="flex items-center gap-2 text-body-sm text-muted">
          <Spinner size="sm" />
          Loading
        </CardBody>
      </Card>
    );
  }

  const period = periodInPlay(appraisals.cycles);
  const running =
    period !== undefined &&
    period.stage !== "PUBLISHED" &&
    period.stage !== "DRAFT";

  /* Nothing to show and nothing to offer. */
  if (!running && !canRun && !canSeeCompany) return null;

  return (
    <Card className="h-full">
      <CardHeader
        title="Appraisals"
        level={3}
        description={
          running
            ? period.name
            : period
              ? `The last one was ${period.name}.`
              : "Nobody has been appraised through ApproveHR yet."
        }
        action={
          /* Renders nothing when the company has appraisals off or the reader
             cannot run one — its own gate, unchanged. A dead control on the
             screen people open first is worse than no control. */
          <StartPeriodButton withIcon />
        }
      />

      {running ? (
        <>
          <CardBody className="flex flex-wrap items-center gap-2">
            <ButtonLink href="/performance" variant="secondary" size="sm">
              <ClipboardList aria-hidden="true" className="size-3.5" />
              Open appraisals
            </ButtonLink>
          </CardBody>
          {/* The figures. Absent for a reader without the permission, and for a
              period with no report yet — never zeroed. */}
          <PeriodStatus cycleId={period.id} canSeeCompany={canSeeCompany} />
        </>
      ) : (
        <CardBody>
          <p className="text-body-sm text-muted">
            An appraisal period asks everybody to write their own review, asks
            their manager to write one back, and produces a mark that can be
            explained afterwards. Nothing happens to anybody&rsquo;s pay
            automatically.
          </p>
        </CardBody>
      )}
    </Card>
  );
}
