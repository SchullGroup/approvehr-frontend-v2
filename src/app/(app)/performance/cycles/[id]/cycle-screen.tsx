"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCheck, Lock, UserX } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Callout,
  EmptyState,
  Spinner,
  Stat,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  dayLabel,
  scoreLabel,
  weightLabel,
  type ApiAppraiserMap,
  type ApiCycleParticipants,
  type ApiScoreRegister,
  type ApiScoreRow,
} from "@/lib/api/performance";
import { useCan } from "@/lib/permissions";
import {
  outstandingIn,
  useCycleMutations,
  useCycleRegister,
} from "@/lib/store/performance";

/**
 * Running one cycle.
 *
 * ## The question this screen answers is "who is not finished"
 *
 * Not "how is the company doing" — that is a report, and it is a different
 * screen. A cycle owner has one job, which is to reach the end of the period with
 * nobody left out, and the two ways somebody gets left out are opposite:
 *
 * | | What it is | Where it comes from |
 * |---|---|---|
 * | **Outstanding** | a form somebody has not got round to | the participant list |
 * | **Nobody appraising them** | a person nobody was ever asked to mark | the appraiser map |
 *
 * Both are surfaced **above** the table, in the payroll run's shape. A blocker
 * buried in row 40 is a blocker nobody read, and that is not a metaphor: the
 * whole reason `PayrollExclusion` exists is that a missing bank account sat in a
 * list nobody scrolled to.
 *
 * ## Nobody appraising somebody is not silence, ever
 *
 * An employee with no appraiser in an open cycle finishes it with no mark, and
 * every screen looks finished. It is the performance module's missing bank
 * account. The mapping *interface* is behind the `multiAppraiser` flag, because a
 * company with one manager per person must never be shown a weighting table it
 * did not ask for — but the **exception is not behind any flag**, and it must not
 * be, because the company that never opens the mapping screen is exactly the
 * company that will lose somebody. That is why this reads the map here rather
 * than only on the mapping tab, and why it renders whether the flag is on or off.
 *
 * ## Scores are integers and an absence is an absence
 *
 * The table's score column prints "No mark" where nothing counted, never 0%.
 * "Scored nought" and "nothing was recorded" are different claims about a person,
 * and only one of them is ever true here.
 */
