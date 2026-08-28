"use client";

import { TriangleAlert } from "lucide-react";
import {
  Badge,
  ButtonLink,
  Callout,
  ProgressMeter,
  Spinner,
} from "@/components/ui";
import {
  EXCEPTION_CODE_SUMMARY,
  type ApiAppraiserException,
  type ApiCycleReport,
} from "@/lib/api/performance";
import { useAppraiserMap, useCycleReport } from "@/lib/store/performance";

/**
 * How far along the running period is, in four figures.
 *
 * ## Why this exists
 *
 * The module opened on a list of periods, and to learn how one was *going* you
 * had to open it. So the first question anybody arrives with — "where is this up
 * to" — was answered two clicks away from the screen that asked it, and the
 * landing page was a work list with no company-wide state on it at all.
 *
 * Every figure here comes from `GET /performance/cycles/:id/report`, which
 * already returned all of them. Nothing is computed on this side, deliberately:
 * `performance-report.test.ts` asserts the identities these numbers satisfy
 * (bands sum to `scored`, `scored + unscored` is `marks.people`), and a second
 * implementation in a browser is how two screens start disagreeing about the
 * same cycle. Same rule as the distribution and the trend.
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
 * ## Three absences, none of them a zero
 *
 * - **No permission.** `useCycleReport`'s `enabled` is `EDIT_RECORDS`, asked by
 *   the caller. An employee gets no strip — not four zeroed cells, which would
 *   be a claim about a company they are not allowed to read.
 * - **Offline.** The report refuses in demo mode, for the reason
 *   `useCycleRegister` gives: every figure on it is a register row. The strip is
 *   absent and the work list underneath is untouched.
 * - **A cell with nothing to measure yet.** Sign-off before any mark is final
 *   has a denominator of zero, and "0 of 0" reads as *nobody has signed off*
 *   when the truth is *nothing is ready to be signed off*. Those are different
 *   facts, so a zero-denominator cell says which one it is and renders no bar.
 *
 * That last one is the same rule as `operates: NOT_OPERATED` on a payslip and
 * `weightedRating` being null while appraisers have not answered. Rendering 0
 * where nothing belongs is a wrong claim, not a cosmetic slip.
 */

type Cell = {
  label: string;
  done: number;
  total: number;
  /** What a zero denominator means here. Never "0 of 0". */
  notYet: string;
};

function cellsFrom(report: ApiCycleReport): Cell[] {
  return [
    {
      label: "Self-reviews",
      done: report.forms.selfIn,
      total: report.forms.people,
      notYet: "Nobody has a form yet",
    },
    {
      label: "Manager reviews",
      done: report.forms.managerIn,
      /* Reviews, not people. See the header. */
      total: report.forms.managerIn + report.forms.managerOutstanding,
      notYet: "No manager review is due yet",
    },
    {
      label: "Marks final",
      done: report.marks.finalised,
      total: report.marks.people,
      notYet: "Nobody is in the register yet",
    },
    {
      label: "Signed off",
      done: report.marks.acknowledged,
      /* You can only answer a mark you have been told, so the denominator is
         what has been finalised — not the headcount. */
      total: report.marks.finalised,
      notYet: "No mark is final yet",
    },
  ];
}

function StatusCell({ cell }: { cell: Cell }) {
  const nothingToMeasure = cell.total === 0;
  const complete = !nothingToMeasure && cell.done === cell.total;

  return (
    <div className="min-w-0 flex-1 basis-40 rounded-md border border-line px-3 py-2.5">
      <p className="text-meta font-semibold uppercase tracking-[0.08em] text-muted">
        {cell.label}
      </p>

      {nothingToMeasure ? (
        <p className="mt-1.5 text-body-sm text-muted">{cell.notYet}</p>
      ) : (
        <>
          <p className="tabular mt-1 text-body-sm font-medium text-ink">
            {cell.done} of {cell.total}
          </p>
          <ProgressMeter
            className="mt-1.5"
            value={cell.done}
            max={cell.total}
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
  cycleId,
  canSeeCompany,
}: {
  cycleId: string | null;
  canSeeCompany: boolean;
}) {
  const { report, loading } = useCycleReport(cycleId, canSeeCompany);
  const appraisers = useAppraiserMap(canSeeCompany ? cycleId : null, {
    exceptionsOnly: true,
  });

  if (loading) {
    return (
      <div className="flex items-center gap-2 border-t border-line px-5 py-4 text-body-sm text-muted">
        <Spinner size="sm" />
        Reading how far along it is
      </div>
    );
  }

  /* Absent, not zero. No permission, no connection, or no report — the strip is
     not here, and the work list below is unaffected. */
  if (!report) return null;

  const lines = exceptionLines(appraisers.map?.rows ?? []);
  const blocking = lines.some((line) => line.severity === "BLOCKER");

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
              href={`/performance/periods/${report.cycleId}`}
              variant="secondary"
              size="sm"
            >
              Review and fix
            </ButtonLink>
          </p>
        </Callout>
      )}

      <div className="flex flex-wrap gap-2">
        {cellsFrom(report).map((cell) => (
          <StatusCell key={cell.label} cell={cell} />
        ))}
      </div>

      <p className="flex flex-wrap items-center gap-2 text-meta text-muted">
        <span>
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
          href={`/performance/periods/${report.cycleId}/report`}
          variant="ghost"
          size="sm"
        >
          See the whole report
        </ButtonLink>
      </p>
    </div>
  );
}
