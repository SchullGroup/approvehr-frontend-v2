"use client";

import { LineChart, UserX, Users } from "lucide-react";
import {
  Badge,
  BarChart,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  ColumnChart,
  EmptyState,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
  Tabs,
  TextLink,
  LoadState,
} from "@/components/ui";
import type { TabItem } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import {
  outOf5FromBp,
  outOf5Label,
  scoreLabel,
  scoreWords,
  weightedParts,
  weightLabel,
  type ApiBandCount,
  type ApiCycleReport,
  type ApiNamedOnList,
  type ApiScoreRegister,
  type ScoreBand,
} from "@/lib/api/performance";
import { useUrlTab } from "@/hooks/use-url-tab";
import { useCan } from "@/lib/permissions";
import {
  BAND_TONE,
  useCycleRegister,
  useCycleReport,
} from "@/lib/store/performance";
import { REPORT_TABS, type ReportTabId } from "./tabs";
import { stageWords } from "@/lib/performance/stage-words";

/**
 * Three tabs, and the third only when somebody needs following up. What came in
 * and who has signed off is the period page's bar and its next step, so it is
 * not said a second time here.
 */
const SCORES_TAB: TabItem = { id: "marks", label: "Scores" };
const PARTS_TAB: TabItem = { id: "parts", label: "Parts of the score" };

/** How many people are on any of the four follow-up lists. */
function followUpCount(report: ApiCycleReport): number {
  return (
    report.unscored.length +
    report.unfinalised.length +
    report.awaitingAcknowledgement.length +
    report.disputed.length
  );
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
export function PeriodReportScreen({
  cycleId,
  initialTab,
}: {
  cycleId: string;
  initialTab: ReportTabId;
}) {
  const [tab, changeTab] = useUrlTab<ReportTabId>(initialTab, REPORT_TABS);
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
          { href: "/performance", label: "Performance" },
          {
            href: `/performance/periods/${cycleId}`,
            label: cycle?.name ?? "Appraisal period",
          },
        ]}
        title="Report"
        meta={
          cycle ? (
            <Badge
              tone={cycle.stage === "PUBLISHED" ? "neutral" : "info"}
              size="sm"
              dot
            >
              {stageWords(cycle.stageLabel)}
            </Badge>
          ) : undefined
        }
      />

      <PageBody className="flex flex-col gap-6">
        {!canSeeCompany ? (
          /* An empty state, not a notice on an empty page.
             ------------------------------------------------
             Word for word the argument `period-screen.tsx` already makes for
             its own version of this: a `Callout` on an otherwise blank screen
             reads as a warning about something that went wrong. Nothing went
             wrong — this page is a company-wide aggregate and this reader is
             not its audience — so it looks like a screen that is simply not
             for you, and points at the one that is. */
          <Card>
            <EmptyState
              plain
              icon={<Users aria-hidden="true" />}
              title="This page covers the whole company"
              description="It shows everyone's scores together, so it is only open to people who can see every employee's record."
              action={
                <ButtonLink href="/performance" variant="secondary">
                  Your own rating
                </ButtonLink>
              }
            />
          </Card>
        ) : DEMO_ENABLED && !detail.available ? (
          <Callout tone="warning" title="Demo data, this browser only">
            <p>{detail.refusal}</p>
          </Callout>
        ) : null}

        <LoadState
          loading={detail.loading}
          error={detail.error}
          subject="this period's report"
          onRetry={detail.reload}
          hasData={Boolean(report)}
          skeleton="page"
        >
          {report && report.marks.people === 0 && (
            <Card>
              <EmptyState
                compact
                icon={<UserX aria-hidden="true" />}
                title="Nobody is in this period"
              />
            </Card>
          )}

          {report && report.marks.people > 0 && (
            <ReportTabs
              report={report}
              register={register.register}
              tab={tab}
              onTab={changeTab}
            />
          )}
        </LoadState>
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Scores, the parts of the score, and who needs following up.
 *
 * The last is absent when everybody is accounted for: a tab of four empty cards
 * that say the news is good is a tab nobody needed.
 */
