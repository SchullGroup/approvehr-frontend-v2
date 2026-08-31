"use client";

import { request, requestPaged, type Paged } from "@/lib/api/client";

/**
 * The audit trail — `/api/v1/audit`.
 *
 * Typed wrappers only, in the same hand-written style as the rest of
 * `lib/api/*`. Five calls, and every one of them needs `VIEW_AUDIT`.
 *
 * ## Nothing here converts money, and that is not an oversight
 *
 * The API's rule is that money crosses as integer kobo, and this module is the
 * one place that cannot honour it at the boundary: a `diff` is arbitrary JSON,
 * so which of its keys hold money is only knowable from the key's *name*. The
 * conversion therefore happens where the name is in hand —
 * `formatFieldValue` in `lib/audit/language.ts`, keyed on a field ending in
 * `Kobo`. That is still one seam, just a later one, and it is the only one.
 *
 * Most pay figures never arrive at all: the API redacts salary, gross, net and
 * basic on the way out whatever is stored. What survives is the fact that
 * somebody moved them.
 *
 * ## Two shapes of "what happened"
 *
 * A stored diff is either a change list — `{ field: { from, to } }` — or a flat
 * bag of facts a router chose to keep about a one-off action, e.g.
 * `{ headcount: 12, blockers: 0 }`. The API separates them into `changes` and
 * `details` rather than calling a recorded count a change from nothing, and the
 * interface renders them differently for the same reason.
 *
 * ## The list carries no values
 *
 * By design: `changedFields` names which fields moved and nothing more. Opening
 * one event is a separate request **and a separately recorded act** — reading
 * this log is itself audited. See `read-log.ts` in the API.
 */

/* ------------------------------------------------------------------- shapes */

/** Who did it. `isSystem` means nothing was signed in — a job, a migration. */
export type AuditActorRef = {
  id: string | null;
  name: string;
  isSystem: boolean;
};

/** What it was done to, resolved to a name at read time rather than stored. */
export type AuditEntityRef = {
  /** The table name as the audit rows store it: `employees`, `leave_requests`. */
  type: string;
  id: string | null;
  /** "Amara Nwachukwu (AHR-0502)". Falls back to the noun plus a short id. */
  label: string;
  /** Singular, lower case: "employee", "leave request". For sentences. */
  noun: string;
};

export type AuditEntry = {
  id: string;
  /** The machine verb: `employee.archived`. Never shown to a person. */
  action: string;
  /** `employee.archived` → "Employee archived". The API humanises it. */
  actionLabel: string;
  at: string;
  actor: AuditActorRef;
  entity: AuditEntityRef;
  /** Which fields moved, as labels. Values need the detail call. */
  changedFields: string[];
  /** Fields whose values are withheld whatever the caller's permission. */
  redactedFields: string[];
  /** True when this is somebody reading the trail, not changing anything. */
  isRead: boolean;
  ipAddress: string | null;
};

/** One field that moved. `from`/`to` are already redacted when `redacted`. */
export type AuditChange = {
  field: string;
  label: string;
  from: unknown;
  to: unknown;
  redacted: boolean;
};

/** A fact recorded alongside the event that is not a before/after pair. */
export type AuditFact = {
  field: string;
  label: string;
  value: unknown;
  redacted: boolean;
};

export type AuditDiff = {
  changes: AuditChange[];
  details: AuditFact[];
  redactedFields: string[];
  /** Set when the stored diff was not an object at all. */
  raw?: unknown;
};

export type AuditEntryDetail = AuditEntry & {
  diff: AuditDiff;
  actorEmail: string | null;
  userAgent: string | null;
};

export type AuditActor = {
  id: string | null;
  name: string;
  email: string | null;
  isSystem: boolean;
  /** Everything, reads included — unaffected by "Show who read the log". */
  events: number;
  /**
   * `events` minus reads: the figure that matches the list under the dropdown
   * while reads are hidden, which is the ordinary state of that toggle.
   *
   * **Optional, and that is not tidiness.** `actors()` on the API computes it
   * only where the audit-actor-counts change has landed; on a deployment
   * without it the field is simply absent from the row. Absent is not zero —
   * `?? 0` here would render "Amara Nwachukwu (0)" for somebody with
   * nineteen events, which is a wrong claim rather than a missing one. The
   * screen falls back to `events` and says what it is counting instead.
   */
  changes?: number;
  lastAt: string | null;
};

