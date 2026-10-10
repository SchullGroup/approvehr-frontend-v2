import { formatMoney } from "@/components/ui/money-format";
import { shortDate } from "@/lib/today";

/**
 * What is said when an expense claim is sent, approved or declined.
 *
 * Kept apart from the components because the point of it is that every sentence
 * is true of what just happened, and that is worth being able to test without
 * rendering anything. Three things it is careful about:
 *
 * - **Nobody is said to have been told.** Filing a claim writes a row the
 *   approvers' queue reads. Nothing in the answer says anybody was messaged, so
 *   nothing here says "your approver has been notified". "Somebody who can
 *   approve it will see it" is as far as the data goes, and the lines below do
 *   not go that far either.
 * - **Approved is not paid.** An approved claim is *owed* until it is paid,
 *   through payroll or by transfer, and the approver's moment says that rather
 *   than closing on a green tick that reads as though the money had moved.
 * - **No number without its noun.** "₦4,500.00 under Fuel, spent 12 Oct", never
 *   "approved".
 */

const money = (amount: number): string =>
  formatMoney(amount, "NGN", { decimals: true });

const firstName = (name: string): string => name.split(" ")[0] ?? name;

export type MomentCopy = {
  title: string;
  lead: string;
  details: string[];
};

/** The figure, the kind and the day the money went out. */
function claimLine(claim: {
  amount: number;
  type: string;
  incurredOn: string;
}): string {
  return `${money(claim.amount)} under ${claim.type}, spent ${shortDate(claim.incurredOn)}.`;
}

/**
 * A claim that has just been sent for approval, as the person sending it sees it.
 *
 * `forName` is set only when somebody with the right to file on another
 * person's behalf chose someone other than themselves, because "your claim" is
 * then not true and "nothing is owed to you" would be a claim about the wrong
 * person.
 */
export function claimSentCopy(claim: {
  amount: number;
  type: string;
  incurredOn: string;
  forName?: string | null;
}): MomentCopy {
  const forName = claim.forName?.trim() || null;

  if (forName) {
    return {
      title: `${forName}'s claim is sent for approval`,
      lead: claimLine(claim),
      details: [
        `Nothing is owed to ${firstName(forName)} until somebody approves it.`,
        "It can be changed while it is waiting for a decision.",
      ],
    };
  }

  return {
    title: "Your claim is sent for approval",
    lead: claimLine(claim),
    details: [
      "Nothing is owed to you until somebody approves it.",
      "You can change it while it is waiting for a decision.",
    ],
  };
}

/** A claim an approver has just approved. */
export function claimApprovedCopy(claim: {
  employeeName: string;
  amount: number;
  type: string;
  incurredOn: string;
}): MomentCopy {
  return {
    title: `${claim.employeeName}'s expense claim is approved`,
    lead: claimLine(claim),
    details: [
      `${money(claim.amount)} is now owed to ${firstName(claim.employeeName)} until it is paid.`,
      "It can be paid through payroll, or marked paid once you have sent it.",
    ],
  };
}

/**
 * The toast for a decline.
 *
 * A toast and not a moment: a decline commits nothing and there is nothing the
 * decider has to do next. The detail is the one thing worth saying, and it is
 * true — a declined claim shows its reason on the claimant's own list.
 */
export function claimDeclinedToast(claim: { employeeName: string }): {
  title: string;
  detail: string;
} {
  return {
    title: `Declined ${claim.employeeName}'s claim`,
    detail: "They can read your reason on the claim.",
  };
}

/** The toast for saving an expense type, which has a name to say. */
export function expenseTypeSavedTitle(name: string | undefined): string {
  return `${name?.trim() || "Expense type"} saved`;
}
