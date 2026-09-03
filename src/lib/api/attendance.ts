"use client";

import { ApiError, request } from "@/lib/api/client";

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
 * | Adding, changing or switching off a work location | `MANAGE_SETTINGS` |
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

/**
 * A place people clock in at, and the fence around it.
 *
 * ## The three geofence fields are set together or not at all
 *
 * A latitude with no radius decides nothing, so the API refuses two thirds of a
 * fence in both directions — on a create and on a patch, where it validates the
 * row it would *end up with* rather than the fields it was sent. `null` on all
 * three is a location with no fence, which is the common case: most companies
 * never draw one, and clocking in from anywhere stays accepted.
 *
 * **Absent is absent.** A missing radius is not a radius of zero — zero metres
 * would be a fence nobody on earth could stand inside. Render these as blank.
 */
export type ApiWorkLocation = {
  id: string;
  name: string;
  addressLine: string | null;
  /** Whether a clock-in from off-site is accepted for this location. */
  remoteAllowed: boolean;
  /** Decimal degrees, six places. Null when no fence is set. */
  latitude: number | null;
  longitude: number | null;
  /** How far from that point a clock-in is accepted. Null when no fence is set. */
  radiusMetres: number | null;
  /**
   * Whether a clock-in here is actually checked against the fence.
   *
   * A fence plus `remoteAllowed` is a fence nothing applies — a real
   * arrangement, and one a screen must say out loud rather than showing a radius
   * that does nothing. Computed by the API so this side never re-derives it.
   */
  geofenceEnforced: boolean;
  /** Null while the location is on. An ISO timestamp once switched off. */
  archivedAt: string | null;
  /**
   * Active people whose record names this location.
   *
   * **Nullable because demo mode cannot know it.** The API always sends a
   * number; offline, `Employee.location` is a city string ("Lagos, NG") and
   * nothing joins it to a work location, so any figure derived from it would be
   * a guess. Absent data renders as absent — a headcount of 0 beside a branch
   * that four people work at is the exact claim this product is sold against.
   */
  assigned: number | null;
};

/**
 * The API's own words for a half-filled fence, character for character.
 *
 * Demo mode has to refuse the same thing the server refuses, in the same
 * sentence — same reasoning as `scoringWeightProblem` in `lib/api/performance.ts`.
 * A screen that only behaves correctly against the real thing is a screen nobody
 * tested. The source is `GEOFENCE_ALL_OR_NOTHING` in
 * `approvehr-api/src/modules/attendance/schemas.ts`.
 */
export const GEOFENCE_ALL_OR_NOTHING =
  "A geofence needs latitude, longitude and a radius together, or none of them.";

/** What a geofence is, in words somebody who has never met one can act on. */
export const GEOFENCE_EXPLANATION =
  "A radius is how far from that point a clock-in is accepted. Somebody standing further away is turned down and told how far off they are.";

export type NewWorkLocationInput = {
  name: string;
  addressLine?: string;
  remoteAllowed?: boolean;
  latitude?: number;
  longitude?: number;
  radiusMetres?: number;
};

/**
 * A change. Absent leaves a field alone; `null` clears it.
 *
 * The distinction is the whole reason this is not `Partial<ApiWorkLocation>`:
 * sending all three fence parts as `null` is how a company removes a fence it
 * drew by mistake, and omitting them keeps the fence that is there. A sentinel
 * value would make those the same request.
 */
export type WorkLocationPatch = {
  name?: string;
  addressLine?: string | null;
  remoteAllowed?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  radiusMetres?: number | null;
};

/* --------------------------------------------------- biometric terminals */

