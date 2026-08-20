"use client";

import { request, requestPaged, type Paged } from "@/lib/api/client";

/**
 * The rota — `/api/v1/shifts`.
 *
 * ## Times are clock strings, not timestamps
 *
 * `startTime` and `endTime` are `HH:MM` in local time and every date is
 * `YYYY-MM-DD`. Nothing in this module is a `Date` on the wire. A night shift is
 * "starts at 22:00" *every* day, and a timestamp cannot say that — one container
 * on UTC and one on Africa/Lagos turn it into 21:00 for half the users. The
 * helpers at the bottom parse and format these as UTC for the same reason: a
 * grid built with local `Date` arithmetic loses or gains a day for anybody east
 * or west of the server.
 *
 * `crossesMidnight` is derived by the API from the two times and is read-only
 * here. Do not compute a second copy of it.
 *
 * ## No money crosses this boundary
 *
 * There is nothing in kobo in the whole module, which is why there is no
 * `naira()` seam at the bottom the way `loans.ts` and `assets.ts` have one. The
 * rota's connection to pay is the divisor — `workingDaysFor` on the API counts
 * rostered days for a payroll period — and that never comes to the browser.
 *
 * ## A rest day is the absence of a cell
 *
 * Both in a pattern's `sequence`, where a rest day is `null`, and in the rota
 * grid, where an unrostered day is `null` in the `days` array. There is no
 * "rest" shift to render and no status meaning "off". Anything that counts
 * rostered days counts non-null cells.
 *
 * ## Who can do what, so a screen can gate before it asks
 *
 * | Action | Needs |
 * |---|---|
 * | Reading shifts, patterns, the rota, your own rota | nothing — a rota is pinned to the wall, not salary data |
 * | Defining a shift, writing a pattern, rostering, taking a day off | `EDIT_RECORDS` |
 * | Asking a colleague to take *your* shift | nothing |
 * | Asking on somebody else's behalf | `EDIT_RECORDS` |
 * | Agreeing to take a shift | **only the colleague asked** — `EDIT_RECORDS` cannot do it for them |
 * | Approving an agreed swap | `EDIT_RECORDS` |
 *
 * The accept rule is the one that surprises people. It is deliberate: a swap the
 * colleague never agreed to is a rota somebody else wrote for them.
 *
 * ## Refusals worth showing verbatim
 *
 * The API names who and when. Show its message; do not replace it with "could
 * not save".
 *
 * - Two shifts on one day, or a night running into the next morning's early —
 *   named per person per date, with the full list in `error.details.clashes`.
 * - Archiving a shift that is on a future rota, or inside a pattern — names
 *   both blockers.
 * - Rostering into a month whose payroll is already approved or paid. That
 *   rota **is** the divisor those payslips were prorated against.
 * - Approving a swap the colleague has not accepted yet.
 */

/* ------------------------------------------------------------------- shapes */

/** Where a rostered day stands. `SWAPPED` is never written — see below. */
export type ShiftAssignmentStatus =
  | "SCHEDULED"
  | "WORKED"
  | "SWAPPED"
  | "ABSENT"
  | "CANCELLED";

export type SwapStatus =
  | "PENDING"
  | "ACCEPTED"
  | "APPROVED"
  | "DECLINED"
  | "CANCELLED";

/** Mirrors `SerializedShift`. */
export type ApiShift = {
  id: string;
  name: string;
  /** One to four characters. What a grid cell can actually fit. */
  shortName: string;
  /** `HH:MM`. */
  startTime: string;
  endTime: string;
  /** Derived from the two times by the API. Read-only. */
  crossesMidnight: boolean;
  unpaidBreakMinutes: number;
  /** Length minus the unpaid break. What an hours column shows. */
  paidMinutes: number;
  active: boolean;
  archived: boolean;
  /** Days rostered on this shift, ever. What blocks an archive. */
  timesRostered: number;
};

