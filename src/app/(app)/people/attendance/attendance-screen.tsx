"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Clock,
  MoreHorizontal,
  Timer,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Modal,
  Select,
  SegmentedControl,
  Skeleton,
  Stat,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  formatMoney,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { BulkInviteButton } from "@/components/portal/bulk-invite";
import { MyClockCard } from "@/components/portal/my-clock-card";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  type ApiRosterRow,
  type ApiWorkLocation,
} from "@/lib/api/attendance";
import { addDays, hoursLabel, timesLabel } from "@/lib/api/shifts";
import { useCan, useIsManager } from "@/lib/permissions";
import {
  STATUS_LABEL,
  STATUS_TONE,
  useAttendanceMutations,
  useAttendanceRoster,
  useAttendanceTimesheet,
  useRotaContext,
  useWorkLocations,
  type RosterState,
  type TimesheetState,
} from "@/lib/store/attendance";
import { useSession } from "@/lib/store/session";
import { shortDate } from "@/lib/today";

type View = "today" | "timesheet";

/**
 * Attendance.
 *
 * ## Three figures this screen must not invent
 *
 * 1. **The status.** Holiday, then rest day, then approved leave, then no
 *    clock-in, then late or present. The server resolves it in that order and
 *    this screen renders the answer. It does not recompute one, because a second
 *    implementation is how the timesheet and the payslip end up disagreeing
 *    about the same Tuesday.
 * 2. **The proration.** Days times the company's own `workingDaysPerMonth`,
 *    computed where payroll computes it and converted to naira once, at the
 *    `lib/api` boundary.
 * 3. **Overtime.** Derived from clock-out times by `/api/v1/overtime`, with a
 *    grace period, a daily cap and a rate per kind of day. The `Hours` column
 *    here is clocked time and nothing else — there is a link to the surface that
 *    owns overtime rather than a number worked out on this page.
 *
 * ## And one it has to add
 *
 * The attendance endpoints measure everybody against the office week. Payroll
 * measures anyone with rostered days against **their rota**. So each view reads
 * `/shifts/rota` for its own window and labels the rows, because a shift worker
 * shown as absent on their day off is the fastest way to lose their trust — and
 * a naira figure that the run will not use is worse than no figure at all.
 *
 * ## Who sees the roster
 *
 * **This used to say the API answers `/attendance/roster` and
 * `/attendance/timesheet` for anybody, deliberately, and that the gate
 * belonged only here because a nav item is a visibility hint and not
 * enforcement.** That was wrong about the API half: nothing there checked
 * anything, so both endpoints answered the whole company for any valid
 * token regardless of what this screen painted — recoverable from the
 * network tab with no more access than a plain employee already has. The
 * API now enforces the same rule this screen renders
 * (`attendance/router.ts#attendanceScope`), and what is left here is real UI
 * policy rather than the only door: which reading a plain employee gets
 * shown, not whether the wider one leaks to them first.
 *
 * `useIsManager()` (their own reports) or `EDIT_RECORDS` (the company's) decides
 * it. Clocking in is unconditional — it is the one thing every employee does on
 * this screen — and everything below it, the company roster and the 15-day
 * timesheet alike, renders only for those two. Someone without either sees their
 * own recent attendance instead of everyone's, which is now the same row the API
 * itself scopes them to.
 */
