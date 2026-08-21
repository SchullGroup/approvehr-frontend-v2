"use client";

import { ApiError, request, requestPaged } from "@/lib/api/client";

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
 * | Public holidays | `GET /leave/holidays` | nothing — **no route yet, see below** |
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
 * ## The holiday calendar is data, and no route serves it yet
 *
 * `PublicHoliday` is a real model with a real `confirmed` flag, because Nigerian
 * holidays are proclaimed at short notice and the Eid dates move with the lunar
 * calendar — which is the whole reason they are rows and not a constant. Three
 * services read that table (attendance, overtime, payroll proration) and **no
 * endpoint returns it.** `GET /leave/holidays` is where it belongs; asking for it
 * today answers 404.
 *
 * So `holidays()` returns `null` on that 404 instead of throwing, and the screen
 * says the calendar is not published rather than quietly showing the demo list.
 * Falling back would put four seeded dates under a badge reading "Live from the
 * API", which is the one thing the two-mode design exists to prevent. When the
 * route lands, delete the `null` branch — nothing else changes.
 *
 * The one endpoint that does carry holiday names is `GET /helpdesk/analytics`,
 * and it is the wrong source twice over: it needs `EDIT_RECORDS`, and it filters
 * to `confirmed: true`, so it would drop precisely the awaiting-proclamation
 * dates this card exists to flag.
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

export type LeaveTypeRow = {
  id: string | null;
  name: string;
  entitledDays: number;
  carryOverMax: number;
  requiresEvidence: boolean;
  minNoticeDays: number;
  isPaid: boolean;
};

/**
 * One public holiday.
 *
 * `confirmed` is the load-bearing field. An unconfirmed holiday is shown as
 * awaiting proclamation, never assumed — a company that rosters against an Eid
 * date the government has not yet declared has rostered against a guess.
 */
export type PublicHolidayRow = {
  /** `YYYY-MM-DD`. */
  date: string;
  name: string;
  confirmed: boolean;
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

const toType = (wire: WireType): LeaveTypeRow => ({
  id: wire.id,
  name: wire.name,
  entitledDays: wire.entitledDays,
  carryOverMax: wire.carryOverMax,
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
   * The company's holiday calendar, or `null` when the API does not serve one.
   *
   * `null` rather than `[]` because the two mean opposite things to a reader: an
   * empty array is "we looked and there are none", and this is "nobody can
   * answer that question yet". A 404 on a collection route is the route being
   * absent, not a missing record — see the header. Every other failure still
   * throws, so a 403 or a network drop is not silently read as "no calendar".
   */
  holidays: async (
    year?: number,
    signal?: AbortSignal,
  ): Promise<PublicHolidayRow[] | null> => {
    try {
      const rows = await request<WireHoliday[]>("/leave/holidays", {
        ...(year ? { query: { year } } : {}),
        ...(signal ? { signal } : {}),
      });
      return rows.map((wire) => ({
        date: wire.date.slice(0, 10),
        name: wire.name,
        confirmed: wire.confirmed,
      }));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },

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

/** How a decided request reads. `pending` is deliberately absent — it has none. */
export const DECISION_LABEL: Record<LeaveRowStatus, string> = {
  pending: "Waiting on a decision",
  approved: "Approved",
  declined: "Sent back",
  cancelled: "Withdrawn",
};
