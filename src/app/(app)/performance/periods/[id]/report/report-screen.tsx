"use client";

import Link from "next/link";
import { CheckCheck, LineChart, Lock, TriangleAlert, UserX } from "lucide-react";
import {
  Badge,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
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
import { PageBody, PageHeader } from "@/components/portal/shell";
import {
  scoreLabel,
  weightLabel,
  type ApiBandCount,
  type ApiCycleReport,
  type ApiNamedOnList,
} from "@/lib/api/performance";
import { useCan } from "@/lib/permissions";
import { BAND_TONE, useCycleReport } from "@/lib/store/performance";

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

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/performance", label: "Performance" },
          {
            href: `/performance/periods/${cycleId}`,
            label: cycle?.name ?? "Appraisal period",
          },
        ]}
        title="Period report"
        description="The spread of marks, what came in, and who is left out — by name."
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
                <Badge tone="accent" size="sm" icon={<Lock aria-hidden="true" />}>
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

        {detail.error && (
          <p className="rounded-md border border-danger-line bg-danger-soft px-3.5 py-2.5 text-body-sm text-ink">
            {detail.error.message}
          </p>
        )}

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
            <CardHeader
              title="Nothing to report yet"
              description="A report needs somebody to report on."
            />
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
        value={report.weightsFrom === "snapshot" ? "Frozen" : "Company's current"}
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
 * The spread of marks, and the row that is not a band.
 *
 * Bars are a share of the marks that exist, never of the headcount. The unscored
 * row sits below a rule, outside the five bands, and says why.
 */
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
        {distribution.scored === 0 ? (
          <p className="text-body-sm text-muted">
            No mark has been recorded in this period, so there is no distribution.
            An empty distribution is stated rather than drawn as five zeroes.
          </p>
        ) : (
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
              Deliberately outside the bands. &quot;Nothing was recorded&quot; and
              &quot;scored nought&quot; are different claims, and only one of them
              is true here. They are named further down.
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function BandRow({ band, of }: { band: ApiBandCount; of: number }) {
  const share = of === 0 ? 0 : (band.people / of) * 100;

  return (
    <li>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone={BAND_TONE[band.band]} size="sm">
            {band.label}
          </Badge>
          <span className="text-meta text-muted">
            {weightLabel(band.fromBp)} to {weightLabel(band.toBp)}
          </span>
        </span>
        <span className="tabular text-body-sm font-medium text-ink">
          {band.people} of {of}
        </span>
      </div>

      <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-sunken">
        <span
          className="block h-full rounded-full bg-accent transition-[width] duration-500 ease-[var(--ease-out-soft)]"
          style={{ width: `${share}%` }}
        />
      </span>

      <p className="mt-1 text-meta text-muted">
        {band.meaning}
        {band.names.length > 0 && ` ${band.names.join(", ")}.`}
      </p>
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
                value: `${forms.selfIn} of ${forms.people}`,
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
                value: `${forms.managerIn} of ${forms.people}`,
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
                  marks.disputed === 0 ? "None" : `${marks.disputed} on the record`,
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
                        <li key={reason.reason} className="text-body-sm text-body">
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
            <Badge tone="success" size="sm" icon={<CheckCheck aria-hidden="true" />}>
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
      <CardBody className={rows.length === 0 ? undefined : "flex flex-col gap-2"}>
        {rows.length === 0 ? (
          <p className="flex items-center gap-2 text-body-sm text-body">
            <CheckCheck aria-hidden="true" className="size-4 text-success-text" />
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
