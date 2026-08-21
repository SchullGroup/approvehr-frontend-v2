import { employeeById } from "@/lib/mock/people";
import {
  APPROVAL_LABEL,
  APPROVALS,
  type ApprovalItem,
  type ApprovalKind,
  type LeaveRequest,
} from "@/lib/mock/workflows";
import { fullName } from "@/lib/types";
import { TODAY, daysSince, shortDate } from "@/lib/today";
import {
  deadlineLabel,
  isPastDeadline,
  type ApprovalRow,
} from "@/lib/api/approvals";
import type { DecisionRecord } from "@/lib/store/approvals";
import { clashesWith } from "./leave";

/**
 * The approval queue, assembled rather than authored.
 *
 * This module is the fix for the gap that used to sit between `/approvals` and
 * the records it claimed to be about. The inbox previously read a static array
 * containing a row that *described* a leave request — same person, same dates,
 * different id — so the two could never agree: approving the row left the
 * request pending, and approving the request left the row in the inbox.
 *
 * Now leave rows are **generated from the leave requests themselves**. There is
 * no second object to keep in step, so there is no drift to manage. Two pending
 * requests that the hand-written array had simply forgotten (`lv-02` and
 * `lv-07`) appear in the inbox as a direct consequence.
 *
 * Every other kind is still a seed row, and each one carries its decision in
 * `useApprovalStore` until its module grows a store of its own. When one does,
 * add a builder here beside `leaveApprovals` and delete its seed rows — the
 * inbox itself should not need changing.
 */

/** One leave request, as the approver's queue sees it. */
function leaveApproval(request: LeaveRequest, all: LeaveRequest[]): ApprovalItem {
  const employee = employeeById(request.employeeId);
  const who = employee ? fullName(employee) : "Unknown";
  const clashes = clashesWith(request, all);

  /* The summary answers the approver's real question — who else is off — rather
     than restating the dates that are already in the row. */
  const cover =
    clashes.length === 0
      ? "nobody else off those days"
      : clashes.length === 1
        ? `overlaps ${
            employeeById(clashes[0].employeeId)
              ? fullName(employeeById(clashes[0].employeeId)!)
              : "one other person"
          }`
        : `overlaps ${clashes.length} others off those days`;

  const raised = request.requestedAt;

  return {
    id: `leave:${request.id}`,
    kind: "leave",
    title: `${request.type} leave — ${who}`,
    summary: `${shortDate(request.from)}–${shortDate(request.to)} · ${
      request.days
    } ${request.days === 1 ? "day" : "days"} · ${cover}`,
    requestedById: request.employeeId,
    requestedAt: raised ? shortDate(raised) : "—",
    waitingDays: raised ? Math.max(0, daysSince(raised)) : 0,
    /* Deep-linked to the request itself, so "decide this" and "look at it
       properly" are one click apart. The leave screen reads `?request=`. */
    href: `/people/leave?request=${request.id}`,
    ref: { store: "leave", id: request.id },
  };
}

/**
 * Everything waiting on a decision, ranked.
 *
 * Ranking is the design: anything with a stated deadline first, then oldest
 * first. An approver's question is "what breaks if I do nothing today", not
 * "what arrived most recently", and never "which module raised it".
 */
export function buildApprovalQueue({
  leaveRequests,
  decisions,
}: {
  leaveRequests: LeaveRequest[];
  decisions: Record<string, DecisionRecord>;
}): ApprovalItem[] {
  const derived = leaveRequests
    .filter((r) => r.status === "pending")
    .map((r) => leaveApproval(r, leaveRequests));

  /* Seed rows drop out of the queue once decided; derived rows drop out because
     the underlying request is no longer pending, which is the whole point. */
  const seeded = APPROVALS.filter((item) => !decisions[item.id]);

  return [...derived, ...seeded].sort((a, b) => {
    if (Boolean(a.deadline) !== Boolean(b.deadline)) return a.deadline ? -1 : 1;
    if (b.waitingDays !== a.waitingDays) return b.waitingDays - a.waitingDays;
    return a.title.localeCompare(b.title);
  });
}

/**
 * The decided items, for the "decided in this session" trail. Derived rows are
 * rebuilt from the request so the trail survives a reload — a decision recorded
 * only in component state disappeared the moment you navigated away, which made
 * the trail an in-page animation rather than a record.
 */
