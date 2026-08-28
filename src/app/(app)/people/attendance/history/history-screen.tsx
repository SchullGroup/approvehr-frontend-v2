"use client";

import { useMemo, useState } from "react";
import type { Point } from "@/components/ui";
import Link from "next/link";
import { CalendarOff, Lock, MapPin, Umbrella } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Badge,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  ColumnChart,
  EmptyState,
  Skeleton,
  Stat,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import type { ApiAttendanceDay, ApiRosterRow } from "@/lib/api/attendance";
import { addDays, timesLabel } from "@/lib/api/shifts";
import { useCan, useIsManager } from "@/lib/permissions";
import {
  STATUS_LABEL,
  STATUS_TONE,
  useAttendanceRoster,
  useRotaContext,
  type RosterState,
} from "@/lib/store/attendance";
import { useAttendanceMonth } from "@/lib/store/attendance-history";
import { useSession } from "@/lib/store/session";
import { TODAY, shortDate } from "@/lib/today";
import { DayHoliday } from "./day-holiday";
import { CalendarLegend, MonthCalendar } from "./month-calendar";

/**
 * Attendance history — a month, and the day you pick out of it.
 *
 * ## Why this is a route and not a third tab on `/people/attendance`
 *
 * That screen opens with a clock-in button, and it opens with one deliberately:
 * the person looking at it is nearly always looking for that control. A month
 * grid above a "Clock in" button asks somebody to hold two ideas at once — the
 * day they are living and a day in March — and the button would be wrong on the
 * second. The reader is different too: this is HR or a manager checking what
 * happened, not a member of staff recording that it is happening.
 *
 * A day also has to be linkable. "Look at the 3rd" is a thing one person sends
 * another, and a tab cannot carry it. `/payroll/payments/history` is the same
 * split for the same reason and is the precedent this follows.
 *
 * ## Two requests, never thirty-one
 *
 * `GET /attendance/summary?month=` for the grid, `GET /attendance/roster?date=`
 * for the table. Drawing the calendar from thirty-one rosters would be thirty-one
 * round trips and a rate limit, and the counts are what make the grid worth
 * having rather than a date picker.
 *
 * ## Nothing on this screen resolves a status
 *
 * Holiday, then rest day, then approved leave, then no clock-in, then late or
 * present. The server resolves that order in one place — `attendance/day-status.ts`
 * — which both endpoints call, so a cell reading "8 in · 2 out" and the table
 * beneath it cannot disagree. A second implementation in the browser is how a
 * timesheet and a payslip end up contradicting each other about one Tuesday, and
 * the person who finds out is the employee whose pay was docked.
 *
 * ## The claim this screen exists to get right
 *
 * "Nobody clocked in" and "we have no record for that day" are different
 * sentences and this screen says them differently. A day before the company
 * started recording attendance carries `absent: null` from the API, and a null is
 * rendered as an absence of information rather than as a wall of no-shows. That is
 * the calendar's version of the defect that prorated every employee of every
 * company without clock-in to ₦0 — see HANDOVER, "Everybody was paid ₦0".
 *
 * ## Who sees this screen
 *
 * Unlike `/people/attendance`, there is no personal reading of a who-came-in
 * calendar — a plain employee has no "my own history" version of a roster for
 * every day of the month, and `/attendance/summary` has no per-employee row to
 * fall back to at all.
 *
 * **This used to say `GET /attendance/roster` and `/attendance/summary` need
 * no permission on the API, so the gate belonged here and nowhere else.** That
 * was wrong: neither endpoint checked anything, so both answered for the whole
 * company on any valid token whether or not this screen was the one asking —
 * `useAttendanceMonth`/`useAttendanceRoster` fire before the `canSeeHistory`
 * check below ever runs, because hooks cannot be conditional. The API enforces
 * the same rule now (`attendance/router.ts#seesCompanyAttendance`); `/roster`
 * degrades to a caller's own row the way `attendance-screen.tsx` also relies
 * on, but `/summary` refuses outright, matching the refusal this screen already
 * renders below rather than a narrower reading nothing here uses. `nav.tsx`'s
 * `permission` on this item remains only a visibility hint — the enforcement
 * is no longer solely this component's to get right.
 *
 * `useIsManager()` (their own reports) or `EDIT_RECORDS` (the company's)
 * decides it, matching `attendance-screen.tsx`'s roster gate exactly, so a
 * manager who can already see today's roster there can see it here too.
 */
