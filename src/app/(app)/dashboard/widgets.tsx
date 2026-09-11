"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CalendarDays,
  Inbox,
  Users,
  Wallet,
} from "lucide-react";
import {
  AreaChart,
  Badge,
  BarChart,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  ColumnChart,
  DonutChart,
  Money,
  Spinner,
  StackedBar,
  Stat,
} from "@/components/ui";
import { AskPanel } from "@/components/portal/ask-panel";
import { MyClockCard } from "@/components/portal/my-clock-card";
import { AnnouncementsPanel } from "./announcements-panel";
import { QuickActions } from "./quick-actions";
import { AppraisalsCard } from "./appraisals-card";
import { formatKobo } from "@/lib/api/payroll";
import {
  employmentTypeLabel,
  naira,
  runStatusLabel,
  type DashboardData,
  type ReportsData,
} from "@/lib/api/insights";
import { useCan } from "@/lib/permissions";
import { formatDate } from "@/lib/time";

/**
 * One component per catalogue entry.
 *
 * ## Every widget asks the third gate for itself
 *
 * `catalogue.ts` answers "may this person see it" and "did this company switch
 * it on". Neither can answer **"is there anything to draw"**, because that
 * depends on what `/insights/dashboard` actually sent and on whether this month
 * has a payroll run — so every component below opens with a presence check and
 * returns `null` when the answer is absent. The grid closes over a null.
 *
 * The rule those checks keep is the one this repo has paid for twice:
 * **absent is not zero.** `payroll === undefined` means no permission and
 * `payroll === null` means no run this month; `₦0.00` would be a claim that the
 * company owes nobody anything. Every check here is presence-then-value, never
 * truthiness, so the two stay distinguishable in the code as well as on screen.
 *
 * ## `reports` is null more often than it is missing
 *
 * The chart widgets read `/insights/reports`, a second request the dashboard
 * only makes when at least one of them is on. So `reports: null` here means
 * *not loaded yet* far more often than it means *failed*, and `reportsLoading`
 * is what tells them apart. A chart draws a spinner for the first and nothing
 * at all for the second — an empty chart frame is a claim that the company has
 * no history.
 */

export type WidgetProps = {
  dashboard: DashboardData;
  /** Null until the reports request lands, or if no chart widget is on. */
  reports: ReportsData | null;
  reportsLoading: boolean;
};

type WidgetComponent = (props: WidgetProps) => React.ReactNode;

/* ------------------------------------------------------------------ shared */

/** A card with a heading, for the widgets that are a card. */
function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="h-full">
      <CardHeader title={title} level={3} description={description} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

/**
 * What a chart shows before its data has arrived.
 *
 * A spinner, not an empty chart. An axis with no line on it says the company
 * has no history, which is a different and wrong claim — the same distinction
 * the dashboard already makes between an absent block and a zeroed one.
 */
function ChartLoading({ title }: { title: string }) {
  return (
    <Panel title={title}>
      <div className="flex items-center gap-2 py-6 text-body-sm text-muted">
        <Spinner size="sm" />
        Working it out
      </div>
    </Panel>
  );
}

/* -------------------------------------------------------------- attention */

