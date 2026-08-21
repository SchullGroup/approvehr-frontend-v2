"use client";

import { request } from "@/lib/api/client";

/**
 * Attendance — `/api/v1/attendance`.
 *
 * ## The server decides the status. This module never does.
 *
 * `GET /roster` returns a status per person per day, resolved in one fixed
 * order: **holiday, then rest day, then approved leave, then no clock-in, then
 * late or present.** That order is the product decision — somebody with
 * approved leave is never reported as a no-show — and it lives in
 * `attendance/service.ts` beside the same order in `payroll/assemble.ts`'s
 * `unpaidDaysFor`.
 *
 * So there is no status arithmetic in this file and none in the screen. A second
 * implementation on the client is how the timesheet and the payslip end up
 * disagreeing about the same day, and the person holding the payslip is the one
 * who finds out.
 *
 * ## Overtime is not here
 *
 * `hours` on a timesheet row is time between a clock-in and its clock-out, and
 * that is all it is. Overtime is a separate record derived by
 * `/api/v1/overtime` from clock-outs later than the scheduled end, with a grace
 * period, a daily cap and a rate per kind of day. Do not subtract a shift length
 * from `hours` and call the remainder overtime — link to `/people/overtime`,
 * which owns it.
 *
 * ## A shift worker is measured against their rota
 *
 * Nothing in this module knows about rotas, and that is a real gap the screen
 * has to cover rather than hide. `/roster` and `/timesheet` measure everybody
 * against the office week in `AttendancePolicy.workingWeekdays`; payroll's
 * `unpaidDaysFor` measures anyone with rostered days against **their rota**,
 * where an unrostered day is a rest day whatever the office calendar says.
 *
 * For a four-on-four-off crew the two answers differ by most of a month. So a
 * screen showing `daysUnexplained` or `proration` for somebody on a rota must
 * read `/shifts/rota` for the same window and say which basis applies —
 * see `useRotaContext` in `lib/store/attendance.ts`.
 *
 * ## Money
 *
 * The wire carries integer **kobo**; everything this module returns is in
 * **naira**, converted once in `toTimesheetRow`. That is the boundary rule, and
 * it is why `WireTimesheetRow` is not exported: nothing downstream should be
 * able to reach a kobo figure and divide it a second time. (`lib/api/overtime.ts`
 * chose the opposite — it hands screens kobo and exports a `naira()` helper.
 * Either is defensible; mixing them inside one screen is not, which is why this
 * one converts here and says so.)
 *
 * ## Two things the wire says that are easy to get backwards
 *
 * - **`workingWeekdays` is ISO: 1 is Monday, 7 is Sunday.** The demo policy in
 *   `lib/mock/attendance.ts` uses JavaScript's `getUTCDay`, where 0 is Sunday.
 *   They are different numbers for the same days. Never pass one where the
 *   other is expected.
 * - **Times are `HH:MM` clock strings, dates are `YYYY-MM-DD`.** Nothing here is
 *   a timestamp. "Clocked in at 07:52" is a fact about a wall clock, and putting
 *   it through a `Date` in one timezone and out in another moves it.
 *
 * ## Who can do what, so a screen can gate before it asks
 *
 * | Action | Needs |
 * |---|---|
 * | Reading the roster, the timesheet, the policy, the locations | nothing |
 * | Clocking **yourself** in or out, now | nothing — it is the most-used action in the product |
 * | Clocking somebody else in, or at a time you typed | `EDIT_RECORDS` |
 * | Correcting a record | `EDIT_RECORDS`, **and a note** |
 * | Changing the policy | `MANAGE_SETTINGS` |
 *
 * ## Refusals worth showing verbatim
 *
 * The API names the time and the fix. Show its message; do not replace it with
 * "could not save".
 *
 * - "Already clocked in at 08:12. Use a correction to change it." (409)
 * - "There is no clock-in for that day to close." (409)
 * - "That is before the clock-in time." (422)
 * - "Say why this changed — payroll pays against this record." (422, on `note`)
 */

/* ------------------------------------------------------------------- shapes */

/**
 * Where a person's day stands.
 *
 * Resolved by the server in the order listed at the top of this file. Treat it
 * as opaque: render the label, never re-derive the value.
 */
export type AttendanceStatus =
  | "PRESENT"
  | "LATE"
  | "ABSENT"
  | "ON_LEAVE"
  | "HOLIDAY"
  | "REST_DAY";

/**
 * The company's working pattern.
 *
 * Company settings rather than constants for the same reason
 * `workingDaysPerMonth` is: an office and a site crew do not share a start
 * time, and a product that hardcodes 09:00 has decided which kind of company it
 * is for. Materialised on first read by the API, so it always exists.
 */