/** One day of a cycle, named, for the preview strip. */
export type ApiPatternDay = {
  /** 1-based. Day 1 is the first day of the cycle, not a weekday. */
  day: number;
  shiftId: string | null;
  name: string | null;
  shortName: string | null;
};

/** Mirrors `SerializedPattern`. */
export type ApiPattern = {
  id: string;
  name: string;
  /** `null` is a rest day. The array length **is** the cycle length. */
  sequence: (string | null)[];
  cycleDays: number;
  /** Working days per cycle. The honest answer to "is this four on four off?" */
  shiftDaysPerCycle: number;
  days: ApiPatternDay[];
  active: boolean;
  archived: boolean;
  /** People with a rostered day still to come from this pattern. */
  peopleOn: number;
};

/**
 * A PATCH answers with `rotaUnchanged`.
 *
 * True when the cycle was re-sequenced, which does **not** rewrite anybody's
 * existing rota — a pattern is a template, the rota is the record. The screen
 * uses this to offer generating again rather than silently regenerating.
 */
export type ApiPatternUpdate = ApiPattern & { rotaUnchanged: boolean };

/** One rostered day. `null` in a grid row means nobody is on that day. */
export type ApiRotaCell = {
  assignmentId: string;
  /** `YYYY-MM-DD`. */
  date: string;
  shiftId: string;
  shiftName: string;
  shortName: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  status: ShiftAssignmentStatus;
  /** Set when a pattern wrote this day. Cleared by an approved swap. */
  patternId: string | null;
  note: string | null;
};

/** A row of the grid: one person across the range. */
export type ApiRotaRow = {
  employeeId: string;
  employeeNo: string;
  name: string;
  rosteredDays: number;
  /** Same length and order as `ApiRota.days`. `null` is a day off. */
  days: (ApiRotaCell | null)[];
};

/** The shift identity a legend needs, without the counts. */
export type ApiRotaShift = {
  id: string;
  name: string;
  shortName: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
};

/** `GET /rota`. Archived shifts are included so no cell renders unlabelled. */
export type ApiRota = {
  from: string;
  to: string;
  /** Every date in the range, in order. The grid's columns. */
  days: string[];
  shifts: ApiRotaShift[];
  rows: ApiRotaRow[];
  /** Who is on each shift each day. Empty `shifts` means nobody is on. */
  coverage: {
    date: string;
    shifts: { shiftId: string; shortName: string; people: number }[];
  }[];
  totals: { people: number; rosteredDays: number; unrostered: number };
};

/** One side of a swap. `null` on a give-away, or if the day has since gone. */
export type ApiSwapSide = {
  assignmentId: string;
  date: string;
  shiftId: string;
  shiftName: string;
  shortName: string;
  startTime: string;
  endTime: string;
};

/** Mirrors `SerializedSwap`. */
export type ApiSwap = {
  id: string;
  status: SwapStatus;
  reason: string | null;
  /** Null only if the shift has since come off the rota. */
  requester: { employeeId: string; name: string } | null;
  requesterShift: ApiSwapSide | null;
  counterparty: { employeeId: string; name: string };
  /** Null for a give-away, where the colleague simply takes the shift. */
  counterpartyShift: ApiSwapSide | null;
  acceptedAt: string | null;
  approvedAt: string | null;
  declinedReason: string | null;
  createdAt: string;
};

/** `GET /me/rota`. Defaults to the next four weeks. */
export type ApiMyRota = {
  employeeId: string;
  from: string;
  to: string;
  rosteredDays: number;
  /** In date order, and only the days that are on. */
  days: ApiRotaCell[];
  /** The next shift from today, so a card can say "Nights, Friday 22:00". */
  next: ApiRotaCell | null;
  /** Swaps needing this person's answer. The only thing here that is a task. */
  awaitingMe: ApiSwap[];
};