const NeedsYou: WidgetComponent = ({ dashboard }) => {
  const { headcount, approvals, exits, onboarding, payroll } = dashboard;
  const canAddEmployee = useCan("EDIT_RECORDS");
  if (!headcount || !approvals) return null;

  /* Absent means no permission; zero means nothing held up. Both draw nothing,
     and the check is presence-then-value so the code keeps them apart. */
  const exitsHeldUp = exits ? exits.withMandatoryOutstanding : 0;
  const onboardingHeldUp = onboarding ? onboarding.withMandatoryOutstanding : 0;
  const nobodyOnPayroll = headcount.active === 0;

  const anything =
    approvals.waiting > 0 ||
    headcount.incomplete > 0 ||
    exitsHeldUp > 0 ||
    onboardingHeldUp > 0 ||
    (payroll !== null && payroll !== undefined && payroll.blockers > 0) ||
    (nobodyOnPayroll && canAddEmployee);

  /* "Needs you" promises every line on it is one click from being dealt with.
     A card saying nothing needs you is furniture on the screen with the least
     room for it. */
  if (!anything) return null;

  return (
    <Card>
      <CardHeader title="Needs you" />
      <CardBody className="flex flex-col gap-3">
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
            label={`${String(approvals.waiting)} ${approvals.waiting === 1 ? "request" : "requests"} waiting for a decision`}
            detail={
              approvals.overdue > 0
                ? `${String(approvals.overdue)} past the deadline`
                : undefined
            }
            action="Open approvals"
            urgent={approvals.overdue > 0}
          />
        )}
        {headcount.incomplete > 0 && (
          <Row
            href="/people"
            label={`${String(headcount.incomplete)} ${headcount.incomplete === 1 ? "person" : "people"} cannot be paid yet`}
            detail="No account number or no pension PIN on file"
            action="Fix records"
            urgent
          />
        )}
        {exits && exitsHeldUp > 0 && (
          <Row
            href="/people/offboarding"
            label={`${String(exitsHeldUp)} ${exitsHeldUp === 1 ? "person is" : "people are"} leaving with things still outstanding`}
            detail={`Equipment, access or final pay not signed off · ${String(exitsHeldUp)} of ${String(exits.open)} open ${exits.open === 1 ? "exit" : "exits"}`}
            action="Open exits"
          />
        )}
        {onboarding && onboardingHeldUp > 0 && (
          <Row
            href="/people/onboarding"
            label={`${String(onboardingHeldUp)} ${onboardingHeldUp === 1 ? "starter has" : "starters have"} mandatory checklist items outstanding`}
            detail={`${String(onboardingHeldUp)} of ${String(onboarding.open)} active ${onboarding.open === 1 ? "starter" : "starters"} not yet complete`}
            action="Open onboarding"
          />
        )}
        {payroll && payroll.blockers > 0 && (
          <Row
            href="/payroll"
            label={`${payroll.period} payroll has ${String(payroll.blockers)} ${payroll.blockers === 1 ? "problem" : "problems"} to fix`}
            detail={`It cannot be approved until ${payroll.blockers === 1 ? "it is" : "they are"} cleared`}
            action="Open payroll"
            urgent
          />
        )}
      </CardBody>
    </Card>
  );
};

const MyQueue: WidgetComponent = ({ dashboard }) => {
  const me = dashboard.me;
  if (!me) return null;
  return (
    <TileLink
      href="/approvals"
      icon={<Inbox aria-hidden="true" className="size-3.5" />}
      label="Waiting on you"
      value={String(me.waitingOnMe)}
      /* Drawn as zero deliberately: "nothing needs you" is a useful answer and
         a true one, unlike a zero standing in for an absence. */
      hint={
        me.waitingOnMe === 0
          ? "Nothing needs you"
          : me.waitingOnMe === 1
            ? "1 thing to decide"
            : `${String(me.waitingOnMe)} things to decide`
      }
    />
  );
};

/* ----------------------------------------------------------------- people */

const StatHeadcount: WidgetComponent = ({ dashboard }) =>
  dashboard.headcount ? (
    <Stat
      label="On the payroll"
      value={dashboard.headcount.active.toLocaleString()}
      hint={
        dashboard.headcount.startingThisMonth > 0
          ? `${String(dashboard.headcount.startingThisMonth)} started this month`
          : undefined
      }
      icon={<Users aria-hidden="true" />}
    />
  ) : null;

const StatApprovals: WidgetComponent = ({ dashboard }) =>
  dashboard.approvals ? (
    <Stat
      label="Waiting for a decision"
      value={dashboard.approvals.waiting.toLocaleString()}
      hint={
        dashboard.approvals.overdue > 0
          ? `${String(dashboard.approvals.overdue)} past their deadline`
          : dashboard.approvals.oldestWaitingDays !== null
            ? `Oldest has waited ${String(dashboard.approvals.oldestWaitingDays)} days`
            : "Nothing waiting"
      }
      icon={<BadgeCheck aria-hidden="true" />}
    />
  ) : null;

