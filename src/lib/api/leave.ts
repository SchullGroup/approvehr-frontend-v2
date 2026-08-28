"use client";

import { request, requestPaged } from "@/lib/api/client";

/**
 * Leave — `/api/v1/leave`.
 *
 * | Action | Endpoint | Needs |
 * |---|---|---|
 * | Leave types and entitlements | `GET /leave/types` | nothing |
 * | The requests | `GET /leave/requests` | nothing |
 * | One request, in full | `GET /leave/requests/:id` | nothing |
 * | Raise one | `POST /leave/requests` | your own; somebody else's needs `APPROVE_LEAVE_ALL` or `EDIT_RECORDS` |
 * | Approve or send back | `POST /leave/requests/:id/decide` | `APPROVE_LEAVE_ALL` |
 * | Undo a decision | `POST /leave/requests/:id/reopen` | `APPROVE_LEAVE_ALL` |
 * | Withdraw | `POST /leave/requests/:id/cancel` | nothing |
 * | Balances | `GET /leave/balances/:id` | `VIEW_SALARIES`, or your own |
 * | The holiday calendar | `GET /leave/holidays` | nothing |
 * | Add, edit or remove a holiday | `POST`/`PATCH`/`DELETE /leave/holidays` | `MANAGE_SETTINGS` |
 *
 * ## The request's own status is the truth
 *
 * There is no second copy of it. An `ApprovalRequest` row points at a request by
 * `subjectId` and carries no status worth trusting, so deciding in the inbox and
 * deciding on the leave screen are the **same write** — the approvals module
 * delegates to this one. That is why `lib/store/leave-api.ts` and
 * `lib/store/approvals-api.ts` are one piece of work: the interlock is real on
 * the server and has to stay real on the screen.
 *
 * ## Two things the list does not tell you
 *
 * `GET /leave/requests/:id` — and only that call — answers the two questions an
 * approver actually has:
 *
 * - **`clashes`**: who else in the company is off across the same dates. Leave
 *   gets declined because nobody would be left to cover, not because somebody
 *   ran out of days, so this belongs on the request rather than three clicks
 *   away. The list endpoint does not carry it; a screen showing a row needs the
 *   detail call before it can say anything about cover.
 * - **`balance`**: computed server-side from the requests themselves, never
 *   stored — approving moves it in the same breath. Nothing here caches it.
 *
 * ## Refusals to show verbatim
 *
 * - A clash on create is a **409** with the dates: "That overlaps an existing
 *   approved Annual request, 2026-09-14 to 2026-09-18." Show it as-is; it names
 *   the mistake and the fix.
 * - Going over an entitlement is **not** a refusal. `create` returns
 *   `warnings`, because a company may allow unpaid overdraw and maternity is
 *   statutory. Surface the warning, keep the request.
 * - Declining without a note is a 422: "Say why, so they know what to change."
 *   Ask for the note before sending, not after.
 * - Deciding a request that is already decided is a 409 telling you to reopen it
 *   first.
 *
 * ## The holiday calendar, and why it never filters
 *
 * `GET /leave/holidays` accepts `confirmedOnly`, and this wrapper never sends it.
 * That is deliberate and matches the API's own default. Nigerian holidays are
 * frequently not gazetted until days before — the Eid dates move with the lunar
 * calendar and Independence Day observance shifts when it falls at a weekend — so
 * an unconfirmed row means "expected, not announced", and it is precisely the
 * date somebody needs to plan around. A calendar that hides it hides the only
 * uncertain thing on it. Callers that genuinely need settled dates only (an SLA
 * clock) ask the API directly; no screen does.
 *
 * `awaitingProclamation` comes back beside the list so a screen can say how many
 * dates are unsettled without walking it. It is a count, not a filter.
 *
 * Writing needs `MANAGE_SETTINGS`, because five services read that table —
 * attendance status, overtime rates, payroll proration and the help desk's
 * working-hours SLA. Adding a date changes what people are paid.
 *
 * **`DELETE` is a hard delete and the API checks nothing.** No leave request,
 * payslip or timesheet references a holiday by id, so nothing refuses and nothing
 * cascades: the row goes and every one of those five readers silently recomputes
 * the day as ordinary. A screen offering the control has to say that, because
 * nothing else will. `HOLIDAY_DELETE_EFFECTS` at the bottom is that sentence,
 * written once so the dialog and the calendar cannot drift apart.
 *
 * ## Units and shapes
 *
 * No money anywhere in this module — leave is counted in days.
 *
 * Two mappings happen here and nowhere else. Statuses arrive as `PENDING` and
 * are lower-cased to the union the app has always used, so one screen renders
 * either source. `startDate`/`endDate` are date-only already; `requestedAt` and
 * `decidedAt` are timestamps and are cut to `YYYY-MM-DD`, because every date
 * helper in `lib/today.ts` is date-only and a timestamp through `shortDate`
 * reads as the wrong day in a westward timezone.
 *
 * `lib/api/endpoints.ts` still carries a thinner `leave` object from the first
 * cutover. Nothing imports it any more — this module replaces it, and that
 * section can go the next time somebody edits that file.
 */