export function HistoryScreen() {
  const { isConnected } = useSession();
  /* Two separate hook calls, never short-circuited into one expression — see
     `attendance-screen.tsx`'s identical comment: a conditional `||` would skip
     `useCan` on whichever render `useIsManager` answers true first, and the
     two must run every render in the same order. */
  const isManager = useIsManager();
  const canEditRecords = useCan("EDIT_RECORDS");
  const canSeeHistory = isManager || canEditRecords;

  /* Demo mode runs on `TODAY`; the seed is a fixed snapshot and the real clock
     would open the calendar on a month it has nothing in. Same line as
     `people/leave/leave-screen.tsx`. The authoritative "today" for marking and
     for refusing a future day is `month.today`, which is the server's. */
  const today = isConnected ? new Date().toISOString().slice(0, 10) : TODAY;

  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));

  const summary = useAttendanceMonth(month);
  const roster = useAttendanceRoster(selected);

  const day = summary.days.find((row) => row.date === selected) ?? null;

  /**
   * Clock-ins per working day, and how many days nothing is known about.
   *
   * `present + late` is "turned up" — somebody late still came in, and putting
   * them outside the figure would make lateness read as absence. People on
   * approved leave are not counted as turnout and are not counted against it
   * either; they are simply not part of this question, which is what the
   * calendar underneath is for.
   *
   * A day is `null` when it was not tracked or has not happened yet. Both are
   * genuine absences of a figure rather than a figure of nought.
   */
  const turnout = useMemo(() => {
    const working = summary.days.filter((row) => row.kind === "WORKING");
    /* Mapped, then counted — not counted during the map. A `let` mutated inside
       a render callback is what the React compiler refuses, and rightly: the
       callback may run more than once and the tally would double. */
    const points: Point[] = working.map((row) => ({
      label: String(Number(row.date.slice(8, 10))),
      value: row.tracked && !row.future ? row.present + row.late : null,
    }));
    return {
      points,
      untracked: points.filter((point) => point.value === null).length,
    };
  }, [summary.days]);
  const awaiting = summary.days.some(
    (row) => row.holiday !== null && !row.holiday.confirmed,
  );

  /**
   * Moving month keeps the selection where it is.
   *
   * Snapping to the 1st of the new month would throw away the day somebody was
   * looking at every time they glanced at the month before it, and the table
   * below is the thing they came for. The grid still marks the selection when
   * they come back, because it is a date rather than an index.
   */
  const goToMonth = (next: string) => setMonth(next);

  /* Same gate as `attendance-screen.tsx`'s roster, and the same reason it
     lives here rather than only in `nav.tsx`: the nav item's `permission` is
     a visibility hint, not enforcement, and this screen has no personal
     reading to fall back to the way the attendance screen falls back to
     "just clock in" — so a refusal, not a narrower view, is the right shape. */
  if (!canSeeHistory) {
    return (
      <>
        <PageHeader
          title="Attendance history"
          breadcrumb={[
            { href: "/people/attendance", label: "Attendance" },
            { href: "/people/attendance/history", label: "History" },
          ]}
        />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Lock aria-hidden="true" />}
              title="Attendance history is not part of your access"
              description="This is the company's who-came-in calendar, not your own. Only a manager or somebody who can edit records can open it."
              action={
                <ButtonLink href="/people/attendance">
                  Go to attendance
                </ButtonLink>
              }
            />
          </Card>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Attendance history"
        breadcrumb={[
          { href: "/people/attendance", label: "Attendance" },
          { href: "/people/attendance/history", label: "History" },
        ]}
      />

      <PageBody className="flex flex-col gap-6">
        {summary.error && (
          <LoadFailure
            subject="this month's attendance"
            error={summary.error}
          />
        )}

        {/* ---- Turnout across the month ----------------------------------
            The calendar below is a good day-picker and a poor trend: "is
            turnout falling?" currently means reading twenty-two cells in
            sequence. This is the same month as a shape.

            Two rules, and the second is the one that matters here:

            - **Only working days are on the axis.** A rest day or a holiday
              with nobody in is not a turnout figure, and drawing it as a short
              column would put the weekend in the trend.
            - **An untracked day is a gap, not a zero.** `absent` is
              `number | null` precisely because "we were not recording" and
              "nobody came" are opposite facts — the type's own comment calls a
              zero here "the zero-pay bug wearing a calendar". A column at the
              floor would be that bug wearing a chart. */}
        {turnout.points.length > 1 && (
          <Card>
            <CardHeader
              title="Who turned up"
              description={
                turnout.untracked > 0
                  ? `${String(turnout.untracked)} working ${turnout.untracked === 1 ? "day is" : "days are"} blank — attendance was not being recorded, which is not the same as nobody coming in.`
                  : "Every working day this month."
              }
            />
            <CardBody>
              <ColumnChart
                height={140}
                points={turnout.points}
                format={(n) => String(n)}
                caption={`People who clocked in on each working day of ${summary.month}.`}
              />
            </CardBody>
          </Card>
        )}

        <Card>
          <MonthCalendar
            month={summary.month}
            days={summary.days}
            today={summary.today}
            selected={selected}
            loading={summary.loading}
            onMonth={goToMonth}
            onSelect={setSelected}
          />
          <CalendarLegend awaitingProclamation={awaiting} />
        </Card>

        {/* The holiday for the selected date, and the way to add one.
            ------------------------------------------------------------
            A Nigerian public holiday is often proclaimed days before it
            happens, and the moment somebody finds out is the moment they are
            looking at the month — here, at the date. Sending them to
            `/settings/leave` to type a date they were already pointing at is
            how one gets recorded late or not at all.

            Above the day's totals rather than below: whether the day was a
            holiday changes how every figure under it should be read. */}
        {day && !summary.loading && (
          <DayHoliday
            date={day.date}
            holiday={day.holiday}
            /* The server decides what the day now is — its `kind`, its
               `tracked`, its holiday. Patching it here would be this screen
               guessing at a precedence that lives in one function on the API. */
            onChanged={() => summary.reload()}
          />
        )}

        <DaySummary day={day} loading={summary.loading} />

        {roster.error ? (
          <LoadFailure subject="that day's roster" error={roster.error} />
        ) : (
          <DayTable
            roster={roster}
            day={day}
            source={summary.source}
            firstRecordedDate={summary.firstRecordedDate}
          />
        )}
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The selected day in four figures, from the month read rather than by counting
 * rows.
 *
 * Counting the table would be a second arithmetic over the same facts, and the
 * point of putting a headline above a table is that the two agree. The API
 * asserts that identity in `tests/attendance-summary.test.ts`; this just renders
 * whichever side of it arrived.
 */
function DaySummary({
  day,
  loading,
}: {
  day: ApiAttendanceDay | null;
  loading: boolean;
}) {
  if (loading || !day) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[104px] rounded-lg" />
        ))}
      </div>
    );
  }

  /* Nothing was expected, so there is nothing to total. */
  if (day.kind !== "WORKING") return null;

  /* Nothing was recorded, so there is nothing to total either — and "In 0 of 10"
     beside "Not accounted for —" is two claims that contradict each other. The
     card below says the one true thing instead. */
  if (day.absent === null) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat
        label="In"
        value={String(day.present + day.late)}
        hint={`of ${day.people} on the payroll that day`}
      />
      <Stat label="Late" value={String(day.late)} />
      <Stat label="On approved leave" value={String(day.onLeave)} />
      <Stat
        label="Not accounted for"
        value={String(day.absent)}
        hint={
          day.absent === 0
            ? "everybody accounted for"
            : "needs a leave request or a correction"
        }
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The day.
 *
 * Three shapes, because three different things are true, and they are tested in
 * the server's own precedence order — holiday and rest day first, because those
 * are facts about the calendar rather than about the clock-in records, and they
 * are true of a June Friday whether or not anybody was clocking in that month:
 *
 * 1. **A rest day or a public holiday.** Nobody was expected, so there is no
 *    absence to list. Anybody who clocked in anyway *is* worth showing: it is
 *    either unrecorded cancelled leave or somebody owed extra pay.
 * 2. **Nothing was recorded.** Say so, and say what it is not. The rows the API
 *    returned are all `ABSENT` and none of them means anything, so the only ones
 *    rendered are the people whose day is explained by a record that does exist —
 *    approved leave. Everything else would be a claim with nothing behind it.
 * 3. **An ordinary working day.** The roster, exceptions first, in the order the
 *    API returned it.
 */
