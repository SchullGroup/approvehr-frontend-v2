"use client";

import { useMemo, useState } from "react";
import { Building2 } from "lucide-react";
import {
  BubbleChart,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  SegmentedControl,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
  TextLink,
} from "@/components/ui";
import type { BubblePoint } from "@/components/ui";
import { InfoTooltip } from "@/components/ui/field";
import {
  type CompanyReport,
  type ReportBand,
  type ShownDepartment,
  ofLabel,
} from "@/lib/api/company-report";
import { DepartmentPanel } from "./department-panel";
import {
  DASH,
  gapSentence,
  koboOrDash,
  likelyRange,
  markOrDash,
  plural,
  progressOrDash,
  signedPoints,
} from "./format";

type Lens = "results" | "process" | "fairness";

/**
 * The Departments tab: one row per department, a lens to choose which columns,
 * and one picture.
 *
 * ## Sorted by name, always
 *
 * Never by score, so the table cannot read as a league. Nothing here ranks a
 * department and the chart names no quadrant ("stars", "laggards") because a
 * word like that is a verdict, and this report only states what the records say.
 *
 * ## The lens chooses content, not colour
 *
 * OWI's report colours everything by one axis. This one does not: Results,
 * Process and Fairness pick which columns the table and the panel show, and
 * they are the same three axes the findings are grouped under.
 *
 * ## A department under five people is a headcount and a sentence
 *
 * The API returns it with no figure keys at all (`shown: false`), so there is
 * nothing here that could print one. It is not plotted, and the chart's note
 * says how many were left out.
 */
export function DepartmentsTab({ report }: { report: CompanyReport }) {
  const departments = report.departments;
  const [lens, setLens] = useState<Lens>("results");
  const [openId, setOpenId] = useState<string | null>(null);

  if (!departments || !report.cycle) {
    return (
      <Card>
        <EmptyState
          icon={<Building2 aria-hidden="true" />}
          title="Nothing to compare yet"
          description="Departments are compared once an appraisal period has started."
        />
      </Card>
    );
  }

  const lenses: { value: Lens; label: string }[] = [
    { value: "results", label: "Results" },
    { value: "process", label: "Process" },
    ...(report.rules
      ? [{ value: "fairness" as const, label: "Fairness" }]
      : []),
  ];
  const shown = departments.rows.filter(
    (row): row is ShownDepartment => row.shown,
  );
  const hasCost = shown.some((row) => row.cost !== undefined);
  const cycle = report.cycle;

  return (
    <div className="flex flex-col gap-6">
      {lens === "results" && (
        <ResultsChart
          shown={shown}
          departments={departments}
          hasCost={hasCost}
          onOpen={setOpenId}
          openId={openId}
        />
      )}

      <Card>
        <CardHeader
          level={2}
          title="By department"
          action={
            <SegmentedControl
              label="Lens"
              options={lenses}
              value={lens}
              onChange={setLens}
            />
          }
        />
        <CardBody className="flex flex-col gap-3 p-0">
          <DepartmentTable
            rows={departments.rows}
            lens={lens}
            hasCost={hasCost}
            onOpen={setOpenId}
          />
          <p className="px-4 pb-4 text-meta text-muted sm:px-5">
            {departments.caveat}{" "}
            {report.rules && (
              <TextLink href={`/performance/periods/${cycle.id}/fairness`}>
                Open the Fairness check
              </TextLink>
            )}
          </p>
        </CardBody>
      </Card>

      <DepartmentPanel
        departmentId={openId}
        row={departments.rows.find((row) => row.id === openId) ?? null}
        report={report}
        onClose={() => {
          setOpenId(null);
        }}
      />
    </div>
  );
}

/**
 * The departments, as they print: the picture and the Results table, with
 * nothing to click and no panel. No people are named on paper, and the side
 * panel and its list of people are where they are named, so they are simply not
 * part of this. (A department's name is not a person's.)
 */