/* ------------------------------------------------------------------ the wire */

type WireStatus = "PENDING" | "APPROVED" | "DECLINED" | "CANCELLED";

type WireRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeJobTitle: string | null;
  leaveTypeId: string;
  leaveType: string;
  /** `YYYY-MM-DD`. */
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: WireStatus;
  approverId: string | null;
  approverName: string | null;
  /** Full ISO timestamps. */
  requestedAt: string;
  decidedAt: string | null;
  decidedById: string | null;
  decisionNote: string | null;
};

type WireDetail = WireRequest & {
  clashes: {
    id: string;
    employeeId: string;
    employeeName: string;
    startDate: string;
    endDate: string;
    status: WireStatus;
  }[];
  balance: WireBalance | null;
};

type WireBalance = {
  leaveTypeId: string;
  leaveType: string;
  year: number;
  entitled: number;
  openingTaken: number;
  carriedIn: number;
  taken: number;
  pending: number;
  remaining: number;
};

type WireHoliday = {
  id: string;
  /** `YYYY-MM-DD`, or a timestamp. Cut to the day either way. */
  date: string;
  name: string;
  confirmed: boolean;
};

/** `GET /leave/holidays` answers an object, not an array. */
type WireHolidayList = {
  holidays: WireHoliday[];
  awaitingProclamation: number;
};

type WireType = {
  id: string;
  name: string;
  entitledDays: number;
  accrual: string;
  carryOverMax: number;
  carryOverExpiresMonths: number;
  requiresEvidence: boolean;
  minNoticeDays: number;
  isPaid: boolean;
};

/* ---------------------------------------------------------------- the shapes */

/** Matches the union in `lib/mock/workflows.ts`, so one screen renders both. */
export type LeaveRowStatus = "pending" | "approved" | "declined" | "cancelled";

/**
 * One leave request, in the shape the screens use.
 *
 * `from`/`to` rather than `startDate`/`endDate` because that is what the app's
 * own leave rows have always been called, and the point of this type is that a
 * screen cannot tell which source it came from.
 */
export type LeaveRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeJobTitle: string | null;
  /** Null in demo mode, where a type is a name and not a record. */
  leaveTypeId: string | null;
  leaveType: string;
  from: string;
  to: string;
  days: number;
  status: LeaveRowStatus;
  reason: string | null;
  approverId: string | null;
  approverName: string | null;
  /** `YYYY-MM-DD`, not a timestamp. See the header. */
  requestedAt: string | null;
  decidedAt: string | null;
  decidedById: string | null;
  decisionNote: string | null;
};

/** Somebody else off across the same dates. The cover question. */
export type LeaveClash = {
  id: string;
  employeeId: string;
  employeeName: string;
  from: string;
  to: string;
  status: LeaveRowStatus;
};

export type LeaveBalanceRow = {
  leaveTypeId: string | null;
  leaveType: string;
  year: number;
  /** Entitlement plus anything carried in. */
  entitled: number;
  carriedIn: number;
  taken: number;
  pending: number;
  /** Entitled less taken less pending. Pending is held back on purpose. */
  remaining: number;
};

export type LeaveDetail = {
  request: LeaveRow;
  clashes: LeaveClash[];
  /** The balance this request draws down. Null when the type has none. */
  balance: LeaveBalanceRow | null;
};

/** The wire's own casing for accrual, matching `LeaveAccrual` in the schema. */
export type LeaveAccrualWire = "ANNUAL_UPFRONT" | "MONTHLY" | "ON_COMPLETION";

export type LeaveTypeRow = {
  id: string | null;
  name: string;
  entitledDays: number;
  accrual: LeaveAccrualWire;
  carryOverMax: number;
  carryOverExpiresMonths: number;
  requiresEvidence: boolean;
  minNoticeDays: number;
  isPaid: boolean;
};

