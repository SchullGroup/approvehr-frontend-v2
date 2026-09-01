"use client";

import { request, requestPaged } from "@/lib/api/client";
/* A type-only import: erased at build time, so this module carries no
   dependency on the seed data. The union is the app's own vocabulary for a
   kind, and duplicating it here is how the two drift apart. */
import type { ApprovalKind } from "@/lib/mock/workflows";

/**
 * The approval inbox — `/api/v1/approvals`.
 *
 * | Action | Endpoint |
 * |---|---|
 * | The queue, ranked | `GET /approvals` |
 * | Header counts | `GET /approvals/summary` |
 * | Approve or send back | `POST /approvals/:id/decide` |
 * | Undo | `POST /approvals/:id/reopen` |
 * | Approve everything routine | `POST /approvals/approve-routine` |
 * | Backfill missing rows | `POST /approvals/reconcile` |
 *
 * ## An approval is an index entry, not a record
 *
 * `subjectType` and `subjectId` point at the thing being approved, and the
 * subject's own status is the truth. Deciding here calls into the owning module,
 * which writes the subject and mirrors the outcome back onto the approval row in
 * one transaction — so approving leave in the inbox **is** approving it on
 * `/people/leave`, not a second write that has to agree with the first.
 *
 * There is no permission gate on the queue itself. The decision is gated by the
 * owning module, which is why `POST /approvals/:id/decide` can approve leave for
 * an account that could not call `POST /leave/requests/:id/decide` directly.
 * Whether that asymmetry is intended is the API's business; the screen offers
 * what the endpoint accepts.
 *
 * ## Ranking is the design, so this module does not re-sort
 *
 * The API orders by `deadlineAt` ascending with nulls last, then oldest first.
 * An approver's question is "what breaks if I do nothing today", and anything
 * with a stated deadline answers it before anything without one. Re-sorting on
 * the client would fight that and produce two different queues for the same
 * data, so the rows are rendered in the order they arrive.
 *
 * `approve-routine` excludes anything with a deadline for the same reason: those
 * are precisely the rows that need a person to look at them, and a bulk action
 * that swept them up would defeat the flag.
 *
 * ## Money
 *
 * `amountKobo` is integer kobo on the wire and becomes naira `amount` here, at
 * the boundary, so no screen multiplies or divides by 100. It is null for most
 * kinds — leave moves no money.
 *
 * ## Two doors, not one — as of the payroll/loan/expense tracking rows
 *
 * `leave_requests` (and offboarding, and self-service record changes) are
 * genuinely decided *through* `POST /:id/decide` — that call writes the
 * subject and mirrors the row in one transaction. Payroll runs, loans and
 * expense claims are different: they are **tracked** here so they show up in
 * this inbox and in "sent by you", but they are still only ever *decided* on
 * their own screens (`/payroll`, `/payroll/loans`, `/payroll/expenses`),
 * because their permission checks — and, for payroll, a re-authentication
 * step — live only at their own routes. Calling `decide()` on one of these
 * now refuses outright (422) rather than silently recording a decision that
 * moved nothing. `isDecidableHere` / `realScreenFor` below are how a screen
 * tells the two apart — check before rendering an Approve/Decline pair.
 *
 * `lib/api/endpoints.ts` still carries a thinner `approvals` object from the
 * first cutover; nothing imports it now, and this module replaces it.
 */

/* ------------------------------------------------------------------ the wire */

type WireKind =
  | "LEAVE"
  | "PAYROLL_RUN"
  | "OFFER"
  | "REQUISITION"
  | "EXPENSE"
  | "RECORD_CHANGE"
  | "LOAN";

type WireStatus = "PENDING" | "APPROVED" | "DECLINED" | "WITHDRAWN";

type WireApproval = {
  id: string;
  kind: WireKind;
  subjectType: string;
  subjectId: string;
  title: string;
  summary: string | null;
  amountKobo: number | null;
  /** Full ISO timestamp, or null when nothing expires. */
  deadlineAt: string | null;
  status: WireStatus;
  requestedAt: string;
  waitingDays: number;
  decidedAt: string | null;
  decisionNote: string | null;
  /** Only present on `GET /approvals/sent` — who a row is currently waiting
   *  on, resolved server-side. A name when it was routed to somebody
   *  specific; a role sentence ("anyone who can approve payroll") when it
   *  was not, which today is every payroll run, loan and expense claim. */
  sentTo?: string;
};

type WireSummary = {
  pending: number;
  withDeadline: number;
  ageing: number;
  atStakeKobo: number;
  byKind: Record<string, number>;
};

/* ---------------------------------------------------------------- the shapes */

export type ApprovalRowStatus = "pending" | "approved" | "declined" | "withdrawn";

