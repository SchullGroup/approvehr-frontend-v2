"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Users,
} from "lucide-react";
import {
  Badge,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Money,
  Spinner,
  StackedBar,
  Stat,
} from "@/components/ui";
import { PageBody } from "@/components/portal/shell";
import { MyClockCard } from "@/components/portal/my-clock-card";
import { DashboardHeader } from "./header";
import { AnnouncementsPanel } from "./announcements-panel";
import { useDashboard } from "@/lib/store/insights";
import { StartPeriodButton } from "@/app/(app)/performance";
import { naira, runStatusLabel, type DashboardData } from "@/lib/api/insights";
import { useCan } from "@/lib/permissions";
import type { ApiBoard } from "@/lib/api/announcements";
import { QuickActions } from "./quick-actions";

/**
 * The screen people open first.
 *
 * One request. `/insights/dashboard` composes it server-side; see the header of
 * `src/modules/insights/service.ts` for why it is not ten calls to ten
 * `/summary` endpoints.
 *
 * ## Two dashboards, one screen
 *
 * `headcount`, `approvals` and `today` are the company's own figures — a
 * headcount, an approval backlog, who has not clocked in — and they are
 * absent, not zeroed, for anybody without `EDIT_RECORDS` or `VIEW_SALARIES`.
 * This file used to destructure and render them unconditionally, which meant
 * every plain employee's own dashboard quoted the whole company's headcount
 * and payroll completeness back at them — a real defect, not a hypothetical
 * one, found by an employee account reading its own screen. `CompanyOverview`
 * below is everything the previous single component did; `EmployeeOverview`
 * is what somebody without those two permissions gets instead, and the branch
 * between them is the fix.
 *
 * ## Blocks are absent, not empty
 *
 * The API omits a section the signed-in person has no permission for. So every
 * block below is behind a presence check, and a missing one renders **nothing**
 * rather than a zero. `₦0.00` where a figure does not belong tells somebody
 * their company has no outstanding loans, which is a different and wrong claim
 * from "you cannot see this".
 *
 * ## The noticeboard is part of the one request
 *
 * Announcements ride in `/insights/dashboard` rather than in a second call to
 * `/announcements/board`. Both come out of one function on the API (`boardFor`),
 * so there is no second definition of "which notices may this person see" to
 * drift — and the panel costs nothing on the screen that has to load fastest.
 *
 * `announcements` is the one block below that arrives for **everybody**: a
 * noticeboard needs no permission, so there is nothing to withhold. That is not
 * an exception to the presence rule, it is the rule read correctly — and it
 * does not make an empty board something to draw. `AnnouncementsPanel` returns
 * null on an empty board. The incumbent renders "Your Announcements Will Appear
 * Here" in that case, which spends the best space on the screen people open
 * first to say that a feature exists.
 *
 * ## Starting an appraisal period is reachable from here
 *
 * One of the doors onto `StartPeriodButton` — the product owner's rule is that
 * the same action should be reachable from every screen somebody might be on
 * when the thought occurs, and the dashboard is the first of them. It costs no
 * request: the button reads the features and permissions stores the shell has
 * already loaded, and it renders **nothing** when the company has appraisals
 * switched off or the reader cannot run one. A dead control on the screen people
 * open first would be worse than no control.
 *
 * ## What is deliberately not here
 *
 * The previous version drew a headcount trend from a hardcoded array —
 * `Feb: 182` through `Aug: 264`. Nothing in the system stores a historical
 * headcount, so those were invented numbers presented as the company's own
 * history, on a screen an owner would quote in a board meeting. It is gone
 * rather than reproduced. When somebody wants the trend, the honest way is a
 * monthly snapshot table, and then the chart is real.
 */
