"use client";

import Link from "next/link";
import {
  CheckCheck,
  LineChart,
  Lock,
  TriangleAlert,
  UserX,
} from "lucide-react";
import {
  Badge,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  ColumnChart,
  DescriptionList,
  EmptyState,
  Spinner,
  Stat,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import {
  scoreLabel,
  weightLabel,
  type ApiBandCount,
  type ApiCycleReport,
  type ApiNamedOnList,
  type ApiScoreRegister,
  type ScoreBand,
} from "@/lib/api/performance";
import { useCan } from "@/lib/permissions";
import {
  BAND_TONE,
  useCycleRegister,
  useCycleReport,
} from "@/lib/store/performance";

/**
 * "N of M", or what the absence is when there is no M.
 *
 * A zero denominator is never "0 of 0" — that reads as a measurement of a set
 * that does not exist yet. The same rule `StatusCell` in `period-status.tsx`
 * follows with its `notYet`, applied to the rows on this screen.
 */
function ratio(done: number, total: number, notYet: string): string {
  return total === 0 ? notYet : `${done} of ${total}`;
}

/**
 * How a cycle came out.
 *
 * ## Every denominator is on screen beside its numerator
 *
 * This is the one screen in the module where that rule is the design rather than
 * a detail. The audit of the incumbent's own performance dashboard found
 * "Completed Criteria 0 — out of 0 total criteria" and "Avg Weight Used 0%"
 * rendered directly above "Performance Score 3.9 — Organization Avg" and a
 * distribution claiming an employee at 92.4% criteria completion. Zero criteria
 * existed. The headline number on the module's front page was computed from data
 * the rest of their product said did not exist.
 *
 * So: forms are counted over the people who have a form, marks over the people
 * the register covers, and the two live in separate cards each stating its own
 * total. The API returns them as two blocks for the same reason. Nothing here
 * divides one by the other, and no figure is rendered without the population it
 * came from.
 *
 * ## An unscored person is not in the bottom band
 *
 * The distribution has five bands and a sixth row that is deliberately **not** a
 * band: people with no mark. Banding them would put somebody nobody assessed in
 * *Below expectations*, which is the distribution's version of paying somebody ₦0
 * because no attendance row exists. The band comes from the API on the row; this
 * screen never compares a score against a threshold.
 *
 * ## An excluded part is reported as excluded, in the API's words
 *
 * "Leadership was not counted for 14 people — they manage nobody" is a true
 * sentence about a company. "Leadership: 0%" is not. Every exclusion is rendered
 * with the register's own note and its own headcount.
 */
export function PeriodReportScreen({ cycleId }: { cycleId: string }) {
  const canSeeCompany = useCan("EDIT_RECORDS");
  const detail = useCycleReport(cycleId, canSeeCompany);
  const cycle = detail.cycle;
  const report = detail.report;
  /* The report has every figure by headcount and none of it by department or
     by name — `unscored`/`unfinalised`/etc are deliberately thin, name-only
     lists. The register is the one read with a row per person, each already
     carrying its own department and score, so department performance and a
     top-performers ranking are grouped and sorted from it here rather than
     computed a second way on the API. */
  const register = useCycleRegister(cycleId, canSeeCompany);

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/performance", label: "KPIs & appraisals" },
          {
            href: `/performance/periods/${cycleId}`,
            label: cycle?.name ?? "Appraisal period",
          },
        ]}
        title="Period report"
        meta={
          cycle ? (
            <>
              <Badge
                tone={cycle.stage === "PUBLISHED" ? "neutral" : "info"}
                size="sm"
                dot
              >
                {cycle.stageLabel}
              </Badge>
              {cycle.scoringFrozen && (
                <Badge
                  tone="accent"
                  size="sm"
                  icon={<Lock aria-hidden="true" />}
                >
                  Weights frozen
                </Badge>
              )}
            </>
          ) : undefined
        }
        action={
          /* The period screen's own action reads "See the report", so this is
             its mirror. Not "Run the period": nothing is run from there — it is
             the register of who still owes a form — and "run" is the product's
             word for nothing at all. */
          <ButtonLink size="sm" href={`/performance/periods/${cycleId}`}>
            See the register
          </ButtonLink>
        }
      />

      <PageBody className="flex flex-col gap-6">
        {!canSeeCompany ? (
          <Callout tone="info" title="This is a company-wide view">
            <p>
              A distribution of marks is an aggregate over every employee, which
              needs the records permission. Your own rating is on{" "}
              <Link
                href="/performance"
                className="font-medium text-accent-text underline-offset-2 hover:underline"
              >
                the performance screen
              </Link>
              .
            </p>
          </Callout>
        ) : DEMO_ENABLED && !detail.available ? (
          <Callout tone="warning" title="Demo data, this browser only">
            <p>{detail.refusal}</p>
          </Callout>
        ) : null}

        <LoadFailure subject="this period's report" error={detail.error}  onRetry={detail.reload}/>

        {detail.loading && (
          <Card>
            <CardBody className="flex items-center gap-2 text-body-sm text-muted">
              <Spinner size="sm" />
              Working out the report
            </CardBody>
          </Card>
        )}

        {report && report.marks.people === 0 && (
          <Card>
            <CardHeader title="Nothing to report yet" />
            <EmptyState
              compact
              icon={<UserX aria-hidden="true" />}
              title="Nobody is in this period"
              description="Starting a period creates a form for every employee who is not archived or exited."
            />
          </Card>
        )}

        {report && report.marks.people > 0 && (
          <>
            <Headline report={report} />
            <div className="grid gap-4 lg:grid-cols-2">
              <DepartmentPerformance register={register.register} />
              <TopPerformers register={register.register} />
            </div>
            <Distribution report={report} />
            <WhatCameIn report={report} />
            <Parts report={report} />
            <NamedList
              title="Nobody marked them"
              description="They finish this period with no mark. Not a mark of nought — nothing was recorded that counts."
              empty="Everybody in this period has a mark."
              rows={report.unscored}
              tone="danger"
            />
            <NamedList
              title="Written, not finalised"
              description="A rating exists and the person has not been told it. Finalising is what makes it theirs to answer."
              empty="Every rating written has been finalised."
              rows={report.unfinalised}
              tone="warning"
            />
            <NamedList
              title="Told, and no answer yet"
              description="Silence is not acceptance. Each of these is somebody who has neither acknowledged nor disputed."
              empty="Everybody told their rating has answered."
              rows={report.awaitingAcknowledgement}
              tone="warning"
            />
            <Disputes report={report} />
          </>
        )}
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The four figures somebody opens this screen for.
 *
 * The average is over the marks that exist and its hint says so, because the
 * whole defect this screen is written against is an average quoted beside a
 * headcount it did not come from. With no marks at all it reads "No marks yet"
 * rather than 0%.
 */