const StatRecords: WidgetComponent = ({ dashboard }) => {
  const { headcount } = dashboard;
  if (!headcount) return null;
  return (
    <Stat
      label="Records to finish"
      value={headcount.incomplete.toLocaleString()}
      hint={
        headcount.incomplete > 0
          ? "Missing a bank account or pension PIN"
          : /* True of an empty set, and reassurance where none is warranted. */
            headcount.active === 0
            ? "Nobody added yet"
            : "Everyone can be paid"
      }
      icon={<AlertTriangle aria-hidden="true" />}
    />
  );
};

const StatAttendance: WidgetComponent = ({ dashboard }) =>
  dashboard.today ? (
    <Stat
      label="Not accounted for today"
      value={dashboard.today.unaccountedFor.toLocaleString()}
      hint={`${String(dashboard.today.clockedIn)} clocked in · ${String(dashboard.today.onLeave)} on leave`}
      icon={<CalendarClock aria-hidden="true" />}
    />
  ) : null;

const WhoIsIn: WidgetComponent = ({ dashboard }) => {
  const today = dashboard.today;
  if (!today) return null;
  /* Gated on the **parts**, not on `expected`. Demo mode returns a real
     `expected` with all four parts at zero, and a bar drawn on that is an empty
     track inside a real headcount — a confident claim that nobody turned up. */
  if (
    today.clockedIn + today.late + today.onLeave + today.unaccountedFor ===
    0
  ) {
    return null;
  }
  return (
    <Panel
      title="Who is in today"
      description={`Of ${String(today.expected)} expected.`}
    >
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
    </Panel>
  );
};

/* -------------------------------------------------------------------- pay */

const PayrollMonth: WidgetComponent = ({ dashboard }) => {
  const payroll = dashboard.payroll;
  const canRunPayroll = useCan("RUN_PAYROLL");
  /* Undefined is no permission. Null is permitted with no run this month, which
     is a real answer and gets a card. */
  if (payroll === undefined) return null;

  return (
    <Panel title="This month's payroll">
      {payroll === null ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-body">
            No run has been prepared for this month yet.
          </p>
          {/* `VIEW_SALARIES` got the card; preparing is `RUN_PAYROLL`, which is
              a different permission on purpose. Absent, not disabled. */}
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
            <Money amount={naira(payroll.netKobo)} decimals size="xl" />
            <Badge
              tone={payroll.status === "APPROVED" ? "success" : "neutral"}
              size="sm"
            >
              {runStatusLabel(payroll.status)}
            </Badge>
          </div>
          <p className="text-body-sm text-muted">
            {/* `employeeCount` is payslips. Beside a net figure it reads as the
                headcount, so the excluded are named in the same breath. */}
            Net pay for {payroll.employeeCount}{" "}
            {payroll.employeeCount === 1 ? "person" : "people"}
            {payroll.excludedCount > 0
              ? ` of ${String(payroll.employeeCount + payroll.excludedCount)}`
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
              {payroll.warnings} {payroll.warnings === 1 ? "thing" : "things"}{" "}
              worth checking before you approve
            </p>
          )}
          <ButtonLink href="/payroll" variant="secondary" size="sm">
            Open payroll
          </ButtonLink>
        </div>
      )}
    </Panel>
  );
};

const MoneyOwed: WidgetComponent = ({ dashboard }) => {
  const money = dashboard.money;
  if (!money) return null;
  return (
    <Panel title="Money owed" description="Committed but not yet paid out.">
      <div className="flex flex-col gap-3">
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
      </div>
    </Panel>
  );
};

const Hiring: WidgetComponent = ({ dashboard }) => {
  const hiring = dashboard.hiring;
  if (!hiring) return null;
  return (
    <Panel title="Hiring">
      <div className="grid grid-cols-2 gap-4">
        <Figure label="In the pipeline" value={hiring.candidatesInPlay} />
        <Figure
          label="Stalled a week or more"
          value={hiring.stalledSevenDays}
          warn={hiring.stalledSevenDays > 0}
        />
        <Figure
          label="Interviews this week"
          value={hiring.interviewsNextSevenDays}
        />
        <Figure label="Offers out" value={hiring.offersOut} />
      </div>
    </Panel>
  );
};