/**
 * A leave type a company is adding for itself.
 *
 * Only the two fields a balance cannot be computed without are required, which
 * mirrors the API's schema — every other field has the same default as its
 * column, so "Study leave, 5 days" is two inputs rather than eight.
 */
export type NewLeaveType = {
  name: string;
  entitledDays: number;
  accrual?: LeaveAccrualWire;
  carryOverMax?: number;
  carryOverExpiresMonths?: number;
  requiresEvidence?: boolean;
  minNoticeDays?: number;
  isPaid?: boolean;
};

/** Every field optional — `PATCH /leave/types/:id` accepts any subset. */
export type LeaveTypePatch = Partial<NewLeaveType>;

/**
 * One public holiday.
 *
 * `confirmed` is the load-bearing field. An unconfirmed holiday is shown as
 * awaiting proclamation, never assumed — a company that rosters against an Eid
 * date the government has not yet declared has rostered against a guess.
 *
 * The `id` is what edit, confirm and delete address, so it is not optional in
 * either mode: the demo store mints its own rather than keying on the date, which
 * would break the moment somebody corrected one.
 */
export type PublicHolidayRow = {
  id: string;
  /** `YYYY-MM-DD`. */
  date: string;
  name: string;
  confirmed: boolean;
};

/**
 * The calendar, with the count that is worth surfacing beside it.
 *
 * `awaitingProclamation` is the API's own figure, not `holidays.filter(...)`
 * length recomputed here. Same number today; a second implementation is still a
 * second thing to keep in step.
 */
export type HolidayCalendar = {
  holidays: PublicHolidayRow[];
  awaitingProclamation: number;
};

export type NewHolidayInput = {
  /** `YYYY-MM-DD`. */
  date: string;
  name: string;
  /**
   * Absent means confirmed, matching the API and the column default. Somebody
   * adding a date they have seen proclaimed should not have to say so twice.
   */
  confirmed?: boolean;
};

export type HolidayPatch = {
  date?: string;
  name?: string;
  confirmed?: boolean;
};