/**
 * A terminal registered against this company.
 *
 * The reading rules on this shape are the two this codebase keeps restating,
 * and both are load-bearing here:
 *
 * - **`secret` is masked, and null offline.** The API always sends a masked
 *   `whsec_…abcd`; the plaintext comes back exactly twice, from `registerDevice`
 *   and `rotateDeviceSecret`, and never again. Demo mode sends **null** rather
 *   than inventing one — a locally generated secret would look exactly like a
 *   real credential and would sign deliveries nothing on earth would accept, so
 *   somebody would hand it to a site engineer and lose an afternoon. Absent is
 *   absent.
 * - **`unmappedPunches` is null offline** for the same reason `assigned` is null
 *   on a work location: there is no ingestion endpoint without a server, so no
 *   tap can ever arrive, and a confident 0 would read as "everybody on this
 *   device is mapped".
 *
 * `lastSeenAt` is null until a delivery is accepted, in both modes. A terminal
 * that has gone quiet is the failure nobody notices, because no punches looks
 * exactly like nobody clocking in.
 */
export type ApiAttendanceDevice = {
  id: string;
  /** The manufacturer's serial, as printed on the unit. The agent sends this. */
  serialNumber: string;
  label: string;
  workLocationId: string | null;
  workLocationName: string | null;
  /** Switched off without archiving — a unit away for repair, say. */
  active: boolean;
  lastSeenAt: string | null;
  /** Masked, or null in demo mode. Never the plaintext. See above. */
  secret: string | null;
  enrolments: number;
  /** Taps attributed to nobody. Null in demo mode — no tap can arrive. */
  unmappedPunches: number | null;
  archivedAt: string | null;
  createdAt: string;
};

/**
 * The one response that carries a readable secret.
 *
 * Returned by registering and by rotating, and by nothing else. `secretNote` is
 * the API's own sentence about what to do with it — rendered verbatim, because
 * it is the only warning somebody gets that this will not be shown again.
 */
export type ApiDeviceSecret = ApiAttendanceDevice & {
  /** The plaintext, this once. */
  secret: string;
  secretNote: string;
};

export type ApiDeviceEnrolment = {
  id: string;
  /** What the terminal calls them. A string: some devices write `0047`. */
  deviceUserId: string;
  employeeId: string;
  employeeName: string;
  employeeNo: string;
  createdAt: string;
};

/**
 * What mapping an enrolment number did, including what it went back for.
 *
 * `punches` and `days` are the backlog it claimed. Mapping a number is the
 * moment a pile of unattributed taps becomes somebody's timesheet, and a screen
 * that did not say how much it had just absorbed would be hiding a change to
 * somebody's pay.
 */
export type ApiEnrolmentResult = {
  deviceUserId: string;
  employeeId: string;
  employeeName: string;
  punches: number;
  days: number;
  note: string;
};

export type NewDeviceInput = {
  serialNumber: string;
  label: string;
  workLocationId?: string;
};

/** Sparse. Absent leaves a field alone; `null` detaches the office. */
export type DevicePatch = {
  label?: string;
  workLocationId?: string | null;
  active?: boolean;
};

/**
 * What a device secret is for, in words somebody who has never met one can act
 * on. Written once so the registration dialog and the rotation dialog cannot
 * describe it differently.
 */
export const DEVICE_SECRET_EXPLANATION =
  "The agent beside the terminal signs every delivery with this. It is shown once and stored in a form we cannot read back, so if it is lost you rotate it and update the agent rather than looking it up.";

/**
 * Why demo mode cannot issue one.
 *
 * Rendered wherever the plaintext would be. The reason matters more than the
 * refusal: a locally generated string would be indistinguishable from a real
 * credential.
 */