/* ----------------------------------------------------------------- charts */

const HeadcountTrend: WidgetComponent = ({ reports, reportsLoading }) => {
  if (reportsLoading) return <ChartLoading title="Headcount over time" />;
  /* `?.` on the **section**, not only on `reports`.
     ------------------------------------------------------------------------
     `reports?.workforce.trend` is what put a real company's dashboard behind
     the error boundary: the first `?.` guards the object that is null while
     loading, and nothing guarded the section, so an API that does not send
     `workforce` threw `Cannot read properties of undefined (reading 'trend')`
     from inside a render. See the note at the top of `ReportsData` — every
     section is optional now, and the compiler found the other four. */
  const trend = reports?.workforce?.trend ?? [];
  /* One point is not a trend, and a chart with a single dot on it reads as a
     broken chart rather than as a young company. */
  if (trend.length < 2) return null;
  return (
    <Panel
      title="Headcount over time"
      description="From real start and end dates. Nothing here is a snapshot or an estimate."
    >
      <AreaChart
        points={trend.map((row) => ({
          label: monthLabel(row.month),
          value: row.headcount,
        }))}
        format={(n) => String(n)}
        caption={`Headcount by month, ${monthLabel(trend[0]?.month ?? "")} to ${monthLabel(trend[trend.length - 1]?.month ?? "")}.`}
      />
    </Panel>
  );
};

const JoinersLeavers: WidgetComponent = ({ reports, reportsLoading }) => {
  if (reportsLoading) return <ChartLoading title="Joiners and leavers" />;
  const trend = reports?.workforce?.trend ?? [];
  if (trend.length < 2) return null;
  const anyMovement = trend.some((row) => row.joiners > 0 || row.leavers > 0);
  /* Nobody has joined or left in the window. A pair of flat empty axes is not
     an answer worth a card. */
  if (!anyMovement) return null;
  return (
    <Panel
      title="Joiners and leavers"
      description="Month by month, over the same window."
    >
      <div className="flex flex-col gap-4">
        <ColumnChart
          points={trend.map((row) => ({
            label: monthLabel(row.month),
            value: row.joiners,
          }))}
          height={110}
          format={(n) => String(n)}
          caption="People who joined, by month."
        />
        <ColumnChart
          points={trend.map((row) => ({
            label: monthLabel(row.month),
            value: row.leavers,
          }))}
          height={110}
          tones={["var(--color-warning)"]}
          format={(n) => String(n)}
          caption="People who left, by month."
        />
      </div>
    </Panel>
  );
};

const StatTurnover: WidgetComponent = ({ reports, reportsLoading }) => {
  if (reportsLoading) return null;
  const workforce = reports?.workforce;
  /* Null, never 0 — 0% would claim the company retains everybody, which is a
     statement about a workforce that does not exist. */
  if (!workforce || workforce.turnoverBp === null) return null;
  return (
    <Stat
      label="Turnover"
      value={`${(workforce.turnoverBp / 100).toFixed(1)}%`}
      hint={`Leavers against average headcount, last ${String(workforce.turnoverWindowMonths)} months`}
    />
  );
};

const StatTenure: WidgetComponent = ({ reports, reportsLoading }) => {
  if (reportsLoading) return null;
  const months = reports?.workforce?.averageTenureMonths;
  if (months === null || months === undefined) return null;
  return (
    <Stat
      label="Average tenure"
      value={
        months >= 24
          ? `${(months / 12).toFixed(1)} yrs`
          : `${String(Math.round(months))} mths`
      }
      hint="Over the people here now, not leavers"
    />
  );
};

const HeadcountByDepartment: WidgetComponent = ({
  reports,
  reportsLoading,
}) => {
  if (reportsLoading) return <ChartLoading title="Headcount by department" />;
  const rows = reports?.headcount?.byDepartment ?? [];
  if (rows.length === 0) return null;
  return (
    <Panel title="Headcount by department" description="Largest first.">
      <BarChart
        points={rows.map((row) => ({ label: row.name, value: row.count }))}
        format={(n) => String(n)}
        caption="How many people sit in each department."
      />
    </Panel>
  );
};