export type LeaveListParams = {
  employeeId?: string;
  leaveTypeId?: string;
  status?: LeaveRowStatus;
  /** `YYYY-MM-DD`. `from` filters on the end date, `to` on the start date. */
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

export type NewLeaveInput = {
  employeeId: string;
  leaveTypeId: string;
  from: string;
  to: string;
  reason?: string;
  approverId?: string;
};

/* --------------------------------------------------------------- the mapping */

const statusOf = (wire: WireStatus): LeaveRowStatus =>
  wire.toLowerCase() as LeaveRowStatus;

/** A timestamp to the day it fell on. See the header on why. */
const dayOf = (iso: string | null): string | null => iso?.slice(0, 10) ?? null;

function toRow(wire: WireRequest): LeaveRow {
  return {
    id: wire.id,
    employeeId: wire.employeeId,
    employeeName: wire.employeeName,
    employeeJobTitle: wire.employeeJobTitle,
    leaveTypeId: wire.leaveTypeId,
    leaveType: wire.leaveType,
    from: wire.startDate.slice(0, 10),
    to: wire.endDate.slice(0, 10),
    days: wire.days,
    status: statusOf(wire.status),
    reason: wire.reason,
    approverId: wire.approverId,
    approverName: wire.approverName,
    requestedAt: dayOf(wire.requestedAt),
    decidedAt: dayOf(wire.decidedAt),
    decidedById: wire.decidedById,
    decisionNote: wire.decisionNote,
  };
}

function toBalance(wire: WireBalance): LeaveBalanceRow {
  return {
    leaveTypeId: wire.leaveTypeId,
    leaveType: wire.leaveType,
    year: wire.year,
    entitled: wire.entitled,
    carriedIn: wire.carriedIn,
    taken: wire.taken,
    pending: wire.pending,
    remaining: wire.remaining,
  };
}

function toDetail(wire: WireDetail): LeaveDetail {
  return {
    request: toRow(wire),
    clashes: wire.clashes.map((clash) => ({
      id: clash.id,
      employeeId: clash.employeeId,
      employeeName: clash.employeeName,
      from: clash.startDate.slice(0, 10),
      to: clash.endDate.slice(0, 10),
      status: statusOf(clash.status),
    })),
    balance: wire.balance ? toBalance(wire.balance) : null,
  };
}

const toHoliday = (wire: WireHoliday): PublicHolidayRow => ({
  id: wire.id,
  date: wire.date.slice(0, 10),
  name: wire.name,
  confirmed: wire.confirmed,
});

const toType = (wire: WireType): LeaveTypeRow => ({
  id: wire.id,
  name: wire.name,
  entitledDays: wire.entitledDays,
  accrual: wire.accrual as LeaveAccrualWire,
  carryOverMax: wire.carryOverMax,
  carryOverExpiresMonths: wire.carryOverExpiresMonths,
  requiresEvidence: wire.requiresEvidence,
  minNoticeDays: wire.minNoticeDays,
  isPaid: wire.isPaid,
});

/* ------------------------------------------------------------------- the api */

export const leaveApi = {
  types: async (signal?: AbortSignal): Promise<LeaveTypeRow[]> =>
    (
      await request<WireType[]>("/leave/types", { ...(signal ? { signal } : {}) })
    ).map(toType),

  /**
   * Add a leave type of the company's own.
   *
   * The API's schema defaults every field except the two a balance cannot be
   * computed without, so this takes the same shape: name and days required,
   * everything else optional.
   */
  createType: async (input: NewLeaveType): Promise<LeaveTypeRow> =>
    toType(
      await request<WireType>("/leave/types", {
        method: "POST",
        body: input,
      }),
    ),

  /**
   * Edit one of the company's own leave types.
   *
   * `entitled` here is the divisor every balance in the product is measured
   * against, so a `PATCH` genuinely moves `/people/leave`, every employee
   * record and the booking form — the same figure, not a copy of it.
   */
  updateType: async (id: string, patch: LeaveTypePatch): Promise<LeaveTypeRow> =>
    toType(
      await request<WireType>(`/leave/types/${id}`, {
        method: "PATCH",
        body: patch,
      }),
    ),

  /**
   * Switch one off. Archive, not delete — see `archiveType` in the API service.
   *
   * Returns how many requests were raised against it, so the screen can say what
   * stays on the record rather than implying the history goes too.
   */
  archiveType: (id: string): Promise<{ name: string; total?: number }> =>
    request<{ name: string; total?: number }>(`/leave/types/${id}`, {
      method: "DELETE",
    }),

  restoreType: (id: string): Promise<{ name: string }> =>
    request<{ name: string }>(`/leave/types/${id}/restore`, { method: "POST" }),

  list: async (
    params: LeaveListParams = {},
    signal?: AbortSignal,
  ): Promise<{ rows: LeaveRow[]; total: number }> => {
    const page = await requestPaged<WireRequest>("/leave/requests", {
      query: {
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 100,
        employeeId: params.employeeId,
        leaveTypeId: params.leaveTypeId,
        status: params.status?.toUpperCase(),
        from: params.from,
        to: params.to,
      },
      ...(signal ? { signal } : {}),
    });
    return { rows: page.data.map(toRow), total: page.meta.total };
  },

  /** The only call that carries clashes and the balance. */
  get: async (id: string, signal?: AbortSignal): Promise<LeaveDetail> =>
    toDetail(
      await request<WireDetail>(`/leave/requests/${id}`, {
        ...(signal ? { signal } : {}),
      }),
    ),

  create: async (
    input: NewLeaveInput,
  ): Promise<{ request: LeaveRow; warnings: string[] }> => {
    const result = await request<{ request: WireRequest; warnings: string[] }>(
      "/leave/requests",
      {
        method: "POST",
        body: {
          employeeId: input.employeeId,
          leaveTypeId: input.leaveTypeId,
          startDate: input.from,
          endDate: input.to,
          ...(input.reason ? { reason: input.reason } : {}),
          ...(input.approverId ? { approverId: input.approverId } : {}),
        },
      },
    );
    return { request: toRow(result.request), warnings: result.warnings };
  },

  /** A decline without a note is refused by the API. Ask first. */
  decide: async (
    id: string,
    decision: "approve" | "decline",
    note?: string,
  ): Promise<LeaveRow> =>
    toRow(
      await request<WireRequest>(`/leave/requests/${id}/decide`, {
        method: "POST",
        body: { decision, ...(note ? { note } : {}) },
      }),
    ),

  reopen: async (id: string): Promise<LeaveRow> =>
    toRow(
      await request<WireRequest>(`/leave/requests/${id}/reopen`, {
        method: "POST",
      }),
    ),

  cancel: async (id: string): Promise<LeaveRow> =>
    toRow(
      await request<WireRequest>(`/leave/requests/${id}/cancel`, {
        method: "POST",
      }),
    ),

  /**
   * The company's holiday calendar for a year, or every year on file.
   *
   * `confirmedOnly` is never sent. See the header: the unconfirmed dates are the
   * ones the calendar exists for.
   */
  holidays: async (year?: number, signal?: AbortSignal): Promise<HolidayCalendar> => {
    const wire = await request<WireHolidayList>("/leave/holidays", {
      ...(year ? { query: { year } } : {}),
      ...(signal ? { signal } : {}),
    });
    return {
      holidays: wire.holidays.map(toHoliday),
      awaitingProclamation: wire.awaitingProclamation,
    };
  },

  /**
   * Adds a date. Writes return the id and nothing else, which is the API's
   * convention throughout — a caller that wants the row reads the list again.
   *
   * A same-date, same-name duplicate is a 409 naming both. Show it verbatim.
   */
  createHoliday: async (input: NewHolidayInput): Promise<{ id: string }> =>
    request<{ id: string }>("/leave/holidays", {
      method: "POST",
      body: {
        date: input.date,
        name: input.name,
        ...(input.confirmed === undefined ? {} : { confirmed: input.confirmed }),
      },
    }),

  /** In practice: confirming one that has been proclaimed. */
  updateHoliday: async (id: string, patch: HolidayPatch): Promise<{ id: string }> =>
    request<{ id: string }>(`/leave/holidays/${id}`, {
      method: "PATCH",
      body: {
        ...(patch.date === undefined ? {} : { date: patch.date }),
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.confirmed === undefined ? {} : { confirmed: patch.confirmed }),
      },
    }),

  /** Hard. Nothing is checked, nothing cascades — see the header. */
  deleteHoliday: async (id: string): Promise<{ id: string }> =>
    request<{ id: string }>(`/leave/holidays/${id}`, { method: "DELETE" }),

  balances: async (
    employeeId: string,
    year?: number,
    signal?: AbortSignal,
  ): Promise<LeaveBalanceRow[]> =>
    (
      await request<WireBalance[]>(`/leave/balances/${employeeId}`, {
        ...(year ? { query: { year } } : {}),
        ...(signal ? { signal } : {}),
      })
    ).map(toBalance),
};