function Headline({ report }: { report: ApiCycleReport }) {
  const { distribution, marks } = report;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat
        label="People in this period"
        value={String(marks.people)}
        hint="Everybody not archived or exited"
      />
      <Stat
        label="With a mark"
        value={`${distribution.scored} of ${marks.people}`}
        hint={
          distribution.unscored === 0
            ? "Everybody has one"
            : `${distribution.unscored} ${distribution.unscored === 1 ? "person has" : "people have"} nothing recorded that counts`
        }
      />
      <Stat
        label="Average mark"
        value={
          distribution.meanBp === null
            ? "No marks yet"
            : scoreLabel(distribution.meanBp)
        }
        hint={
          distribution.meanBp === null
            ? "Nothing has been recorded that counts towards a mark"
            : `Over the ${distribution.scored} ${distribution.scored === 1 ? "mark" : "marks"} that exist, and nothing else`
        }
      />
      <Stat
        label="Weights used"
        value={
          report.weightsFrom === "snapshot" ? "Frozen" : "Company's current"
        }
        hint={
          report.weightsFrom === "snapshot"
            ? `Copied onto this period when it started, totalling ${weightLabel(report.weightsTotalBp)}`
            : `This period has no frozen set, so a change to the company's weights would move these marks`
        }
      />
    </div>
  );
}

/**
 * One department, added up from the register's own rows.
 *
 * Not a database aggregate — the register already carries `departmentName`
 * and `scoreBp` per person, so grouping it here is a reduction over data this
 * screen fetches anyway, not a second way of computing a score. `null` scores
 * are excluded from the average and counted separately, the same absence
 * rule every other figure on this screen follows: a department where nobody
 * has a mark yet reads "No marks yet", never 0%.
 */