export function CycleScreen({ cycleId }: { cycleId: string }) {
  const canSeeCompany = useCan("EDIT_RECORDS");
  const canManage = useCan("MANAGE_SETTINGS");
  const detail = useCycleRegister(cycleId, canSeeCompany);
  const cycles = useCycleMutations();
  const toast = useToast();

  const [chasing, setChasing] = useState(false);

  const cycle = detail.cycle;
  const outstanding = outstandingIn(detail.participants);

  const chase = async () => {
    setChasing(true);
    try {
      const result = await cycles.remind(cycleId);
      toast.push({
        title:
          result.outstanding === 0
            ? "Nobody owes anything"
            : `Nudged ${result.reminded} ${result.reminded === 1 ? "person" : "people"}`,
        tone: "success",
        /* The count that does not add up is the useful one: somebody with no
           sign-in cannot be chased in the app, and saying so beats a number
           that quietly disagrees with the outstanding list. */
        ...(result.noAccount > 0
          ? {
              detail: `${result.noAccount} ${result.noAccount === 1 ? "person has" : "people have"} no sign-in, so they were not reached. Nothing here sends email.`,
            }
          : {}),
      });
      detail.reload();
    } catch (error) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setChasing(false);
    }
  };

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/performance", label: "Performance" },
          { href: "/performance?tab=appraisals", label: "Appraisals" },
        ]}
        title={cycle?.name ?? "Review cycle"}
        description="Who owes a form, who has nobody appraising them, and where every mark stands."
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
          <>
            {/* The outcome is a different question from "who is not finished",
                and a different screen. Linked from here because this is where
                somebody is when they decide they want it. */}
            {canSeeCompany && (
              <ButtonLink size="sm" href={`/performance/cycles/${cycleId}/report`}>
                See the report
              </ButtonLink>
            )}
            {detail.available &&
              canManage &&
              cycle &&
              cycle.stage !== "DRAFT" &&
              cycle.stage !== "PUBLISHED" && (
                <Button size="sm" loading={chasing} onClick={() => void chase()}>
                  Nudge who is late
                </Button>
              )}
          </>
        }
      />

      <PageBody>
        <div className="flex flex-col gap-6">
          {/* Not a permission problem and not an outage. Two different sentences,
              because sending somebody to look for the wrong one wastes an
              afternoon. */}
          {!canSeeCompany ? (
            <Callout tone="info" title="This is a company-wide view">
              <p>
                Who owes a form and what everybody scored is an aggregate over
                every employee, which needs the records permission. Your own
                review and your own objectives are on{" "}
                <Link
                  href="/performance"
                  className="font-medium text-accent-text underline-offset-2 hover:underline"
                >
                  the performance screen
                </Link>
                .
              </p>
            </Callout>
          ) : !detail.available ? (
            <Callout tone="warning" title="Demo data, this browser only">
              <p>{detail.refusal}</p>
            </Callout>
          ) : null}

          {detail.error && (
            <p className="rounded-md border border-danger-line bg-danger-soft px-3.5 py-2.5 text-body-sm text-ink">
              {detail.error.message}
            </p>
          )}

          {cycle && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat
                label="Stage"
                value={cycle.stageLabel}
                {...(cycle.dueDate
                  ? { hint: `Due ${dayLabel(cycle.dueDate)}` }
                  : {})}
              />
              <Stat
                label="Questions"
                value={String(cycle.questionCount)}
                hint={
                  cycle.questionCount === 0
                    ? "A form with no questions asks nobody anything"
                    : "Asked across the self and manager forms"
                }
              />
              <Stat
                label="Forms in this cycle"
                value={String(cycle.reviewCount)}
                hint="One self-review each, plus one per appraiser"
              />
              <Stat
                label="Scoring weights"
                value={cycle.scoringFrozen ? "Frozen" : "Live"}
                hint={
                  cycle.scoringFrozen
                    ? "A later change to the company's weights cannot move these marks"
                    : "This cycle started before weights were frozen onto a cycle"
                }
              />
            </div>
          )}

          {detail.loading && (
            <Card>
              <CardBody className="flex items-center gap-2 text-body-sm text-muted">
                <Spinner size="sm" />
                Reading the cycle
              </CardBody>
            </Card>
          )}

          {detail.available && !detail.loading && (
            <>
              <NobodyAppraising exceptions={detail.exceptions} />
              <Outstanding
                rows={outstanding}
                participants={detail.participants}
              />
              <Register register={detail.register} />
            </>
          )}
        </div>
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The people something is wrong with, by name, above everything else.
 *
 * `NO_APPRAISER` is a WARNING in a draft and a BLOCKER once the cycle is
 * running, which is the API's decision and the right one: colouring the whole
 * company red before anybody has started teaches people to ignore the colour.
 *
 * An empty list is stated rather than left blank. "Everybody has an appraiser" is
 * a fact worth reading, and a card that simply disappears when the news is good
 * is a card nobody trusts when it comes back.
 */