export const DEVICE_SECRET_NEEDS_API =
  "A signing secret is issued by the server. One made up in this browser would look exactly like a real one and would sign deliveries nothing would accept, so none is shown here.";

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
  /**
   * Minutes clocked out before the shift's grace-adjusted end. Zero unless
   * they left early — independent of `status`: somebody can be `LATE` and
   * still leave early, the same way `lateByMinutes` sits beside `LATE`
   * rather than being folded into a seventh status.
   */
  earlyByMinutes: number;
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
  /**
   * The server's own `HH:MM`, in the organisation's day.
   *
   * The same fact as `date`, one unit finer, and needed for the same reason.
   * Attendance times are UTC-rendered throughout, so a client working out how
   * long somebody has been clocked in from its own wall clock is out by its own
   * UTC offset — a whole hour in Lagos. Anchor on this instead.
   */
  time: string;
  policy: ApiAttendancePolicy;
  /** Exceptions first: absent, late, on leave, present, holiday, rest day. */
  rows: ApiRosterRow[];
  /**
   * Clock-ins on file for the day.
   *
   * Zero is a **presence check**, never a count of absences. Together with
   * `tracked` below it is how a screen looking at a past day tells "nobody
   * clocked in" from "we have no record for that day" — two different claims,
   * and reading the second as the first is what paid everybody ₦0.
   */
  recorded: number;
  /**
   * Whether the organisation was recording attendance at all by this date.
   *
   * False for every day before its first clock-in ever, where the rows are all
   * `ABSENT` and none of them means anything. The rows still carry their
   * statuses — the server does not suppress one — so it is the screen's job to
   * refuse to render a wall of absences it has been told not to believe.
   */
  tracked: boolean;
};

/**
 * One day of a month, for a calendar cell. Every figure is the server's.
 *
 * `GET /attendance/summary?month=YYYY-MM` answers the whole month in one
 * request. Reading `/roster` thirty times to draw a calendar is thirty round
 * trips, a rate limit, and a grid slower to appear than the table under it.
 *
 * The counts come from the same resolver `/roster` uses
 * (`attendance/day-status.ts` in the API), which is why a cell and the day table
 * beneath it cannot disagree — and why nothing on this side re-derives a status.
 */
export type ApiAttendanceDay = {
  /** `YYYY-MM-DD`. */
  date: string;
  /** Holiday, then rest day, then working — the roster's own first two steps. */
  kind: "HOLIDAY" | "REST_DAY" | "WORKING";
  /**
   * The public holiday on this date, if any.
   *
   * Present for an ungazetted date too, where `kind` stays `WORKING`. See
   * `UNCONFIRMED_HOLIDAY_EFFECT` in `lib/api/leave.ts`: attendance filters to
   * confirmed dates while payroll proration and the overtime rate read every
   * row, so an expected date already costs money and is still a working day
   * here. Mark it differently rather than resolving the disagreement.
   */
  holiday: { name: string; confirmed: boolean } | null;
  /** People on the payroll that day. Not the same figure all month. */
  people: number;
  /** Clock-ins on file. Zero is the presence check. */
  recorded: number;
  /** Whether the organisation was recording attendance by this date. */
  tracked: boolean;
  /**
   * Later than the server's today.
   *
   * The server's answer, not the browser's, because the browser's clock is not
   * the one the records were written against — and in demo mode it is not even
   * the same year. A calendar must not offer a day that has not happened.
   */
  future: boolean;
  present: number;
  late: number;
  /** Approved leave — a fact from the leave table, whoever clocked in. */
  onLeave: number;
  /**
   * People the roster reports `ABSENT`.
   *
   * **Null on an untracked day, and on a day still ahead**, and `number | null`
   * on purpose: a formatter that accepted a plain number here would have to print
   * something for a day nothing is known about, and the number it would print is
   * 0 out of N. That is the zero-pay bug wearing a calendar. Say "no attendance
   * recorded" instead.
   */
  absent: number | null;
};

export type ApiAttendanceSummary = {
  /** `YYYY-MM`, echoed back so a stale answer can be recognised. */
  month: string;
  from: string;
  to: string;
  policy: ApiAttendancePolicy;
  /** The server's today, so a calendar marks it from the same clock. */
  today: string;
  /**
   * The organisation's earliest clock-in ever, or null if it has never recorded
   * one. The boundary every day's `tracked` is measured against.
   */
  firstRecordedDate: string | null;
  days: ApiAttendanceDay[];
};