const EmploymentTypes: WidgetComponent = ({ reports, reportsLoading }) => {
  if (reportsLoading) return <ChartLoading title="Contract types" />;
  const rows = reports?.headcount?.byEmploymentType ?? [];
  if (rows.length === 0) return null;
  return (
    <Panel title="Contract types">
      <DonutChart
        points={rows.map((row) => ({
          label: employmentTypeLabel(row.type),
          value: row.count,
        }))}
        format={(n) => String(n)}
        centreLabel="people"
        caption="The company split by contract type."
      />
    </Panel>
  );
};

const PayrollByDepartment: WidgetComponent = ({ reports, reportsLoading }) => {
  if (reportsLoading)
    return <ChartLoading title="Payroll cost by department" />;
  const rows = reports?.payrollByDepartment;
  /* Null means no payroll run this month, so there is nothing to attribute.
     A chart of zeros would claim every department costs nothing. */
  if (!rows || rows.length === 0) return null;
  return (
    <Panel
      title="Payroll cost by department"
      description="Gross, for this month's run."
    >
      <BarChart
        points={rows.map((row) => ({
          label: row.department,
          value: row.grossKobo / 100,
        }))}
        format={(n) => formatKobo(Math.round(n * 100))}
        caption="Gross payroll cost by department for this month."
      />
    </Panel>
  );
};

const GrossBreakdown: WidgetComponent = ({ reports, reportsLoading }) => {
  if (reportsLoading) return <ChartLoading title="What gross is made of" />;
  const parts = reports?.grossBreakdown;
  if (!parts) return null;
  return (
    <Panel
      title="What gross is made of"
      description="Employer pension sits on top of gross and does not reduce anybody's pay."
    >
      <DonutChart
        points={[
          { label: "Basic", value: parts.basicKobo / 100 },
          { label: "Housing", value: parts.housingKobo / 100 },
          { label: "Transport", value: parts.transportKobo / 100 },
          { label: "Allowances", value: parts.allowancesKobo / 100 },
          { label: "Employer pension", value: parts.employerPensionKobo / 100 },
        ].filter((point) => point.value > 0)}
        format={(n) => formatKobo(Math.round(n * 100))}
        caption="This month's gross, split into its parts."
      />
    </Panel>
  );
};

const OperationalLoad: WidgetComponent = ({ reports, reportsLoading }) => {
  if (reportsLoading) return <ChartLoading title="How much is in flight" />;
  const load = reports?.operationalLoad;
  if (!load) return null;
  return (
    <Panel
      title="How much is in flight"
      description="Right now, across the company."
    >
      <div className="grid grid-cols-2 gap-4">
        <Figure label="Leave requests" value={load.leaveRequests} />
        <Figure label="Open tickets" value={load.ticketsOpen} />
        <Figure label="Approvals pending" value={load.approvalsPending} />
        <Figure
          label="Attendance corrections"
          value={load.attendanceCorrections}
        />
      </div>
    </Panel>
  );
};

/* -------------------------------------------------------------------- you */

const MyPay: WidgetComponent = ({ dashboard }) => {
  const pay = dashboard.me?.pay;
  /* No payslip: nobody has run a payroll that included them. Never ₦0.00,
     which would say the company paid them nothing. */
  if (!pay) return null;
  return (
    <TileLink
      href="/payroll/payslips"
      icon={<Wallet aria-hidden="true" className="size-3.5" />}
      label="Last payslip"
      value={formatKobo(pay.netKobo)}
      hint={`${monthLabel(pay.period)} · ${pay.paid ? "paid" : "approved, not yet paid"}`}
    />
  );
};

