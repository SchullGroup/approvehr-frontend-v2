"use client";

import { TriangleAlert } from "lucide-react";
import {
  Badge,
  ButtonLink,
  Callout,
  ProgressMeter,
  Spinner,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  EXCEPTION_CODE_SUMMARY,
  dayLabel,
  type ApiAppraiserException,
  type ApiCycle,
  type ApiCycleReport,
  type ReviewCycleStage,
} from "@/lib/api/performance";
import { useAppraiserMap, useCycleReport } from "@/lib/store/performance";

/**
 * How far along the running period is, as a rail rather than four tiles.
 *
 * ## Why it is a rail
 *
 * The four figures were right and they did not say they were a *sequence*. Self
 * reviews come in, then managers write theirs, then marks are made final, then
 * people answer them — that order is the whole model, and it was being carried
 * by a four-bullet paragraph elsewhere on the same screen explaining it in
 * words. A rail with the live stage tinted says it in one object, which is why
 * that paragraph is gone.
 *
 * ## Everybody sees the rail. Not everybody sees the figures.
 *
 * This used to render nothing at all without `EDIT_RECORDS`, on the correct
 * grounds that four zeroed cells would be a claim about a company somebody is
 * not allowed to read. But *which stage the period is in* is not that claim —
 * it is the single most useful thing an employee can know about a period they
 * are in, and they were being shown a work list with no idea whether anybody
 * had started.
 *
 * So the two are split:
 *
 * | | Sees |
 * |---|---|
 * | Anybody in the period | the four stages, which one is live, the due date |
 * | `EDIT_RECORDS` | that, plus every count and the exceptions |
 *
 * A staff member gets no numerators, no denominators and no bars — not zeroed
 * ones. Absent, not zero, exactly as before; what changed is that the *shape*
 * of the period was never the privileged part.
 *
 * ## The manager denominator is not the headcount
 *
 * `forms.managerOutstanding` counts **reviews** still to come in, not people —
 * `performance/service.ts` says so where it is computed, because one person can
 * carry more than one appraiser and somebody with two appraisers and one answer
 * contributes 1 to it rather than 0. So the denominator is
 * `managerIn + managerOutstanding` and never `forms.people`, which in a
 * multi-appraiser company would report the period as further along than it is.
 *
 * ## A cell with nothing to measure yet
 *
 * Sign-off before any mark is final has a denominator of zero, and "0 of 0"
 * reads as *nobody has signed off* when the truth is *nothing is ready to be
 * signed off*. Those are different facts, so a zero-denominator segment says
 * which one it is and renders no bar. Same rule as `operates: NOT_OPERATED` on
 * a payslip and `weightedRating` being null while appraisers have not answered.
 */

type Segment = {
  /** Short enough for a rail segment. The long form is the cell label. */
  label: string;
  /** The stage this segment is the work of. Null for sign-off, which follows
      publication rather than being a stage of its own. */
  stage: ReviewCycleStage | null;
  done: number;
  total: number;
  /** What a zero denominator means here. Never "0 of 0". */
  notYet: string;
};

function segmentsFrom(report: ApiCycleReport | null): Segment[] {
  return [
    {
      label: "Self",
      stage: "SELF",
      done: report?.forms.selfIn ?? 0,
      total: report?.forms.people ?? 0,
      notYet: "Nobody has a form yet",
    },
    {
      label: "Manager",
      stage: "MANAGER",
      done: report?.forms.managerIn ?? 0,
      /* Reviews, not people. See the header. */
      total: report
        ? report.forms.managerIn + report.forms.managerOutstanding
        : 0,
      notYet: "No manager review is due yet",
    },
    {
      label: "Marks final",
      stage: "CALIBRATION",
      done: report?.marks.finalised ?? 0,
      total: report?.marks.people ?? 0,
      notYet: "Nobody is in the register yet",
    },
    {
      label: "Signed off",
      stage: "PUBLISHED",
      done: report?.marks.acknowledged ?? 0,
      /* You can only answer a mark you have been told, so the denominator is
         what has been finalised — not the headcount. */
      total: report?.marks.finalised ?? 0,
      notYet: "No mark is final yet",
    },
  ];
}

function RailSegment({
  segment,
  live,
  showFigures,
}: {
  segment: Segment;
  live: boolean;
  showFigures: boolean;
}) {
  const nothingToMeasure = segment.total === 0;
  const complete = !nothingToMeasure && segment.done === segment.total;

  return (
    <div
      className={cn(
        "min-w-0 flex-1 basis-32 border-r border-line px-3 py-2.5 last:border-r-0",
        live && "bg-accent-soft",
      )}
    >
      <p
        className={cn(
          "truncate text-meta font-semibold",
          live ? "text-accent-text" : "text-muted",
        )}
      >
        {segment.label}
        {live && <span className="sr-only"> — the stage this period is in</span>}
      </p>

      {!showFigures ? (
        /* No numerator, no denominator, no bar. The stage names and which one
           is live are the whole of what somebody outside the register is
           entitled to, and they are worth having. */
        <p className="mt-1 text-body-sm text-muted">{live ? "Now" : ""}</p>
      ) : nothingToMeasure ? (
        <p className="mt-1.5 text-body-sm text-muted">{segment.notYet}</p>
      ) : (
        <>
          <p className="tabular mt-1 text-body-sm font-medium text-ink">
            {segment.done} of {segment.total}
          </p>
          <ProgressMeter
            className="mt-1.5"
            value={segment.done}
            max={segment.total}
            tone={complete ? "success" : "accent"}
            size="sm"
            showValue={false}
          />
        </>
      )}
    </div>
  );
}