/** Kobo, as the wire has it. Deliberately not exported — see the money note. */
type WireTimesheetRow = {
  employeeId: string;
  employeeName: string;
  workingDays: number;
  daysPresent: number;
  daysLate: number;
  daysEarly: number;
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
    /** Null where no pay is set: there is no figure to withhold a share of. */
    amount: number | null;
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
  /**
   * The location the clock-in was recorded against, where there is one.
   *
   * Resolved by the API from what was sent, else from the employee's own
   * record — so it is the location a fence was judged against, and the name to
   * show back. Null on a clock-out, and for anybody with no location assigned.
   */
  workLocation?: { id: string; name: string } | null;
  /**
   * Metres from that location when a position was sent, else null.
   *
   * **Absent is absent.** Null means no position was taken, not that somebody
   * clocked in at the centre of the fence — so render it as nothing, never as
   * "0m away".
   */
  distanceMetres?: number | null;
};

/* ----------------------------------------------------------------- geofence */

/**
 * A clock-in the API turned down on location grounds.
 *
 * Three reasons, and they are three different situations rather than three
 * wordings of one:
 *
 * - `outside` — the device's whole accuracy circle is beyond the radius. They
 *   are not there.
 * - `unproven` — the circle straddles the boundary, so the fix is too coarse to
 *   decide it. They may well be standing in reception; their phone cannot show
 *   it. The API refuses rather than guessing, and says so.
 * - `position_required` — the location has an enforced fence and no position
 *   came with the request.
 *
 * `summary` is the API's own one-line phrasing of the fact — "You are 340m from
 * Lagos HQ". Show it as the heading and `ApiError.message` underneath, which
 * carries the way forward. **Do not reformat the distance here**: phrasing it in
 * the browser means a second distance formatter that drifts from the API's, and
 * the whole reason `summary` is on the wire is so this side formats nothing.
 */
export type GeofenceRefusal = {
  reason: "outside" | "unproven" | "position_required";
  summary: string;
  locationName: string;
  radiusMetres: number;
  distanceMetres: number | null;
  accuracyMetres: number | null;
};

const GEOFENCE_REASONS = ["outside", "unproven", "position_required"] as const;

/**
 * The geofence facts on an error, or null when it is some other refusal.
 *
 * Switches on `details.reason` rather than on the message, per the rule the API's
 * `lib/errors.ts` states: codes and structured details are stable, wording is
 * free to improve.
 */
export function geofenceRefusal(error: unknown): GeofenceRefusal | null {
  if (!(error instanceof ApiError)) return null;
  const details = error.details;
  if (details === undefined || details === null || Array.isArray(details)) return null;
  const reason = (details as Record<string, unknown>)["reason"];
  if (typeof reason !== "string") return null;
  if (!GEOFENCE_REASONS.some((known) => known === reason)) return null;
  return details as unknown as GeofenceRefusal;
}

export type ApiCorrection = {
  id: string;
  employeeId: string;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  workLocation: string | null;
  correctionNote: string | null;
};

/** What `HistoryQuery.status` may narrow a range down to. */
export type HistoryStatusFilter = AttendanceStatus | "EARLY";

/** One day of one person's own attendance. */
export type ApiHistoryRow = {
  /** `YYYY-MM-DD`. */
  date: string;
  status: AttendanceStatus;
  clockIn: string | null;
  clockOut: string | null;
  lateByMinutes: number;
  earlyByMinutes: number;
  workLocation: string | null;
  leave: { id: string; type: string } | null;
  correctionNote: string | null;
};

export type ApiHistory = {
  employeeId: string;
  from: string;
  to: string;
  /** Newest first. A day before the organisation's first-ever clock-in, or
      one that has not happened yet, is not in this list at all — not present,
      not absent. See `ApiRoster.tracked` for the same discipline elsewhere. */
  rows: ApiHistoryRow[];
};

