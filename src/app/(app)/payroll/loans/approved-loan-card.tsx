"use client";

import { ButtonLink } from "@/components/ui";
import { DecidedCard } from "@/components/payroll/decided-card";
import type { ApiLoan } from "@/lib/api/loans";
import { loanApprovedCopy } from "./loan-moments-copy";

/**
 * A loan approval, said back where it was made.
 *
 * Approving lends company money and writes a schedule payroll will start
 * deducting from, and the answer used to be a toast — on the loan's own page a
 * bare "Approved". This stays until the next decision replaces it or it is
 * closed, with the figure, the first deduction, and a way to the schedule it
 * created. On that schedule's own page the link is left out: the reader is
 * already there. There is no Undo; the API has no way to take an approval back.
 */
export function ApprovedLoanCard({
  loan,
  askedFor,
  linkToLoan = true,
  onDismiss,
}: {
  loan: ApiLoan;
  /** What was applied for, when this approval changed it. */
  askedFor?: { principalKobo: number; termMonths: number };
  linkToLoan?: boolean;
  onDismiss: () => void;
}) {
  const copy = loanApprovedCopy({ loan, ...(askedFor ? { askedFor } : {}) });
  return (
    <DecidedCard
      title={copy.title}
      lead={copy.lead}
      details={copy.details}
      onDismiss={onDismiss}
      {...(linkToLoan
        ? {
            actions: (
              <ButtonLink
                variant="ghost"
                size="sm"
                href={`/payroll/loans/${loan.id}`}
              >
                See the schedule
              </ButtonLink>
            ),
          }
        : {})}
    />
  );
}
