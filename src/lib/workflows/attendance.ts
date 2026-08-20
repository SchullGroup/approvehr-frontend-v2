import {
  locationById,
  recentWorkingDays,
  type AttendanceEntry,
  type AttendancePolicy,
  type AttendanceStatus,
} from "@/lib/mock/attendance";
import { PUBLIC_HOLIDAYS, type LeaveRequest } from "@/lib/mock/workflows";
import type { Employee } from "@/lib/types";

/**
 * Turning raw clock-ins into the two things anyone actually asks.
 *
 * 1. "Who is in today, and who should be?" — the roster.
 * 2. "How many days did this person work this period?" — the timesheet, which
 *    is the number payroll prorates unpaid absence against.
 *
 * The second is why this file matters. The marketing site claims that what time
 * tracking records is what payroll pays; `prorationFor` is that claim expressed
 * as arithmetic, using the same `workingDaysPerMonth` divisor the payroll engine
 * uses. If the two ever disagree, this is the file that is wrong.
 */

const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

export const isHoliday = (date: string) =>
  PUBLIC_HOLIDAYS.some((h) => h.confirmed && h.date === date);

export const isWorkingDay = (date: string, policy: AttendancePolicy) =>
  policy.workingWeekdays.includes(new Date(date).getUTCDay()) &&
  !isHoliday(date);

/** Approved leave covering a date. Pending leave is not absence yet. */
export const onLeave = (
  employeeId: string,
  date: string,
  requests: LeaveRequest[],
) =>
  requests.find(
    (r) =>
      r.employeeId === employeeId &&
      r.status === "approved" &&
      r.from <= date &&
      r.to >= date,
  );

export type RosterRow = {
  employee: Employee;
  status: AttendanceStatus;
  entry?: AttendanceEntry;
  /** Minutes past the grace period. Zero unless status is "late". */
  lateBy: number;
  locationName?: string;
  /** The leave request explaining an absence, where there is one. */
  leave?: LeaveRequest;
  /**
   * A clock-in that contradicts the day's status — someone on approved leave or
   * a public holiday who nonetheless turned up. Worth showing rather than
   * silently resolving: it is either an unrecorded cancellation of leave or
   * somebody working a day they should be paid extra for.
   */
  anomaly?: string;
};

/**
 * One row per employee for a given day.
 *
 * The ordering of the checks is the design. Someone with approved leave is "on
 * leave", never "absent" — marking an approved absence as a no-show is the
 * single most common way an attendance system loses its users' trust, and it is
 * only avoidable because leave and attendance read the same store.
 */
export function rosterFor({
  date,
  employees,
  entries,
  leaveRequests,
  policy,
}: {
  date: string;
  employees: Employee[];
  entries: AttendanceEntry[];
  leaveRequests: LeaveRequest[];
  policy: AttendancePolicy;
}): RosterRow[] {
  const lateAfter = toMinutes(policy.shiftStart) + policy.graceMinutes;

  return employees
    .map((employee): RosterRow => {
      const entry = entries.find(
        (e) => e.employeeId === employee.id && e.date === date,
      );
      const locationName = locationById(entry?.locationId)?.name;

      const worked = entry?.clockIn
        ? `Clocked in at ${entry.clockIn} regardless`
        : undefined;

      if (isHoliday(date)) {
        return {
          employee,
          status: "holiday",
          entry,
          lateBy: 0,
          locationName,
          anomaly: worked,
        };
      }
      if (!policy.workingWeekdays.includes(new Date(date).getUTCDay())) {
        return {
          employee,
          status: "rest_day",
          entry,
          lateBy: 0,
          locationName,
          anomaly: worked,
        };
      }

      const leave = onLeave(employee.id, date, leaveRequests);
      if (leave) {
        return {
          employee,
          status: "on_leave",
          entry,
          lateBy: 0,
          locationName,
          leave,
          anomaly: worked,
        };
      }

      if (!entry?.clockIn) {
        return { employee, status: "absent", entry, lateBy: 0, locationName };
      }

      const lateBy = Math.max(0, toMinutes(entry.clockIn) - lateAfter);
      return {
        employee,
        status: lateBy > 0 ? "late" : "present",
        entry,
        lateBy,
        locationName,
      };
    })
    .sort((a, b) => {
      /* Exceptions first: an absence is what needs acting on, a present person
         needs nothing. */
      const rank: Record<AttendanceStatus, number> = {
        absent: 0,
        late: 1,
        on_leave: 2,
        present: 3,
        holiday: 4,
        rest_day: 5,
      };
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      return a.employee.firstName.localeCompare(b.employee.firstName);
    });
}