function NobodyAppraising({
  exceptions,
}: {
  exceptions: ApiAppraiserMap | null;
}) {
  if (!exceptions) return null;

  const rows = exceptions.rows.filter((row) => row.exceptions.length > 0);

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader
          title="Who is appraising whom"
          description="Nothing outstanding here."
        />
        <CardBody className="flex items-center gap-2 text-body-sm text-body">
          <CheckCheck aria-hidden="true" className="size-4 text-success-text" />
          All {exceptions.counts.people} people have somebody appraising them, and
          every set of weights makes a whole mark.
        </CardBody>
      </Card>
    );
  }

  const blockers = rows.flatMap((row) =>
    row.exceptions
      .filter((issue) => issue.severity === "BLOCKER")
      .map((issue) => ({ key: `${row.employeeId}-${issue.code}`, issue })),
  );
  const warnings = rows.flatMap((row) =>
    row.exceptions
      .filter((issue) => issue.severity === "WARNING")
      .map((issue) => ({ key: `${row.employeeId}-${issue.code}`, issue })),
  );

  return (
    <Card>
      <CardHeader
        title="Who is appraising whom"
        description={
          exceptions.counts.unassigned > 0
            ? "Somebody with no appraiser finishes this cycle with no mark. Set a manager on their record, or assign an appraiser."
            : "What is wrong with the mapping, by name."
        }
        action={
          <Badge
            tone={blockers.length > 0 ? "danger" : "warning"}
            size="sm"
            icon={<UserX aria-hidden="true" />}
          >
            {blockers.length > 0
              ? `${blockers.length} ${blockers.length === 1 ? "blocker" : "blockers"}`
              : `${warnings.length} to look at`}
          </Badge>
        }
      />
      <CardBody className="flex flex-col gap-2">
        {blockers.map(({ key, issue }) => (
          <p
            key={key}
            className="rounded-md border border-danger-line bg-danger-soft px-3.5 py-2.5 text-body-sm text-ink"
          >
            {issue.message}
          </p>
        ))}
        {warnings.map(({ key, issue }) => (
          <p
            key={key}
            className="rounded-md border border-warning-line bg-warning-soft px-3.5 py-2.5 text-body-sm text-ink"
          >
            {issue.message}
          </p>
        ))}
      </CardBody>
    </Card>
  );
}

/**
 * Who has not sent a form yet, by name and by what is missing.
 *
 * The counts come from the API and the rows are derived from the same payload, so
 * "12 of 18 self-reviews in" and the list underneath it cannot disagree.
 */
