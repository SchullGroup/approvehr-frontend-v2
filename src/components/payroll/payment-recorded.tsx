"use client";

import type { ReactNode } from "react";
import { SuccessMoment } from "@/components/ui";
import { formatKobo, longDate } from "@/lib/api/payroll";
import { MomentCard } from "./moment-card";
import type { RecordedPayment } from "./record-paid-dialog";

/**
 * What recording a bank payment is, said so that it is true of every company.
 *
 * ## Why none of it mentions the wallet
 *
 * This moment used to end on "The wallet has come down by that amount", and that
 * was false. Recording writes the payment into the ledger and closes the run
 * (`markBatchPaid` on the API); it does not touch the wallet. A company that
 * pays from the wallet had it debited when the payroll was approved, and one
 * that pays from its own bank account never had a wallet to debit. Both reach
 * this moment, so the one line has to be true of both, and the only thing true
 * of both is that recording moves nothing.
 */
export const RECORDED_MOVES_NO_MONEY =
  "Nothing was sent. This only records what your bank did.";

/**
 * What to say once somebody has recorded that their bank paid.
 *
 * Kept as a plain function beside the component for the reason
 * `record-paid-dialog.tsx` gives for sharing the form: two screens record a
 * payment, and a consequence described in two places is a consequence that
 * eventually gets described two ways. It is also why the words can be tested
 * without rendering anything.
 *
 * Every line is something the API's answer or the form already held. The
 * figure is the batch total the API returned, the date is the one typed (or
 * "today", which is what the API stamps when it is left blank), and the
 * second line is `RECORDED_MOVES_NO_MONEY` above.
 */
export function recordedPaymentCopy(recorded: RecordedPayment): {
  title: string;
  lead: string;
  details: string[];
} {
  /* A second press on a batch that is already recorded. Saying "recorded as
     paid" again would read as though it had been recorded twice. */
  if (recorded.settled === 0) {
    return {
      title: `${recorded.reference} was already recorded as paid`,
      lead: "Nothing changed. These payments had been recorded before.",
      details: [],
    };
  }

  return {
    title: `${recorded.reference} is recorded as paid by your bank`,
    lead: `${formatKobo(recorded.totalKobo)} to ${recorded.people}, ${
      recorded.paidOn ? `paid on ${longDate(recorded.paidOn)}` : "dated today"
    }.`,
    details: [
      RECORDED_MOVES_NO_MONEY,
      ...(recorded.bankReference
        ? [
            `Your bank's reference, ${recorded.bankReference}, is saved on the ledger line.`,
          ]
        : []),
    ],
  };
}

/**
 * The moment after "Record that your bank paid this".
 *
 * Until this existed the dialog closed on nothing and the page quietly turned
 * into a sentence, so somebody who had just told the product that a month of
 * salaries left the account had to read the page again to learn whether it
 * had taken.
 *
 * Rendered in place of whatever held the form, by the caller, because where it
 * belongs differs: on the payroll run it replaces the pay card, on a payment's
 * own page it replaces the release panel. The words do not differ, so they
 * are here.
 */
export function PaymentRecordedMoment({
  recorded,
  actions,
}: {
  recorded: RecordedPayment;
  actions: ReactNode;
}) {
  const copy = recordedPaymentCopy(recorded);

  return (
    <MomentCard>
      <SuccessMoment
        title={copy.title}
        lead={copy.lead}
        details={copy.details}
        actions={actions}
        focusHeading
      />
    </MomentCard>
  );
}
