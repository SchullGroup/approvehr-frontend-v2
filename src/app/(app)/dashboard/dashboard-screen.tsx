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
  Stat,
} from "@/components/ui";
import { PageBody } from "@/components/portal/shell";
import { DashboardHeader } from "./header";
import { AnnouncementsPanel } from "./announcements-panel";
import { useDashboard } from "@/lib/store/insights";
import { naira, runStatusLabel } from "@/lib/api/insights";

/**
 * The screen people open first.
 *
 * One request. `/insights/dashboard` composes it server-side; see the header of
 * `src/modules/insights/service.ts` for why it is not ten calls to ten
 * `/summary` endpoints.
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
              <p className="text-body text-ink">
                {error ?? "Could not load your dashboard."}
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

  const { headcount, approvals, today, announcements, hiring, payroll, money } = data;

  return (
    <>
      <DashboardHeader />

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
                : "Everyone can be paid"
            }
            icon={<AlertTriangle aria-hidden="true" />}
          />
        </div>

        {/* ---- Things to do, each with the button that does it ------------ */}
        {(approvals.waiting > 0 ||
          headcount.incomplete > 0 ||
          (payroll && payroll.blockers > 0)) && (
          <Card>
            <CardHeader
              title="Needs you"
              description="Each of these is one click from being dealt with."
            />
            <CardBody className="flex flex-col gap-3">
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

              {payroll && payroll.blockers > 0 && (
                <Row
                  href="/payroll"
                  label={`${payroll.period} payroll has ${payroll.blockers} ${payroll.blockers === 1 ? "problem" : "problems"} to fix`}
                  detail="It cannot be approved until they are cleared"
                  action="Open payroll"
                  urgent
                />
              )}
            </CardBody>
          </Card>
        )}

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
                    <p className="text-body text-body">
                      No run has been prepared for this month yet.
                    </p>
                    <ButtonLink href="/payroll/runs/new" variant="accent" size="sm">
                      Start this month&rsquo;s payroll
                      <ArrowRight aria-hidden="true" className="size-4" />
                    </ButtonLink>
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
        <p className="text-body font-medium text-ink">
          {/* Urgency carries a word as well as a colour. */}
          {urgent && (
            <span className="mr-2 text-meta font-semibold uppercase tracking-wide text-danger-text">
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
      <Money amount={naira(kobo)} decimals className="text-body font-medium" />
    </Link>
  );
}
