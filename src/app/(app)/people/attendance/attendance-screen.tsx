"use client";

import { useState } from "react";
import Link from "next/link";
import { Clock, LogIn, LogOut, MapPin, Timer, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Avatar,
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
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  geofenceRefusal,
  type ApiClockResult,
  type ApiRosterRow,
  type ApiWorkLocation,
} from "@/lib/api/attendance";
import { addDays, timesLabel } from "@/lib/api/shifts";
import { PositionError } from "@/lib/geolocation";
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
 */
export function AttendanceScreen() {
  const roster = useAttendanceRoster();
  const sheet = useAttendanceTimesheet(15);
  const locations = useWorkLocations();
  const { clockIn, clockOut } = useAttendanceMutations();
  const session = useSession();
  const toast = useToast();

  const [view, setView] = useState<View>("today");
  const [picked, setPicked] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<ApiRosterRow | null>(null);
  const [busy, setBusy] = useState(false);

  const policy = roster.policy;

  /* Attributing an action to a person needs an employee id, and the id in the
     session is an *account* id when connected. `employeeId` is the one that
     matches a roster row; `displayName` is the one to print. */
  const myRow = roster.rows.find((row) => row.employeeId === session.employeeId);

  /* Derived rather than stored, so the first location to arrive becomes the
     default without a setState in an effect. The ids differ between the two
     modes — uuids from the API, `loc-hq` from the seed — so nothing may
     hardcode one. */
  const locationId = picked ?? locations.locations[0]?.id ?? "";
  /* The row, not the id: `clockIn` needs to know whether this location's fence
     is enforced before it decides to ask the browser where the device is. */
  const selected = locations.locations.find((l) => l.id === locationId) ?? null;

  const nothingToClock =
    myRow?.status === "ON_LEAVE" ||
    myRow?.status === "HOLIDAY" ||
    myRow?.status === "REST_DAY";

  const refresh = () => {
    roster.reload();
    sheet.reload();
  };

  /**
   * Both clock actions, and every way they can be turned down.
   *
   * Three sources of refusal reach here and they are not interchangeable:
   *
   * 1. **The browser** — a `PositionError`, when the device would not say where
   *    it is. Permission denied, position unavailable and timeout are three
   *    different problems with three different next steps, and it carries which
   *    one along with the wording for it. No request was made, so there is no
   *    API message to fall back on.
   * 2. **The geofence** — a 422 carrying the distance, the location and the
   *    radius. `summary` is the API's own one-line phrasing of the fact — "You
   *    are 340m from Lagos HQ" — and it is the heading, with the full message
   *    and its way forward underneath. This screen formats no distances: doing
   *    so would be a second distance formatter drifting from the API's.
   * 3. **Everything else** — an ordinary `ApiError`, whose message already names
   *    the time and the fix ("Already clocked in at 08:12…").
   *
   * "Clock-in failed" is the one thing none of them is allowed to become.
   */
  const run = async (
    action: () => Promise<ApiClockResult>,
    title: (time: string) => string,
    detail: (result: ApiClockResult) => string,
  ) => {
    setBusy(true);
    try {
      const result = await action();
      toast.push({
        title: title(result.time),
        tone: "success",
        detail: detail(result),
      });
      refresh();
    } catch (error) {
      const position = error instanceof PositionError ? error : null;
      const fence = geofenceRefusal(error);
      toast.push({
        title: position?.title ?? fence?.summary ?? "That did not go through",
        tone: "danger",
        detail:
          position?.message ??
          (error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again."),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Attendance"
        description={
          policy
            ? `Work day ${policy.shiftStart}–${policy.shiftEnd}, ${policy.graceMinutes} minutes' grace. Showing ${shortDate(roster.date)}.`
            : "Who is in, who is late, and who is on approved leave."
        }
        action={
          <SegmentedControl
            label="View"
            value={view}
            onChange={setView}
            options={[
              { value: "today", label: "Today" },
              { value: "timesheet", label: "Timesheet" },
            ]}
          />
        }
      />

      <PageBody className="flex flex-col gap-6">
        {roster.error && (
          <LoadFailure subject="today's roster" error={roster.error} />
        )}

        {/* Own clock-in. Deliberately the first thing on the page: the person
            looking at this screen most often is looking for this control. */}
        <Card>
          <CardBody className="flex flex-wrap items-center gap-4">
            <Avatar name={session.displayName ?? myRow?.employeeName ?? "You"} size="md" />
            <div className="min-w-0 flex-1">
              <p className="text-body font-semibold text-ink">
                {session.displayName ?? myRow?.employeeName ?? "Your day"}
              </p>
              <p className="mt-0.5 text-body-sm text-muted">
                {myRow?.clockIn
                  ? myRow.clockOut
                    ? `In at ${myRow.clockIn}, out at ${myRow.clockOut}.`
                    : `In at ${myRow.clockIn}. Still clocked in.`
                  : nothingToClock && myRow
                    ? `${STATUS_LABEL[myRow.status]} today — nothing to clock.`
                    : "You have not clocked in today."}
              </p>
            </div>

            {policy && !policy.selfServiceClockIn ? (
              <p className="text-body-sm text-muted">
                Your HR team records attendance for everybody.
              </p>
            ) : (
              !nothingToClock && (
                <div className="flex flex-wrap items-end gap-2">
                  {!myRow?.clockIn && locations.locations.length > 0 && (
                    <Field
                      label="Where"
                      /* Said before the click, not after it. Somebody about to
                         see a browser permission prompt should know why it is
                         coming — an unexplained prompt is the one people
                         dismiss, and a dismissal is remembered for the origin.
                         Nothing is said for a location with no enforced fence,
                         because nothing will be asked.

                         Demo mode gets the other half of the truth, not this
                         one. It asks for no position and judges no fence, so
                         promising a prompt here would be a promise this mode
                         does not keep — the same gap `store/work-locations.ts`
                         states on the settings screen. */
                      help={
                        !selected?.geofenceEnforced
                          ? undefined
                          : session.isConnected || !DEMO_ENABLED
                            ? `${selected.name} accepts clock-ins on site only, so your browser will ask for your location.`
                            : `${selected.name} has a geofence, and demo mode does not apply it — nothing here asks where you are.`
                      }
                    >
                      <Select
                        value={locationId}
                        onChange={(e) => {
                          const next = e.target.value;
                          setPicked(next);
                        }}
                      >
                        {locations.locations.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                  {!myRow?.clockIn ? (
                    <Button
                      variant="approve"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => clockIn(selected),
                          (time) => `Clocked in at ${time}`,
                          /* The API's resolved name when connected — it may
                             have fallen back to the location on the employee's
                             own record — and the picked one otherwise. */
                          (result) =>
                            `${result.workLocation?.name ?? selected?.name ?? "Recorded"}. Have a good day.`,
                        )
                      }
                    >
                      <LogIn aria-hidden="true" className="size-4" />
                      Clock in
                    </Button>
                  ) : !myRow.clockOut ? (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => clockOut(),
                          (time) => `Clocked out at ${time}`,
                          () => "Your hours for today are on the timesheet.",
                        )
                      }
                    >
                      <LogOut aria-hidden="true" className="size-4" />
                      Clock out
                    </Button>
                  ) : (
                    <Badge tone="success" size="sm" dot>
                      Day complete
                    </Badge>
                  )}
                </div>
              )
            )}
          </CardBody>
        </Card>

        {view === "today" ? (
          roster.date ? (
            <TodayView roster={roster} onCorrect={setCorrecting} />
          ) : (
            <LoadingPanel label="Loading today's roster" />
          )
        ) : sheet.error ? (
          <LoadFailure subject="the timesheet" error={sheet.error} />
        ) : sheet.from ? (
          <TimesheetView sheet={sheet} />
        ) : (
          <LoadingPanel label="Loading the timesheet" />
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
 * Today.
 *
 * Mounted only once the roster has a date, so the rota it reads covers the day
 * actually on screen rather than a guess made while the first request was still
 * in flight.
 */
function TodayView({
  roster,
  onCorrect,
}: {
  roster: RosterState;
  onCorrect: (row: ApiRosterRow) => void;
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
              ? { direction: "down", label: `after ${roster.policy.shiftStart}` }
              : undefined
          }
        />
        <Stat label="On approved leave" value={String(count("ON_LEAVE"))} />
        <Stat
          label="Not clocked in"
          value={String(unexplained)}
          hint={
            restDays > 0
              ? `${restDays} more off on the rota`
              : "nothing booked, nothing recorded"
          }
        />
      </div>

      <Card>
        <CardHeader
          title={`Roster — ${shortDate(roster.date)}`}
          description="Exceptions first. Anyone on approved leave is shown as on leave, never as a no-show."
        />
        <TableWrap className="rounded-none border-0">
          <THead>
            <TH>Employee</TH>
            <TH>Status</TH>
            <TH>In</TH>
            <TH>Out</TH>
            <TH>Where</TH>
            <TH align="right">Fix</TH>
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
                        {row.lateByMinutes} min late
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
                  <TD className="text-muted">
                    {row.workLocation ? (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin aria-hidden="true" className="size-3.5 text-faint" />
                        {row.workLocation}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD align="right">
                    <div className="flex justify-end gap-1.5">
                      {row.status === "ABSENT" && !off && (
                        <ButtonLink href="/people/leave" variant="ghost" size="sm">
                          Approve leave
                        </ButtonLink>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onCorrect(row)}
                      >
                        Fix record
                      </Button>
                    </div>
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
                          <TriangleAlert aria-hidden="true" className="size-3.5" />
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
          <Button variant="accent" disabled={saving} onClick={() => void save()}>
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
          help="Payroll pays against this record, so a change cannot be silent."
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