/** The same exception, however many people it names, said once. */
function exceptionLines(
  rows: { exceptions: ApiAppraiserException[] }[],
): { code: ApiAppraiserException["code"]; severity: string; text: string }[] {
  const counts = new Map<
    ApiAppraiserException["code"],
    { severity: string; count: number }
  >();

  for (const row of rows) {
    for (const issue of row.exceptions) {
      const seen = counts.get(issue.code);
      /* A blocker anywhere in the group makes the group a blocker. */
      counts.set(issue.code, {
        severity:
          seen?.severity === "BLOCKER" || issue.severity === "BLOCKER"
            ? "BLOCKER"
            : issue.severity,
        count: (seen?.count ?? 0) + 1,
      });
    }
  }

  return [...counts.entries()].map(([code, { severity, count }]) => ({
    code,
    severity,
    text: EXCEPTION_CODE_SUMMARY[code](count),
  }));
}

export function PeriodStatus({
  cycle,
  canSeeCompany,
}: {
  cycle: ApiCycle;
  canSeeCompany: boolean;
}) {
  const { report, loading } = useCycleReport(cycle.id, canSeeCompany);
  const appraisers = useAppraiserMap(canSeeCompany ? cycle.id : null, {
    exceptionsOnly: true,
  });

  /* Only the figures wait on the request. The rail itself is drawn from the
     cycle the caller already has, so it does not flash for anybody. */
  if (canSeeCompany && loading) {
    return (
      <div className="flex items-center gap-2 border-t border-line px-5 py-4 text-body-sm text-muted">
        <Spinner size="sm" />
        Reading how far along it is
      </div>
    );
  }

  /* Counts need both the permission and an answer. Without either, the rail
     still renders — it just carries stages rather than figures. */
  const showFigures = canSeeCompany && report !== null;

  const lines = exceptionLines(appraisers.map?.rows ?? []);
  const blocking = lines.some((line) => line.severity === "BLOCKER");
  const segments = segmentsFrom(report);

  return (
    <div className="flex flex-col gap-3 border-t border-line px-5 py-4">
      {/* Above the figures, never below them. A blocker in row forty is a
          blocker nobody read — the payroll run's own discipline. */}
      {lines.length > 0 && (
        <Callout
          tone={blocking ? "danger" : "warning"}
          title={
            blocking
              ? "Somebody will finish this period with no mark"
              : "Worth sorting before the period closes"
          }
          icon={<TriangleAlert aria-hidden="true" />}
        >
          <ul className="flex flex-col gap-1">
            {lines.map((line) => (
              <li key={line.code}>{line.text}</li>
            ))}
          </ul>
          <p className="mt-2">
            <ButtonLink
              href={`/performance/periods/${cycle.id}`}
              variant="secondary"
              size="sm"
            >
              Review and fix
            </ButtonLink>
          </p>
        </Callout>
      )}

      <div className="flex flex-wrap overflow-hidden rounded-md border border-line">
        {segments.map((segment) => (
          <RailSegment
            key={segment.label}
            segment={segment}
            live={segment.stage === cycle.stage}
            showFigures={showFigures}
          />
        ))}
      </div>

      <p className="flex flex-wrap items-center gap-2 text-meta text-muted">
        {/* The stage in the API's own words, for everybody. A rail says where
            in the sequence; this says what that stage is called. */}
        <span>At {cycle.stageLabel}</span>
        {cycle.dueDate && <span>· Answers due {dayLabel(cycle.dueDate)}</span>}

        {showFigures && report && (
          <>
            <span>
              ·{" "}
              {report.marks.people === 1
                ? "1 person in this period"
                : `${report.marks.people} people in this period`}
            </span>
            {report.marks.disputed > 0 && (
              <Badge tone="warning" size="sm">
                {report.marks.disputed === 1
                  ? "1 mark disputed"
                  : `${report.marks.disputed} marks disputed`}
              </Badge>
            )}
            <ButtonLink
              href={`/performance/periods/${cycle.id}/report`}
              variant="ghost"
              size="sm"
            >
              See the whole report
            </ButtonLink>
          </>
        )}

        {/* The explanation, one link from the thing it explains, instead of
            four bullets printed on this screen for everybody for ever. */}
        <ButtonLink href="/performance/how-it-works" variant="ghost" size="sm">
          How this works
        </ButtonLink>
      </p>
    </div>
  );
}
