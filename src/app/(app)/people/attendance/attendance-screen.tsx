"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Clock,
  LogIn,
  LogOut,
  MapPin,
  PencilLine,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Modal,
  Money,
  SegmentedControl,
  Select,
  Stat,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  useToast,
  type BadgeTone,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { CURRENT_USER } from "@/lib/mock/people";
import { useSession } from "@/lib/store/session";
import {
  WORK_LOCATIONS,
  type AttendanceStatus,
} from "@/lib/mock/attendance";
import { useAttendanceStore, nowTime } from "@/lib/store/attendance";
import { useEmployeeStore } from "@/lib/store/employees";
import { useLeaveStore } from "@/lib/store/leave";
import { usePayrollSettings } from "@/lib/payroll/use-settings";
import {
  STATUS_LABEL,
  prorationFor,
  rosterFor,
  timesheet,
} from "@/lib/workflows/attendance";
import { fullName } from "@/lib/types";
import { TODAY, shortDate } from "@/lib/today";

const TONE: Record<AttendanceStatus, BadgeTone> = {
  present: "success",
  late: "warning",
  absent: "danger",
  on_leave: "info",
  holiday: "accent",
  rest_day: "neutral",
};

type View = "today" | "timesheet";

/**
 * Attendance.
 *
 * The screen the marketing site has been promising under Time & Leave. Three
 * things make it more than a list of times:
 *
 * 1. **It reads the leave store.** Someone with approved leave shows as "on
 *    leave", never as a no-show. Getting this wrong is how an attendance system
 *    loses its users, and it is only avoidable because both read one store.
 * 2. **It reads payroll settings.** The proration column divides by the same
 *    `workingDaysPerMonth` the payroll engine uses, so the cost of an absence
 *    shown here is the cost payroll will actually withhold.
 * 3. **Corrections require a note.** A timesheet that money is paid against
 *    should never change silently.
 */