function DayTable({
  roster,
  day,
  source,
  firstRecordedDate,
}: {
  roster: RosterState;
  day: ApiAttendanceDay | null;
  source: "api" | "demo";
  firstRecordedDate: string | null;
}) {
  /* A four-week window around the day, not the day itself. A rota row only
     exists for a day somebody is *on*, so a one-day window cannot tell "off
     today" from "not on a rota at all", and those two need opposite treatment.
     Four weeks covers any cycle in use here. */
  const rota = useRotaContext(
    addDays(roster.date, -13),
    addDays(roster.date, 14),
  );

  if (roster.loading || !day) {
    return (
      <Card>
        <CardBody className="flex flex-col gap-3">
          <span className="sr-only">Loading that day</span>
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </CardBody>
      </Card>
    );
  }

  const onLeave = roster.rows.filter((row) => row.status === "ON_LEAVE");
  const cameInAnyway = roster.rows.filter((row) => row.clockIn !== null);

  /* Nothing on file, and the difference between that and an empty office is the
     whole reason this screen was built.

     `kind === "WORKING"` is in the guard rather than the branch order below
     because a public holiday is a holiday whether or not anybody was clocking in
     that month — it is a fact about the calendar, not about the records. Reading
     the two in the other order would tell somebody there was "no attendance
     recorded" on Christmas Day. It is the server's own precedence, and the whole
     reason it lives in one function there. */
  if (day.kind === "WORKING" && !roster.tracked) {
    return (
      <Card>
        <CardHeader
          title={`${shortDate(roster.date)} — no attendance recorded`}
        />
        <CardBody className="flex flex-col gap-4">
          <Callout
            tone="neutral"
            title="This is not a day everybody was absent"
          >
            <span className="flex flex-col gap-1.5">
              <span>
                No attendance exists for this date, so there is nothing here
                that says anybody was missing. A day nobody came in and a day
                nothing was recorded look the same in the data and are not the
                same claim — reading the second as the first is what once
                prorated a whole company&apos;s pay to nothing.
              </span>
              {firstRecordedDate ? (
                <span>
                  The earliest day with a clock-in on it is{" "}
                  {shortDate(firstRecordedDate)}
                  {DEMO_ENABLED && source === "demo"
                    ? ", which is as far back as the demo dataset goes."
                    : ". Days before that predate clock-in being used here."}
                </span>
              ) : (
                <span>
                  Nobody has ever clocked in
                  {DEMO_ENABLED && source === "demo"
                    ? " in this browser"
                    : " here"}
                  , so every day reads this way. Payroll withholds nothing for
                  absence at a company that does not record attendance.
                </span>
              )}
            </span>
          </Callout>

          {/* Leave is a record of its own. It is true on this date whether or
              not anybody was clocking in, so it is the one thing worth listing. */}
          {onLeave.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-body-sm font-medium text-ink">
                Approved leave on this date
              </p>
              <ul className="flex flex-col gap-1.5">
                {onLeave.map((row) => (
                  <li
                    key={row.employeeId}
                    className="flex flex-wrap items-center gap-2 text-body-sm text-body"
                  >
                    <Umbrella
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-faint"
                    />
                    <Link
                      href={`/people/${row.employeeId}`}
                      className="font-medium text-ink hover:text-accent-text hover:underline underline-offset-4"
                    >
                      {row.employeeName}
                    </Link>
                    {row.leave && (
                      <span className="text-muted">
                        {row.leave.type}, to {shortDate(row.leave.endDate)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardBody>
      </Card>
    );
  }

  /* Nobody was expected in. Listing ten identical "Rest day" rows would bury the
     only interesting fact, which is anybody who turned up regardless. */
  if (day.kind !== "WORKING") {
    /* The holiday's name is a proper noun and stays cased as it was given —
       "12 Jun — democracy day" is a typo with a rule behind it. */
    const label =
      day.kind === "HOLIDAY"
        ? (day.holiday?.name ?? "public holiday")
        : "rest day";

    return (
      <Card>
        <CardHeader
          title={`${shortDate(roster.date)} — ${label}`}
          description={
            day.kind === "HOLIDAY"
              ? "Payroll withholds nothing."
              : "Outside the company's working week."
          }
        />
        {cameInAnyway.length === 0 ? (
          <EmptyState
            compact
            icon={<CalendarOff aria-hidden="true" />}
            title="Nobody clocked in"
            description={`${day.people} people were on the payroll and none of them was expected. There is nothing to account for.`}
          />
        ) : (
          <CardBody className="flex flex-col gap-3">
            <p className="text-body-sm text-body">
              {cameInAnyway.length === 1
                ? "One person"
                : `${cameInAnyway.length} people`}{" "}
              clocked in anyway. That is either leave nobody cancelled on the
              record or work somebody is owed extra for — one of them needs
              fixing and the other needs paying.
            </p>
            <ul className="flex flex-col gap-1.5">
              {cameInAnyway.map((row) => (
                <li
                  key={row.employeeId}
                  className="flex flex-wrap items-center gap-2 text-body-sm text-body"
                >
                  <Link
                    href={`/people/${row.employeeId}`}
                    className="font-medium text-ink hover:text-accent-text hover:underline underline-offset-4"
                  >
                    {row.employeeName}
                  </Link>
                  <span className="tabular text-muted">
                    in {row.clockIn}
                    {row.clockOut ? `, out ${row.clockOut}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            <ButtonLink
              href="/people/overtime"
              variant="secondary"
              size="sm"
              className="self-start"
            >
              Check overtime
            </ButtonLink>
          </CardBody>
        )}
      </Card>
    );
  }

  /* An ordinary working day. */
  const offThatDay = (row: ApiRosterRow) =>
    rota.onRota.has(row.employeeId) &&
    rota.shiftOn(row.employeeId, roster.date) === null;

  return (
    <Card>
      <CardHeader
        title={`Roster — ${shortDate(roster.date)}`}
        /* No reference to today's date here on purpose. `TODAY` is the demo's
           clock and the browser's is not the one these records were written
           against, so a sentence that branches on either would be wrong in one
           of the two modes. The count says everything it needs to. */
        description={
          roster.recorded === 0
            ? "Exceptions first. Anyone on approved leave is shown as on leave, never as a no-show."
            : `${roster.recorded} ${roster.recorded === 1 ? "clock-in" : "clock-ins"} on file. Exceptions first — anyone on approved leave is shown as on leave, never as a no-show.`
        }
      />
      <TableWrap className="rounded-none border-0">
        <THead>
          <TH>Employee</TH>
          <TH>Status</TH>
          <TH>In</TH>
          <TH>Out</TH>
          <TH>Where</TH>
        </THead>
        <TBody>
          {roster.rows.map((row) => {
            const shift = rota.shiftOn(row.employeeId, roster.date);
            const off = offThatDay(row);
            return (
              <TR key={row.employeeId}>
                <TDPrimary
                  title={
                    <Link
                      href={`/people/${row.employeeId}`}
                      className="hover:text-accent-text hover:underline underline-offset-4"
                    >
                      {row.employeeName}
                    </Link>
                  }
                  subtitle={row.jobTitle}
                />
                <TD>
                  <Badge tone={STATUS_TONE[row.status]} size="sm" dot>
                    {STATUS_LABEL[row.status]}
                  </Badge>
                  {row.lateByMinutes > 0 && (
                    <span className="mt-0.5 block text-meta text-warning-text">
                      {row.lateByMinutes} min late
                    </span>
                  )}
                  {row.leave && (
                    <span className="mt-0.5 block text-meta text-faint">
                      {row.leave.type}, to {shortDate(row.leave.endDate)}
                    </span>
                  )}
                  {row.anomaly && (
                    <span className="mt-0.5 block text-meta font-medium text-warning-text">
                      {row.anomaly}
                    </span>
                  )}
                  {/* A day off on a rota is a rest day whatever the office
                      calendar says, and payroll agrees — so saying it here is
                      what keeps this row and the payslip from contradicting
                      each other about the same date. */}
                  {shift ? (
                    <span className="mt-0.5 block text-meta text-faint">
                      On the rota: {shift.shiftName}, {timesLabel(shift)}
                    </span>
                  ) : off ? (
                    <span className="mt-0.5 block text-meta text-muted">
                      {row.clockIn
                        ? "Worked a rest day on their rota"
                        : "Rest day on their rota — no pay is held back"}
                    </span>
                  ) : null}
                  {row.correctionNote && (
                    <span className="mt-0.5 block text-meta text-faint">
                      Corrected: {row.correctionNote}
                    </span>
                  )}
                </TD>
                <TD className="tabular">{row.clockIn ?? "—"}</TD>
                <TD className="tabular text-muted">
                  {row.clockOut ?? (row.clockIn ? "no clock-out" : "—")}
                </TD>
                <TD className="text-muted">
                  {row.workLocation ? (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin
                        aria-hidden="true"
                        className="size-3.5 text-faint"
                      />
                      {row.workLocation}
                    </span>
                  ) : (
                    <span className={cn("text-faint")}>—</span>
                  )}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </TableWrap>
    </Card>
  );
}
