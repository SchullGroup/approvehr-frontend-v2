"use client";

import { request, requestPaged, type Paged } from "@/lib/api/client";

/**
 * The help desk — `/api/v1/helpdesk`.
 *
 * Typed wrappers plus the small amount of arithmetic a queue row needs. No
 * React, no state: this file knows the shape of the wire and nothing else.
 *
 * ## There is no money in this module
 *
 * Nothing here is an amount, so nothing here divides by 100. If a ticket ever
 * grows a cost, convert it in this file and nowhere else — same rule as
 * `loans.ts`.
 *
 * ## Every duration is in *working* minutes
 *
 * This is the one thing to get right, and the backend is emphatic about it (see
 * `modules/helpdesk/working-hours.ts`). The company's day is 08:00–17:00 on
 * working weekdays, holidays excluded, so a ticket raised at 5pm on Friday has
 * used **no** time by Monday morning. Two consequences for anything rendering
 * these numbers:
 *
 * 1. **Never turn a working minute into a clock hour.** "480 minutes" is eight
 *    working hours, which is most of a day and a bit — not "by 1am tonight".
 *    `formatWorkingMinutes` is the only formatter, and it always says
 *    "working". A screen that drops the word is making a promise the backend
 *    did not make.
 * 2. **Never subtract two timestamps here.** `openWorkingMinutes`,
 *    `responseWorkingMinutes` and `resolutionWorkingMinutes` are already
 *    counted against the company's own calendar. A `Date.now()` difference
 *    would charge the weekend.
 *
 * `minutesPerDay` comes from `GET /helpdesk/sla` (`workingDay.minutesPerDay`).
 * It decides when a figure stops reading as hours and starts reading as days,
 * so pass it through rather than assuming nine.
 *
 * ## Three lists, one row shape
 *
 * | | Scope | Permission |
 * |---|---|---|
 * | `queue` | every ticket in the company | `EDIT_RECORDS` |
 * | `mine` | tickets I raised | none — they are mine |
 * | `assigned` | tickets on my desk | none |
 *
 * One shape means the staff view is the queue with a different scope, which is
 * how `/help` renders one route to two audiences.
 *
 * ## `showsInternalNotes` is the whole visibility contract
 *
 * The API filters internal notes out before they reach the wire, and it does it
 * for the **requester** whatever permissions they hold — an HR administrator
 * reading a ticket they raised themselves does not see the notes on it. So the
 * client never decides who may read a note. `showsInternalNotes` only says
 * whether this reader is being shown them, which is what the composer needs in
 * order not to offer a control the API would refuse.
 */

/* ------------------------------------------------------------------- shapes */

/** Mirrors `TicketStatus` in the Prisma schema. */
export type TicketStatus = "OPEN" | "IN_PROGRESS" | "WAITING" | "RESOLVED";

/** Mirrors `TicketPriority`. Three levels, deliberately — not five. */
export type TicketPriority = "LOW" | "NORMAL" | "HIGH";

/** A person as the help desk joins them in. One name, not two fields. */
export type ApiPerson = {
  id: string;
  name: string;
  employeeNo: string | null;
};

/**
 * The targets that were in force when the ticket was raised. Never today's.
 *
 * Editing a policy changes what the *next* ticket promises. Re-classifying a
 * ticket does not move a clock that has already started. Both rules live in the
 * backend's `sla.ts`; the client just prints what it is given.
 */
export type ApiTicketSla = {
  policyId: string | null;
  policyName: string | null;
  firstResponseMinutes: number | null;
  resolutionMinutes: number | null;
};

export type ApiTicket = {
  id: string;
  /** What people say out loud: "HR-2841". */
  reference: string;
  subject: string;
  body: string | null;
  /** The denormalised label. Present even when `categoryId` is null. */
  category: string;
  categoryId: string | null;
  categoryName: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  requester: ApiPerson | null;
  assignee: ApiPerson | null;
  raisedAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  sla: ApiTicketSla | null;
  responseDueAt: string | null;
  resolutionDueAt: string | null;
  /** When somebody other than the requester first replied in public. */
  firstRespondedAt: string | null;
  responseWorkingMinutes: number | null;
  resolutionWorkingMinutes: number | null;
  /** Working minutes since it was raised, or until it was resolved. */
  openWorkingMinutes: number;
  responseBreached: boolean;
  resolutionBreached: boolean;
  /** Comments **this reader** may see. Not the row count. */
  commentCount: number;
  /** Whether internal notes are part of what this reader is being shown. */
  showsInternalNotes: boolean;
};

export type ApiTicketComment = {
  id: string;
  author: ApiPerson | null;
  body: string;
  internal: boolean;
  createdAt: string;
};

/** `GET /helpdesk/tickets/:id`, and the answer to every ticket write. */
export type ApiTicketDetail = ApiTicket & {
  /** Oldest first. A thread is read downwards. */
  comments: ApiTicketComment[];
};