export function AttendanceScreen() {
  const roster = useAttendanceRoster();
  const sheet = useAttendanceTimesheet(15);
  const locations = useWorkLocations();
  const session = useSession();
  /* Two separate hook calls, never short-circuited into one expression — a
     conditional `||` would skip `useCan` on whichever render `useIsManager`
     answers true first, and the two must run every render in the same order. */
  const isManager = useIsManager();
  const canEditRecords = useCan("EDIT_RECORDS");
  const canInvite = useCan("INVITE_STAFF");
  const canSeeRoster = isManager || canEditRecords;

  const [view, setView] = useState<View>("today");
  const [correcting, setCorrecting] = useState<ApiRosterRow | null>(null);


  const refresh = () => {
    roster.reload();
    sheet.reload();
  };

  return (
    <>
      <PageHeader
        title="Attendance"
        action={
          canInvite || canSeeRoster ? (
            <div className="flex flex-wrap items-center gap-2">
              {/* The same component the Directory mounts. This screen kept its
                  own eighty lines of orchestration around the same dialog, and
                  two copies drift until one stops defaulting to the right role
                  or stops filtering out people who already have an account. */}
              <BulkInviteButton label="Set up staff logins" />
              {/* The view toggle chooses between two company-wide reads, so
                  it has no reason to exist for somebody who cannot see
                  either of them. */}
              {canSeeRoster && (
                <SegmentedControl
                  label="View"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: "today", label: "Today" },
                    { value: "timesheet", label: "Timesheet" },
                  ]}
                />
              )}
            </div>
          ) : undefined
        }
      />

      <PageBody className="flex flex-col gap-6">
        {roster.error && (
          <LoadFailure subject="today's roster" error={roster.error} />
        )}

        {/* Own clock-in. Deliberately the first thing on the page: the person
            looking at this screen most often is looking for this control.
            Shared with `/dashboard` — see `components/portal/my-clock-card.tsx`
            for why this used to be inline here and no longer is. */}
        <MyClockCard onRecorded={refresh} />

        {/* Everybody clocks in above. Everybody else's day is a different
            question, and only a manager or `EDIT_RECORDS` gets to ask it —
            see "Who sees the roster" on this component. A plain employee
            gets their own recent attendance instead of the company's. */}
        {canSeeRoster ? (
          view === "today" ? (
            roster.date ? (
              <TodayView
                roster={roster}
                onCorrect={setCorrecting}
                canCorrect={canEditRecords}
              />
            ) : (
              <LoadingPanel label="Loading today's roster" />
            )
          ) : sheet.error ? (
            <LoadFailure subject="the timesheet" error={sheet.error} />
          ) : sheet.from ? (
            <TimesheetView sheet={sheet} />
          ) : (
            <LoadingPanel label="Loading the timesheet" />
          )
        ) : (
          <MyAttendanceSummary sheet={sheet} employeeId={session.employeeId} />
        )}
      </PageBody>

      {/* Keyed so opening a different employee remounts with fresh state,
          rather than deriving state from props during render. */}
      {correcting && (
        <CorrectionDialog
          key={correcting.employeeId}
          row={correcting}
          date={roster.date}
          locations={locations.locations}
          onClose={() => setCorrecting(null)}
          onSaved={refresh}
        />
      )}

    </>
  );
}

/* -------------------------------------------------------------------------- */

function LoadingPanel({ label }: { label: string }) {
  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <span className="sr-only">{label}</span>
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </CardBody>
    </Card>
  );
}

/**
 * What a plain employee gets instead of the roster: their own days, not
 * everybody's.
 *
 * Reads the same 15-day timesheet the manager's view already fetched — no
 * second request, and no new endpoint — and picks out the one row that is
 * theirs. `employeeId` can be null for an account with no staff record behind
 * it, and a row can be absent even with one (nobody has clocked in for them
 * yet in the window); both render the same quiet "nothing recorded" rather
 * than a wall of zeroes standing in for data that was never fetched.
 */
