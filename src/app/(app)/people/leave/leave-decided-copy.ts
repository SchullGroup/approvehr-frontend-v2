import {
  daysLabel,
  type LeaveBalanceRow,
  type LeaveRow,
} from "@/lib/api/leave";
import { shortDate } from "@/lib/today";

/**
 * What is said when somebody approves a leave request.
 *
 * Kept apart from the component because the point of it is that every sentence
 * is true of what just happened, and that is worth being able to test without
 * rendering anything. Three things it is careful about:
 *
 * - **The first approval is not the approval.** With a department head and then
 *   HR, the head saying yes leaves the request *waiting on HR*, and the API
 *   tells HR, not the person who asked ("telling somebody 'your leave was
 *   approved' when it is halfway through a two-step workflow is a claim they
 *   would plan a holiday around"). Calling that "approved" would be exactly the
 *   claim the API refuses to make.
 * - **Only what is known.** The balance is read after the decision, and a type
 *   with no entitlement has no balance line rather than a made-up one. Nothing
 *   here says the person was notified: whether they had a sign-in to notify is
 *   not in the response.
 * - **No number without its noun.** "5 days, 12 Oct to 16 Oct", never "approved".
 */

/** Which approval this was. `first` leaves it waiting on HR. */
export type LeaveStage = "final" | "first";

export type LeaveDecidedCopy = {
  title: string;
  lead: string;
  details: string[];
};

/** "annual leave", and not "annual leave leave" for a type already named that way. */
function leaveName(type: string): string {
  const lower = type.trim().toLowerCase();
  return /\bleave$/.test(lower) ? lower : `${lower} leave`;
}

/** "12 Oct", or "12 Oct to 16 Oct". */
function dates(request: Pick<LeaveRow, "from" | "to">): string {
  return request.from === request.to
    ? shortDate(request.from)
    : `${shortDate(request.from)} to ${shortDate(request.to)}`;
}

/**
 * The balance line, or none.
 *
 * The year the leave falls in, because a request in January is not drawn from
 * the balance of the year it was approved in. A negative remainder is the one
 * case worth saying out loud: it is the approver's cue that this took the person
 * past what they are entitled to.
 */
export function balanceLine(
  request: Pick<LeaveRow, "leaveType" | "from">,
  balances: readonly LeaveBalanceRow[],
): string | null {
  const year = Number(request.from.slice(0, 4));
  const row = balances.find(
    (entry) => entry.leaveType === request.leaveType && entry.year === year,
  );
  if (!row || row.entitled <= 0) return null;
  const type = request.leaveType.trim().toLowerCase();
  if (row.remaining < 0) {
    return `This takes them ${daysLabel(Math.abs(row.remaining))} past their ${type} entitlement.`;
  }
  return `${daysLabel(row.remaining)} of ${String(row.entitled)} ${type} days left in ${String(year)}.`;
}

export function leaveDecidedCopy({
  request,
  stage,
  balances,
}: {
  request: Pick<
    LeaveRow,
    "employeeName" | "leaveType" | "from" | "to" | "days"
  >;
  stage: LeaveStage;
  balances: readonly LeaveBalanceRow[];
}): LeaveDecidedCopy {
  const name = request.employeeName;
  const first = name.split(" ")[0] ?? name;
  const span = `${daysLabel(request.days)}, ${dates(request)}.`;

  if (stage === "first") {
    return {
      title: `${name}'s ${leaveName(request.leaveType)} has your approval`,
      lead: `${span} HR decides next.`,
      details: [`${first} is not told until HR has decided.`],
    };
  }

  const details: string[] = [];
  const balance = balanceLine(request, balances);
  if (balance) details.push(balance);
  details.push(`${first} shows as on leave in attendance for those days.`);

  return {
    title: `${name}'s ${leaveName(request.leaveType)} is approved`,
    lead: span,
    details,
  };
}