export function PrintDepartments({ report }: { report: CompanyReport }) {
  const departments = report.departments;
  if (!departments || !report.cycle) return null;
  const shown = departments.rows.filter(
    (row): row is ShownDepartment => row.shown,
  );
  const hasCost = shown.some((row) => row.cost !== undefined);
  return (
    <div className="flex flex-col gap-6">
      <ResultsChart
        shown={shown}
        departments={departments}
        hasCost={hasCost}
        openId={null}
      />
      <Card>
        <CardHeader level={2} title="By department" />
        <CardBody className="flex flex-col gap-3 p-0">
          <DepartmentTable
            rows={departments.rows}
            lens="results"
            hasCost={hasCost}
          />
          <p className="px-4 pb-4 text-meta text-muted sm:px-5">
            {departments.caveat}
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The picture                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Average mark against cost per head, or against goal progress for somebody who
 * may not see pay. Area is headcount.
 *
 * With `VIEW_SALARIES` the horizontal axis is gross pay per head, and the chart
 * says in a tooltip that cost per head reflects who works in a department as
 * well as how well it is rated. Without it the horizontal axis is goal progress
 * and no key in the response mentions money. Departments under five people are
 * not plotted and the note under the chart counts them.
 */
function ResultsChart({
  shown,
  departments,
  hasCost,
  onOpen,
  openId,
}: {
  shown: ShownDepartment[];
  departments: NonNullable<CompanyReport["departments"]>;
  hasCost: boolean;
  /** Absent on paper: the chart is then a picture, with nothing to press. */
  onOpen?: (id: string) => void;
  openId: string | null;
}) {
  const plotted = useMemo(() => {
    const points: BubblePoint[] = [];
    for (const row of shown) {
      const mark = row.results.markMeanBp;
      const x = hasCost
        ? row.cost !== undefined
          ? row.cost.perHeadKobo / 100
          : null
        : row.results.goals.progressMean;
      if (mark === null || x === null) continue;
      const percent = mark / 100;
      points.push({
        id: row.id,
        label: row.name,
        x,
        y: percent,
        size: row.people,
        flagged: row.fairness?.flagged === true,
        detail: `${row.name}, ${String(row.people)} ${plural(row.people, "person", "people")}, average mark ${markOrDash(mark)}, ${
          hasCost
            ? `gross pay per head ${koboOrDash(row.cost?.perHeadKobo)}`
            : `goal progress ${progressOrDash(row.results.goals.progressMean)}`
        }${row.fairness?.flagged ? ", flagged by the Fairness check" : ""}`,
      });
    }
    return points;
  }, [shown, hasCost]);

  if (plotted.length === 0) return null;

  const company = departments.company;
  const referenceX = hasCost
    ? company.perHeadKobo === undefined
      ? undefined
      : company.perHeadKobo / 100
    : (company.goalProgressMean ?? undefined);
  const referenceY =
    company.markMeanBp === null ? undefined : company.markMeanBp / 100;
  const title = hasCost
    ? "Average mark against gross pay per head"
    : "Average mark against goal progress";

  return (
    <Card>
      <CardHeader
        level={2}
        title={
          <span className="inline-flex items-center gap-2">
            How the departments compare
            {hasCost && (
              <InfoTooltip
                label="About cost per head"
                text="Cost per head reflects who works in a department as well as how well it is rated. It is not a measure of value."
              />
            )}
          </span>
        }
        description={`Bubble size is headcount.${hasCost && departments.costFrom ? ` Pay is from the ${departments.costFrom.period} payroll.` : ""}`}
      />
      <CardBody className="flex flex-col gap-2">
        <BubbleChart
          points={plotted}
          title={title}
          summary={`${String(plotted.length)} ${plural(plotted.length, "department is", "departments are")} plotted. The horizontal axis is ${hasCost ? "gross pay per head, per month" : "average goal progress"}, the vertical axis is the average mark, and bubble size is headcount.`}
          xLabel={
            hasCost ? "Gross pay per head, per month" : "Average goal progress"
          }
          yLabel="Average mark"
          formatX={(value) =>
            hasCost ? wholeNaira(value) : `${String(Math.round(value))}%`
          }
          formatY={(value) => `${String(Math.round(value))}%`}
          {...(referenceX === undefined ? {} : { referenceX })}
          {...(referenceY === undefined ? {} : { referenceY })}
          selectedId={openId}
          {...(onOpen === undefined ? {} : { onSelect: onOpen })}
        />
        {departments.notShown > 0 && (
          <p className="text-meta text-muted">
            Not shown: {departments.notShown}{" "}
            {plural(departments.notShown, "department", "departments")} with
            fewer than 5 people.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* The table                                                                   */
/* -------------------------------------------------------------------------- */

const BAND_ORDER: ReportBand[] = [
  "OUTSTANDING",
  "EXCEEDS",
  "MEETS",
  "PARTIALLY_MEETS",
  "BELOW",
];
const BAND_WORDS: Record<ReportBand, string> = {
  OUTSTANDING: "Outstanding",
  EXCEEDS: "Exceeds",
  MEETS: "Meets",
  PARTIALLY_MEETS: "Partly meets",
  BELOW: "Below",
};
const BAND_FILL: Record<ReportBand, string> = {
  OUTSTANDING: "bg-accent",
  EXCEEDS: "bg-accent/70",
  MEETS: "bg-accent/40",
  PARTIALLY_MEETS: "bg-warning/70",
  BELOW: "bg-warning",
};

/**
 * How the marks in a department are spread, as one bar and the same facts in
 * words for anybody who cannot see the bar. Over the people who have a mark, and
 * the sentence beside it says how many that is.
 */
function BandBar({ bands }: { bands: Record<ReportBand, number> }) {
  const total = BAND_ORDER.reduce((sum, band) => sum + bands[band], 0);
  const words = BAND_ORDER.filter((band) => bands[band] > 0)
    .map((band) => `${String(bands[band])} ${BAND_WORDS[band].toLowerCase()}`)
    .join(", ");
  if (total === 0) return <span className="text-muted">{DASH}</span>;
  return (
    <span className="inline-flex flex-col gap-1">
      <span
        aria-hidden="true"
        className="flex h-2 w-28 overflow-hidden rounded-full bg-sunken"
      >
        {BAND_ORDER.map((band) =>
          bands[band] > 0 ? (
            <span
              key={band}
              className={BAND_FILL[band]}
              style={{ width: `${String((bands[band] / total) * 100)}%` }}
            />
          ) : null,
        )}
      </span>
      <span className="sr-only">{words}</span>
    </span>
  );
}

type Row = CompanyReport["departments"] extends infer D
  ? D extends { rows: (infer R)[] }
    ? R
    : never
  : never;

const WITHHELD: Record<"small" | "protects", string> = {
  small: "Fewer than 5 people: figures are not shown.",
  protects:
    "Left out so a smaller department's figures cannot be worked out from this one's.",
};

/**
 * An axis tick or a reference line, in whole naira.
 *
 * The table and every bubble's own description carry the exact figure with its
 * kobo; two decimals on every tick of an axis is noise nobody is reconciling.
 */
const wholeNaira = (naira: number): string =>
  `₦${Math.round(naira).toLocaleString("en-NG")}`;

function DepartmentTable({
  rows,
  lens,
  hasCost,
  onOpen,
}: {
  rows: Row[];
  lens: Lens;
  hasCost: boolean;
  /** Absent on paper: names are then plain text and the rows do nothing. */
  onOpen?: (id: string) => void;
}) {
  const columns = {
    results: hasCost ? 7 : 6,
    process: 6,
    fairness: 4,
  }[lens];
  return (
    <>
      <div className="hidden sm:block">
        <TableWrap caption={`Departments by ${lens}, in name order`}>
          <THead>
            <TH>Department</TH>
            <TH align="right">People</TH>
            {lens === "results" && (
              <>
                <TH align="right">Average mark</TH>
                <TH>Marks</TH>
                <TH align="right">Goal progress</TH>
                <TH align="right">Weekly tasks</TH>
                {hasCost && <TH align="right">Gross pay per head</TH>}
              </>
            )}
            {lens === "process" && (
              <>
                <TH align="right">Have an appraiser</TH>
                <TH align="right">Agreed objectives</TH>
                <TH align="right">Manager reviews in</TH>
                <TH align="right">Flagged marks decided</TH>
              </>
            )}
            {lens === "fairness" && (
              <>
                <TH align="right">Against everyone else</TH>
                <TH>Likely range</TH>
              </>
            )}
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id}>
                <TD>
                  {onOpen ? (
                    <button
                      type="button"
                      className="text-left font-medium text-accent-text hover:underline"
                      onClick={() => {
                        onOpen(row.id);
                      }}
                    >
                      {row.name}
                    </button>
                  ) : (
                    <span className="font-medium text-ink">{row.name}</span>
                  )}
                </TD>
                <TD align="right">
                  <span className="tabular">{row.people}</span>
                </TD>
                {row.shown ? (
                  <ShownCells row={row} lens={lens} hasCost={hasCost} />
                ) : (
                  <TD colSpan={columns - 2}>
                    <span className="text-meta text-muted">
                      {WITHHELD[row.reason]}
                    </span>
                  </TD>
                )}
              </TR>
            ))}
          </TBody>
        </TableWrap>
      </div>

      {onOpen && (
        <ul className="divide-y divide-line sm:hidden">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="flex w-full flex-col gap-1 p-4 text-left"
                onClick={() => {
                  onOpen(row.id);
                }}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-ink">{row.name}</span>
                  <span className="tabular text-meta text-muted">
                    {row.people} {plural(row.people, "person", "people")}
                  </span>
                </span>
                {row.shown ? (
                  <MobileFigures row={row} lens={lens} hasCost={hasCost} />
                ) : (
                  <span className="text-meta text-muted">
                    {WITHHELD[row.reason]}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ShownCells({
  row,
  lens,
  hasCost,
}: {
  row: ShownDepartment;
  lens: Lens;
  hasCost: boolean;
}) {
  if (lens === "results") {
    const { results } = row;
    const objectives = results.goals.objectives;
    return (
      <>
        <TD align="right">
          <span className="tabular font-medium text-ink">
            {markOrDash(results.markMeanBp)}
          </span>
          <span className="block text-meta text-muted">
            {results.scored} of {row.people} scored
          </span>
        </TD>
        <TD>
          <BandBar bands={results.bands} />
        </TD>
        <TD align="right">
          <span className="tabular text-ink">
            {progressOrDash(results.goals.progressMean)}
          </span>
          <span className="block text-meta text-muted">
            {objectives === 0
              ? "No agreed objectives"
              : `${String(objectives)} ${plural(objectives, "objective", "objectives")}${
                  results.goals.atRiskOrOff > 0
                    ? `, ${String(results.goals.atRiskOrOff)} at risk or off track`
                    : ""
                }`}
          </span>
        </TD>
        <TD align="right">
          <span className="tabular text-ink">
            {results.tasks.withLogged} of {results.tasks.people} logged
          </span>
          <span className="block text-meta text-muted">
            {results.tasks.withGraded}{" "}
            {plural(results.tasks.withGraded, "has", "have")} one graded
          </span>
        </TD>
        {hasCost && (
          <TD align="right">
            <span className="tabular text-ink">
              {koboOrDash(row.cost?.perHeadKobo)}
            </span>
          </TD>
        )}
      </>
    );
  }
  if (lens === "process") {
    const { process } = row;
    return (
      <>
        <TD align="right">
          <span className="tabular">
            {ofLabel({ n: process.withAppraiser, of: row.people })}
          </span>
        </TD>
        <TD align="right">
          <span className="tabular">
            {ofLabel({ n: process.withAgreedObjective, of: row.people })}
          </span>
        </TD>
        <TD align="right">
          <span className="tabular">
            {process.reviewsExpected === 0
              ? DASH
              : ofLabel({
                  n: process.reviewsWritten,
                  of: process.reviewsExpected,
                })}
          </span>
        </TD>
        <TD align="right">
          <span className="tabular">
            {process.flagged === undefined
              ? DASH
              : process.flagged.total === 0
                ? "None flagged"
                : ofLabel({
                    n: process.flagged.total - process.flagged.open,
                    of: process.flagged.total,
                  })}
          </span>
        </TD>
      </>
    );
  }
  const gap = row.fairness;
  return (
    <>
      <TD align="right">
        {gap ? (
          <>
            <span className="tabular font-medium text-ink">
              {signedPoints(gap.gapBp)} points
            </span>
            <span className="block text-meta text-muted">
              {gap.flagged ? (
                <>
                  <span
                    aria-hidden="true"
                    className="mr-1.5 inline-block size-2 rounded-full bg-warning"
                  />
                  Flagged: {gapSentence(gap.gapBp)}
                </>
              ) : (
                "Not flagged"
              )}
            </span>
          </>
        ) : (
          <span className="text-muted">Not compared</span>
        )}
      </TD>
      <TD>
        <span className="tabular text-muted">
          {gap ? (likelyRange(gap.lowBp, gap.highBp) ?? DASH) : DASH}
        </span>
      </TD>
    </>
  );
}

function MobileFigures({
  row,
  lens,
  hasCost,
}: {
  row: ShownDepartment;
  lens: Lens;
  hasCost: boolean;
}) {
  if (lens === "results") {
    return (
      <span className="flex flex-col gap-0.5 text-meta text-muted">
        <span>
          Average mark{" "}
          <span className="tabular font-medium text-ink">
            {markOrDash(row.results.markMeanBp)}
          </span>
          , {row.results.scored} of {row.people} scored
        </span>
        <span>
          Goal progress {progressOrDash(row.results.goals.progressMean)}
          {hasCost && (
            <>, gross pay per head {koboOrDash(row.cost?.perHeadKobo)}</>
          )}
        </span>
      </span>
    );
  }
  if (lens === "process") {
    return (
      <span className="text-meta text-muted">
        {ofLabel({ n: row.process.withAppraiser, of: row.people })} have an
        appraiser,{" "}
        {ofLabel({ n: row.process.withAgreedObjective, of: row.people })} have
        an agreed objective
      </span>
    );
  }
  return (
    <span className="text-meta text-muted">
      {row.fairness
        ? `${signedPoints(row.fairness.gapBp)} points against everyone else${row.fairness.flagged ? ", flagged" : ""}`
        : "Not compared"}
    </span>
  );
}