export function decidedItems({
  leaveRequests,
  decisions,
}: {
  leaveRequests: LeaveRequest[];
  decisions: Record<string, DecisionRecord>;
}): { item: ApprovalItem; decision: "approved" | "declined"; at?: string }[] {
  const fromLeave = leaveRequests
    .filter((r) => r.status === "approved" || r.status === "declined")
    /* Seed rows carry a decidedAt too, so restrict the trail to decisions made
       in this browser. Every seed decision predates TODAY, so a decision dated
       TODAY is one made here — the seed's own history is not activity. */
    .filter((r) => r.decidedAt === TODAY && r.decidedById !== undefined)
    .map((r) => ({
      item: leaveApproval(r, leaveRequests),
      decision: r.status as "approved" | "declined",
      at: r.decidedAt,
    }));

  const fromSeed = APPROVALS.filter((i) => decisions[i.id]).map((i) => ({
    item: i,
    decision: decisions[i.id].decision,
    at: decisions[i.id].at,
  }));

  return [...fromLeave, ...fromSeed];
}

/* ============================================================ one row shape */

/**
 * Where a decision has to be written.
 *
 * `leave` writes through to the leave request in the local store; `approval`
 * posts to `/approvals/:id/decide`, which routes into the owning module on the
 * server and writes the same subject. Two paths, one rule: the decision lands on
 * the record, never on a copy of it.
 */
export type QueueRef =
  | { store: "leave"; id: string }
  | { store: "approval"; id: string };

/**
 * A row in the inbox, from either source.
 *
 * `ApprovalItem` is the seed's shape and could not grow the two fields the API
 * has and the seed does not — a real `deadlineAt`, and a requester it may not be
 * able to name. So this is the shape the screen renders, and both sources map
 * into it: `toQueueItem` for a seed or derived row, `queueItemFromApproval` for
 * an API row.
 */
export type QueueItem = {
  id: string;
  kind: ApprovalKind;
  /** The API's own word when we have no better one. Always safe to render. */
  kindLabel: string;
  title: string;
  summary: string;
  /** Set only when the requester is somebody this app can name. */
  requestedById?: string;
  /** Display, e.g. `12 Aug`. */
  requestedAt: string;
  waitingDays: number;
  /** Naira, where the decision moves money. */
  amount?: number;
  href: string;
  /** Display label for a deadline: `Due 26 Aug`, `Due today`. */
  deadline?: string;
  /** True once that deadline has gone past. */
  pastDeadline?: boolean;
  ref?: QueueRef;
};

/**
 * Where the record behind a row lives.
 *
 * Every one of these routes exists. A queue that links at a 404 is worse than a
 * queue that does not link, and this list is the thing to check when a module
 * moves.
 */
const HREF: Record<ApprovalKind, string> = {
  leave: "/people/leave",
  payroll_run: "/payroll",
  offer: "/hiring/offers",
  requisition: "/hiring",
  expense: "/payroll/expenses",
  record_change: "/people",
  loan: "/payroll/loans",
};

/** A seed or derived row, in the shape the screen renders. */
export function toQueueItem(item: ApprovalItem): QueueItem {
  return {
    id: item.id,
    kind: item.kind,
    kindLabel: APPROVAL_LABEL[item.kind],
    title: item.title,
    summary: item.summary,
    requestedById: item.requestedById,
    requestedAt: item.requestedAt,
    waitingDays: item.waitingDays,
    ...(item.amount === undefined ? {} : { amount: item.amount }),
    href: item.href,
    ...(item.deadline ? { deadline: item.deadline } : {}),
    ...(item.ref ? { ref: item.ref } : {}),
  };
}

/**
 * An API approval row, in the same shape.
 *
 * Two differences from a seed row, both deliberate:
 *
 * - **No requester.** The API's approval row does not serialise who raised it,
 *   so the avatar line is left off rather than filled with a guess. The title
 *   already names the person the request is about, which is the thing an
 *   approver is looking for.
 * - **A leave row deep-links to its request.** `/people/leave?request=<id>`
 *   opens that request on the leave screen, so "decide this" and "look at this
 *   properly" are one click apart rather than a search.
 */
export function queueItemFromApproval(row: ApprovalRow): QueueItem {
  const label = deadlineLabel(row.deadlineAt);
  const href =
    row.subjectType === "leave_requests"
      ? `/people/leave?request=${row.subjectId}`
      : HREF[row.kind];

  return {
    id: row.id,
    kind: row.kind,
    kindLabel: row.kindLabel,
    title: row.title,
    summary: row.summary ?? "",
    requestedAt: shortDate(row.requestedAt),
    waitingDays: row.waitingDays,
    ...(row.amount === null ? {} : { amount: row.amount }),
    href,
    ...(label ? { deadline: label } : {}),
    ...(isPastDeadline(row.deadlineAt) ? { pastDeadline: true } : {}),
    ref: { store: "approval", id: row.id },
  };
}