export function DashboardScreen() {
  const { data, loading, error, reload } = useDashboard();

  if (loading) {
    return (
      <>
        <DashboardHeader />
        <PageBody>
          <div className="flex items-center gap-3 py-16">
            <Spinner />
            <span className="text-body-sm text-muted">Loading your day…</span>
          </div>
        </PageBody>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <DashboardHeader />
        <PageBody>
          <Card>
            <CardBody className="flex flex-col items-start gap-3">
              <p className="text-body">
                {error ??
                  "Your dashboard did not load. Try again in a moment."}
              </p>
              <button
                type="button"
                onClick={reload}
                className="text-body-sm font-medium text-accent-text underline"
              >
                Try again
              </button>
            </CardBody>
          </Card>
        </PageBody>
      </>
    );
  }

  /* Checked together rather than one standing for all three: the API gates
     them on the same permission pair, but only this check lets TypeScript
     narrow all three to defined below, in `CompanyOverview`'s props. */
  if (data.headcount && data.approvals && data.today) {
    return (
      <CompanyOverview
        {...data}
        headcount={data.headcount}
        approvals={data.approvals}
        today={data.today}
      />
    );
  }

  return <EmployeeOverview announcements={data.announcements} />;
}

/* -------------------------------------------------------------------------- */

/**
 * Somebody without `EDIT_RECORDS` or `VIEW_SALARIES`: the noticeboard,
 * everybody's, and their own clock-in — the one thing every employee does on
 * this screen. Nothing here is a smaller version of a company figure; it is a
 * different, honest question ("what is my day") rather than the company's
 * question answered badly.
 */