export type ApiAttendancePolicy = {
  id: string;
  /** `HH:MM`. Anything after this plus `graceMinutes` is late. */
  shiftStart: string;
  shiftEnd: string;
  graceMinutes: number;
  /** **ISO weekdays: 1 = Monday, 7 = Sunday.** Not `getUTCDay`. */
  workingWeekdays: number[];
  /** False means only HR records attendance, and the screen hides the button. */
  selfServiceClockIn: boolean;
};

export type ApiWorkLocation = {
  id: string;
  name: string;
  addressLine: string | null;
  /** Whether a clock-in from off-site is accepted for this location. */
  remoteAllowed: boolean;
};

/** One person, one day. */
export type ApiRosterRow = {
  employeeId: string;
  employeeName: string;
  jobTitle: string;
  /** Server-resolved. See the note at the top of this file. */
  status: AttendanceStatus;
  /** `HH:MM`, or null when they never clocked. */
  clockIn: string | null;
  clockOut: string | null;
  /** Minutes past the grace period. Zero unless the status is `LATE`. */
  lateByMinutes: number;
  /** The location's name, already resolved. There is no id on this row. */
  workLocation: string | null;
  /** The approved leave explaining an absence, where there is one. */
  leave: { id: string; type: string; endDate: string } | null;
  /**
   * A clock-in that contradicts the day's status — somebody on approved leave
   * or a public holiday who turned up anyway. Worth showing rather than
   * silently resolving: it is either unrecorded cancelled leave or somebody
   * owed extra pay.
   */
  anomaly: string | null;
  /** Set when HR corrected this entry. The reason travels with the change. */
  correctionNote: string | null;
};

export type ApiRoster = {
  /** `YYYY-MM-DD`. The server's answer, not the browser's clock. */
  date: string;
  policy: ApiAttendancePolicy;
  /** Exceptions first: absent, late, on leave, present, holiday, rest day. */
  rows: ApiRosterRow[];
};

/** Kobo, as the wire has it. Deliberately not exported — see the money note. */
type WireTimesheetRow = {
  employeeId: string;
  employeeName: string;
  workingDays: number;
  daysPresent: number;
  daysLate: number;
  daysOnLeave: number;
  daysUnexplained: number;
  hours: number;
  proration: {
    unpaidDays: number;
    workingDaysPerMonth: number;
    amountKobo: number;
  };
};

type WireTimesheet = {
  from: string;
  to: string;
  workingDays: number;
  rows: WireTimesheetRow[];
};

export type ApiTimesheetRow = Omit<WireTimesheetRow, "proration"> & {
  /**
   * What payroll would withhold for unexplained absence.
   *
   * `workingDaysPerMonth` is payroll's own divisor read from `PayrollSettings`,
   * not an assumption made here — so a company on a 26-day month prorates
   * against 26 and this figure is the one the run will actually use.
   *
   * **Except for somebody on a rota**, where payroll counts their rostered days
   * instead. See the rota note at the top of this file.
   */
  proration: {
    unpaidDays: number;
    workingDaysPerMonth: number;
    /** **Naira.** Converted once, here. */
    amount: number;
  };
};

export type ApiTimesheet = {
  /** `YYYY-MM-DD`. The first working day the window actually covered. */
  from: string;
  to: string;
  /** Working days in the window, public holidays excluded. */
  workingDays: number;
  rows: ApiTimesheetRow[];
};

/** What a clock-in or clock-out answers with. A write returns the fact, not a row. */
export type ApiClockResult = {
  employeeId: string;
  date: string;
  /** `HH:MM`, the time actually recorded. Show it back rather than guessing. */
  time: string;
};

export type ApiCorrection = {
  id: string;
  employeeId: string;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  workLocation: string | null;
  correctionNote: string | null;
};

/* ------------------------------------------------------------------- bodies */

/**
 * Omit `employeeId` to clock yourself in — the API reads it off the session.
 *
 * Sending it, or sending `at`, is an HR action and needs `EDIT_RECORDS`. This
 * matters in connected mode: the browser's idea of who is signed in is a *user*
 * id, and passing one where an employee id belongs looks up nothing.
 */
export type ClockInBody = {
  employeeId?: string;
  workLocationId?: string;
  /** `HH:MM`. Needs `EDIT_RECORDS`; omit it and the API uses now. */
  at?: string;
  /** `YYYY-MM-DD`. Omit for today. */
  date?: string;
};

export type ClockOutBody = {
  employeeId?: string;
  at?: string;
  date?: string;
};