export type TimesheetRow = {
  employee: Employee;
  daysPresent: number;
  daysLate: number;
  daysOnLeave: number;
  daysAbsent: number;
  /** Working days in the window, excluding holidays. */
  workingDays: number;
  /** Hours from paired clock-in/out entries only. */
  hours: number;
};

/**
 * A timesheet over the last `days` working days.
 *
 * Days still in progress (clocked in, not yet out) count as present but
 * contribute no hours — reporting a part-day as though it were complete would
 * make the hours column quietly wrong every afternoon.
 */
export function timesheet({
  employees,
  entries,
  leaveRequests,
  policy,
  days = 15,
}: {
  employees: Employee[];
  entries: AttendanceEntry[];
  leaveRequests: LeaveRequest[];
  policy: AttendancePolicy;
  days?: number;
}): TimesheetRow[] {
  const window = recentWorkingDays(days, policy).filter((d) => !isHoliday(d));
  const lateAfter = toMinutes(policy.shiftStart) + policy.graceMinutes;

  return employees.map((employee) => {
    let daysPresent = 0;
    let daysLate = 0;
    let daysOnLeave = 0;
    let daysAbsent = 0;
    let hours = 0;

    for (const date of window) {
      if (onLeave(employee.id, date, leaveRequests)) {
        daysOnLeave++;
        continue;
      }
      const entry = entries.find(
        (e) => e.employeeId === employee.id && e.date === date,
      );
      if (!entry?.clockIn) {
        daysAbsent++;
        continue;
      }
      daysPresent++;
      if (toMinutes(entry.clockIn) > lateAfter) daysLate++;
      if (entry.clockOut) {
        hours += (toMinutes(entry.clockOut) - toMinutes(entry.clockIn)) / 60;
      }
    }

    return {
      employee,
      daysPresent,
      daysLate,
      daysOnLeave,
      daysAbsent,
      workingDays: window.length,
      hours: Math.round(hours * 10) / 10,
    };
  });
}

export type Proration = {
  unpaidDays: number;
  workingDaysPerMonth: number;
  /** Fraction of gross withheld. */
  fraction: number;
  amount: number;
};

/**
 * What an unexplained absence costs, using payroll's own divisor.
 *
 * `workingDaysPerMonth` comes from `PayrollSettings`, not from a constant here,
 * so a shift company that runs a 26-day month prorates against 26. Passing the
 * setting in rather than importing it keeps this function pure and testable, and
 * makes it obvious at every call site that the number is a company policy.
 */
export function prorationFor({
  grossMonthly,
  unpaidDays,
  workingDaysPerMonth,
}: {
  grossMonthly: number;
  unpaidDays: number;
  workingDaysPerMonth: number;
}): Proration {
  const fraction =
    workingDaysPerMonth > 0
      ? Math.min(1, unpaidDays / workingDaysPerMonth)
      : 0;
  return {
    unpaidDays,
    workingDaysPerMonth,
    fraction,
    amount: Math.round(grossMonthly * fraction),
  };
}

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "In",
  late: "Late",
  absent: "Not clocked in",
  on_leave: "On leave",
  holiday: "Public holiday",
  rest_day: "Rest day",
};