function MyAttendanceSummary({
  sheet,
  employeeId,
}: {
  sheet: TimesheetState;
  employeeId: string | null;
}) {
  if (sheet.error) {
    return <LoadFailure subject="your attendance" error={sheet.error} />;
  }
  if (!sheet.from) {
    return <LoadingPanel label="Loading your attendance" />;
  }

  const mine = employeeId
    ? sheet.rows.find((row) => row.employeeId === employeeId)
    : undefined;

  return (
    <Card>
      <CardHeader
        title={`Your attendance — ${shortDate(sheet.from)} to ${shortDate(sheet.to)}`}
        action={
          <ButtonLink href="/people/overtime" variant="secondary" size="sm">
            <Timer aria-hidden="true" className="size-4" />
            Overtime
          </ButtonLink>
        }
      />
      <CardBody>
        {mine ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Present" value={String(mine.daysPresent)} />
            <Stat
              label="Late"
              value={String(mine.daysLate)}
              icon={<Clock aria-hidden="true" />}
            />
            <Stat label="On leave" value={String(mine.daysOnLeave)} />
            <Stat
              label="Unexplained"
              value={String(mine.daysUnexplained)}
              hint={`of ${mine.workingDays} working days`}
            />
          </div>
        ) : (
          <p className="text-body-sm text-muted">
            Nothing recorded for you in this window yet.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * Today.
 *
 * Mounted only once the roster has a date, so the rota it reads covers the day
 * actually on screen rather than a guess made while the first request was still
 * in flight.
 */
function TodayView({
  roster,
  onCorrect,
  canCorrect,
}: {
  roster: RosterState;
  onCorrect: (row: ApiRosterRow) => void;
  /**
   * Separate from `canSeeRoster` on purpose. That gate is `isManager ||
   * EDIT_RECORDS` — whether this screen is worth opening at all — and a
   * manager with reports but no `EDIT_RECORDS` passes it and still cannot
   * correct a record: the backend route is `EDIT_RECORDS` alone. Reusing the
   * broader gate here let such a manager open the dialog, type a correction,
   * and only discover the 403 after clicking Save.
   */
  canCorrect: boolean;
}) {
  /* A four-week window around the day, not the day itself.
     A rota row only exists for a day somebody is *on*, so a one-day window
     cannot tell "off today" from "not on a rota at all" — and those two need
     opposite treatment: one is a rest day, the other is an absence. Four weeks
     covers any cycle in use here (four-on-four-off is eight days, early/late
     rotating is fourteen). */
  const rota = useRotaContext(
    addDays(roster.date, -13),
    addDays(roster.date, 14),
  );

  /** Their rota says they are off. Not an absence, and payroll agrees. */
  const offToday = (row: ApiRosterRow) =>
    rota.onRota.has(row.employeeId) &&
    rota.shiftOn(row.employeeId, roster.date) === null;

  const count = (status: ApiRosterRow["status"]) =>
    roster.rows.filter((row) => row.status === status).length;

  /* The server's ABSENT rows, split by a fact the attendance endpoints do not
     have: whether the person was rostered at all. Nobody's *status* changes
     here — the badge still says what the server said. This only stops the
     headline alarming about a security guard on his four days off, which is the
     same split `unpaidDaysFor` makes before it charges anybody a day's pay. */
  const absent = roster.rows.filter((row) => row.status === "ABSENT");
  const unexplained = absent.filter((row) => !offToday(row)).length;
  const restDays = absent.length - unexplained;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="In today"
          value={String(count("PRESENT") + count("LATE"))}
          hint={`of ${roster.rows.length} on the roster`}
        />
        <Stat
          label="Late"
          value={String(count("LATE"))}
          icon={<Clock aria-hidden="true" />}
          trend={
            count("LATE") > 0 && roster.policy
              ? {
                  direction: "down",
                  label: `after ${roster.policy.shiftStart}`,
                }
              : undefined
          }
        />
        <Stat label="On approved leave" value={String(count("ON_LEAVE"))} />
        <Stat
          label="Not clocked in"
          value={String(unexplained)}
          {...(restDays > 0
            ? { hint: `${restDays} more off on the rota` }
            : {})}
        />
      </div>

      <Card>
        <CardHeader title={`Roster — ${shortDate(roster.date)}`} />
        <TableWrap className="rounded-none border-0">
          <THead>
            <TH>Employee</TH>
            <TH>Status</TH>
            <TH>In</TH>
            <TH>Out</TH>
            <TH align="right">Actions</TH>
          </THead>
          <TBody>
            {roster.rows.map((row) => {
              const shift = rota.shiftOn(row.employeeId, roster.date);
              const off = offToday(row);
              return (
                <TR key={row.employeeId} interactive>
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
                        {row.lateByMinutes > 60
                          ? hoursLabel(row.lateByMinutes)
                          : `${row.lateByMinutes} min`}{" "}
                        late
                      </span>
                    )}
                    {row.leave && (
                      <span className="mt-0.5 block text-meta text-faint">
                        {row.leave.type}, to {row.leave.endDate}
                      </span>
                    )}
                    {row.anomaly && (
                      <span className="mt-0.5 block text-meta font-medium text-warning-text">
                        {row.anomaly}
                      </span>
                    )}
                    {/* The rota, where there is one. A day off on a rota is a
                        rest day whatever the office calendar says, so saying so
                        here is what keeps this row and the payslip agreeing —
                        and a rest day somebody worked anyway is money owed, on
                        a surface this screen does not own. */}
                    {shift ? (
                      <span className="mt-0.5 block text-meta text-faint">
                        On the rota: {shift.shiftName}, {timesLabel(shift)}
                      </span>
                    ) : off ? (
                      row.clockIn ? (
                        <span className="mt-0.5 block text-meta text-muted">
                          Worked a rest day on their rota —{" "}
                          <Link
                            href="/people/overtime"
                            className="font-medium text-accent-text underline underline-offset-4"
                          >
                            check overtime
                          </Link>
                        </span>
                      ) : (
                        <span className="mt-0.5 block text-meta text-muted">
                          Rest day on their rota — no pay is held back
                        </span>
                      )
                    ) : null}
                    {row.correctionNote && (
                      <span className="mt-0.5 block text-meta text-faint">
                        Corrected: {row.correctionNote}
                      </span>
                    )}
                  </TD>
                  <TD className="tabular">{row.clockIn ?? "—"}</TD>
                  <TD className="tabular text-muted">
                    {row.clockOut ?? (row.clockIn ? "still in" : "—")}
                  </TD>
                  <TD align="right">
                    <RowActions
                      row={row}
                      off={off}
                      canCorrect={canCorrect}
                      onCorrect={onCorrect}
                    />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </TableWrap>
      </Card>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One row's actions, behind a menu rather than two standing buttons.
 *
 * A row rarely has both — "Approve leave" only applies to somebody absent and
 * not on a day off, "Edit clock-in" only to whoever can correct a record — so
 * two always-visible ghost buttons per row spent most of their width on
 * nothing. Renders nothing at all when neither applies, same principle as a
 * dead control being worse than none.
 */
function RowActions({
  row,
  off,
  canCorrect,
  onCorrect,
}: {
  row: ApiRosterRow;
  off: boolean;
  canCorrect: boolean;
  onCorrect: (row: ApiRosterRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const canApproveLeave = row.status === "ABSENT" && !off;

  if (!canApproveLeave && !canCorrect) return null;

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Actions for ${row.employeeName}`}
        className="rounded-md p-1.5 hover:bg-canvas"
      >
        <MoreHorizontal aria-hidden="true" className="size-4 text-muted" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="menu"
            className="animate-scale-in absolute right-0 z-50 mt-1.5 w-48 rounded-lg border border-line bg-surface p-1.5 shadow-lg"
          >
            {canApproveLeave && (
              <Link
                href="/people/leave"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block rounded-md px-2.5 py-2 text-body-sm text-body hover:bg-canvas hover:text-ink"
              >
                Approve leave
              </Link>
            )}
            {canCorrect && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onCorrect(row);
                }}
                className="block w-full rounded-md px-2.5 py-2 text-left text-body-sm text-body hover:bg-canvas hover:text-ink"
              >
                Edit clock-in
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The timesheet.
 *
 * Two things here are somebody else's to compute and this view links to them
 * rather than reproducing them: **overtime**, which `/people/overtime` derives
 * from clock-outs, and **a shift worker's unpaid days**, which payroll counts
 * against their rota. For anyone on a rota the office-week figures are not the
 * ones a run would use, so the cell says where the real answer lives instead of
 * printing a naira amount nobody can reconcile.
 */
function TimesheetView({ sheet }: { sheet: TimesheetState }) {
  const rota = useRotaContext(sheet.from, sheet.to);

  return (
    <Card>
      <CardHeader
        title={`Timesheet — ${shortDate(sheet.from)} to ${shortDate(sheet.to)}`}
        description={`${sheet.workingDays} working days, public holidays excluded. Hours are clocked time; anyone on a rota is measured against their rota.`}
        action={
          <ButtonLink href="/people/overtime" variant="secondary" size="sm">
            <Timer aria-hidden="true" className="size-4" />
            Overtime
          </ButtonLink>
        }
      />
      <TableWrap className="rounded-none border-0">
        <THead>
          <TH>Employee</TH>
          <TH align="right">Present</TH>
          <TH align="right">Late</TH>
          <TH align="right">On leave</TH>
          <TH align="right">Unexplained</TH>
          <TH align="right">Hours</TH>
          <TH align="right">Payroll effect</TH>
        </THead>
        <TBody>
          {[...sheet.rows]
            .sort((a, b) => b.daysUnexplained - a.daysUnexplained)
            .map((row) => {
              const onRota = rota.onRota.has(row.employeeId);
              const rostered = rota.rosteredDays.get(row.employeeId) ?? 0;
              return (
                <TR key={row.employeeId} interactive>
                  <TDPrimary
                    title={
                      <Link
                        href={`/people/${row.employeeId}`}
                        className="hover:text-accent-text hover:underline underline-offset-4"
                      >
                        {row.employeeName}
                      </Link>
                    }
                    subtitle={
                      onRota
                        ? `${rostered} rostered days in this window`
                        : `${row.daysPresent} of ${row.workingDays} working days`
                    }
                  />
                  <TD align="right" className="tabular font-medium text-ink">
                    {row.daysPresent}
                  </TD>
                  <TD
                    align="right"
                    className={cn(
                      "tabular",
                      row.daysLate > 2 ? "text-warning-text" : "text-muted",
                    )}
                  >
                    {row.daysLate || "—"}
                  </TD>
                  <TD align="right" className="tabular text-muted">
                    {row.daysOnLeave || "—"}
                  </TD>
                  <TD
                    align="right"
                    className={cn(
                      "tabular",
                      onRota
                        ? "text-muted"
                        : row.daysUnexplained > 0
                          ? "font-medium text-danger-text"
                          : "text-muted",
                    )}
                  >
                    {/* An office-week count means nothing for somebody on a
                        rota, so it is not shown as though it did. */}
                    {onRota ? "—" : row.daysUnexplained || "—"}
                  </TD>
                  <TD align="right" className="tabular text-muted">
                    {row.hours || "—"}
                  </TD>
                  <TD align="right" className="tabular">
                    {rota.loading ? (
                      <Skeleton className="ml-auto h-4 w-20" />
                    ) : onRota ? (
                      <Link
                        href="/people/shifts"
                        className="text-body-sm font-medium text-accent-text underline underline-offset-4"
                      >
                        From their rota
                      </Link>
                    ) : (row.proration.amount ?? 0) > 0 ? (
                      <span className="inline-flex flex-col items-end">
                        <span className="inline-flex items-center gap-1.5 font-medium text-danger-text">
                          <TriangleAlert
                            aria-hidden="true"
                            className="size-3.5"
                          />
                          {`−${formatMoney(row.proration.amount ?? 0, "NGN", {
                            decimals: true,
                          })}`}
                        </span>
                        <span className="text-meta text-muted">
                          {row.proration.unpaidDays} of{" "}
                          {row.proration.workingDaysPerMonth} days
                        </span>
                      </span>
                    ) : (
                      <span className="text-faint">Full pay</span>
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

/* -------------------------------------------------------------------------- */

/**
 * An HR correction.
 *
 * The note is required rather than optional. Payroll pays against this number,
 * so a change without a stated reason is exactly the kind of thing an auditor
 * asks about and nobody can answer.
 *
 * The location select starts on "leave it as it is" rather than on a default,
 * because a roster row carries a location *name* and not its id — so preselecting
 * anything would quietly move somebody's site the next time HR fixed a time.
 * Omitting the field leaves the stored value alone.
 */
function CorrectionDialog({
  row,
  date,
  locations,
  onClose,
  onSaved,
}: {
  row: ApiRosterRow;
  date: string;
  locations: ApiWorkLocation[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { correct } = useAttendanceMutations();
  const toast = useToast();

  const [clockIn, setClockIn] = useState(row.clockIn ?? "");
  const [clockOut, setClockOut] = useState(row.clockOut ?? "");
  const [locationId, setLocationId] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    setTouched(true);
    if (!note.trim()) return;
    setSaving(true);
    try {
      await correct(
        row.employeeId,
        date,
        {
          clockIn: clockIn || null,
          clockOut: clockOut || null,
          ...(locationId ? { locationId } : {}),
        },
        note,
      );
      toast.push({
        title: `${row.employeeName}'s record corrected`,
        tone: "success",
        detail: "The change and your reason are both on the record.",
      });
      onSaved();
      onClose();
    } catch (error) {
      toast.push({
        title: "The correction was refused",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Correct ${row.employeeName}'s day`}
      description={`${shortDate(date)}. The reason is kept with the change.`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={saving}
            onClick={() => void save()}
          >
            Save correction
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Clocked in" help="Leave empty to record an absence.">
            <Input
              type="time"
              value={clockIn}
              onChange={(e) => {
                const v = e.target.value;
                setClockIn(v);
              }}
            />
          </Field>
          <Field label="Clocked out">
            <Input
              type="time"
              value={clockOut}
              onChange={(e) => {
                const v = e.target.value;
                setClockOut(v);
              }}
            />
          </Field>
        </div>

        <Field label="Where">
          <Select
            value={locationId}
            onChange={(e) => {
              const v = e.target.value;
              setLocationId(v);
            }}
          >
            <option value="">
              {row.workLocation
                ? `Leave as ${row.workLocation}`
                : "Leave as it is"}
            </option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
                {location.addressLine ? ` — ${location.addressLine}` : ""}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Reason for the change"
          required
          error={touched && !note.trim() ? "A reason is required." : undefined}
          help="Payroll pays against this record."
        >
          <Input
            value={note}
            placeholder="Forgot to clock out; confirmed with their manager"
            onChange={(e) => {
              const v = e.target.value;
              setNote(v);
            }}
          />
        </Field>
      </div>
    </Modal>
  );
}