/** `POST /assignments`. A write returns ids, so this is deliberately thin. */
export type ApiAssignmentCreated = {
  id: string;
  employeeId: string;
  employeeName: string;
  shiftId: string;
  shiftName: string;
  onDate: string;
  status: ShiftAssignmentStatus;
};

/** `DELETE /assignments/:id`. A hard delete, and it says what it cancelled. */
export type ApiAssignmentRemoved = {
  id: string;
  removed: boolean;
  employeeId: string;
  onDate: string;
  /** Open swaps on that day, cancelled in the same transaction. */
  swapsCancelled: number;
};

/** `POST /assignments/bulk`. */
export type ApiBulkResult = {
  created: number;
  /** Days this same pattern had already written, replaced rather than doubled. */
  replaced: number;
  people: number;
  days: number;
  from: string;
  to: string;
  patternId: string | null;
  patternName: string | null;
  shiftId: string | null;
  shiftName: string | null;
  /** Rostered days per person, so the caller can sanity-check the cycle. */
  rosteredDaysEach: number;
};

/* ------------------------------------------------------------------- bodies */

export type CreateShiftBody = {
  name: string;
  shortName: string;
  startTime: string;
  endTime: string;
  unpaidBreakMinutes?: number;
};

/**
 * `startTime` and `endTime` move together.
 *
 * One without the other changes how long every future shift on the pattern
 * lasts, and `crossesMidnight` is derived from both — so the API refuses a body
 * carrying one of them. The form sends both or neither.
 */
export type UpdateShiftBody = {
  name?: string;
  shortName?: string;
  startTime?: string;
  endTime?: string;
  unpaidBreakMinutes?: number;
  active?: boolean;
};

/** `sequence` is one entry per day; `null` is a rest day. */
export type CreatePatternBody = { name: string; sequence: (string | null)[] };

export type UpdatePatternBody = {
  name?: string;
  sequence?: (string | null)[];
  active?: boolean;
};

export type CreateAssignmentBody = {
  employeeId: string;
  shiftId: string;
  onDate: string;
  note?: string;
};

/**
 * Either a pattern or a single shift. Never both — a body carrying both has not
 * said which one wins, and the API refuses it.
 */
export type BulkAssignBody = {
  employeeIds: string[];
  patternId?: string;
  shiftId?: string;
  from: string;
  to: string;
  /**
   * The day the cycle counts from, when it is not the first day of the range.
   *
   * This is how two crews run the same pattern offset from each other — B crew
   * starts its nights when A crew starts its days off. Without it, every crew
   * generated from one pattern works the same days and the nights are
   * uncovered half the month.
   */
  cycleStart?: string;
};

export type SwapRequestBody = {
  /** The shift being given up. Somebody else's needs `EDIT_RECORDS`. */
  assignmentId: string;
  counterpartyId: string;
  /** Omit for a give-away: the colleague simply takes the shift. */
  counterpartyAssignmentId?: string;
  reason?: string;
};

export type SwapListParams = {
  page?: number;
  pageSize?: number;
  status?: SwapStatus;
  /** Only the ones I am part of, for somebody who can see all of them. */
  mine?: boolean;
};

export type RotaParams = {
  from: string;
  to: string;
  /**
   * Include people with no shifts in the range.
   *
   * Off by default — a 200-person company where 40 work shifts should not draw
   * 160 empty rows. On when somebody is about to put a name on the rota.
   */
  includeUnrostered?: boolean;
};

/* -------------------------------------------------------------------- calls */