/**
 * An employee's own account of what a day's attendance should say, waiting
 * on HR.
 *
 * Distinct from `ApiCorrection`, which is the *result* of an HR-typed fix
 * applied immediately. This is a **proposal** — the same shape
 * `EmployeeChangeRequest` uses for a bank account: held until somebody with
 * `EDIT_RECORDS` agrees, and only then applied through the very function an
 * HR-typed correction uses. `status` other than `PENDING` means it is
 * settled; `WITHDRAWN` means a newer request for the same day replaced it.
 */
export type ApiCorrectionRequest = {
  id: string;
  employeeId: string;
  /** `YYYY-MM-DD`. */
  workDate: string;
  requestedAt: string;
  /** What the record said when this was raised — the snapshot, not a live read. */
  clockInBefore: string | null;
  clockOutBefore: string | null;
  /** What was asked for. Null means "no change asked to this side". */
  clockInAfter: string | null;
  clockOutAfter: string | null;
  reason: string;
  status: "PENDING" | "APPROVED" | "DECLINED" | "WITHDRAWN";
  decidedAt: string | null;
  decisionNote: string | null;
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
  /**
   * Where the device says it is. Only worth sending for a location whose fence
   * is enforced — `useAttendanceMutations` decides that and asks for it there.
   *
   * `accuracyMetres` is not decoration. The API accepts the fence only when the
   * whole accuracy circle falls inside the radius, and refuses to judge one it
   * cannot decide, so dropping it would turn "your device cannot tell" into a
   * confident answer nobody could defend.
   */
  position?: {
    latitude: number;
    longitude: number;
    accuracyMetres?: number;
  };
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

export type HistoryParams = {
  /** Omit for your own. Reading somebody else's needs the same company-wide
      read `/roster` and `/timesheet` do — see `attendanceApi.history`. */
  employeeId?: string;
  /** `YYYY-MM-DD`. Omitted defaults to the last 30 days on the API. */
  from?: string;
  to?: string;
  status?: HistoryStatusFilter;
};

/**
 * At least one of `clockIn`/`clockOut` is required.
 *
 * Unlike `CorrectionBody`, neither side is nullable: this is a proposal, and
 * an employee asking to *clear* their own clock-in is not a request this
 * form expresses — only "it should have said something else".
 */
export type RequestCorrectionBody = {
  /** `YYYY-MM-DD`. */
  date: string;
  clockIn?: string;
  clockOut?: string;
  reason: string;
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

  /**
   * Every location, with its fence.
   *
   * `includeArchived` is for the settings screen, which has to be able to show a
   * switched-off branch in order to offer turning it back on. A picker asking
   * this question leaves it off and gets only the places somebody may clock in
   * at today.
   */
  locations: (
    params: { includeArchived?: boolean } = {},
    signal?: AbortSignal,
  ) =>
    request<ApiWorkLocation[]>("/attendance/locations", {
      query: params.includeArchived ? { includeArchived: true } : {},
      ...(signal ? { signal } : {}),
    }),

  /**
   * Add a place people clock in at. `MANAGE_SETTINGS`.
   *
   * Only the name is required. A geofence is the exception rather than the rule,
   * and the API refuses a partial one — latitude without a radius cannot decide
   * anything, and a fence that silently never matches refuses clock-ins with no
   * visible cause.
   *
   * **`body` takes the object, not a JSON string.** `request` stringifies it;
   * this call used to hand it `JSON.stringify(input)`, which was stringified
   * again and reached the API as a quoted string where an object belonged. Every
   * field came back as a validation failure and none of them named the cause.
   */
  createLocation: (input: NewWorkLocationInput) =>
    request<ApiWorkLocation>("/attendance/locations", {
      method: "POST",
      body: input,
    }),

  /**
   * Move a fence, widen it, rename a branch. `MANAGE_SETTINGS`.
   *
   * Sparse: what is absent is left alone. See `WorkLocationPatch` for why `null`
   * is a different request from omission.
   */
  updateLocation: (id: string, patch: WorkLocationPatch) =>
    request<ApiWorkLocation>(`/attendance/locations/${id}`, {
      method: "PATCH",
      body: patch,
    }),

  /** Off, not gone. Reports how many people are still assigned there. */
  archiveLocation: (id: string) =>
    request<{ name: string; assigned?: number }>(`/attendance/locations/${id}`, {
      method: "DELETE",
    }),

  /**
   * Back on. Idempotent, so a double click is not an error.
   *
   * The route the create refusal names: an archived location keeps its name, so
   * "Head office exists but is switched off. Turn it back on rather than making
   * a second one." is only actionable because this exists.
   */
  restoreLocation: (id: string) =>
    request<{ id: string; name: string; alreadyOn: boolean }>(
      `/attendance/locations/${id}/restore`,
      { method: "POST" },
    ),

  /* ------------------------------------------------- biometric terminals */

  /**
   * Every registered terminal. `MANAGE_SETTINGS`.
   *
   * `includeArchived` is for this screen, which has to show a switched-off unit
   * in order to offer turning it back on. Nothing else asks.
   */
  devices: (params: { includeArchived?: boolean } = {}, signal?: AbortSignal) =>
    request<{ devices: ApiAttendanceDevice[] }>("/attendance/devices", {
      query: params.includeArchived ? { includeArchived: true } : {},
      ...(signal ? { signal } : {}),
    }).then((res) => res.devices),

  /**
   * Register a terminal. `MANAGE_SETTINGS`.
   *
   * **The response carries the plaintext secret, once.** Show it before the
   * dialog closes; there is no route that returns it again. 409 when the serial
   * is already registered, and the message says whether the existing one is live
   * or merely switched off.
   */
  registerDevice: (input: NewDeviceInput) =>
    request<ApiDeviceSecret>("/attendance/devices", { method: "POST", body: input }),

  updateDevice: (id: string, patch: DevicePatch) =>
    request<ApiAttendanceDevice>(`/attendance/devices/${id}`, {
      method: "PATCH",
      body: patch,
    }),

  /**
   * Off, not gone. An archived device is refused at ingestion, so a stolen
   * terminal stops being believed the moment somebody says so — without erasing
   * what it reported while it was trusted.
   */
  archiveDevice: (id: string) =>
    request<ApiAttendanceDevice>(`/attendance/devices/${id}`, { method: "DELETE" }),

  restoreDevice: (id: string) =>
    request<ApiAttendanceDevice>(`/attendance/devices/${id}/restore`, {
      method: "POST",
    }),

  /**
   * A new secret, shown once. The old one stops working immediately.
   *
   * No grace period: a rotation is what somebody does when a secret has leaked,
   * and a window would leave the leaked one signing valid deliveries for the
   * length of it. Whatever the agent buffers meanwhile arrives when it is
   * updated.
   */
  rotateDeviceSecret: (id: string) =>
    request<ApiDeviceSecret>(`/attendance/devices/${id}/rotate-secret`, {
      method: "POST",
    }),

  deviceEnrolments: (id: string, signal?: AbortSignal) =>
    request<{ enrolments: ApiDeviceEnrolment[] }>(
      `/attendance/devices/${id}/enrolments`,
      { ...(signal ? { signal } : {}) },
    ).then((res) => res.enrolments),

  /**
   * Say which person an enrolment number means, and go back for its backlog.
   *
   * 409 when that number already belongs to somebody: every tap it has sent is
   * attributed to them, and moving the mapping would silently re-attribute
   * their attendance. Unmap first.
   */
  mapDeviceEnrolment: (
    id: string,
    body: { deviceUserId: string; employeeId: string },
  ) =>
    request<ApiEnrolmentResult>(`/attendance/devices/${id}/enrolments`, {
      method: "POST",
      body,
    }),

  /** Taps already collected keep the person they were attributed to. */
  unmapDeviceEnrolment: (deviceId: string, enrolmentId: string) =>
    request<{ removed: string; note: string }>(
      `/attendance/devices/${deviceId}/enrolments/${enrolmentId}`,
      { method: "DELETE" },
    ),

  /** Defaults to the server's today, which is the date to display. */
  roster: (date?: string, signal?: AbortSignal) =>
    request<ApiRoster>("/attendance/roster", {
      query: { date },
      ...(signal ? { signal } : {}),
    }),

  /**
   * A month of per-day counts. `YYYY-MM`; omitted means the server's month.
   *
   * One request per month, deliberately. A calendar drawn from thirty rosters is
   * thirty requests, and the rate limiter is the least of the problems with it.
   */
  summary: (month?: string, signal?: AbortSignal) =>
    request<ApiAttendanceSummary>("/attendance/summary", {
      query: { month },
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

  /**
   * 409 when there is already a clock-in for that day. Show the message.
   *
   * Also 422 when the location has an enforced geofence and the position sent
   * does not satisfy it. That refusal carries structured details — read them
   * with `geofenceRefusal` and show `summary` above `message`, rather than
   * replacing either with "clock-in failed".
   */
  clockIn: async (body: ClockInBody = {}): Promise<ApiClockResult> => {
    const result = await request<{
      employeeId: string;
      date: string;
      clockIn: string;
      workLocation: { id: string; name: string } | null;
      distanceMetres: number | null;
    }>("/attendance/clock-in", { method: "POST", body });
    return {
      employeeId: result.employeeId,
      date: result.date,
      time: result.clockIn,
      workLocation: result.workLocation,
      distanceMetres: result.distanceMetres,
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

  /**
   * Undo your own clock-out, just after making it.
   *
   * No body: it acts on your entry for today and nothing else. Refused past a
   * short window on the API, because an unbounded undo is a way to manufacture
   * a working day on a product that turns these rows into pay — the refusal
   * names the HR correction as the way through, and this shows that sentence
   * verbatim rather than paraphrasing it.
   */
  undoClockOut: () =>
    request<{ employeeId: string; date: string; clockIn: string | null }>(
      "/attendance/clock-out/undo",
      { method: "POST" },
    ),

  /** `EDIT_RECORDS`. The note is part of the record, not of the request. */
  correct: (employeeId: string, date: string, body: CorrectionBody) =>
    request<ApiCorrection>(`/attendance/entries/${employeeId}/${date}`, {
      method: "PATCH",
      body,
    }),

  /**
   * One person's own day-by-day record. Omit `employeeId` for yourself;
   * naming somebody else needs the same company-wide read `/roster` and
   * `/timesheet` need, and a scoped caller who tries anyway gets their own
   * id back regardless of what they asked for — same as `/timesheet`.
   */
  history: (params: HistoryParams = {}, signal?: AbortSignal) =>
    request<ApiHistory>("/attendance/history", {
      query: {
        employeeId: params.employeeId,
        from: params.from,
        to: params.to,
        status: params.status,
      },
      ...(signal ? { signal } : {}),
    }),

  /** Your own pending or recently-decided correction requests, newest first. */
  myCorrections: (signal?: AbortSignal) =>
    request<ApiCorrectionRequest[]>("/attendance/corrections/mine", {
      ...(signal ? { signal } : {}),
    }),

  /**
   * Ask for your own attendance record to be put right.
   *
   * No permission beyond a staff record — the same door `/clock-in` and
   * `/clock-out` already open for yourself. Deciding it is HR's action, via
   * the shared `/approvals` queue, not this call.
   */
  requestCorrection: (body: RequestCorrectionBody) =>
    request<ApiCorrectionRequest>("/attendance/corrections", {
      method: "POST",
      body,
    }),
};