function EmployeeOverview({ announcements }: { announcements: ApiBoard }) {
  return (
    <>
      <DashboardHeader action={<StartPeriodButton withIcon />} />
      <PageBody className="flex flex-col gap-6">
        <MyClockCard />
        <AnnouncementsPanel board={announcements} />
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

type CompanyOverviewProps = Omit<
  DashboardData,
  "headcount" | "approvals" | "today"
> & {
  headcount: NonNullable<DashboardData["headcount"]>;
  approvals: NonNullable<DashboardData["approvals"]>;
  today: NonNullable<DashboardData["today"]>;
};

/** Everybody with `EDIT_RECORDS` or `VIEW_SALARIES`: the company's own dashboard. */
function CompanyOverview({
  headcount,
  approvals,
  today,
  announcements,
  exits,
  hiring,
  payroll,
  money,
}: CompanyOverviewProps) {
  /* The card this sits in is gated by the API on `VIEW_SALARIES` — "absent
     means no permission", see the comment on the block below. Preparing a
     payroll is `RUN_PAYROLL`, which is a different permission on purpose:
     `PARITY.md` splits reading what people are paid from releasing money. So
     the card can be present and this button still refused, which is what a
     read-only finance reader met. Absent, not disabled. */
  const canRunPayroll = useCan("RUN_PAYROLL");
  /* Gates the "nobody's on the payroll yet" row below. Without this,
     somebody who cannot add an employee would see an action they cannot take.
     Same principle `StartPeriodButton` above already follows: a dead control
     is worse than no control. */
  const canAddEmployee = useCan("EDIT_RECORDS");

  /* An exit with nothing outstanding needs nobody, so it earns no row — "Needs
     you" says every line on it is one click from being dealt with, and a row
     reporting that three exits are progressing normally is furniture. The open
     total still travels, and is used below to give the figure its denominator.

     Absent means the caller may not see the register; zero means nothing is
     held up. Both render nothing, and the check is presence-then-value rather
     than truthiness so the two stay distinguishable in the code. */
  const exitsHeldUp = exits ? exits.withMandatoryOutstanding : 0;

  /* A company that has never added anyone satisfies none of the other
     "Needs you" conditions — no approvals, no incomplete records (there is
     nobody to be incomplete), no exits, no payroll blockers — so without
     this the card that is supposed to say what needs doing stays hidden for
     exactly the company that has done the least. */
  const nobodyOnPayroll = headcount.active === 0;

  return (
    <>
      <DashboardHeader action={<StartPeriodButton withIcon />} />

      <PageBody className="flex flex-col gap-6">
        {/* ---- The row that answers "is anything waiting for me" ---------- */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="On the payroll"
            value={headcount.active.toLocaleString()}
            hint={
              headcount.startingThisMonth > 0
                ? `${headcount.startingThisMonth} started this month`
                : undefined
            }
            icon={<Users aria-hidden="true" />}
          />

          <Stat
            label="Waiting for a decision"
            value={approvals.waiting.toLocaleString()}
            hint={
              approvals.overdue > 0
                ? `${approvals.overdue} past their deadline`
                : approvals.oldestWaitingDays !== null
                  ? `Oldest has waited ${approvals.oldestWaitingDays} days`
                  : "Nothing waiting"
            }
            icon={<BadgeCheck aria-hidden="true" />}
          />

          <Stat
            label="Not accounted for today"
            value={today.unaccountedFor.toLocaleString()}
            hint={`${today.clockedIn} clocked in · ${today.onLeave} on leave`}
            icon={<CalendarClock aria-hidden="true" />}
          />

          {/* Records payroll would refuse. Same test the run uses, so this
              figure and the run's blockers cannot disagree. */}
          <Stat
            label="Records to finish"
            value={headcount.incomplete.toLocaleString()}
            hint={
              headcount.incomplete > 0
                ? "Missing a bank account or pension PIN"
                : /* "Everyone can be paid" is true of an empty set, which
                     reads as reassurance where none is warranted — there is
                     nobody to have finished a record for. */
                  nobodyOnPayroll
                  ? "Nobody added yet"
                  : "Everyone can be paid"
            }
            icon={<AlertTriangle aria-hidden="true" />}
          />
        </div>

        {/* ---- Who is in today -------------------------------------------
            `expected` splits into exactly these four, and two of them —
            `late` and `expected` itself — were being fetched on every dashboard
            load and rendered nowhere. The tile above shows one part of a
            composition and hints at two more; this is the whole of it.

            **Gated on the parts, not on `expected`.** In demo mode
            `store/insights.ts` deliberately returns a real `expected` with all
            four parts at zero, because the dashboard does not reach into the
            attendance store. A bar drawn on that would be an empty track inside
            a real headcount — a confident claim that nobody turned up. */}
        {today.clockedIn + today.late + today.onLeave + today.unaccountedFor >
          0 && (
          <Card>
            <CardHeader
              title="Who is in today"
              description={`Of ${String(today.expected)} expected.`}
            />
            <CardBody>
              <StackedBar
                total={today.expected}
                format={(n) => String(n)}
                segments={[
                  {
                    label: "Clocked in",
                    value: today.clockedIn,
                    color: "var(--color-success-strong)",
                  },
                  ...(today.late > 0
                    ? [
                        {
                          label: "Late",
                          value: today.late,
                          color: "var(--color-warning)",
                        },
                      ]
                    : []),
                  ...(today.onLeave > 0
                    ? [
                        {
                          label: "On leave",
                          value: today.onLeave,
                          color: "var(--color-accent-line)",
                        },
                      ]
                    : []),
                  ...(today.unaccountedFor > 0
                    ? [
                        {
                          label: "Not accounted for",
                          value: today.unaccountedFor,
                          color: "var(--color-danger)",
                        },
                      ]
                    : []),
                ]}
                caption={`Of ${String(today.expected)} expected today: ${String(today.clockedIn)} clocked in, ${String(today.late)} late, ${String(today.onLeave)} on leave, ${String(today.unaccountedFor)} not accounted for.`}
              />
            </CardBody>
          </Card>
        )}

        {/* ---- Things to do, each with the button that does it ------------ */}
        {(approvals.waiting > 0 ||
          headcount.incomplete > 0 ||
          exitsHeldUp > 0 ||
          (payroll && payroll.blockers > 0) ||
          (nobodyOnPayroll && canAddEmployee)) && (
          <Card>
            <CardHeader title="Needs you" />
            <CardBody className="flex flex-col gap-3">
              {/* First, because nothing else on this card can be true for a
                  company that has never added anyone — every other row here
                  needs an employee to exist first. */}
              {nobodyOnPayroll && canAddEmployee && (
                <Row
                  href="/people/new"
                  label="Nobody's on the payroll yet"
                  detail="Add your first person to start paying them"
                  action="Add employee"
                />
              )}

              {approvals.waiting > 0 && (
                <Row
                  href="/approvals"
                  label={`${approvals.waiting} ${approvals.waiting === 1 ? "request" : "requests"} waiting for a decision`}
                  detail={
                    approvals.overdue > 0
                      ? `${approvals.overdue} past the deadline`
                      : undefined
                  }
                  action="Open approvals"
                  urgent={approvals.overdue > 0}
                />
              )}

              {headcount.incomplete > 0 && (
                <Row
                  href="/people"
                  label={`${headcount.incomplete} ${headcount.incomplete === 1 ? "person" : "people"} cannot be paid yet`}
                  detail="No account number or no pension PIN on file"
                  action="Fix records"
                  urgent
                />
              )}

              {/* Exits, for whoever may see the register. Placed after the
                  records row and before payroll because it is the one item here
                  whose cost grows the longer it is left: an account nobody
                  disabled and a laptop nobody chased do not get easier in
                  September. */}
              {exits && exitsHeldUp > 0 && (
                <Row
                  href="/people/offboarding"
                  label={`${exitsHeldUp} ${exitsHeldUp === 1 ? "person is" : "people are"} leaving with things still outstanding`}
                  detail={
                    /* The denominator matters: "1 of 1" and "1 of 9" are
                       different situations, and the second one is the company
                       working through exits properly with one held up. */
                    `Equipment, access or final pay not signed off · ${exitsHeldUp} of ${exits.open} open ${exits.open === 1 ? "exit" : "exits"}`
                  }
                  action="Open exits"
                />
              )}

              {payroll && payroll.blockers > 0 && (
                <Row
                  href="/payroll"
                  label={`${payroll.period} payroll has ${payroll.blockers} ${payroll.blockers === 1 ? "problem" : "problems"} to fix`}
                  detail={`It cannot be approved until ${payroll.blockers === 1 ? "it is" : "they are"} cleared`}
                  action="Open payroll"
                  urgent
                />
              )}
            </CardBody>
          </Card>
        )}

        {/* What to *start*, above what to read. `QuickActions` gates itself on
            permissions and features, so it renders nothing for somebody who can
            act on none of it — which is why it is safe here and absent from
            `EmployeeOverview`, whose reader holds neither permission. */}
        <QuickActions />

        {/* ---- The noticeboard. Renders nothing when nothing is up ------- */}
        <AnnouncementsPanel board={announcements} />

        <div className="grid gap-6 lg:grid-cols-2">
          {/* ---- Payroll. Absent means no permission; null means no run --- */}
          {payroll !== undefined && (
            <Card>
              <CardHeader title="This month's payroll" level={3} />
              <CardBody>
                {payroll === null ? (
                  <div className="flex flex-col items-start gap-3">
                    <p className="text-body">
                      No run has been prepared for this month yet.
                    </p>
                    {canRunPayroll && (
                      <ButtonLink href="/payroll/runs/new" variant="accent" size="sm">
                        Start this month&rsquo;s payroll
                        <ArrowRight aria-hidden="true" className="size-4" />
                      </ButtonLink>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-baseline gap-3">
                      <Money amount={naira(payroll.netKobo)} decimals className="text-h2" />
                      <Badge
                        tone={payroll.status === "APPROVED" ? "success" : "neutral"}
                        size="sm"
                      >
                        {runStatusLabel(payroll.status)}
                      </Badge>
                    </div>
                    <p className="text-body-sm text-muted">
                      {/* `employeeCount` is payslips. Beside a net figure it
                          reads as the headcount, and stating nine where ten
                          people work is a wrong claim rather than a rounded
                          one — so the excluded are named in the same breath. */}
                      Net pay for {payroll.employeeCount}{" "}
                      {payroll.employeeCount === 1 ? "person" : "people"}
                      {payroll.excludedCount > 0
                        ? ` of ${payroll.employeeCount + payroll.excludedCount}`
                        : ""}{" "}
                      · gross <Money amount={naira(payroll.grossKobo)} decimals />
                    </p>
                    {payroll.excludedCount > 0 && (
                      <p className="text-body-sm text-warning-text">
                        {payroll.excludedCount}{" "}
                        {payroll.excludedCount === 1 ? "person is" : "people are"}{" "}
                        deliberately not on this payroll, with the reason recorded
                      </p>
                    )}
                    {payroll.warnings > 0 && (
                      <p className="text-body-sm text-warning-text">
                        {payroll.warnings}{" "}
                        {payroll.warnings === 1 ? "thing" : "things"} worth checking
                        before you approve
                      </p>
                    )}
                    <ButtonLink href="/payroll" variant="secondary" size="sm">
                      Open payroll
                    </ButtonLink>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {/* ---- Hiring, for whoever holds MANAGE_HIRING ------------------ */}
          {hiring && (
            <Card>
              <CardHeader title="Hiring" level={3} />
              <CardBody className="grid grid-cols-2 gap-4">
                <Figure label="In the pipeline" value={hiring.candidatesInPlay} />
                <Figure
                  label="Stalled a week or more"
                  value={hiring.stalledSevenDays}
                  warn={hiring.stalledSevenDays > 0}
                />
                <Figure label="Interviews this week" value={hiring.interviewsNextSevenDays} />
                <Figure label="Offers out" value={hiring.offersOut} />
              </CardBody>
            </Card>
          )}

          {/* ---- Money owed, for whoever holds VIEW_SALARIES -------------- */}
          {money && (
            <Card>
              <CardHeader
                title="Money owed"
                level={3}
                description="Committed but not yet paid out."
              />
              <CardBody className="flex flex-col gap-3">
                <Owed
                  href="/payroll/loans"
                  label="Staff loans outstanding"
                  kobo={money.loansOutstandingKobo}
                />
                <Owed
                  href="/payroll/expenses"
                  label="Approved expenses not yet paid"
                  kobo={money.expensesApprovedUnpaidKobo}
                />
                <Owed
                  href="/people/overtime"
                  label="Overtime waiting for approval"
                  kobo={money.overtimeAwaitingApprovalKobo}
                />
              </CardBody>
            </Card>
          )}
        </div>
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function Row({
  href,
  label,
  detail,
  action,
  urgent = false,
}: {
  href: string;
  label: string;
  detail?: string;
  action: string;
  urgent?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3">
      <div className="min-w-0">
        <p className="text-body-sm font-medium">
          {/* Urgency carries a word as well as a colour. */}
          {urgent && (
            <span className="mr-2 text-meta font-semibold text-danger-text">
              Overdue
            </span>
          )}
          {label}
        </p>
        {detail && <p className="mt-0.5 text-body-sm text-muted">{detail}</p>}
      </div>
      <ButtonLink href={href} variant="secondary" size="sm">
        {action}
      </ButtonLink>
    </div>
  );
}

function Figure({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div>
      <p
        className={
          warn ? "text-h3 text-warning-text" : "text-h3 text-ink"
        }
      >
        {value.toLocaleString()}
      </p>
      <p className="mt-0.5 text-body-sm text-muted">{label}</p>
    </div>
  );
}

function Owed({
  href,
  label,
  kobo,
}: {
  href: string;
  label: string;
  kobo: number;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-md px-1 py-1 transition-colors hover:bg-canvas"
    >
      <span className="text-body-sm text-body">{label}</span>
      <Money amount={naira(kobo)} decimals className="text-body-sm font-medium" />
    </Link>
  );
}
