import {
  entitlementsFor,
  type LeaveBalance,
} from "@/lib/mock/people";
import type { LeaveRequest, LeaveStatus } from "@/lib/mock/workflows";
import type { LeaveTypePolicy } from "@/lib/store/company";

/**
 * Leave balances, derived from live requests.
 *
 * `taken` and `pending` are computed rather than stored, so approving a request
 * moves the employee's balance on their record page in the same breath. A stored
 * balance would need updating alongside every decision, and the first time the
 * two disagreed nobody would know which was right.
 *
 *   taken   = days used before the tracked window + approved days in it
 *   pending = days sitting in requests nobody has decided yet
 *
 * Pending days are held back from `remaining` deliberately: an approver looking
 * at "4 days left" needs that to already account for the request in front of
 * them, or they will approve past the entitlement.
 */
export function leaveBalancesFor(
  employeeId: string,
  requests: LeaveRequest[],
  /**
   * Company leave policy. When passed, `entitled` comes from the policy rather
   * than the seed, so changing Annual leave to 22 days on `/settings/leave`
   * moves every balance in the product at once. Optional so a server-rendered
   * caller that has no store can still produce the seed figures.
   */
  policies?: LeaveTypePolicy[],
): LeaveBalance[] {
  const mine = requests.filter((r) => r.employeeId === employeeId);

  return entitlementsFor(employeeId).map((entitlement) => {
    const policy = policies?.find((p) => p.name === entitlement.type);
    const entitled = policy?.entitled ?? entitlement.entitled;
    const ofType = mine.filter((r) => r.type === entitlement.type);
    const approved = ofType
      .filter((r) => r.status === "approved")
      .reduce((sum, r) => sum + r.days, 0);
    const pending = ofType
      .filter((r) => r.status === "pending")
      .reduce((sum, r) => sum + r.days, 0);

    return {
      employeeId,
      type: entitlement.type,
      entitled,
      taken: entitlement.takenBefore + approved,
      pending,
    };
  });
}

export const remainingDays = (b: LeaveBalance) =>
  b.entitled - b.taken - b.pending;

/** The balance a specific request draws down, for validation and display. */
export function balanceForRequest(
  employeeId: string,
  type: string,
  requests: LeaveRequest[],
  policies?: LeaveTypePolicy[],
): LeaveBalance | undefined {
  return leaveBalancesFor(employeeId, requests, policies).find(
    (b) => b.type === type,
  );
}

/**
 * The minimum a row needs for the cover question to be answerable.
 *
 * Deliberately not `LeaveRequest`. The API's rows carry a leave *type record*
 * rather than one of five hard-coded names, so they are not `LeaveRequest`s and
 * never will be — but the overlap arithmetic is identical, and the demo and the
 * connected screen must not each get their own copy of it. Widening the input to
 * what the calculation actually reads is what lets one function serve both.
 */
export type LeaveWindow = {
  id: string;
  employeeId: string;
  status: LeaveStatus;
  from: string;
  to: string;
};

/**
 * Who else is off across the same dates, excluding the request itself.
 *
 * This is the question an approver actually has and the reason leave gets
 * declined: not "does this person have days left" but "will anyone be left to
 * cover". Surfacing it on the request is the difference between an inbox and a
 * rubber stamp.
 *
 * Connected, the API answers this itself on `GET /leave/requests/:id` and that
 * answer wins — it can see the whole company, where this can only see the rows
 * a screen happens to be holding. This is the demo's implementation of the same
 * rule, and it is also what `lib/workflows/queue.ts` uses to write the cover
 * line on a queued row without a request per row.
 */
export function clashesWith<T extends LeaveWindow>(
  request: LeaveWindow,
  requests: readonly T[],
): T[] {
  return requests.filter(
    (r) =>
      r.id !== request.id &&
      r.employeeId !== request.employeeId &&
      (r.status === "approved" || r.status === "pending") &&
      r.from <= request.to &&
      r.to >= request.from,
  );
}