export function ReportTabs({
  report,
  register,
  tab,
  onTab,
}: {
  report: ApiCycleReport;
  register: ApiScoreRegister | null;
  tab: ReportTabId;
  onTab: (next: string) => void;
}) {
  const followUps = followUpCount(report);
  const items: TabItem[] = [
    SCORES_TAB,
    PARTS_TAB,
    ...(followUps > 0
      ? [{ id: "follow-up", label: "To follow up", count: followUps }]
      : []),
  ];
  /* A link to a tab that is not there lands on the first one. */
  const shown: ReportTabId = items.some((item) => item.id === tab)
    ? tab
    : "marks";

  return (
    <Tabs items={items} value={shown} onChange={onTab}>
      <div className="flex flex-col gap-6">
        {shown === "marks" && (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <DepartmentPerformance register={register} />
              <TopPerformers register={register} />
            </div>
            <Distribution report={report} />
          </>
        )}
        {shown === "parts" && <Parts report={report} />}
        {shown === "follow-up" && (
          <>
            <NamedList title="No score" rows={report.unscored} />
            <NamedList title="Written" rows={report.unfinalised} />
            <NamedList title="Final" rows={report.awaitingAcknowledgement} />
            <Disputes report={report} />
          </>
        )}
      </div>
    </Tabs>
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

export function DepartmentPerformance({
  register,
}: {
  register: ApiScoreRegister | null;
}) {
  if (!register) return null;
  const rollups = departmentRollups(register);

  return (
    <Card>
      <CardHeader title="By department" />
      <CardBody className="p-0">
        {rollups.length === 0 ? (
          <p className="p-4 text-body-sm text-muted">
            Nobody is in this period.
          </p>
        ) : (
          <>
            <div className="hidden sm:block">
              <TableWrap caption="Average score, headcount and how many have one, by department">
                <THead>
                  <TH>Department</TH>
                  <TH align="right">People</TH>
                  <TH align="right">With a score</TH>
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
                          <span className="text-muted">No scores yet</span>
                        ) : (
                          <span className="tabular font-medium text-ink">
                            {outOf5Label(outOf5FromBp(department.meanBp))}
                          </span>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </TableWrap>
            </div>

            <ul className="divide-y divide-line sm:hidden">
              {rollups.map((department) => (
                <li
                  key={department.name}
                  className="flex items-center justify-between gap-3 p-4"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{department.name}</p>
                    <p className="tabular text-body-sm text-muted">
                      {department.scored} of {department.people} with a score
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {department.meanBp === null ? (
                      <span className="text-body-sm text-muted">
                        No scores yet
                      </span>
                    ) : (
                      <span className="tabular font-medium text-ink">
                        {outOf5Label(outOf5FromBp(department.meanBp))}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
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
export function TopPerformers({
  register,
}: {
  register: ApiScoreRegister | null;
}) {
  if (!register) return null;
  const ranked = register.rows
    .filter((row) => row.scoreBp !== null)
    .sort((a, b) => (b.scoreBp ?? 0) - (a.scoreBp ?? 0))
    .slice(0, 5);

  return (
    <Card>
      <CardHeader title="Top performers" />
      <CardBody className="p-0">
        {ranked.length === 0 ? (
          <p className="p-4 text-body-sm text-muted">No scores yet.</p>
        ) : (
          <>
            <div className="hidden sm:block">
              <TableWrap caption="The five highest scores in this period">
                <THead>
                  <TH>Person</TH>
                  <TH>Department</TH>
                  <TH align="right">Score</TH>
                </THead>
                <TBody>
                  {ranked.map((row, index) => (
                    <TR key={row.employeeId}>
                      <TD>
                        <span className="tabular text-muted">{index + 1}.</span>{" "}
                        <TextLink
                          href={`/performance/history/${row.employeeId}`}
                        >
                          {row.employeeName}
                        </TextLink>
                      </TD>
                      <TD>{row.departmentName ?? "—"}</TD>
                      <TD align="right">
                        <span className="tabular font-medium text-ink">
                          {scoreWords(row)}
                        </span>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </TableWrap>
            </div>

            <ul className="divide-y divide-line sm:hidden">
              {ranked.map((row, index) => (
                <li
                  key={row.employeeId}
                  className="flex items-center justify-between gap-3 p-4"
                >
                  <div className="min-w-0">
                    <span className="tabular text-muted">{index + 1}.</span>{" "}
                    <TextLink href={`/performance/history/${row.employeeId}`}>
                      {row.employeeName}
                    </TextLink>
                    <p className="text-body-sm text-muted">
                      {row.departmentName ?? "—"}
                    </p>
                  </div>
                  <span className="tabular shrink-0 font-medium text-ink">
                    {scoreWords(row)}
                  </span>
                </li>
              ))}
            </ul>
          </>
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
  BELOW: "var(--color-cat-4)",
  PARTIALLY_MEETS: "var(--color-warning)",
  MEETS: "var(--color-line-strong)",
  EXCEEDS: "var(--color-info)",
  OUTSTANDING: "var(--color-success-strong)",
};

export function Distribution({ report }: { report: ApiCycleReport }) {
  const { distribution } = report;
  /* Nobody has a score yet: there is no shape to draw, and the follow-up list
     already names who is missing one. */
  if (distribution.scored === 0) return null;

  return (
    <Card>
      <CardHeader title="The spread of scores" />
      <CardBody className="flex flex-col gap-4">
        {/* The shape first, then the figures. The chart answers "what shape is
            this company in", which five independent bars could not; the list
            under it still answers "who is in this band", which a chart cannot.
            Neither replaces the other, and the list is also the accessible
            copy — the chart is `aria-hidden`. */}
        {/* Columns need a column's width per band label. At five bands and a
            phone's width each gets about 55px, and "Outstanding" or "Partially
            meets expectations" does not fit in 55px, so the labels were drawn
            over each other and the last ran out of the card. Below `sm` the
            same data is drawn as bars with the label on its own line; the two
            are never both in the page, so a screen reader meets one table, not
            two. */}
        <ColumnChart
          className="hidden sm:block"
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
          caption={`The spread of ${String(distribution.scored)} ${distribution.scored === 1 ? "score" : "scores"} across the five bands.`}
        />
        <BarChart
          className="sm:hidden"
          points={distribution.bands.map((band) => ({
            label: band.label,
            value: band.people,
          }))}
          tones={distribution.bands.map((band) => BAND_FILL[band.band])}
          format={(n) => `${String(n)}`}
          caption={`The spread of ${String(distribution.scored)} ${distribution.scored === 1 ? "score" : "scores"} across the five bands.`}
        />

        <ul className="flex flex-col gap-3">
          {distribution.bands.map((band) => (
            <BandRow key={band.band} band={band} of={distribution.scored} />
          ))}
        </ul>
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
 * How each part of the mark came out, and what it was left out of.
 *
 * The average per component is over the people it counted for and the column
 * heading says so. A component counted for nobody reads "Counted for nobody"
 * rather than 0%.
 *
 * A part the period weights at 0% is not here: the company is not appraising on
 * it, so a row saying it is "shown but not counted" is a row about nothing. The
 * weights are on the period page, and the link above changes them.
 */
export function Parts({ report }: { report: ApiCycleReport }) {
  const parts = weightedParts(report.components);
  return (
    <Card>
      <CardBody className="p-0">
        <div className="hidden sm:block">
          <TableWrap caption="Each part of the score across this period">
            <THead>
              <TH>Part</TH>
              <TH align="right">Weight</TH>
              <TH align="right">Counted for</TH>
              <TH align="right">Average for those people</TH>
              <TH>Left out because</TH>
            </THead>
            <TBody>
              {parts.map((part) => (
                <TR key={part.component}>
                  <TD>
                    <span className="font-medium text-ink">{part.label}</span>
                  </TD>
                  <TD align="right">
                    <span className="tabular">
                      {weightLabel(part.weightBp)}
                    </span>
                  </TD>
                  <TD align="right">
                    <span className="tabular">
                      {part.includedPeople} of {report.marks.people}
                    </span>
                  </TD>
                  <TD align="right">
                    {/* Absent is absent: nothing counted is not an average of 0. */}
                    {part.meanBp === null ? (
                      <span className="text-muted">Nothing to average</span>
                    ) : (
                      <span className="tabular font-medium text-ink">
                        {scoreLabel(part.meanBp)}
                      </span>
                    )}
                  </TD>
                  <TD>
                    {part.excluded.length === 0 ? (
                      <span className="text-body-sm text-muted">
                        Nobody left out
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
        </div>

        <ul className="divide-y divide-line sm:hidden">
          {parts.map((part) => (
            <li key={part.component} className="flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-ink">{part.label}</p>
                <span className="tabular shrink-0 text-body-sm text-muted">
                  {weightLabel(part.weightBp)}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-muted">
                <span className="tabular">
                  Counted for {part.includedPeople} of {report.marks.people}
                </span>
                {part.meanBp === null ? (
                  <span>Nothing to average</span>
                ) : (
                  <span className="tabular font-medium text-ink">
                    Average {scoreLabel(part.meanBp)}
                  </span>
                )}
              </div>

              {part.excluded.length > 0 && (
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
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

/**
 * One named list, with the API's sentence per person.
 *
 * An empty list renders nothing: the tab it sits in is absent when all four are
 * empty, and a card that says the news is good adds a line to read and nothing
 * to do.
 */
function NamedList({ title, rows }: { title: string; rows: ApiNamedOnList[] }) {
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardHeader
        title={title}
        action={
          <Badge tone="neutral" size="sm">
            {rows.length}
          </Badge>
        }
      />
      <CardBody className="flex flex-col gap-2">
        {rows.map((row) => (
          <PersonRow key={row.employeeId} row={row} />
        ))}
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
      <TextLink
        href={`/performance/history/${row.employeeId}`}
        className="flex shrink-0 items-center gap-1.5 text-body-sm"
      >
        <LineChart aria-hidden="true" className="size-4" />
        Their trend
      </TextLink>
    </div>
  );
}

/** Disputes carry the employee's own words and a link to the record. */
function Disputes({ report }: { report: ApiCycleReport }) {
  const rows = report.disputed;
  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="Disputed"
        action={
          <Badge tone="neutral" size="sm">
            {rows.length}
          </Badge>
        }
      />
      <CardBody className="flex flex-col gap-2">
        {rows.map((row) => (
          <PersonRow key={row.employeeId} row={row}>
            {row.employeeComment && (
              <p className="mt-1.5 border-l-2 border-line-strong pl-3 text-body-sm text-ink">
                {row.employeeComment}
              </p>
            )}
            {row.reviewId && (
              <TextLink
                href={`/performance/reviews/${row.reviewId}`}
                className="mt-1.5 inline-block text-body-sm"
              >
                Open the rating
              </TextLink>
            )}
          </PersonRow>
        ))}
      </CardBody>
    </Card>
  );
}