/** A policy as `GET /helpdesk/sla` returns it. */
export type ApiSlaPolicy = {
  id: string;
  name: string;
  priority: TicketPriority;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  /** The same figures in working days, for somebody judging a target. */
  firstResponseWorkingDays: number;
  resolutionWorkingDays: number;
  active: boolean;
  categories: { id: string; name: string }[];
};

/** When the company is open. Every working-minute figure is measured against it. */
export type ApiWorkingDay = {
  timeZone: string;
  /** `HH:MM` local. */
  opensAt: string;
  closesAt: string;
  /** ISO weekdays. 1 = Monday … 7 = Sunday. */
  weekdays: number[];
  minutesPerDay: number;
  /** Local `YYYY-MM-DD` dates the company is closed. */
  holidays: string[];
};

export type ApiSlaList = {
  workingDay: ApiWorkingDay;
  policies: ApiSlaPolicy[];
};

/** A category, with the target attached. Readable by anyone signed in. */
export type ApiTicketCategory = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  defaultAssignee: ApiPerson | null;
  sla: {
    id: string;
    name: string;
    priority: TicketPriority;
    firstResponseMinutes: number;
    resolutionMinutes: number;
    active: boolean;
  } | null;
  tickets: number;
  openTickets: number;
};

/** `GET /helpdesk/analytics`. Behind `EDIT_RECORDS`. */
export type ApiHelpdeskAnalytics = {
  from: string;
  to: string;
  workingDay: ApiWorkingDay & {
    holidaysInPeriod: { date: string; name: string }[];
  };
  volume: {
    raised: number;
    resolved: number;
    stillOpen: number;
    byCategory: { name: string; count: number }[];
    byPriority: { name: string; count: number }[];
    byStatus: { name: string; count: number }[];
  };
  firstResponse: {
    medianWorkingMinutes: number | null;
    measured: number;
    /** Open tickets nobody has replied to. The number that needs a person. */
    unanswered: number;
  };
  resolution: {
    medianWorkingMinutes: number | null;
    measured: number;
  };
  breaches: {
    response: number;
    resolution: number;
    /** Raised with no policy in force. Not breaches — no promise was made. */
    withoutTarget: number;
  };
  /** The API's own caveat: nothing chases a target between page loads. */
  note: string;
};

/* -------------------------------------------------------------------- input */

/**
 * The queue query.
 *
 * `overdue` and `openOnly` are three-state on the wire — absent means "do not
 * filter", which is not the same as `false`. Leave them undefined rather than
 * sending false, or "on time only" becomes unaskable.
 *
 * `sort` is an allow-list: `createdAt | updatedAt | targetAt | priority |
 * status`. `targetAt` ascending is triage order — soonest promise first, and
 * Postgres puts the tickets with no target last on its own.
 */
export type TicketListParams = {
  page?: number;
  pageSize?: number;
  sort?: "createdAt" | "updatedAt" | "targetAt" | "priority" | "status";
  order?: "asc" | "desc";
  q?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  categoryId?: string;
  assigneeId?: string;
  unassigned?: boolean;
  /** Open tickets whose **response** target has already passed. */
  overdue?: boolean;
  openOnly?: boolean;
};

/**
 * Raising one. Three things the person actually knows.
 *
 * `priority` is left off deliberately — the API defaults it to NORMAL, and
 * asking somebody to grade their own problem produces a queue of urgent
 * everything. Somebody triaging changes it afterwards.
 *
 * `requesterId` raises it on another person's behalf and needs `EDIT_RECORDS`.
 */
export type CreateTicketBody = {
  subject: string;
  body?: string;
  categoryId?: string;
  priority?: TicketPriority;
  requesterId?: string;
};

export type UpdateTicketBody = {
  subject?: string;
  body?: string | null;
  priority?: TicketPriority;
  categoryId?: string | null;
  /** Resolving has its own route, because it takes an answer. */
  status?: "OPEN" | "IN_PROGRESS" | "WAITING";
};

/** `internal: true` is refused for the requester — on the way in, not just out. */
export type CommentBody = {
  body: string;
  internal?: boolean;
};

/* -------------------------------------------------------------------- calls */

const listQuery = (params: TicketListParams) => ({
  page: params.page,
  pageSize: params.pageSize,
  sort: params.sort,
  order: params.order,
  q: params.q,
  status: params.status,
  priority: params.priority,
  categoryId: params.categoryId,
  assigneeId: params.assigneeId,
  /* Booleans go over as the string literals the schema's three-state flag
     parses, and only when they were actually asked for. */
  unassigned: params.unassigned === undefined ? undefined : String(params.unassigned),
  overdue: params.overdue === undefined ? undefined : String(params.overdue),
  openOnly: params.openOnly === undefined ? undefined : String(params.openOnly),
});

