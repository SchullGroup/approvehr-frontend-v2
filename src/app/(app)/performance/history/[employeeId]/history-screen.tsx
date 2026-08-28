"use client";

import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  Lock,
  Minus,
  TriangleAlert,
} from "lucide-react";
import {
  AreaChart,
  Badge,
  Callout,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  EmptyState,
  Spinner,
  Stat,
  type BadgeTone,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import {
  changeLabel,
  dayLabel,
  scoreLabel,
  weightLabel,
  type ApiComponentScore,
  type ApiHistoryPoint,
  type ApiScoreHistory,
} from "@/lib/api/performance";
import { BAND_TONE, useScoreHistory } from "@/lib/store/performance";

/**
 * One person's mark, cycle by cycle.
 *
 * ## Why this screen exists
 *
 * An appraisal decides confirmation after probation, promotion, bonus and
 * sometimes termination, and none of those decisions are about one period. "Has
 * she got better since we spoke about it" is the question a manager actually
 * asks, and until this screen the product could not answer it. The incumbent can
 * (`appraisal-history/employee_history`, `rating_trends`); this is the gap closed.
 *
 * ## Every point is the cycle screen's own figure
 *
 * The API assembles each point from the same `scoreRegister` that produces the
 * mark on `/performance/periods/[id]`, against the weights that period was frozen
 * with. Nothing here recomputes a score, bands a score, or averages one — a
 * second implementation is how two screens end up disagreeing about the same
 * person, and this screen is the one somebody opens *in order to* compare.
 *
 * ## A cycle with no mark is not a zero on the chart
 *
 * It is a row in its own list, and the chart plots only the marks that exist,
 * with a line underneath saying which periods are not on it. Plotting an absence
 * as nought would draw a collapse and a recovery that never happened — and the
 * change against the previous cycle deliberately skips over an unscored one for
 * the same reason. The API does that arithmetic, so the sentence and the figure
 * cannot drift.
 *
 * ## Somebody reading their own history sees final marks only
 *
 * A working figure moves every time a rating is recorded. `withheldNote` is the
 * API's sentence for the periods held back, and it has to be rendered: a missing
 * period with no explanation reads as a period the person was never in.
 */
export function ScoreHistoryScreen({ employeeId }: { employeeId: string }) {
  const detail = useScoreHistory(employeeId, true);
  const history = detail.history;

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/performance", label: "KPIs & appraisals" }]}
        title={history?.employeeName ?? "Appraisal history"}
        meta={
          history ? (
            <>
              <Badge tone="neutral" size="sm">
                {history.counts.cycles}{" "}
                {history.counts.cycles === 1 ? "period" : "periods"}
              </Badge>
              {history.counts.unscored > 0 && (
                <Badge tone="warning" size="sm" dot>
                  {history.counts.unscored} with no mark
                </Badge>
              )}
            </>
          ) : undefined
        }
      />

      <PageBody className="flex flex-col gap-6">
        {DEMO_ENABLED && !detail.available && (
          <Callout tone="warning" title="Demo data, this browser only">
            <p>{detail.refusal}</p>
          </Callout>
        )}

        {/* A 403 here reaches the reader as the server's own sentence, which is
            the one that names the rule: self, direct report, or the records
            permission. An appraiser assigned to one period is refused on
            purpose, and only the server can say so. */}
        <LoadFailure
          subject="this person's score history"
          error={detail.error}
        />

        {detail.loading && (
          <Card>
            <CardBody className="flex items-center gap-2 text-body-sm text-muted">
              <Spinner size="sm" />
              Reading every period
            </CardBody>
          </Card>
        )}

        {history && (
          <>
            <Who history={history} />

            {history.withheldNote && (
              <Callout tone="info" title="A period is still in progress">
                <p>{history.withheldNote}</p>
              </Callout>
            )}

            {history.points.length === 0 ? (
              <Card>
                <EmptyState
                  compact
                  icon={<TriangleAlert aria-hidden="true" />}
                  title="No appraisal period has covered them yet"
                  description="A person appears here once an appraisal period they are in has started. A period that has not been started has no marks to show."
                />
              </Card>
            ) : (
              <>
                <Trend history={history} />
                {history.unscoredCycles.length > 0 && (
                  <NoMark cycles={history.unscoredCycles} />
                )}
                {history.truncated && (
                  <p className="text-body-sm text-muted">
                    The {history.limit} most recent periods are shown. Older
                    ones exist and are not on this page.
                  </p>
                )}
                {[...history.points].reverse().map((point) => (
                  <Point key={point.cycleId} point={point} />
                ))}
              </>
            )}
          </>
        )}
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function Who({ history }: { history: ApiScoreHistory }) {
  const scored = history.points.filter((point) => point.scoreBp !== null);
  const latest = scored[scored.length - 1];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat
        label="Who"
        value={history.employeeName}
        hint={
          history.departmentName
            ? `${history.jobTitle} · ${history.departmentName}`
            : history.jobTitle
        }
      />
      <Stat
        label="Latest mark"
        value={
          latest?.scoreBp === undefined || latest.scoreBp === null
            ? "No mark"
            : scoreLabel(latest.scoreBp)
        }
        hint={latest ? latest.cycleName : "No cycle has produced one"}
      />
      <Stat
        label="Periods with a mark"
        value={`${history.counts.scored} of ${history.counts.cycles}`}
        hint={
          history.counts.unscored === 0
            ? "Every period has one"
            : `${history.counts.unscored} ${history.counts.unscored === 1 ? "period" : "periods"} recorded nothing that counts`
        }
      />
      <Stat
        label="Across the whole span"
        value={
          history.trend === null
            ? "Not a trend yet"
            : changeLabel(history.trend.changeBp)
        }
        hint={
          history.trend === null
            ? "One mark is not a direction, and none is not a flat line"
            : `${history.trend.fromCycle} to ${history.trend.toCycle}`
        }
      />
    </div>
  );
}

/**
 * The shape of it.
 *
 * The chart carries only the marks that exist. `AreaChart` needs at least two
 * points to draw a line worth looking at, so with fewer this falls back to the
 * figures alone rather than drawing a single dot and calling it a trend.
 */
function Trend({ history }: { history: ApiScoreHistory }) {
  const scored = history.points.filter(
    (point): point is ApiHistoryPoint & { scoreBp: number } =>
      point.scoreBp !== null,
  );
  const trend = history.trend;

  const direction: {
    icon: React.ReactNode;
    tone: BadgeTone;
    words: string;
  } | null =
    trend === null
      ? null
      : trend.direction === "UP"
        ? {
            icon: <ArrowUpRight aria-hidden="true" className="size-4" />,
            tone: "success",
            words: "Up across the span",
          }
        : trend.direction === "DOWN"
          ? {
              icon: <ArrowDownRight aria-hidden="true" className="size-4" />,
              tone: "danger",
              words: "Down across the span",
            }
          : {
              icon: <Minus aria-hidden="true" className="size-4" />,
              tone: "neutral",
              words: "Level across the span",
            };

  return (
    <Card>
      <CardHeader
        title="The marks, in order"
        description={
          scored.length < 2
            ? "A line needs two marks. The figures are below."
            : "Only the periods with a mark are plotted. The ones without are listed separately, never drawn as nought."
        }
        {...(direction
          ? {
              action: (
                <Badge tone={direction.tone} size="sm" icon={direction.icon}>
                  {direction.words} · {changeLabel(trend?.changeBp ?? 0)}
                </Badge>
              ),
            }
          : {})}
      />
      <CardBody className="flex flex-col gap-4">
        {scored.length >= 2 ? (
          <AreaChart
            points={scored.map((point) => ({
              label: point.cycleName,
              value: point.scoreBp / 100,
            }))}
            format={(value) => `${value}%`}
            caption={`${history.employeeName}'s mark by period, as a percentage`}
          />
        ) : (
          <p className="text-body-sm text-muted">
            {scored.length === 1
              ? `One mark so far: ${scoreLabel(scored[0]?.scoreBp ?? 0)} in ${scored[0]?.cycleName}.`
              : "No mark has been recorded in any period, so there is nothing to plot."}
          </p>
        )}
      </CardBody>
    </Card>
  );
}

/** The periods with no mark, by name, and why that is not a nought. */
function NoMark({ cycles }: { cycles: string[] }) {
  return (
    <Callout
      tone="warning"
      title={`${cycles.length === 1 ? "One period" : `${cycles.length} periods`} with no mark`}
    >
      <p>
        {cycles.join(", ")} recorded nothing that counts towards a mark — no
        agreed objective, no competency rating against a weighted part. That is
        not a mark of nought and it is not on the chart, because the two say
        opposite things about the person.
      </p>
    </Callout>
  );
}

/**
 * One period, in full.
 *
 * Newest first in the list, because the recent period is the one somebody is
 * looking for, and the chart above already carries the chronology.
 */
function Point({ point }: { point: ApiHistoryPoint }) {
  return (
    <Card>
      <CardHeader
        level={3}
        title={point.cycleName}
        description={
          point.dueDate
            ? `Due ${dayLabel(point.dueDate)} · ${point.stage.toLowerCase()}`
            : point.stage.toLowerCase()
        }
        action={
          <span className="flex flex-wrap items-center gap-2">
            {point.weightsFrom === "snapshot" && (
              <Badge
                tone="neutral"
                size="sm"
                icon={<Lock aria-hidden="true" />}
              >
                Weights frozen
              </Badge>
            )}
            {point.band === null ? (
              <Badge tone="warning" size="sm" dot>
                No mark
              </Badge>
            ) : (
              <Badge tone={BAND_TONE[point.band]} size="sm">
                {point.bandLabel}
              </Badge>
            )}
          </span>
        }
      />
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <p className="text-meta text-muted">Mark</p>
            {/* Absent is absent. Nothing recorded is not a mark of nought. */}
            <p className="tabular text-h4 text-ink">
              {point.scoreBp === null ? (
                <span className="text-body-lg text-muted">No mark</span>
              ) : (
                scoreLabel(point.scoreBp)
              )}
            </p>
          </div>
          <div>
            <p className="text-meta text-muted">Against the last mark</p>
            <p className="text-body-lg text-ink">
              {point.changeBp === null ? (
                <span className="text-muted">
                  {point.scoreBp === null
                    ? "Nothing to compare"
                    : "No earlier mark to compare with"}
                </span>
              ) : (
                changeLabel(point.changeBp)
              )}
            </p>
          </div>
          <div>
            <p className="text-meta text-muted">Objectives agreed</p>
            <p className="tabular text-body-lg text-ink">
              {point.objectives.agreed}
              {point.objectives.awaitingApproval > 0 && (
                <span className="ml-2 text-body-sm text-muted">
                  {point.objectives.awaitingApproval} waiting
                </span>
              )}
            </p>
          </div>
        </div>

        <Components components={point.components} />

        <SignOff point={point} />

        {point.exceptions.length > 0 && (
          <ul className="flex flex-col gap-2">
            {point.exceptions.map((issue) => (
              <li
                key={issue.code}
                className={
                  issue.severity === "BLOCKER"
                    ? "rounded-md border border-danger-line bg-danger-soft px-3.5 py-2.5 text-body-sm text-ink"
                    : "rounded-md border border-warning-line bg-warning-soft px-3.5 py-2.5 text-body-sm text-ink"
                }
              >
                {issue.message}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * What the mark was made of, and what it was not.
 *
 * `scoreLabel` takes a `number` and never `null`, so the compiler asks this
 * function what it wants to say about an absence instead of letting one fall
 * through as 0%. What it says is the API's own note.
 */
function Components({ components }: { components: ApiComponentScore[] }) {
  return (
    <div className="rounded-md border border-line">
      <ul className="divide-y divide-line">
        {components.map((part) => (
          <li
            key={part.component}
            className="flex flex-wrap gap-x-4 gap-y-1 p-3"
          >
            <div className="min-w-40 flex-1">
              <p className="text-body-sm font-medium text-ink">{part.label}</p>
              {part.included ? (
                <p className="mt-0.5 text-meta text-muted">
                  Counted for {weightLabel(part.effectiveWeightBp)} of the mark
                  {part.evidenceCount > 0 &&
                    ` · ${part.evidenceCount} ${part.evidenceCount === 1 ? "thing" : "things"} recorded`}
                </p>
              ) : (
                <p className="mt-0.5 text-meta text-muted">
                  {part.excludedNote}
                </p>
              )}
            </div>
            <p className="tabular shrink-0 text-body-sm font-medium text-ink">
              {part.scoreBp === null ? (
                <span className="font-normal text-muted">Nothing recorded</span>
              ) : (
                scoreLabel(part.scoreBp)
              )}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Sign-off, as the three separate facts it is.
 *
 * Not acknowledged is usually "nobody has asked them yet", which is why the
 * fields read as states rather than as one boolean.
 */
function SignOff({ point }: { point: ApiHistoryPoint }) {
  const { signOff } = point;

  return (
    <DescriptionList
      columns={2}
      items={[
        {
          term: "Rating written",
          value: signOff.submitted ? "Yes" : "Not yet",
        },
        {
          term: "Told the person",
          value: signOff.finalised
            ? "Finalised"
            : signOff.reviewId === null
              ? "No manager review exists"
              : "Not finalised, so they have not been told",
        },
        {
          term: "Their answer",
          value: signOff.disputed
            ? "Disputed"
            : signOff.acknowledged
              ? "Acknowledged"
              : signOff.finalised
                ? "None yet"
                : "Not asked yet",
        },
        {
          term: "What they said",
          value:
            signOff.employeeComment ??
            "Nothing, which they were not obliged to add",
        },
        ...(signOff.reviewId
          ? [
              {
                term: "The record",
                value: (
                  <Link
                    href={`/performance/reviews/${signOff.reviewId}`}
                    className="font-medium text-accent-text underline-offset-2 hover:underline"
                  >
                    Open the appraisal
                  </Link>
                ),
              },
            ]
          : []),
        {
          term: "Appraisers' overall mark",
          value:
            point.appraiserMark.ratingBp === null
              ? "None in yet"
              : `${scoreLabel(point.appraiserMark.ratingBp)} across ${point.appraiserMark.appraisers} ${point.appraiserMark.appraisers === 1 ? "appraiser" : "appraisers"}, weighted over the ${weightLabel(point.appraiserMark.submittedWeightBp)} that has come in — not scored`,
        },
      ]}
    />
  );
}