/**
 * A correction. `note` is required by the schema, not by convention.
 *
 * `null` clears a time; `undefined` leaves it alone. The two are different
 * requests and the difference is the whole reason this is not `string | null`
 * with a sentinel.
 */
export type CorrectionBody = {
  clockIn?: string | null;
  clockOut?: string | null;
  workLocationId?: string | null;
  /** At least three characters. The API refuses a blank one. */
  note: string;
};

export type PolicyBody = Partial<{
  shiftStart: string;
  shiftEnd: string;
  graceMinutes: number;
  /** ISO weekdays, 1–7. */
  workingWeekdays: number[];
  selfServiceClockIn: boolean;
}>;

export type TimesheetParams = {
  /** Working days to look back over. The API caps this at 90. */
  days?: number;
  /** `YYYY-MM-DD`. Supplying both overrides `days` as the window. */
  from?: string;
  to?: string;
  /** One person's sheet, for a record page. */
  employeeId?: string;
};

/* ------------------------------------------------------------------- the seam */

/** Kobo to naira. The only division by 100 on this side. */
const naira = (kobo: number): number => Math.round(kobo) / 100;

function toTimesheetRow(wire: WireTimesheetRow): ApiTimesheetRow {
  const { proration, ...rest } = wire;
  return {
    ...rest,
    proration: {
      unpaidDays: proration.unpaidDays,
      workingDaysPerMonth: proration.workingDaysPerMonth,
      amount: naira(proration.amountKobo),
    },
  };
}

/* -------------------------------------------------------------------- calls */

export const attendanceApi = {
  policy: (signal?: AbortSignal) =>
    request<ApiAttendancePolicy>("/attendance/policy", {
      ...(signal ? { signal } : {}),
    }),

  /** `MANAGE_SETTINGS`. Refuses a shift that ends before it starts. */
  updatePolicy: (body: PolicyBody) =>
    request<ApiAttendancePolicy>("/attendance/policy", {
      method: "PATCH",
      body,
    }),

  locations: (signal?: AbortSignal) =>
    request<ApiWorkLocation[]>("/attendance/locations", {
      ...(signal ? { signal } : {}),
    }),

  /**
   * Add a place people clock in at.
   *
   * Only the name is required. A geofence is the exception rather than the rule,
   * and the API refuses a partial one — latitude without a radius cannot decide
   * anything, and a fence that silently never matches refuses clock-ins with no
   * visible cause.
   */
  createLocation: (input: {
    name: string;
    addressLine?: string;
    remoteAllowed?: boolean;
    latitude?: number;
    longitude?: number;
    radiusMetres?: number;
  }) =>
    request<ApiWorkLocation>("/attendance/locations", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  archiveLocation: (id: string) =>
    request<{ name: string; assigned?: number }>(`/attendance/locations/${id}`, {
      method: "DELETE",
    }),

  /** Defaults to the server's today, which is the date to display. */
  roster: (date?: string, signal?: AbortSignal) =>
    request<ApiRoster>("/attendance/roster", {
      query: { date },
      ...(signal ? { signal } : {}),
    }),

  timesheet: async (
    params: TimesheetParams = {},
    signal?: AbortSignal,
  ): Promise<ApiTimesheet> => {
    const wire = await request<WireTimesheet>("/attendance/timesheet", {
      query: {
        days: params.days,
        from: params.from,
        to: params.to,
        employeeId: params.employeeId,
      },
      ...(signal ? { signal } : {}),
    });
    return { ...wire, rows: wire.rows.map(toTimesheetRow) };
  },

  /** 409 when there is already a clock-in for that day. Show the message. */
  clockIn: async (body: ClockInBody = {}): Promise<ApiClockResult> => {
    const result = await request<{
      employeeId: string;
      date: string;
      clockIn: string;
    }>("/attendance/clock-in", { method: "POST", body });
    return {
      employeeId: result.employeeId,
      date: result.date,
      time: result.clockIn,
    };
  },

  /** 409 when there is no clock-in to close, or it is already closed. */
  clockOut: async (body: ClockOutBody = {}): Promise<ApiClockResult> => {
    const result = await request<{
      employeeId: string;
      date: string;
      clockOut: string;
    }>("/attendance/clock-out", { method: "POST", body });
    return {
      employeeId: result.employeeId,
      date: result.date,
      time: result.clockOut,
    };
  },

  /** `EDIT_RECORDS`. The note is part of the record, not of the request. */
  correct: (employeeId: string, date: string, body: CorrectionBody) =>
    request<ApiCorrection>(`/attendance/entries/${employeeId}/${date}`, {
      method: "PATCH",
      body,
    }),
};