export const helpdeskApi = {
  /** Every ticket in the company. Needs `EDIT_RECORDS`. */
  queue: (params: TicketListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiTicket>("/helpdesk/tickets", {
      query: listQuery(params),
      ...(signal ? { signal } : {}),
    }),

  /** Tickets I raised. Mine to read whatever permissions I hold. */
  mine: (params: TicketListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiTicket>("/helpdesk/tickets/mine", {
      query: listQuery(params),
      ...(signal ? { signal } : {}),
    }),

  /** Tickets on my desk. */
  assigned: (params: TicketListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiTicket>("/helpdesk/tickets/assigned", {
      query: listQuery(params),
      ...(signal ? { signal } : {}),
    }),

  get: (id: string, signal?: AbortSignal) =>
    request<ApiTicketDetail>(`/helpdesk/tickets/${id}`, {
      ...(signal ? { signal } : {}),
    }),

  create: (body: CreateTicketBody) =>
    request<ApiTicket>("/helpdesk/tickets", { method: "POST", body }),

  update: (id: string, body: UpdateTicketBody) =>
    request<ApiTicketDetail>(`/helpdesk/tickets/${id}`, { method: "PATCH", body }),

  /** `null` puts it back in the unassigned queue. */
  assign: (id: string, assigneeId: string | null) =>
    request<ApiTicketDetail>(`/helpdesk/tickets/${id}/assign`, {
      method: "POST",
      body: { assigneeId },
    }),

  /**
   * The answer, and the resolution in one step.
   *
   * The resolution is posted as a public comment, not a private field: marking
   * something sorted without saying what happened is how the same ticket comes
   * back a week later.
   */
  resolve: (id: string, resolution: string) =>
    request<ApiTicketDetail>(`/helpdesk/tickets/${id}/resolve`, {
      method: "POST",
      body: { resolution },
    }),

  /** The requester can do this themselves. The reason is optional. */
  reopen: (id: string, reason?: string) =>
    request<ApiTicketDetail>(`/helpdesk/tickets/${id}/reopen`, {
      method: "POST",
      body: reason ? { reason } : {},
    }),

  /**
   * The thread, paged.
   *
   * `GET /helpdesk/tickets/:id` already carries the whole visible thread, so
   * the detail drawer uses that and this stays for a ticket long enough to
   * need paging.
   */
  comments: (id: string, page = 1, pageSize = 100, signal?: AbortSignal) =>
    requestPaged<ApiTicketComment>(`/helpdesk/tickets/${id}/comments`, {
      query: { page, pageSize, order: "asc" },
      ...(signal ? { signal } : {}),
    }),

  comment: (id: string, body: CommentBody) =>
    request<{ id: string; ticketId: string; internal: boolean }>(
      `/helpdesk/tickets/${id}/comments`,
      { method: "POST", body },
    ),

  /** Readable by anyone: a person raising a ticket has to see the list. */
  categories: (includeInactive = false, signal?: AbortSignal) =>
    request<ApiTicketCategory[]>("/helpdesk/categories", {
      query: { includeInactive: String(includeInactive) },
      ...(signal ? { signal } : {}),
    }),

  /** Also readable by anyone — and where `workingDay` comes from. */
  sla: (includeInactive = false, signal?: AbortSignal) =>
    request<ApiSlaList>("/helpdesk/sla", {
      query: { includeInactive: String(includeInactive) },
      ...(signal ? { signal } : {}),
    }),

  analytics: (
    range: { from?: string; to?: string } = {},
    signal?: AbortSignal,
  ) =>
    request<ApiHelpdeskAnalytics>("/helpdesk/analytics", {
      query: { from: range.from, to: range.to },
      ...(signal ? { signal } : {}),
    }),
};

export type PagedTickets = Paged<ApiTicket>;

/* ----------------------------------------------------- the working-day maths */

/**
 * The 08:00–17:00 weekday the backend defaults to, for before `/sla` answers.
 *
 * A fallback rather than a constant: a company on a six-day week or a different
 * zone gets its own figures from the API, and this only decides whether a
 * number reads as hours or as days until then.
 */
export const WORKING_DAY_FALLBACK: ApiWorkingDay = {
  timeZone: "Africa/Lagos",
  opensAt: "08:00",
  closesAt: "17:00",
  weekdays: [1, 2, 3, 4, 5],
  minutesPerDay: 540,
  holidays: [],
};

/** Trims `1.0` to `1` so a target reads as "4 working hours", not "4.0". */
const trim = (value: number): string =>
  (Math.round(value * 10) / 10).toString().replace(/\.0$/, "");

/**
 * A count of working minutes, in words.
 *
 * Always says "working", at every scale, because the number is not clock time
 * and a reader who assumes it is will expect an answer on a Saturday. Under an
 * hour is the one case that drops the word — "40 working minutes" reads as
 * jargon and no target that short is a promise anybody makes.
 */
export function formatWorkingMinutes(
  minutes: number,
  minutesPerDay: number = WORKING_DAY_FALLBACK.minutesPerDay,
): string {
  const safeDay = minutesPerDay > 0 ? minutesPerDay : WORKING_DAY_FALLBACK.minutesPerDay;
  const value = Math.max(0, Math.round(minutes));

  if (value < 1) return "under a minute";
  if (value < 60) return `${value} minute${value === 1 ? "" : "s"}`;
  if (value < safeDay) {
    const hours = trim(value / 60);
    return `${hours} working hour${hours === "1" ? "" : "s"}`;
  }
  const days = trim(value / safeDay);
  return `${days} working day${days === "1" ? "" : "s"}`;
}

/**
 * The one number somebody raising a ticket wants: when they will hear back.
 *
 * Returns null where no policy applies, which is a normal state — a company
 * that has not set targets yet has tickets with no deadline, and inventing one
 * would put a promise on screen that nothing behind it keeps.
 */
export function responseTargetLine(
  firstResponseMinutes: number | null | undefined,
  minutesPerDay: number = WORKING_DAY_FALLBACK.minutesPerDay,
): string | null {
  if (firstResponseMinutes === null || firstResponseMinutes === undefined) return null;
  return `Usually answered within ${formatWorkingMinutes(
    firstResponseMinutes,
    minutesPerDay,
  )}.`;
}

/**
 * Where a ticket stands against the promise made when it was raised.
 *
 * `overdue` is taken from the API's own `responseBreached` /
 * `resolutionBreached` rather than recomputed from the minutes, because those
 * flags were worked out against the company's calendar including its holidays —
 * which this side does not have. The minutes are used only to say *by how much*.
 *
 * Which promise is being measured switches at the first public reply: before
 * one, the person is waiting to hear anything, so it is the response target;
 * after, they are waiting for it to be fixed.
 */
export type TicketClockState =
  | "no_target"
  | "on_time"
  | "due_soon"
  | "overdue"
  | "resolved_late"
  | "resolved";

export type TicketClock = {
  state: TicketClockState;
  /** The phrase a badge prints. Carries the meaning on its own — never colour. */
  label: string;
  /** How long it has been waiting, in words. */
  waited: string;
  /** Which promise `label` is about, for a screen that wants to say so. */
  against: "response" | "resolution" | null;
};

export function ticketClock(
  ticket: ApiTicket,
  minutesPerDay: number = WORKING_DAY_FALLBACK.minutesPerDay,
): TicketClock {
  const waited = formatWorkingMinutes(ticket.openWorkingMinutes, minutesPerDay);

  if (ticket.status === "RESOLVED") {
    const took =
      ticket.resolutionWorkingMinutes === null
        ? null
        : formatWorkingMinutes(ticket.resolutionWorkingMinutes, minutesPerDay);
    const sorted = took === null ? "Sorted" : `Sorted in ${took}`;
    return ticket.resolutionBreached
      ? {
          state: "resolved_late",
          label: `${sorted} — past target`,
          waited,
          against: "resolution",
        }
      : { state: "resolved", label: sorted, waited, against: "resolution" };
  }

  const awaitingFirstReply = ticket.firstRespondedAt === null;
  const against: "response" | "resolution" = awaitingFirstReply
    ? "response"
    : "resolution";
  const target = awaitingFirstReply
    ? (ticket.sla?.firstResponseMinutes ?? null)
    : (ticket.sla?.resolutionMinutes ?? null);
  const breached = awaitingFirstReply
    ? ticket.responseBreached
    : ticket.resolutionBreached;

  if (breached) {
    const over = target === null ? 0 : ticket.openWorkingMinutes - target;
    return {
      state: "overdue",
      label:
        over > 0
          ? `Overdue by ${formatWorkingMinutes(over, minutesPerDay)}`
          : "Overdue",
      waited,
      against,
    };
  }

  if (target === null) {
    return { state: "no_target", label: `Waiting ${waited}`, waited, against: null };
  }

  const remaining = Math.max(0, target - ticket.openWorkingMinutes);
  /* A quarter of the target left, or half an hour, whichever is longer. Under a
     four-working-hour promise that is the last hour; under a two-day one it is
     the last half day, which is when somebody can still do something. */
  const closeToBreaching = remaining <= Math.max(30, Math.round(target * 0.25));

  return {
    state: closeToBreaching ? "due_soon" : "on_time",
    label: closeToBreaching
      ? `Due in ${formatWorkingMinutes(remaining, minutesPerDay)}`
      : `${formatWorkingMinutes(remaining, minutesPerDay)} left`,
    waited,
    against,
  };
}