export type ApprovalRow = {
  id: string;
  /**
   * The app's own kind, for an icon and a tone.
   *
   * A kind the frontend has not learned yet falls back to `record_change` — a
   * neutral document — while `kindLabel` keeps the API's own word, so the badge
   * still tells the truth about what the row is. Dropping the row instead would
   * hide an approval somebody is waiting on.
   */
  kind: ApprovalKind;
  kindLabel: string;
  subjectType: string;
  subjectId: string;
  title: string;
  summary: string | null;
  /** Naira. Converted from integer kobo here and nowhere else. */
  amount: number | null;
  /** ISO timestamp. Null when nothing expires. */
  deadlineAt: string | null;
  status: ApprovalRowStatus;
  /** `YYYY-MM-DD`. */
  requestedAt: string;
  waitingDays: number;
  decidedAt: string | null;
  decisionNote: string | null;
  /** Present only on rows from `approvalsApi.sentByMe` — see the note on
   *  the wire type this is copied from. */
  sentTo?: string;
};

export type ApprovalSummary = {
  pending: number;
  withDeadline: number;
  /** Waiting five days or more. */
  ageing: number;
  /** Naira across every pending decision. */
  atStake: number;
  byKind: Partial<Record<ApprovalKind, number>>;
};

export type ApprovalListParams = {
  kind?: ApprovalKind;
  status?: ApprovalRowStatus;
  /** Only rows carrying an amount. */
  movesMoney?: boolean;
  /** Has a deadline, or has been waiting five days or more. */
  overdue?: boolean;
  page?: number;
  pageSize?: number;
};

/* --------------------------------------------------------------- the mapping */

const KIND: Record<WireKind, ApprovalKind> = {
  LEAVE: "leave",
  PAYROLL_RUN: "payroll_run",
  OFFER: "offer",
  REQUISITION: "requisition",
  EXPENSE: "expense",
  RECORD_CHANGE: "record_change",
  LOAN: "loan",
};

/** `PAYROLL_RUN` → `Payroll run`. Only used for a kind we have no word for. */
const spell = (wire: string): string =>
  wire.charAt(0) + wire.slice(1).toLowerCase().replace(/_/g, " ");

/** Kobo to naira. The only division by 100 on this side of the wire. */
export const naira = (kobo: number): number => Math.round(kobo) / 100;

function toRow(wire: WireApproval): ApprovalRow {
  const kind = KIND[wire.kind];
  return {
    id: wire.id,
    kind: kind ?? "record_change",
    kindLabel: kind ? LABEL[kind] : spell(wire.kind),
    subjectType: wire.subjectType,
    subjectId: wire.subjectId,
    title: wire.title,
    summary: wire.summary,
    amount: wire.amountKobo === null ? null : naira(wire.amountKobo),
    deadlineAt: wire.deadlineAt,
    status: wire.status.toLowerCase() as ApprovalRowStatus,
    requestedAt: wire.requestedAt.slice(0, 10),
    waitingDays: wire.waitingDays,
    decidedAt: wire.decidedAt,
    decisionNote: wire.decisionNote,
    ...(wire.sentTo ? { sentTo: wire.sentTo } : {}),
  };
}

/**
 * The words for each kind.
 *
 * A copy of `APPROVAL_LABEL` in the seed module rather than an import of it,
 * because that module is seed *data* and this one has no business pulling an
 * array of fake payroll runs into the bundle to read one dictionary.
 */
const LABEL: Record<ApprovalKind, string> = {
  leave: "Leave",
  payroll_run: "Payroll",
  offer: "Offer",
  requisition: "Requisition",
  expense: "Expense",
  record_change: "Record change",
  loan: "Loan",
};

function toSummary(wire: WireSummary): ApprovalSummary {
  const byKind: Partial<Record<ApprovalKind, number>> = {};
  for (const [key, count] of Object.entries(wire.byKind)) {
    const kind = KIND[key as WireKind];
    if (kind) byKind[kind] = count;
  }
  return {
    pending: wire.pending,
    withDeadline: wire.withDeadline,
    ageing: wire.ageing,
    atStake: naira(wire.atStakeKobo),
    byKind,
  };
}

/* ------------------------------------------------------------------- the api */

