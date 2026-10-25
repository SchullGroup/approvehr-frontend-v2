"use client";

import {
  Drawer,
  DrawerSection,
  LoadFailure,
  SkeletonText,
  TextLink,
} from "@/components/ui";
import {
  type CompanyReport,
  type DepartmentRow,
  type ShownDepartment,
  ofLabel,
} from "@/lib/api/company-report";
import { useDepartmentPeople } from "@/lib/store/company-report";
import {
  DASH,
  gapSentence,
  koboOrDash,
  likelyRange,
  markOrDash,
  plural,
  progressOrDash,
} from "./format";

/**
 * One department, in the side panel, in the order OWI's team panel runs: who,
 * what the figures say, what connects to it, and who is in it.
 *
 * ## The panel adds nothing the table was withholding
 *
 * A department under five people gets its headcount and one sentence and
 * nothing below it: the API sends no figure for it, and `people` answers with an
 * empty list and the same sentence, so there is no second route to the number.
 *
 * ## People to look at is everybody, by name
 *
 * Not the best, not the worst. Everyone in the department, sorted by name, each
 * with their mark and a "why" that is a short list of plain facts a reader could
 * check (their basis for being on a list, a mark that sits a long way from the
 * evidence behind it, no mark, no appraiser). The panel says that marks are not
 * adjusted for how each manager rates, and when the period is not published it
 * says marks can still move.
 */
export function DepartmentPanel({
  departmentId,
  row,
  report,
  onClose,
}: {
  departmentId: string | null;
  row: DepartmentRow | null;
  report: CompanyReport;
  onClose: () => void;
}) {
  const cycle = report.cycle;
  const people = useDepartmentPeople(
    row?.shown ? departmentId : null,
    cycle?.id ?? null,
  );

  return (
    <Drawer
      open={row !== null}
      onClose={onClose}
      title={row?.name ?? ""}
      description={
        row
          ? `${String(row.people)} ${plural(row.people, "person", "people")}`
          : undefined
      }
    >
      {row && (
        <div className="flex flex-col gap-6">
          <button
            type="button"
            className="self-start text-meta text-muted hover:text-ink hover:underline"
            onClick={onClose}
          >
            Company reports / Departments
          </button>

          <DrawerSection title="Led by">
            <p className="text-body-sm text-ink">
              {row.headName ?? <span className="text-muted">No head set</span>}
            </p>
          </DrawerSection>

          {!row.shown ? (
            <p className="text-body-sm text-muted">
              {row.reason === "small"
                ? "Fewer than 5 people: figures are not shown."
                : "Left out so a smaller department's figures cannot be worked out from this one's."}
            </p>
          ) : (
            <>
              <Results row={row} costFrom={report.departments?.costFrom} />
              <Process row={row} />
              <Fairness row={row} />
              <Related row={row} report={report} />
              <People
                state={people}
                fairnessHref={
                  report.rules && cycle
                    ? `/performance/periods/${cycle.id}/fairness`
                    : null
                }
                nineBoxHref={
                  cycle ? `/performance/periods/${cycle.id}/nine-box` : null
                }
              />
            </>
          )}
        </div>
      )}
    </Drawer>
  );
}

/* -------------------------------------------------------------------------- */

function Line({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-body-sm text-muted">{label}</dt>
      <dd className="text-right text-body-sm text-ink">{children}</dd>
    </div>
  );
}

function Results({
  row,
  costFrom,
}: {
  row: ShownDepartment;
  costFrom: NonNullable<CompanyReport["departments"]>["costFrom"];
}) {
  const { results } = row;
  const bands = Object.entries(results.bands).filter(([, n]) => n > 0);
  return (
    <DrawerSection title="Results">
      <dl className="divide-y divide-line">
        <Line label="Average mark">
          <span className="tabular font-medium">
            {markOrDash(results.markMeanBp)}
          </span>
          <span className="block text-meta text-muted">
            {ofLabel({ n: results.scored, of: row.people })} scored
          </span>
        </Line>
        <Line label="Marks by band">
          <span className="text-meta text-muted">
            {bands.length === 0
              ? DASH
              : bands
                  .map(([band, n]) => `${String(n)} ${bandWords(band)}`)
                  .join(", ")}
          </span>
        </Line>
        <Line label="Goal progress">
          <span className="tabular">
            {progressOrDash(results.goals.progressMean)}
          </span>
          <span className="block text-meta text-muted">
            {results.goals.objectives === 0
              ? "No agreed objectives"
              : `${String(results.goals.objectives)} agreed ${plural(results.goals.objectives, "objective", "objectives")}${
                  results.goals.atRiskOrOff > 0
                    ? `, ${String(results.goals.atRiskOrOff)} at risk or off track`
                    : ""
                }`}
          </span>
        </Line>
        <Line label="Weekly tasks">
          <span className="tabular">
            {ofLabel({ n: results.tasks.withLogged, of: results.tasks.people })}{" "}
            logged
          </span>
          <span className="block text-meta text-muted">
            {results.tasks.withGraded}{" "}
            {plural(results.tasks.withGraded, "has", "have")} one graded
          </span>
        </Line>
        {row.cost && (
          <Line label="Gross pay per head">
            <span className="tabular">{koboOrDash(row.cost.perHeadKobo)}</span>
            <span className="block text-meta text-muted">
              {row.cost.paid} {plural(row.cost.paid, "person", "people")} on the
              {costFrom ? ` ${costFrom.period}` : ""} payroll
            </span>
          </Line>
        )}
      </dl>
    </DrawerSection>
  );
}