const MyLeave: WidgetComponent = ({ dashboard }) => {
  const leave = dashboard.me?.leave ?? [];
  /* No entitlement is a company that has not configured leave, not a person
     with no days left. */
  if (leave.length === 0) return null;
  return (
    <Link
      href="/people/leave"
      className="flex h-full min-w-0 flex-col gap-1 rounded-lg border border-line bg-surface p-4 hover:border-control-line hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
    >
      <span className="flex items-center gap-2 text-meta text-muted">
        <CalendarDays aria-hidden="true" className="size-3.5" />
        Leave left
      </span>
      {/* Every type, named. Picking one would be a guess about which is
          "your leave". */}
      <ul className="flex flex-col gap-0.5">
        {leave.map((row) => (
          <li
            key={row.leaveType}
            className="flex items-baseline justify-between gap-3 text-body-sm"
          >
            <span className="min-w-0 truncate text-body">{row.leaveType}</span>
            <span className="shrink-0 text-ink tabular">
              {row.remaining}
              <span className="text-faint"> of {row.entitled}</span>
            </span>
          </li>
        ))}
      </ul>
    </Link>
  );
};

const MyClock: WidgetComponent = () => <MyClockCard />;

/* ------------------------------------------------------------------ tools */

const Appraisals: WidgetComponent = () => <AppraisalsCard />;
const Assistant: WidgetComponent = () => <AskPanel />;
const Actions: WidgetComponent = () => <QuickActions />;
const Noticeboard: WidgetComponent = ({ dashboard }) => (
  <AnnouncementsPanel board={dashboard.announcements} />
);

/* -------------------------------------------------------------------------- */

/**
 * Catalogue id to component.
 *
 * A plain map rather than a `switch`, so a catalogue entry with no component —
 * or a component with no catalogue entry — is findable. `verify-dashboard`
 * asserts the two agree, because a widget in one and not the other renders
 * either nothing or a card nobody can remove.
 */
export const WIDGET_COMPONENTS: Readonly<Record<string, WidgetComponent>> = {
  "needs-you": NeedsYou,
  "my-queue": MyQueue,
  "stat-headcount": StatHeadcount,
  "stat-approvals": StatApprovals,
  "stat-records": StatRecords,
  "stat-attendance": StatAttendance,
  "who-is-in": WhoIsIn,
  "payroll-month": PayrollMonth,
  "money-owed": MoneyOwed,
  hiring: Hiring,
  "chart-headcount-trend": HeadcountTrend,
  "chart-joiners-leavers": JoinersLeavers,
  "stat-turnover": StatTurnover,
  "stat-tenure": StatTenure,
  "chart-headcount-by-department": HeadcountByDepartment,
  "chart-employment-types": EmploymentTypes,
  "chart-payroll-by-department": PayrollByDepartment,
  "chart-gross-breakdown": GrossBreakdown,
  "operational-load": OperationalLoad,
  "my-pay": MyPay,
  "my-leave": MyLeave,
  "my-clock": MyClock,
  appraisals: Appraisals,
  assistant: Assistant,
  "quick-actions": Actions,
  noticeboard: Noticeboard,
};

/* ------------------------------------------------------------------ pieces */

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

function TileLink({
  href,
  icon,
  label,
  value,
  hint,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="flex h-full min-w-0 flex-col gap-1 rounded-lg border border-line bg-surface p-4 hover:border-control-line hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
    >
      <span className="flex items-center gap-2 text-meta text-muted">
        {icon}
        {label}
      </span>
      <span className="text-h4 text-ink tabular">{value}</span>
      <span className="text-meta text-faint">{hint}</span>
    </Link>
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
      <p className={warn ? "text-h3 text-warning-text" : "text-h3 text-ink"}>
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
      <Money
        amount={naira(kobo)}
        decimals
        className="text-body-sm font-medium"
      />
    </Link>
  );
}

/**
 * `2026-08` as `Aug 2026`. Short, because it is an axis label as often as
 * prose. Always UTC: a `YYYY-MM` period has no time-of-day, so there is no
 * moment for the company's zone to relocate — the day/month/year that
 * `formatDate` gives is sliced down to month+year rather than reached for
 * with a fresh Intl call, so this stays covered by the guardrail too.
 */
function monthLabel(period: string): string {
  const [year, month] = period.split("-");
  if (!year || !month) return period;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  const [, longMonth, y] = formatDate(date, "UTC").split(" ");
  return `${longMonth.slice(0, 3)} ${y}`;
}