type DepartmentRollup = {
  name: string;
  people: number;
  scored: number;
  meanBp: number | null;
};

function departmentRollups(register: ApiScoreRegister): DepartmentRollup[] {
  const groups = new Map<string, { people: number; scoredBp: number[] }>();
  for (const row of register.rows) {
    const name = row.departmentName ?? "No department";
    const existing = groups.get(name) ?? { people: 0, scoredBp: [] };
    existing.people += 1;
    if (row.scoreBp !== null) existing.scoredBp.push(row.scoreBp);
    groups.set(name, existing);
  }
  return Array.from(groups.entries())
    .map(([name, { people, scoredBp }]) => ({
      name,
      people,
      scored: scoredBp.length,
      meanBp:
        scoredBp.length === 0
          ? null
          : Math.round(
              scoredBp.reduce((sum, bp) => sum + bp, 0) / scoredBp.length,
            ),
    }))
    .sort((a, b) => (b.meanBp ?? -1) - (a.meanBp ?? -1));
}

function DepartmentPerformance({
  register,
}: {
  register: ApiScoreRegister | null;
}) {
  if (!register) return null;
  const rollups = departmentRollups(register);

  return (
    <Card>
      <CardHeader
        title="By department"
        description="Average mark per department, over the people in each who have one."
      />
      <CardBody className="p-0">
        {rollups.length === 0 ? (
          <p className="p-4 text-body-sm text-muted">
            Nobody is in this period.
          </p>
        ) : (
          <TableWrap caption="Average mark, headcount and how many have one, by department">
            <THead>
              <TH>Department</TH>
              <TH align="right">People</TH>
              <TH align="right">With a mark</TH>
              <TH align="right">Average</TH>
            </THead>
            <TBody>
              {rollups.map((department) => (
                <TR key={department.name}>
                  <TD>{department.name}</TD>
                  <TD align="right">
                    <span className="tabular">{department.people}</span>
                  </TD>
                  <TD align="right">
                    <span className="tabular">
                      {department.scored} of {department.people}
                    </span>
                  </TD>
                  <TD align="right">
                    {department.meanBp === null ? (
                      <span className="text-muted">No marks yet</span>
                    ) : (
                      <span className="tabular font-medium text-ink">
                        {scoreLabel(department.meanBp)}
                      </span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * The highest marks in this period, and nothing else.
 *
 * A ranking, not a judgement about anybody not on it — the same distinction
 * `Distribution`'s unscored row draws for absence. Excluded entirely rather
 * than shown at the bottom: nobody wants to be read as "last" on a list
 * built for the other five names.
 */
function TopPerformers({ register }: { register: ApiScoreRegister | null }) {
  if (!register) return null;
  const ranked = register.rows
    .filter((row) => row.scoreBp !== null)
    .sort((a, b) => (b.scoreBp ?? 0) - (a.scoreBp ?? 0))
    .slice(0, 5);

  return (
    <Card>
      <CardHeader
        title="Top performers"
        description="The highest marks in this period so far."
      />
      <CardBody className="p-0">
        {ranked.length === 0 ? (
          <p className="p-4 text-body-sm text-muted">No marks yet.</p>
        ) : (
          <TableWrap caption="The five highest marks in this period">
            <THead>
              <TH>Person</TH>
              <TH>Department</TH>
              <TH align="right">Mark</TH>
            </THead>
            <TBody>
              {ranked.map((row, index) => (
                <TR key={row.employeeId}>
                  <TD>
                    <span className="tabular text-muted">{index + 1}.</span>{" "}
                    <Link
                      href={`/performance/history/${row.employeeId}`}
                      className="font-medium text-ink underline-offset-2 hover:text-accent-text hover:underline"
                    >
                      {row.employeeName}
                    </Link>
                  </TD>
                  <TD>{row.departmentName ?? "—"}</TD>
                  <TD align="right">
                    <span className="tabular font-medium text-ink">
                      {scoreLabel(row.scoreBp ?? 0)}
                    </span>
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * The spread of marks, and the row that is not a band.
 *
 * Bars are a share of the marks that exist, never of the headcount. The unscored
 * row sits below a rule, outside the five bands, and says why.
 */
/**
 * The column colours, matching `BAND_TONE`'s badges.
 *
 * A separate map because `BAND_TONE` yields a `BadgeTone` name and a chart
 * needs a colour. Kept next to its one consumer rather than in the store: this
 * is the only place a band becomes a fill, and a second table of band colours
 * in `store/performance.ts` would be one more thing to keep in step.
 */
const BAND_FILL: Record<ScoreBand, string> = {
  BELOW: "var(--color-danger)",
  PARTIALLY_MEETS: "var(--color-warning)",
  MEETS: "var(--color-line-strong)",
  EXCEEDS: "var(--color-accent)",
  OUTSTANDING: "var(--color-success-strong)",
};

function Distribution({ report }: { report: ApiCycleReport }) {
  const { distribution } = report;

  return (
    <Card>
      <CardHeader
        title="The spread of marks"
        description={
          distribution.scored === 0
            ? "Nothing to spread yet."
            : `${distribution.scored} ${distribution.scored === 1 ? "mark" : "marks"}, banded by the API. The bands are the midpoints of the 1-5 scale.`
        }
      />
      <CardBody className="flex flex-col gap-4">
        {/* The shape first, then the figures. The chart answers "what shape is
            this company in", which five independent bars could not; the list
            under it still answers "who is in this band", which a chart cannot.
            Neither replaces the other, and the list is also the accessible
            copy — the chart is `aria-hidden`. */}
        {distribution.scored === 0 ? (
          <p className="text-body-sm text-muted">
            No mark has been recorded in this period, so there is no
            distribution. An empty distribution is stated rather than drawn as
            five zeroes.
          </p>
        ) : (
          <ColumnChart
            height={160}
            points={distribution.bands.map((band) => ({
              label: band.label,
              value: band.people,
            }))}
            /* The badge tones, so a reader who has learnt amber-means-partially
               -meets on the register does not learn it again here. Never the
               only cue: every column carries its count and its band name. */
            tones={distribution.bands.map((band) => BAND_FILL[band.band])}
            format={(n) => `${String(n)}`}
            caption={`The spread of ${String(distribution.scored)} ${distribution.scored === 1 ? "mark" : "marks"} across the five bands.`}
          />
        )}

        {distribution.scored > 0 && (
          <ul className="flex flex-col gap-3">
            {distribution.bands.map((band) => (
              <BandRow key={band.band} band={band} of={distribution.scored} />
            ))}
          </ul>
        )}

        {distribution.unscored > 0 && (
          <div className="border-t border-line pt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-body-sm font-medium text-ink">
                No mark — {distribution.unscored}{" "}
                {distribution.unscored === 1 ? "person" : "people"}
              </span>
              <Badge tone="neutral" size="sm">
                Not a band
              </Badge>
            </div>
            <p className="mt-1 text-meta text-muted">
              Deliberately outside the bands. &quot;Nothing was recorded&quot;
              and &quot;scored nought&quot; are different claims, and only one
              of them is true here. They are named further down.
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * One band, as words and names.
 *
 * **It used to carry its own bar and no longer does.** Each band filling a share
 * of its own separate track answered "how big is this band" five times over and
 * never showed the shape — which is now the chart's job, on one shared axis
 * above. Two renderings of the same proportion is one too many, and the one
 * that had to go is the one that could not be compared across bands.
 *
 * What stays is what a chart cannot say: the range the band covers, what it
 * means, and **who is in it**. The names are the reason anybody scrolls to this
 * list, and they are also what makes it the accessible copy of the chart.
 */
function BandRow({ band, of }: { band: ApiBandCount; of: number }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line pb-3 last:border-0 last:pb-0">
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone={BAND_TONE[band.band]} size="sm">
            {band.label}
          </Badge>
          <span className="text-meta text-muted">
            {weightLabel(band.fromBp)} to {weightLabel(band.toBp)}
          </span>
        </span>
        <span className="text-meta text-muted">
          {band.meaning}
          {band.names.length > 0 && ` ${band.names.join(", ")}.`}
        </span>
      </span>
      <span className="tabular shrink-0 text-body-sm font-medium text-ink">
        {band.people} of {of}
      </span>
    </li>
  );
}

/**
 * Two cards, two headcounts, and each says which one it is counting.
 *
 * `forms.people` is everybody with a form; `marks.people` is everybody the
 * register covers. They are usually equal and are not the same fact — a cycle
 * with nobody's form created yet has forms over 0 people and marks over the whole
 * company. Dividing one by the other is the specific thing this layout exists to
 * make impossible.
 */
function WhatCameIn({ report }: { report: ApiCycleReport }) {
  const { forms, marks } = report;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="Forms"
          description={`Over the ${forms.people} ${forms.people === 1 ? "person" : "people"} who have a form in this cycle.`}
        />
        <CardBody>
          <DescriptionList
            columns={1}
            items={[
              {
                term: "Self-reviews in",
                value: ratio(forms.selfIn, forms.people, "Nobody has a form yet"),
              },
              {
                term: "Self-reviews outstanding",
                value:
                  forms.selfOutstanding === 0
                    ? "None"
                    : `${forms.selfOutstanding} not sent`,
              },
              {
                term: "Manager reviews in",
                /* Reviews, not people — somebody with two appraisers and one
                   answer owes one more, so the denominator is the reviews due
                   and not the headcount. `cellsFrom` in period-status.tsx says
                   the same thing over the same payload; this row said
                   `forms.people` and the two screens disagreed about one
                   figure. */
                value: ratio(
                  forms.managerIn,
                  forms.managerIn + forms.managerOutstanding,
                  "No manager review is due yet",
                ),
              },
              {
                term: "Manager reviews outstanding",
                value:
                  forms.managerOutstanding === 0
                    ? "None"
                    : `${forms.managerOutstanding} not written`,
              },
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Sign-off"
          description={`Over the ${marks.people} ${marks.people === 1 ? "person" : "people"} in the cycle. Four separate facts, not one.`}
        />
        <CardBody>
          <DescriptionList
            columns={1}
            items={[
              {
                term: "Ratings written",
                value: `${marks.written} of ${marks.people}`,
              },
              {
                term: "Finalised — the person was told",
                value: `${marks.finalised} of ${marks.people}`,
              },
              {
                term: "Acknowledged",
                value: `${marks.acknowledged} of ${marks.finalised} told`,
              },
              {
                term: "No answer yet",
                value:
                  marks.awaitingAnswer === 0
                    ? "None outstanding"
                    : `${marks.awaitingAnswer} neither acknowledged nor disputed`,
              },
              {
                term: "Disputed",
                value:
                  marks.disputed === 0
                    ? "None"
                    : `${marks.disputed} on the record`,
              },
              {
                term: "No manager review at all",
                value:
                  marks.noReview === 0
                    ? "None"
                    : `${marks.noReview} — nobody was asked, which is a different problem`,
              },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}

/**
 * How each part of the mark came out, and what it was left out of.
 *
 * The average per component is over the people it counted for and the column
 * heading says so. A component counted for nobody reads "Counted for nobody"
 * rather than 0%.
 */
function Parts({ report }: { report: ApiCycleReport }) {
  return (
    <Card>
      <CardHeader
        title="The parts of the mark"
        description="Each part, the weight it carried, and every reason it was left out — with the API's own wording."
        action={
          <ButtonLink size="sm" href="/settings/performance">
            Change the weights
          </ButtonLink>
        }
      />
      <CardBody className="p-0">
        <TableWrap caption="Each scoring component across this period">
          <THead>
            <TH>Part</TH>
            <TH align="right">Weight</TH>
            <TH align="right">Counted for</TH>
            <TH align="right">Average over those people</TH>
            <TH>Left out because</TH>
          </THead>
          <TBody>
            {report.components.map((part) => (
              <TR key={part.component}>
                <TD>
                  <span className="font-medium text-ink">{part.label}</span>
                </TD>
                <TD align="right">
                  <span className="tabular">{weightLabel(part.weightBp)}</span>
                </TD>
                <TD align="right">
                  <span className="tabular">
                    {part.includedPeople} of {report.marks.people}
                  </span>
                </TD>
                <TD align="right">
                  {/* Absent is absent: nothing counted is not an average of 0. */}
                  {part.meanBp === null ? (
                    <span className="text-muted">Counted for nobody</span>
                  ) : (
                    <span className="tabular font-medium text-ink">
                      {scoreLabel(part.meanBp)}
                    </span>
                  )}
                </TD>
                <TD>
                  {part.excluded.length === 0 ? (
                    <span className="text-body-sm text-muted">
                      Counted for everybody
                    </span>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {part.excluded.map((reason) => (
                        <li
                          key={reason.reason}
                          className="text-body-sm text-body"
                        >
                          <span className="font-medium text-ink">
                            {reason.people}{" "}
                            {reason.people === 1 ? "person" : "people"}
                          </span>{" "}
                          — {reason.note}
                        </li>
                      ))}
                    </ul>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </TableWrap>
      </CardBody>
    </Card>
  );
}

/**
 * One named list, with the API's sentence per person.
 *
 * An empty list is stated rather than left blank, the same rule the cycle
 * screen's appraiser card follows: a card that disappears when the news is good
 * is a card nobody trusts when it comes back.
 */
function NamedList({
  title,
  description,
  empty,
  rows,
  tone,
}: {
  title: string;
  description: string;
  empty: string;
  rows: ApiNamedOnList[];
  tone: "danger" | "warning";
}) {
  return (
    <Card>
      <CardHeader
        title={title}
        description={description}
        action={
          rows.length === 0 ? (
            <Badge
              tone="success"
              size="sm"
              icon={<CheckCheck aria-hidden="true" />}
            >
              Nothing outstanding
            </Badge>
          ) : (
            <Badge
              tone={tone}
              size="sm"
              icon={<TriangleAlert aria-hidden="true" />}
            >
              {rows.length} {rows.length === 1 ? "person" : "people"}
            </Badge>
          )
        }
      />
      <CardBody
        className={rows.length === 0 ? undefined : "flex flex-col gap-2"}
      >
        {rows.length === 0 ? (
          <p className="flex items-center gap-2 text-body-sm text-body">
            <CheckCheck
              aria-hidden="true"
              className="size-4 text-success-text"
            />
            {empty}
          </p>
        ) : (
          rows.map((row) => <PersonRow key={row.employeeId} row={row} />)
        )}
      </CardBody>
    </Card>
  );
}

function PersonRow({
  row,
  children,
}: {
  row: ApiNamedOnList;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-line p-3">
      <div className="min-w-0">
        <p className="text-body-sm font-medium text-ink">{row.employeeName}</p>
        <p className="mt-0.5 text-meta text-muted">
          {row.jobTitle}
          {row.departmentName ? ` · ${row.departmentName}` : ""}
        </p>
        {/* The register's own sentence. A second wording for one fact lets a
            reader clear the wrong thing. */}
        <p className="mt-1.5 text-body-sm text-body">{row.note}</p>
        {children}
      </div>
      <Link
        href={`/performance/history/${row.employeeId}`}
        className="flex shrink-0 items-center gap-1.5 text-body-sm font-medium text-accent-text underline-offset-2 hover:underline"
      >
        <LineChart aria-hidden="true" className="size-4" />
        Their trend
      </Link>
    </div>
  );
}

/** Disputes carry the employee's own words and a link to the record. */
function Disputes({ report }: { report: ApiCycleReport }) {
  const rows = report.disputed;

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader
          title="Disputed ratings"
          description="A dispute opens a record to answer, not an argument to win."
        />
        <CardBody className="flex items-center gap-2 text-body-sm text-body">
          <CheckCheck aria-hidden="true" className="size-4 text-success-text" />
          Nobody has disputed their rating in this cycle.
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Disputed ratings"
        description="The mark stands and the dispute stands beside it. Rewriting the mark would destroy the evidence of what was decided."
        action={
          <Badge tone="danger" size="sm" dot>
            {rows.length} {rows.length === 1 ? "dispute" : "disputes"}
          </Badge>
        }
      />
      <CardBody className="flex flex-col gap-2">
        {rows.map((row) => (
          <PersonRow key={row.employeeId} row={row}>
            {row.employeeComment && (
              <p className="mt-1.5 border-l-2 border-danger-line pl-3 text-body-sm text-ink">
                {row.employeeComment}
              </p>
            )}
            {row.reviewId && (
              <Link
                href={`/performance/reviews/${row.reviewId}`}
                className="mt-1.5 inline-block text-body-sm font-medium text-accent-text underline-offset-2 hover:underline"
              >
                Open the rating
              </Link>
            )}
          </PersonRow>
        ))}
      </CardBody>
    </Card>
  );
}