export const approvalsApi = {
  list: async (
    params: ApprovalListParams = {},
    signal?: AbortSignal,
  ): Promise<{ rows: ApprovalRow[]; total: number }> => {
    const page = await requestPaged<WireApproval>("/approvals", {
      query: {
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 100,
        kind: params.kind?.toUpperCase(),
        status: params.status?.toUpperCase(),
        /* The API parses these as the strings "true"/"false", not booleans. */
        movesMoney: params.movesMoney ? "true" : undefined,
        overdue: params.overdue ? "true" : undefined,
      },
      ...(signal ? { signal } : {}),
    });
    return { rows: page.data.map(toRow), total: page.meta.total };
  },

  summary: async (signal?: AbortSignal): Promise<ApprovalSummary> =>
    toSummary(
      await request<WireSummary>("/approvals/summary", {
        ...(signal ? { signal } : {}),
      }),
    ),

  /**
   * Approve or send back.
   *
   * `note` is required when declining. `subjectMoved` is false when no module
   * owns the subject type — the decision is on the row and nothing downstream
   * changed, which the caller must say out loud.
   */
  decide: async (
    id: string,
    decision: "approve" | "decline",
    note?: string,
  ): Promise<{ row: ApprovalRow | null; subjectMoved: boolean; note?: string }> => {
    const result = await request<{
      approval: WireApproval | null;
      subject: unknown;
      note?: string;
    }>(`/approvals/${id}/decide`, {
      method: "POST",
      body: { decision, ...(note ? { note } : {}) },
    });
    return {
      row: result.approval ? toRow(result.approval) : null,
      subjectMoved: result.subject !== null && result.subject !== undefined,
      ...(result.note ? { note: result.note } : {}),
    };
  },

  /**
   * Everything the caller themselves requested, newest first — the other
   * half of the inbox from `list`. Each row carries `sentTo`: a name where
   * one was chosen, a role sentence where it was not.
   */
  sentByMe: async (
    params: ApprovalListParams = {},
    signal?: AbortSignal,
  ): Promise<{ rows: ApprovalRow[]; total: number }> => {
    const page = await requestPaged<WireApproval>("/approvals/sent", {
      query: {
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 100,
        kind: params.kind?.toUpperCase(),
        status: params.status?.toUpperCase(),
      },
      ...(signal ? { signal } : {}),
    });
    return { rows: page.data.map(toRow), total: page.meta.total };
  },

  /** Undo. Reopens the subject too, through the same registry. */
  reopen: async (id: string): Promise<ApprovalRow | null> => {
    const row = await request<WireApproval | null>(`/approvals/${id}/reopen`, {
      method: "POST",
    });
    return row ? toRow(row) : null;
  },

  /** Everything with no deadline, waiting under five days. */
  approveRoutine: () =>
    request<{ decided: number; skipped: { id: string; reason: string }[] }>(
      "/approvals/approve-routine",
      { method: "POST" },
    ),

  /**
   * Backfills approval rows for pending subjects that have none.
   *
   * Idempotent. Needed when a subject was created by a path that predates its
   * approval row — a migration or a seed — which is exactly the case where the
   * inbox would otherwise be quietly missing a request somebody is waiting on.
   */
  reconcile: () =>
    request<{ created: number }>("/approvals/reconcile", { method: "POST" }),
};

/* ---------------------------------------------------------------- for screens */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * A deadline as a badge reads.
 *
 * Measured against the real clock, not `lib/today.ts` — a deadline that came
 * from the database is a real date, and comparing it against the demo's frozen
 * "now" would report the wrong number of days. Returns null for a row with no
 * deadline so a caller can leave the badge out entirely.
 */
export function deadlineLabel(iso: string | null): string | null {
  if (!iso) return null;
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return null;

  const day = Math.round(
    (Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()) -
      startOfToday()) /
      86_400_000,
  );

  if (day < -1) return `${Math.abs(day)} days past the deadline`;
  if (day === -1) return "A day past the deadline";
  if (day === 0) return "Due today";
  if (day === 1) return "Due tomorrow";
  return `Due ${due.getUTCDate()} ${MONTHS[due.getUTCMonth()]}`;
}

function startOfToday(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/** True once a deadline has passed. Drives the danger treatment, not the copy. */
export function isPastDeadline(iso: string | null): boolean {
  if (!iso) return false;
  const due = new Date(iso);
  return !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
}

/**
 * Where a kind is actually decided, for the three that cannot be decided
 * from this inbox at all — see the module header. `/payroll` rather than a
 * specific run's URL for `payroll_run`: a row here has no period on it, and
 * the hub already opens on the current month with a picker for any other.
 */
const REAL_SCREEN: Partial<Record<ApprovalKind, string>> = {
  payroll_run: "/payroll",
  loan: "/payroll/loans",
  expense: "/payroll/expenses",
};

/** False for the three kinds that `decide()` now refuses outright (422). */
export function isDecidableHere(kind: ApprovalKind): boolean {
  return !(kind in REAL_SCREEN);
}

/** The screen that can actually decide a row of this kind, or null when
 *  this inbox already is that screen. */
export function realScreenFor(kind: ApprovalKind): string | null {
  return REAL_SCREEN[kind] ?? null;
}