export type AuditSummary = {
  from: string;
  to: string;
  /** Everything in the window, reads included. */
  total: number;
  changes: number;
  /** Times somebody read this log. Reported whatever `includeReads` says. */
  reads: number;
  actors: number;
  byAction: { action: string; label: string; count: number }[];
  /** Doubles as the kind filter: only types actually present are listed. */
  byEntityType: { type: string; noun: string; count: number }[];
};

/* ------------------------------------------------------------------ queries */

export type AuditListParams = {
  page?: number;
  pageSize?: number;
  /** Free text across the action, the kind, and the record's name. */
  q?: string;
  /** A user id, or the literal `system` for events with no signed-in actor. */
  actorUserId?: string;
  entityType?: string;
  entityId?: string;
  /** Exact action, or a trailing dot like `loan.` for the whole family. */
  action?: string;
  /** `YYYY-MM-DD`. Both ends inclusive of the whole day. */
  from?: string;
  to?: string;
  /** Include the events written when somebody reads this log. Off by default. */
  includeReads?: boolean;
  sort?: "createdAt" | "action" | "subjectType";
  order?: "asc" | "desc";
};

export type AuditTimelineParams = {
  page?: number;
  pageSize?: number;
  includeReads?: boolean;
  order?: "asc" | "desc";
};

export type AuditRangeParams = { from?: string; to?: string };

/**
 * What the API will accept as an entity type.
 *
 * Mirrors the `entityType` regex in the API's `audit/schemas.ts`. Exported
 * because it is load-bearing for `RecordHistory`: a record whose module writes
 * a `subjectType` outside this shape cannot be looked up at all, and the panel
 * has to say so rather than render an empty timeline that reads as "nothing
 * ever happened". `PayrollRun` is exactly that case today.
 */
export const AUDIT_ENTITY_TYPE = /^[a-z][a-z0-9_]{1,59}$/;

export const isQueryableEntityType = (type: string): boolean =>
  AUDIT_ENTITY_TYPE.test(type);

/** The API takes ids as uuids. Demo ids (`p-06`) are not, and must not be sent. */
export const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/* -------------------------------------------------------------------- calls */

/**
 * `includeReads` is sent only when true.
 *
 * The API defaults it to false, so passing the default back would make every
 * URL noisier for nothing — and the query string is what the read event records
 * as "the question that was asked", so it is worth keeping it to the truth.
 */
const reads = (on?: boolean) => (on ? { includeReads: "true" } : {});

export const auditApi = {
  /** The log. Newest first unless asked otherwise. */
  list: (
    params: AuditListParams = {},
    signal?: AbortSignal,
  ): Promise<Paged<AuditEntry>> =>
    requestPaged<AuditEntry>("/audit", {
      query: {
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 30,
        q: params.q,
        actorUserId: params.actorUserId,
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        from: params.from,
        to: params.to,
        sort: params.sort,
        order: params.order,
        ...reads(params.includeReads),
      },
      ...(signal ? { signal } : {}),
    }),

  /** One event with its before/after. Sensitive values are already withheld. */
  get: (id: string, signal?: AbortSignal): Promise<AuditEntryDetail> =>
    request<AuditEntryDetail>(`/audit/${id}`, { ...(signal ? { signal } : {}) }),

  /**
   * Everything that ever happened to one record.
   *
   * Filing a read event against *the record* is the API's decision, not an
   * accident: opening somebody's history shows up in that person's own
   * timeline, which is how "who has been looking at Amara's pay" becomes a
   * question with an answer.
   */
  timeline: (
    type: string,
    id: string,
    params: AuditTimelineParams = {},
    signal?: AbortSignal,
  ): Promise<Paged<AuditEntry>> =>
    requestPaged<AuditEntry>(`/audit/entity/${type}/${id}`, {
      query: {
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 25,
        order: params.order ?? "desc",
        ...reads(params.includeReads),
      },
      ...(signal ? { signal } : {}),
    }),

  /** Who has generated events, for the person filter. Includes a System row. */
  actors: (
    params: AuditRangeParams = {},
    signal?: AbortSignal,
  ): Promise<AuditActor[]> =>
    request<AuditActor[]>("/audit/actors", {
      query: { from: params.from, to: params.to },
      ...(signal ? { signal } : {}),
    }),

  /** Counts for a period. `byEntityType` is also the kind filter's options. */
  summary: (
    params: AuditRangeParams = {},
    signal?: AbortSignal,
  ): Promise<AuditSummary> =>
    request<AuditSummary>("/audit/summary", {
      query: { from: params.from, to: params.to },
      ...(signal ? { signal } : {}),
    }),
};
