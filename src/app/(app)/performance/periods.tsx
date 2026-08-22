"use client";

import Link from "next/link";
import { CalendarRange } from "lucide-react";
import {
  Badge,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Disclosure,
  EmptyState,
  Spinner,
} from "@/components/ui";
import { dayLabel, type ApiCycle } from "@/lib/api/performance";
import { useAppraisals } from "@/lib/store/performance";
import { StartPeriodButton } from "./start-period";

/**
 * The appraisal periods, as a list of periods and nothing else.
 *
 * ## Why the actions left this screen
 *
 * They used to be here: add the questions, start it, nudge the late ones,
 * publish the results — six controls on a row, in a card at the bottom of a tab
 * called *Appraisals*. So the one screen that answers "what periods are there"
 * also tried to answer "what shall I do to this one", and the second answer
 * squeezed the first into a strip nobody found. A product owner read the module
 * and could not locate the periods at all.
 *
 * Each row is now one link to `/performance/periods/[id]`, which is where a
 * period is run. That is `PARITY.md` Rule 5 at its plainest — a screen answers
 * one question — and it is also the only arrangement in which the row can say
 * what the period needs next rather than offering everything it might ever need.
 *
 * ## Finished periods are behind a reveal, with their count on the line
 *
 * A closed period is a record: nothing on it needs doing, and after three years
 * there are more of them than of anything else. The open ones are above, always.
 * The closed line carries the count, because a section whose summary carries no
 * count has to be opened before anybody learns whether it mattered.
 */
export function PeriodsTab() {
  const appraisals = useAppraisals();

  const periods = appraisals.cycles;
  const live = periods.filter((period) => period.stage !== "PUBLISHED");
  const finished = periods.filter((period) => period.stage === "PUBLISHED");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {DEMO_ENABLED && appraisals.source === "demo" ? (
          <Badge tone="warning" size="sm">
            Demo · this browser only
          </Badge>
        ) : (
          <span />
        )}
        <StartPeriodButton variant="accent" withIcon />
      </div>

      {appraisals.error && (
        <p className="rounded-md border border-danger-line bg-danger-soft px-3.5 py-2.5 text-body-sm text-ink">
          {appraisals.error.message}
        </p>
      )}

      <Card>
        <CardHeader
          title="Open and not yet started"
          description="A period covers a stretch of time. Everybody in the company gets one form inside it."
        />
        {appraisals.loading ? (
          <CardBody className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Reading the periods
          </CardBody>
        ) : live.length === 0 ? (
          <EmptyState
            compact
            icon={<CalendarRange aria-hidden="true" />}
            title="No appraisal period is open"
            description="Start one, write the questions, then start it. Nobody is asked anything until you do."
            action={<StartPeriodButton variant="accent" />}
          />
        ) : (
          <CardBody className="flex flex-col gap-2">
            {live.map((period) => (
              <PeriodRow key={period.id} period={period} />
            ))}
          </CardBody>
        )}
      </Card>

      {finished.length > 0 && (
        <Disclosure
          title="Finished periods"
          meta={
            <Badge tone="neutral" size="sm">
              {finished.length === 1 ? "1 period" : `${finished.length} periods`}
            </Badge>
          }
          hint="Published, and a record now. The marks in them cannot move."
          level={2}
        >
          <div className="flex flex-col gap-2">
            {finished.map((period) => (
              <PeriodRow key={period.id} period={period} />
            ))}
          </div>
        </Disclosure>
      )}

      <p className="text-body-sm text-muted">
        How much each part of an appraisal counts towards a mark is set in{" "}
        <Link
          href="/settings/performance"
          className="font-medium text-accent-text underline-offset-2 hover:underline"
        >
          settings
        </Link>
        , and frozen onto a period the moment it starts.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One period, with the one thing it needs next.
 *
 * The label on the link is the state, not a menu: a draft needs setting up, a
 * running period needs chasing, a published one is read. A row offering all
 * three makes the reader work out which applies, which is the job the row was
 * supposed to do for them.
 */
function PeriodRow({ period }: { period: ApiCycle }) {
  const draft = period.stage === "DRAFT";
  const published = period.stage === "PUBLISHED";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3">
      <div className="min-w-0">
        <p className="text-body-sm font-medium text-ink">{period.name}</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-meta text-muted">
          <Badge tone={published ? "neutral" : "info"} size="sm" dot>
            {period.stageLabel}
          </Badge>
          <span>
            {period.questionCount === 1
              ? "1 question"
              : `${period.questionCount} questions`}
          </span>
          {/* Absent, not zero: a draft has written no forms yet, and "0 forms"
              beside a period nobody has started reads as a failure. */}
          {!draft && (
            <span>
              {period.reviewCount === 1
                ? "1 form"
                : `${period.reviewCount} forms`}
            </span>
          )}
          {period.dueDate && <span>Answers due {dayLabel(period.dueDate)}</span>}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <ButtonLink
          variant={draft ? "accent" : "secondary"}
          size="sm"
          href={`/performance/periods/${period.id}`}
        >
          {draft
            ? "Set it up and start it"
            : published
              ? "See how it came out"
              : "Who is outstanding"}
        </ButtonLink>
      </div>
    </div>
  );
}
