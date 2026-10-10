import { formatMoney } from "@/components/ui/money-format";
import { monthLabel } from "@/lib/loans/schedule";

/**
 * What is said when a staff loan is asked for, or approved.
 *
 * Kept apart from the components so every sentence can be tested without
 * rendering anything, because each has to be true of what just happened:
 *
 * - **Asking is not getting.** A request leaves nothing deducted and nothing
 *   decided, and says so. The first deduction is the month that was *asked
 *   for*: whoever approves it may change the terms, and the API leaves the start
 *   month empty until somebody decides.
 * - **Nobody is said to have been told.** Applying writes a loan row the queue
 *   reads. Nothing in the answer says an approver was messaged, so nothing here
 *   does either.
 * - **Every figure comes from the loan the API answered with**, not from the
 *   form: what is shown is what was saved. The one exception is the start month
 *   on a request, which the API does not echo until a decision.
 */

/** Naira, in full, from the API's kobo. */
const money = (amountKobo: number): string =>
  formatMoney(Math.round(amountKobo) / 100, "NGN", { decimals: true });

const months = (n: number): string =>
  `${String(n)} ${n === 1 ? "month" : "months"}`;

export type MomentCopy = {
  title: string;
  lead: string;
  details: string[];
};

type Terms = {
  principalKobo: number;
  termMonths: number;
  monthlyRepaymentKobo: number;
  interestKobo: number;
};

/** "₦300,000.00 over 6 months, ₦50,000.00 a month." */
function termsLine(loan: Terms): string {
  return `${money(loan.principalKobo)} over ${months(loan.termMonths)}, ${money(loan.monthlyRepaymentKobo)} a month.`;
}

/**
 * A loan that has just been asked for, as the person asking sees it.
 *
 * `forName` is set only when somebody who may apply on another person's behalf
 * did so for somebody else, because "your loan" is then not true and "you can
 * withdraw it" is a thing only the applicant can do.
 */
export function loanRequestedCopy({
  loan,
  startPeriod,
  forName,
}: {
  loan: Terms;
  /** The month the applicant asked for the first deduction in. */
  startPeriod: string;
  forName?: string | null;
}): MomentCopy {
  const name = forName?.trim() || null;
  const first = monthLabel(startPeriod);

  const details = [
    "Nothing is deducted until somebody approves it.",
    name
      ? `The first deduction asked for is ${first}.`
      : `You asked for the first deduction in ${first}.`,
  ];
  if (loan.interestKobo > 0) {
    details.push(`It includes ${money(loan.interestKobo)} interest.`);
  }
  if (!name) details.push("You can withdraw it while it is waiting.");

  return {
    title: name
      ? `${name}'s loan request is sent for approval`
      : "Your loan request is sent for approval",
    lead: termsLine(loan),
    details,
  };
}

/**
 * A loan an approver has just approved.
 *
 * `askedFor` is present only for an approval on different terms, and changes
 * the title: "approved" on its own would let an approver and an applicant each
 * read a different loan into it.
 */
export function loanApprovedCopy({
  loan,
  askedFor,
}: {
  loan: Terms & {
    employeeName: string;
    /** Set by the decision. Null on a loan that has not been decided. */
    startPeriod: string | null;
  };
  askedFor?: { principalKobo: number; termMonths: number };
}): MomentCopy {
  const changed =
    askedFor !== undefined &&
    (askedFor.principalKobo !== loan.principalKobo ||
      askedFor.termMonths !== loan.termMonths);

  const details: string[] = [];
  if (loan.startPeriod) {
    details.push(`The first deduction is ${monthLabel(loan.startPeriod)}.`);
  }
  if (changed && askedFor) {
    details.push(
      `They asked for ${money(askedFor.principalKobo)} over ${months(askedFor.termMonths)}.`,
    );
  }
  if (loan.interestKobo > 0) {
    details.push(`It includes ${money(loan.interestKobo)} interest.`);
  }
  details.push("It comes out of their net pay, after tax.");

  return {
    title: changed
      ? `${loan.employeeName}'s loan is approved on different terms`
      : `${loan.employeeName}'s loan is approved`,
    lead: termsLine(loan),
    details,
  };
}
