import { formatMoney } from "@/components/ui/money-format";

/**
 * What is said when pay is asked for early, approved, declined, or the policy
 * is saved.
 *
 * Kept apart from the components so every sentence can be tested without
 * rendering anything. The thing it is most careful about is the one the API is
 * most careful about: **approved is not paid.** Approving signs an advance off
 * against the company's wallet; the money moves when somebody sends it and then
 * presses "The money has gone". Payroll takes it back off a payslip only after
 * that, and only what has been paid out. So:
 *
 * - the employee is never told a deduction is coming until it has been paid;
 * - the approver is told the money has not been sent, and where to say it has.
 *
 * Nobody is said to have been told anything. The API's answer to a request or
 * an approval says nothing about messaging anybody, so these lines do not.
 */

/** Naira, in full, from the API's kobo. */
const money = (amountKobo: number): string =>
  formatMoney(Math.round(amountKobo) / 100, "NGN", { decimals: true });

export type MomentCopy = {
  title: string;
  lead: string;
  details: string[];
};

/** A request that has just been sent, as the person sending it sees it. */
export function advanceRequestedCopy(advance: {
  amountKobo: number;
  feeKobo: number;
}): MomentCopy {
  const { amountKobo, feeKobo } = advance;
  return {
    title: "Your pay-early request is sent for a decision",
    lead:
      feeKobo > 0
        ? `${money(amountKobo)} asked for, plus a ${money(feeKobo)} fee.`
        : `${money(amountKobo)} asked for.`,
    details: [
      "Somebody has to approve it, and then it has to be paid.",
      `Once it is paid, ${money(amountKobo + feeKobo)} comes off your next payslip${feeKobo > 0 ? ", fee included" : ""}.`,
    ],
  };
}

/** A request an approver has just approved. */
export function advanceApprovedCopy(advance: {
  employeeName: string;
  amountKobo: number;
  feeKobo: number;
}): MomentCopy {
  const { amountKobo, feeKobo } = advance;
  return {
    title: `${advance.employeeName}'s pay-early request is approved`,
    lead:
      feeKobo > 0
        ? `${money(amountKobo)}, with a ${money(feeKobo)} fee.`
        : `${money(amountKobo)}.`,
    details: [
      "The money has not been sent yet. Press “The money has gone” under Advances once it has.",
      `${money(amountKobo + feeKobo)} comes off their payslip once it is paid.`,
    ],
  };
}

/**
 * The toast for a decline.
 *
 * A toast and not a moment: a decline commits nothing and the decider has
 * nothing left to do. The detail is the dialog's own wording.
 */
export function advanceDeclinedToast(advance: { employeeName: string }): {
  title: string;
  detail: string;
} {
  return {
    title: `Declined ${advance.employeeName}'s request`,
    detail: "They see your reason.",
  };
}

/** "50", "12.5": a percentage without a trailing `.0`. */
function percent(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * The toast for saving how drawing early works here.
 *
 * Says what the saved policy now is, so somebody who changed one field can see
 * all of it, and a fee is never saved silently: when there is one it is in the
 * sentence.
 */
export function policySavedToast(policy: {
  enabled: boolean;
  /** A percentage, e.g. 50. */
  maxPercent: number;
  minNaira: number;
  feeNaira: number;
}): { title: string; detail: string } {
  if (!policy.enabled) {
    return {
      title: "Pay-early settings saved",
      detail: "Staff cannot draw pay early.",
    };
  }
  const fee =
    policy.feeNaira > 0
      ? ` The fee is ${formatMoney(policy.feeNaira, "NGN", { decimals: true })} an advance.`
      : "";
  return {
    title: "Pay-early settings saved",
    detail: `Staff can draw up to ${percent(policy.maxPercent)}% of what they have earned, from ${formatMoney(policy.minNaira, "NGN", { decimals: true })}.${fee}`,
  };
}