function bandWords(band: string): string {
  const words: Record<string, string> = {
    OUTSTANDING: "outstanding",
    EXCEEDS: "exceeds",
    MEETS: "meets",
    PARTIALLY_MEETS: "partly meets",
    BELOW: "below",
  };
  return words[band] ?? band.toLowerCase();
}

function Process({ row }: { row: ShownDepartment }) {
  const { process } = row;
  return (
    <DrawerSection title="Process">
      <dl className="divide-y divide-line">
        <Line label="Have an appraiser">
          <span className="tabular">
            {ofLabel({ n: process.withAppraiser, of: row.people })}
          </span>
        </Line>
        <Line label="Have an agreed objective">
          <span className="tabular">
            {ofLabel({ n: process.withAgreedObjective, of: row.people })}
          </span>
        </Line>
        <Line label="Manager reviews in">
          <span className="tabular">
            {process.reviewsExpected === 0
              ? DASH
              : ofLabel({
                  n: process.reviewsWritten,
                  of: process.reviewsExpected,
                })}
          </span>
        </Line>
        {process.flagged && (
          <Line label="Flagged marks decided">
            <span className="tabular">
              {process.flagged.total === 0
                ? "None flagged"
                : ofLabel({
                    n: process.flagged.total - process.flagged.open,
                    of: process.flagged.total,
                  })}
            </span>
          </Line>
        )}
      </dl>
    </DrawerSection>
  );
}

function Fairness({ row }: { row: ShownDepartment }) {
  if (!row.fairness) return null;
  const range = likelyRange(row.fairness.lowBp, row.fairness.highBp);
  return (
    <DrawerSection title="Fairness">
      <p className="text-body-sm text-ink">
        Average mark {gapSentence(row.fairness.gapBp)}
        {range ? ` (likely range ${range} points)` : ""}.
      </p>
      <p className="mt-1 text-meta text-muted">
        {row.fairness.flagged
          ? "The Fairness check flags this gap. A gap can come from the work or from how marks were given."
          : "The Fairness check does not flag this gap."}
      </p>
    </DrawerSection>
  );
}

/**
 * The findings that name this department, as plain lines with their link.
 *
 * The same idea as OWI's "connections and friction": what the report already
 * said about this group, so the panel is a way into it rather than a second
 * telling.
 */
function Related({
  row,
  report,
}: {
  row: ShownDepartment;
  report: CompanyReport;
}) {
  const related = report.findings.filter(
    (finding) =>
      finding.departments?.includes(row.name) ||
      finding.lines?.some((line) => line.department === row.name) ||
      finding.evidence.some((line) =>
        line.startsWith(`Department: ${row.name},`),
      ),
  );
  if (related.length === 0) return null;
  return (
    <DrawerSection title="Findings that name it">
      <ul className="flex flex-col gap-2">
        {related.map((finding) => (
          <li key={finding.id} className="text-body-sm text-body">
            {finding.title}.{" "}
            {finding.act && (
              <TextLink href={finding.act.href}>{finding.act.label}</TextLink>
            )}
          </li>
        ))}
      </ul>
    </DrawerSection>
  );
}

function People({
  state,
  fairnessHref,
  nineBoxHref,
}: {
  state: ReturnType<typeof useDepartmentPeople>;
  fairnessHref: string | null;
  nineBoxHref: string | null;
}) {
  return (
    <DrawerSection title="Everyone in this department">
      {state.error ? (
        <LoadFailure
          subject="the people in this department"
          error={state.error}
          onRetry={state.reload}
        />
      ) : state.loading || !state.people ? (
        <SkeletonText lines={4} />
      ) : state.people.people.length === 0 ? (
        <p className="text-body-sm text-muted">
          {state.people.caveats.join(" ")}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {state.people.people.map((person) => (
              <li
                key={person.employeeId}
                className="flex flex-col gap-0.5 py-2.5"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <TextLink href={`/performance/history/${person.employeeId}`}>
                    {person.name}
                  </TextLink>
                  <span className="tabular text-body-sm text-ink">
                    {markOrDash(person.markBp)}
                  </span>
                </span>
                <span className="text-meta text-muted">{person.jobTitle}</span>
                {person.why.length > 0 && (
                  <ul className="mt-0.5 flex flex-col gap-0.5 text-meta text-muted">
                    {person.why.map((why) => (
                      <li key={why}>{why}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <ul className="mt-3 flex flex-col gap-1 text-meta text-muted">
            {state.people.caveats.map((line) => (
              <li key={line}>{line}</li>
            ))}
            <li>Sorted by name, not by mark.</li>
          </ul>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-meta">
            {nineBoxHref && (
              <TextLink href={nineBoxHref}>Open the nine-box</TextLink>
            )}
            {fairnessHref && (
              <TextLink href={fairnessHref}>Open the Fairness check</TextLink>
            )}
          </p>
        </>
      )}
    </DrawerSection>
  );
}