export function AttendanceScreen() {
  const { directory } = useEmployeeStore();
  const leave = useLeaveStore();
  const attendance = useAttendanceStore();
  const { settings } = usePayrollSettings();
  const session = useSession();
  const toast = useToast();

  /* Clocking in is a personal act, so it has to be the signed-in person doing
     it. `session.employee` is the employee record; `session.user` is the
     *account*, whose id is a User id and would silently look up nothing. */
  const me = session.employee ?? CURRENT_USER;

  const [view, setView] = useState<View>("today");
  const [locationId, setLocationId] = useState("loc-hq");
  const [correcting, setCorrecting] = useState<string | null>(null);

  const policy = attendance.policy;

  const roster = useMemo(
    () =>
      rosterFor({
        date: TODAY,
        employees: directory,
        entries: attendance.entries,
        leaveRequests: leave.requests,
        policy,
      }),
    [directory, attendance.entries, leave.requests, policy],
  );

  const sheet = useMemo(
    () =>
      timesheet({
        employees: directory,
        entries: attendance.entries,
        leaveRequests: leave.requests,
        policy,
      }),
    [directory, attendance.entries, leave.requests, policy],
  );

  const counts = roster.reduce<Record<AttendanceStatus, number>>(
    (acc, row) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }),
    {} as Record<AttendanceStatus, number>,
  );

  /* The signed-in user's own day, for the clock-in control. */
  const mine = attendance.entryFor(me.id, TODAY);
  const myRow = roster.find((r) => r.employee.id === me.id);

  function clockMyselfIn() {
    attendance.clockIn(me.id, locationId);
    toast.push({
      title: `Clocked in at ${nowTime()}`,
      tone: "success",
      detail: `${WORK_LOCATIONS.find((l) => l.id === locationId)?.name}. Have a good day.`,
    });
  }

  function clockMyselfOut() {
    attendance.clockOut(me.id);
    toast.push({
      title: `Clocked out at ${nowTime()}`,
      tone: "info",
      detail: "Your hours for today are on your timesheet.",
    });
  }

  return (
    <>
      <PageHeader
        title="Attendance"
        description={`Shift ${policy.shiftStart}–${policy.shiftEnd}, ${policy.graceMinutes} minutes' grace. Today is ${shortDate(TODAY)}.`}
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
        {/* Own clock-in. Deliberately the first thing on the page: the person
            looking at this screen most often is looking for this control. */}
        <Card>
          <CardBody className="flex flex-wrap items-center gap-4">
            <Avatar name={fullName(me)} size="md" />
            <div className="min-w-0 flex-1">
              <p className="text-[0.9375rem] font-semibold text-ink">
                {fullName(me)}
              </p>
              <p className="mt-0.5 text-[0.875rem] text-muted">
                {mine?.clockIn
                  ? mine.clockOut
                    ? `In at ${mine.clockIn}, out at ${mine.clockOut}.`
                    : `In at ${mine.clockIn}. Still clocked in.`
                  : myRow?.status === "on_leave"
                    ? "On approved leave today — nothing to clock."
                    : "You have not clocked in today."}
              </p>
            </div>

            {myRow?.status !== "on_leave" && (
              <div className="flex flex-wrap items-end gap-2">
                {!mine?.clockIn && (
                  <Field label="Location">
                    <Select
                      value={locationId}
                      onChange={(e) => {
                        const next = e.target.value;
                        setLocationId(next);
                      }}
                    >
                      {WORK_LOCATIONS.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                {!mine?.clockIn ? (
                  <Button variant="approve" onClick={clockMyselfIn}>
                    <LogIn aria-hidden="true" className="size-4" />
                    Clock in
                  </Button>
                ) : !mine.clockOut ? (
                  <Button variant="secondary" onClick={clockMyselfOut}>
                    <LogOut aria-hidden="true" className="size-4" />
                    Clock out
                  </Button>
                ) : (
                  <Badge tone="success" size="sm" dot>
                    Day complete
                  </Badge>
                )}
              </div>
            )}
          </CardBody>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="In today"
            value={String((counts.present ?? 0) + (counts.late ?? 0))}
            hint={`of ${directory.length} on the roster`}
          />
          <Stat
            label="Late"
            value={String(counts.late ?? 0)}
            icon={<Clock aria-hidden="true" />}
            trend={
              (counts.late ?? 0) > 0
                ? { direction: "down", label: `after ${policy.shiftStart}` }
                : undefined
            }
          />
          <Stat label="On approved leave" value={String(counts.on_leave ?? 0)} />
          <Stat
            label="Not clocked in"
            value={String(counts.absent ?? 0)}
            trend={
              (counts.absent ?? 0) > 0
                ? { direction: "down", label: "Unexplained" }
                : undefined
            }
          />
        </div>

        {(counts.absent ?? 0) > 0 && (
          <Callout tone="warning" title="Unexplained absence costs money">
            An absence with no approved leave behind it prorates against{" "}
            {settings.workingDaysPerMonth} working days — the same divisor the
            payroll engine uses, so the figure in the timesheet view is what the
            run will actually withhold. Fix the record here, or approve the
            leave, before the run.{" "}
            <Link
              href="/settings/payroll"
              className="font-medium text-ink underline underline-offset-4"
            >
              Change the working month
            </Link>
            .
          </Callout>
        )}

        {view === "today" ? (
          <Card>
            <CardHeader
              title={`Roster — ${shortDate(TODAY)}`}
              description="Exceptions first. Anyone on approved leave is shown as on leave, never as a no-show."
            />
            <TableWrap className="rounded-none border-0">
              <THead>
                <TH>Employee</TH>
                <TH>Status</TH>
                <TH>In</TH>
                <TH>Out</TH>
                <TH>Location</TH>
                <TH align="right">Correct</TH>
              </THead>
              <TBody>
                {roster.map((row) => (
                  <TR key={row.employee.id} interactive>
                    <TDPrimary
                      title={
                        <Link
                          href={`/people/${row.employee.id}`}
                          className="hover:text-accent-text hover:underline underline-offset-4"
                        >
                          {fullName(row.employee)}
                        </Link>
                      }
                      subtitle={row.employee.jobTitle}
                    />
                    <TD>
                      <Badge tone={TONE[row.status]} size="sm" dot>
                        {STATUS_LABEL[row.status]}
                      </Badge>
                      {row.lateBy > 0 && (
                        <span className="mt-0.5 block text-[0.75rem] text-warning-text">
                          {row.lateBy} min late
                        </span>
                      )}
                      {row.leave && (
                        <span className="mt-0.5 block text-[0.75rem] text-faint">
                          {row.leave.type}, to {row.leave.to}
                        </span>
                      )}
                      {row.anomaly && (
                        <span className="mt-0.5 block text-[0.75rem] font-medium text-warning-text">
                          {row.anomaly}
                        </span>
                      )}
                    </TD>
                    <TD className="tabular">{row.entry?.clockIn ?? "—"}</TD>
                    <TD className="tabular text-muted">
                      {row.entry?.clockOut ?? (row.entry?.clockIn ? "still in" : "—")}
                    </TD>
                    <TD className="text-muted">
                      {row.locationName ? (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin aria-hidden="true" className="size-3.5 text-faint" />
                          {row.locationName}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD align="right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCorrecting(row.employee.id)}
                        aria-label={`Correct ${fullName(row.employee)}'s attendance`}
                      >
                        <PencilLine aria-hidden="true" className="size-3.5" />
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          </Card>
        ) : (
          <Card>
            <CardHeader
              title="Timesheet — last 15 working days"
              description="Public holidays are excluded from the working-day count. The last column is what payroll would withhold for unexplained absence."
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
                {[...sheet]
                  .sort((a, b) => b.daysAbsent - a.daysAbsent)
                  .map((row) => {
                    const proration = prorationFor({
                      grossMonthly: row.employee.grossMonthly,
                      unpaidDays: row.daysAbsent,
                      workingDaysPerMonth: settings.workingDaysPerMonth,
                    });
                    return (
                      <TR key={row.employee.id} interactive>
                        <TDPrimary
                          title={
                            <Link
                              href={`/people/${row.employee.id}`}
                              className="hover:text-accent-text hover:underline underline-offset-4"
                            >
                              {fullName(row.employee)}
                            </Link>
                          }
                          subtitle={`${row.daysPresent} of ${row.workingDays} working days`}
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
                            row.daysAbsent > 0
                              ? "font-medium text-danger-text"
                              : "text-muted",
                          )}
                        >
                          {row.daysAbsent || "—"}
                        </TD>
                        <TD align="right" className="tabular text-muted">
                          {row.hours || "—"}
                        </TD>
                        <TD align="right" className="tabular">
                          {proration.amount > 0 ? (
                            <span className="inline-flex items-center gap-1.5 text-danger-text">
                              <TriangleAlert
                                aria-hidden="true"
                                className="size-3.5"
                              />
                              <Money amount={-proration.amount} />
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
        )}
      </PageBody>

      {/* Keyed so opening a different employee remounts with fresh state,
          rather than deriving state from props during render. */}
      {correcting && (
        <CorrectionDialog
          key={correcting}
          employeeId={correcting}
          onClose={() => setCorrecting(null)}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * An HR correction to today's record.
 *
 * The note is required rather than optional. Payroll pays against this number,
 * so a change without a stated reason is exactly the kind of thing an auditor
 * asks about and nobody can answer.
 */
function CorrectionDialog({
  employeeId,
  onClose,
}: {
  employeeId: string;
  onClose: () => void;
}) {
  const attendance = useAttendanceStore();
  const { get } = useEmployeeStore();
  const toast = useToast();

  const employee = get(employeeId);
  const existing = attendance.entryFor(employeeId, TODAY);

  const [clockIn, setClockIn] = useState(existing?.clockIn ?? "");
  const [clockOut, setClockOut] = useState(existing?.clockOut ?? "");
  const [locationId, setLocationId] = useState(existing?.locationId ?? "loc-hq");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);

  if (!employee) return null;

  function save() {
    setTouched(true);
    if (!note.trim()) return;
    attendance.correct(
      employeeId,
      TODAY,
      {
        clockIn: clockIn || undefined,
        clockOut: clockOut || undefined,
        locationId,
      },
      note.trim(),
    );
    toast.push({
      title: `${fullName(employee!)}'s record corrected`,
      tone: "success",
      detail: "The change and your reason are both on the record.",
    });
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Correct ${fullName(employee)}'s day`}
      description={`${shortDate(TODAY)}. The reason is kept with the change.`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" onClick={save}>
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

        <Field label="Location">
          <Select
            value={locationId}
            onChange={(e) => {
              const v = e.target.value;
              setLocationId(v);
            }}
          >
            {WORK_LOCATIONS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} — {l.address}
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