export const shiftsApi = {
  /* -- the catalogue ----------------------------------------------------- */

  list: (includeArchived = false, signal?: AbortSignal) =>
    request<ApiShift[]>("/shifts", {
      query: { includeArchived: includeArchived ? "true" : undefined },
      ...(signal ? { signal } : {}),
    }),

  create: (body: CreateShiftBody) =>
    request<ApiShift>("/shifts", { method: "POST", body }),

  update: (id: string, body: UpdateShiftBody) =>
    request<ApiShift>(`/shifts/${id}`, { method: "PATCH", body }),

  /** Archive. Refused while it is on a future rota or inside a pattern. */
  archive: (id: string) =>
    request<{ id: string; archived: boolean; note: string }>(`/shifts/${id}`, {
      method: "DELETE",
    }),

  /* -- patterns ---------------------------------------------------------- */

  patterns: (includeArchived = false, signal?: AbortSignal) =>
    request<ApiPattern[]>("/shifts/patterns", {
      query: { includeArchived: includeArchived ? "true" : undefined },
      ...(signal ? { signal } : {}),
    }),

  createPattern: (body: CreatePatternBody) =>
    request<ApiPattern>("/shifts/patterns", { method: "POST", body }),

  /** Never rewrites an existing rota. See `ApiPatternUpdate.rotaUnchanged`. */
  updatePattern: (id: string, body: UpdatePatternBody) =>
    request<ApiPatternUpdate>(`/shifts/patterns/${id}`, {
      method: "PATCH",
      body,
    }),

  /* -- the grid ---------------------------------------------------------- */

  /** Capped at a quarter by the API, because the response is a cell per day. */
  rota: (params: RotaParams, signal?: AbortSignal) =>
    request<ApiRota>("/shifts/rota", {
      query: {
        from: params.from,
        to: params.to,
        ...(params.includeUnrostered ? { includeUnrostered: "true" } : {}),
      },
      ...(signal ? { signal } : {}),
    }),

  /** 422 when the sign-in is not linked to a staff record. */
  myRota: (
    params: { from?: string; to?: string } = {},
    signal?: AbortSignal,
  ) =>
    request<ApiMyRota>("/shifts/me/rota", {
      query: { from: params.from, to: params.to },
      ...(signal ? { signal } : {}),
    }),

  /* -- putting people on it --------------------------------------------- */

  assign: (body: CreateAssignmentBody) =>
    request<ApiAssignmentCreated>("/shifts/assignments", {
      method: "POST",
      body,
    }),

  /** Replaces only rows the same pattern wrote. Anything else refuses. */
  bulkAssign: (body: BulkAssignBody) =>
    request<ApiBulkResult>("/shifts/assignments/bulk", { method: "POST", body }),

  /** Hard delete, and it cancels any open swap on that day. */
  removeAssignment: (id: string) =>
    request<ApiAssignmentRemoved>(`/shifts/assignments/${id}`, {
      method: "DELETE",
    }),

  /* -- swaps ------------------------------------------------------------- */

  swaps: (params: SwapListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiSwap>("/shifts/swaps", {
      query: {
        pageSize: 50,
        ...params,
        ...(params.mine ? { mine: "true" } : {}),
      },
      ...(signal ? { signal } : {}),
    }),

  requestSwap: (body: SwapRequestBody) =>
    request<ApiSwap>("/shifts/swaps", { method: "POST", body }),

  /** Only the colleague asked. Not delegable, on purpose. */
  acceptSwap: (id: string) =>
    request<ApiSwap>(`/shifts/swaps/${id}/accept`, { method: "POST" }),

  /** Moves both sides of the rota. Refused until the colleague has accepted. */
  approveSwap: (id: string) =>
    request<ApiSwap>(`/shifts/swaps/${id}/approve`, { method: "POST" }),

  /** The colleague saying no, or a manager refusing one they agreed. */
  declineSwap: (id: string, reason: string) =>
    request<ApiSwap>(`/shifts/swaps/${id}/decline`, {
      method: "POST",
      body: { reason },
    }),

  /** The requester withdrawing it. */
  cancelSwap: (id: string) =>
    request<ApiSwap>(`/shifts/swaps/${id}/cancel`, { method: "POST" }),
};

/* --------------------------------------------------------------- date maths */

/**
 * Dates in this module are `YYYY-MM-DD` and every calculation on them runs in
 * UTC.
 *
 * `new Date("2026-08-24")` is already parsed as UTC midnight, and using local
 * getters on it puts anybody west of Greenwich on the previous day — which in a
 * rota means a whole column of the grid is wrong, silently, for some readers
 * only. So: parse with `Date.UTC`, read with `getUTC*`, format explicitly.
 */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

export function toIsoDay(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(iso: string, days: number): string {
  const date = parseDay(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDay(date);
}

/** Whole days from `a` to `b`. Negative when `b` is earlier. */
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (parseDay(b).getTime() - parseDay(a).getTime()) / 86_400_000,
  );
}

/** Every date from `from` to `to` inclusive. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const span = daysBetween(from, to);
  for (let i = 0; i <= span; i += 1) out.push(addDays(from, i));
  return out;
}

/**
 * The Monday of the week a date falls in.
 *
 * Monday rather than Sunday: a Nigerian working week starts on Monday, and a
 * grid whose weekend is split across two screens is a grid nobody can read.
 */
export function weekStart(iso: string): string {
  const date = parseDay(iso);
  /* getUTCDay is 0 for Sunday, so Sunday goes back six days, not forward one. */
  const shift = (date.getUTCDay() + 6) % 7;
  return addDays(iso, -shift);
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** `Mon`. The grid's column heading. */
export const dayAbbrev = (iso: string): string =>
  (DAY_NAMES[parseDay(iso).getUTCDay()] ?? "").slice(0, 3);

/** `Monday`. Spoken, so an accessible name reads as a sentence. */
export const dayName = (iso: string): string =>
  DAY_NAMES[parseDay(iso).getUTCDay()] ?? "";

/** `24`. The number under the column heading. */
export const dayOfMonth = (iso: string): number => parseDay(iso).getUTCDate();

/** `24 Aug`. */
export function shortDay(iso: string): string {
  const date = parseDay(iso);
  return `${date.getUTCDate()} ${(MONTH_NAMES[date.getUTCMonth()] ?? "").slice(0, 3)}`;
}

/** `Monday 24 August`. What a shift block's accessible name says. */
export function spokenDay(iso: string): string {
  const date = parseDay(iso);
  return `${dayName(iso)} ${date.getUTCDate()} ${MONTH_NAMES[date.getUTCMonth()] ?? ""}`;
}

/** True for a Saturday or a Sunday. Only ever used to tint a column. */
export const isWeekend = (iso: string): boolean => {
  const day = parseDay(iso).getUTCDay();
  return day === 0 || day === 6;
};

/**
 * Whether a shift runs past midnight, derived from its two clock times.
 *
 * The API derives and stores this, and `ApiShift` and `ApiRotaCell` both carry
 * it — read theirs, never recompute it. This exists for the two places that
 * genuinely have no flag to read:
 *
 * 1. **`ApiSwapSide`**, which carries the times and not the flag, so a swap row
 *    showing "22:00 – 06:00" has to work out the "next day" itself or read as an
 *    eight-hour shift that finished this morning.
 * 2. **A shift form**, where the shift does not exist yet and the help text has
 *    to say what the times the user has just typed will mean.
 *
 * One definition rather than three inline `end <= start` comparisons, because
 * three copies of a rule is three chances for one of them to use `<`.
 */
export const crossesMidnight = (startTime: string, endTime: string): boolean =>
  endTime <= startTime;

/** `8h 30m`, from the API's `paidMinutes`. */
export function hoursLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * `22:00 – 06:00, next day`.
 *
 * The trailing clause is why `crossesMidnight` is on the wire: "22:00 – 06:00"
 * on its own reads as an eight-hour shift that ended this morning.
 */
export function timesLabel(
  shift: { startTime: string; endTime: string; crossesMidnight: boolean },
): string {
  return `${shift.startTime} – ${shift.endTime}${
    shift.crossesMidnight ? ", next day" : ""
  }`;
}

export type { Paged };