/* ---------------------------------------------------------------- for screens */

/** `1` → `1 day`. Used in three places and got the plural wrong in one of them. */
export const daysLabel = (days: number): string =>
  `${days} ${days === 1 ? "day" : "days"}`;

/**
 * What removing a date actually does, in the order it bites.
 *
 * Every line was read out of the API rather than assumed, because the shape of
 * this hazard is not what it looks like. There is no foreign key from a leave
 * request, a payslip or a timesheet to a `PublicHoliday` — the readers all match
 * on the date — so `DELETE /leave/holidays/:id` has nothing to check and checks
 * nothing. It is a hard delete that succeeds quietly and moves numbers on four
 * other screens. A confirm dialog that only says "are you sure" is a lie by
 * omission here.
 *
 * Sources: `leave/service.ts#deleteHoliday` (the hard delete and why),
 * `payroll/assemble.ts#unpaidDaysFor`, `overtime/service.ts`,
 * `attendance/service.ts` and `helpdesk/working-hours.ts`.
 */
export const HOLIDAY_DELETE_EFFECTS: readonly string[] = [
  "Nothing refuses it. No leave request, payslip or timesheet points at a holiday by id, so there is no reference to check and the API checks none.",
  "Leave already approved keeps its day count. A request stores the days it was granted and that figure does not move.",
  "The date becomes an ordinary day again everywhere the calendar is read live — the attendance timesheet, overtime rates, the unpaid days payroll prorates against, and the help desk's response clock.",
  "A payroll run already approved keeps its own figures. A run not yet made will come out different.",
];

/**
 * Which readers already act on an unconfirmed date, and which wait.
 *
 * The split is real and it is not tidy, which is why it is worth stating on
 * screen. Payroll's unpaid-day count and the overtime calculation read every row
 * and do not look at `confirmed`; attendance's day status and the help desk's SLA
 * clock filter to `confirmed: true`, on the reasoning that you cannot excuse a
 * breach with a holiday nobody declared. So an expected date is already costing
 * money before it is announced, and still shows as a working day on the
 * timesheet.
 */
export const UNCONFIRMED_HOLIDAY_EFFECT = {
  acts: "Payroll proration and overtime rates already treat these as holidays.",
  waits:
    "The attendance timesheet and the help desk's response clock keep treating them as working days until they are confirmed.",
} as const;

/** How a decided request reads. `pending` is deliberately absent — it has none. */
export const DECISION_LABEL: Record<LeaveRowStatus, string> = {
  pending: "Waiting on a decision",
  approved: "Approved",
  declined: "Sent back",
  cancelled: "Withdrawn",
};