function Outstanding({
  rows,
  participants,
}: {
  rows: { employeeId: string; employeeName: string; what: string; reviewId: string }[];
  participants: ApiCycleParticipants | null;
}) {
  if (!participants) return null;
  const { counts } = participants;

  return (
    <Card>
      <CardHeader
        title="Still to come in"
        description="A form somebody has not got round to. Different from nobody being asked at all, which is above."
      />
      <CardBody className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="Self-reviews in"
            value={`${counts.selfDone} of ${counts.people}`}
          />
          <Stat
            label="Manager reviews in"
            value={`${counts.managerDone} of ${counts.people}`}
          />
          <Stat label="Forms outstanding" value={String(rows.length)} />
        </div>

        {rows.length === 0 ? (
          <p className="flex items-center gap-2 text-body-sm text-body">
            <CheckCheck aria-hidden="true" className="size-4 text-success-text" />
            Everything asked for has come in.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <li
                key={`${row.employeeId}-${row.reviewId}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3"
              >
                <span className="text-body-sm text-ink">{row.what}</span>
                <Link
                  href={`/performance/reviews/${row.reviewId}`}
                  className="text-body-sm font-medium text-accent-text underline-offset-2 hover:underline"
                >
                  Open it
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * Where every mark stands.
 *
 * One row per person, and the score column is the place absent-versus-zero shows
 * up most often: a person with nothing recorded gets "No mark", never 0%. The
 * sign-off column carries three separate facts and reads whichever applies, in
 * order of what somebody has to do about it.
 */
function Register({ register }: { register: ApiScoreRegister | null }) {
  if (!register) return null;

  if (register.rows.length === 0) {
    return (
      <Card>
        <CardHeader title="Where the marks stand" />
        <EmptyState
          compact
          icon={<UserX aria-hidden="true" />}
          title="Nobody is in this cycle"
          description="Starting a cycle creates a form for every employee who is not archived or exited."
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Where the marks stand"
        description={
          register.weightsFrom === "snapshot"
            ? `Weighted with the set frozen onto this cycle, totalling ${weightLabel(register.weightsTotalBp)}.`
            : `Weighted with the company's current set, totalling ${weightLabel(register.weightsTotalBp)}. This cycle has no frozen weights, so a change to them would move these marks.`
        }
        action={
          <span className="flex flex-wrap gap-2">
            {register.counts.unscored > 0 && (
              <Badge tone="danger" size="sm">
                {register.counts.unscored} unscored
              </Badge>
            )}
            {register.counts.awaitingAcknowledgement > 0 && (
              <Badge tone="warning" size="sm">
                {register.counts.awaitingAcknowledgement} unanswered
              </Badge>
            )}
            {register.counts.disputed > 0 && (
              <Badge tone="danger" size="sm">
                {register.counts.disputed} disputed
              </Badge>
            )}
          </span>
        }
      />
      <CardBody className="p-0">
        <TableWrap caption="Everybody in this cycle, their score and their sign-off">
          <THead>
            <TH>Person</TH>
            <TH>Objectives agreed</TH>
            <TH align="right">Score</TH>
            <TH>Sign-off</TH>
          </THead>
          <TBody>
            {register.rows.map((row) => (
              <RegisterRow key={row.employeeId} row={row} />
            ))}
          </TBody>
        </TableWrap>
      </CardBody>
    </Card>
  );
}

function RegisterRow({ row }: { row: ApiScoreRow }) {
  return (
    <TR>
      <TD>
        {/* The name is the link to their trend across cycles. One mark is a
            snapshot; the argument about a rating is almost always about whether
            it moved. */}
        <Link
          href={`/performance/history/${row.employeeId}`}
          className="font-medium text-ink underline-offset-2 hover:text-accent-text hover:underline"
        >
          {row.employeeName}
        </Link>
        <span className="mt-0.5 block text-meta text-muted">
          {row.jobTitle}
          {row.departmentName ? ` · ${row.departmentName}` : ""}
        </span>
      </TD>
      <TD>
        <span className="tabular">{row.objectives.agreed}</span>
        {row.objectives.awaitingApproval > 0 && (
          <span className="mt-0.5 block text-meta text-muted">
            {row.objectives.awaitingApproval} waiting to be agreed
          </span>
        )}
      </TD>
      <TD align="right">
        {/* Absent is absent. Nothing recorded is not a mark of nought. */}
        {row.scoreBp === null ? (
          <span className="text-muted">No mark</span>
        ) : (
          <span className="tabular font-medium text-ink">
            {scoreLabel(row.scoreBp)}
          </span>
        )}
      </TD>
      <TD>
        <SignOffCell row={row} />
      </TD>
    </TR>
  );
}

/**
 * The sign-off state, in one phrase, ordered by what has to happen next.
 *
 * Disputed first because it is the only one that obliges somebody else to act.
 * Then unanswered, which is the exposure acknowledgement exists to close —
 * silence is not acceptance and this cell must never read as though it were.
 */
function SignOffCell({ row }: { row: ApiScoreRow }) {
  const signOff = row.signOff;

  if (signOff.disputed) {
    return (
      <Badge tone="danger" size="sm" dot>
        Disputed
      </Badge>
    );
  }
  if (signOff.acknowledged) {
    return (
      <Badge tone="success" size="sm" dot>
        Acknowledged
      </Badge>
    );
  }
  if (signOff.finalised) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <Badge tone="warning" size="sm" dot>
          Not answered yet
        </Badge>
        {signOff.reviewId && (
          <Link
            href={`/performance/reviews/${signOff.reviewId}`}
            className="text-meta font-medium text-accent-text underline-offset-2 hover:underline"
          >
            Open
          </Link>
        )}
      </span>
    );
  }
  if (signOff.submitted) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <Badge tone="info" size="sm" dot>
          Written, not final
        </Badge>
        {signOff.reviewId && (
          <Link
            href={`/performance/reviews/${signOff.reviewId}`}
            className="text-meta font-medium text-accent-text underline-offset-2 hover:underline"
          >
            Finalise
          </Link>
        )}
      </span>
    );
  }
  /* No review at all is a different fact from an unwritten one, and it is the
     appraiser-map exception above rather than a state of this cell. */
  return (
    <span className="text-body-sm text-muted">
      {signOff.reviewId === null ? "No manager review" : "Not written yet"}
    </span>
  );
}
