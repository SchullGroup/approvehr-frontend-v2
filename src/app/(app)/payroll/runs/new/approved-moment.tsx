"use client";

import type { ReactNode } from "react";
import { Button, ButtonLink, SuccessMoment } from "@/components/ui";
import { MomentCard } from "@/components/payroll/moment-card";
import { formatKobo, periodLabel } from "@/lib/api/payroll";
import type { RunBatch } from "@/lib/api/payroll";

/**
 * What approving a payroll did, as it was at the moment of approving.
 *
 * Captured from the approval's own answer and the run on screen, and held by
 * the wizard rather than here: approving re-reads the run, and the wizard
 * unmounts this whole step while it does. The figures are the run's frozen
 * ones, so they cannot have moved between the click and the re-read.
 */
export type ApprovedRunFacts = {
  runId: string;
  period: string;
  netKobo: number;
  /** People on the run. The ones left off it are not in this number. */
  employeeCount: number;
  settled: { loans: number; claims: number; overtime: number };
};

function count(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

/** "A", "A and B", "A, B and C". */
function listed(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1] ?? ""}`;
}

/**
 * What approving settled, as one sentence.
 *
 * The toast this replaces printed loans and claims and ignored overtime, so a
 * run that settled only overtime read "0 loan instalments and 0 expense
 * claims settled". Only what happened is named here.
 */
export function settledLine(settled: ApprovedRunFacts["settled"]): string {
  const parts: string[] = [];
  if (settled.loans > 0) {
    parts.push(count(settled.loans, "loan instalment", "loan instalments"));
  }
  if (settled.claims > 0) {
    parts.push(count(settled.claims, "expense claim", "expense claims"));
  }
  if (settled.overtime > 0) {
    parts.push(count(settled.overtime, "overtime entry", "overtime entries"));
  }
  if (parts.length === 0) return "Nothing else needed settling.";

  const many =
    parts.length > 1 ||
    settled.loans > 1 ||
    settled.claims > 1 ||
    settled.overtime > 1;
  return `${listed(parts)} ${many ? "were" : "was"} settled.`;
}

/**
 * What a payment batch's status says about whether anybody has been paid.
 *
 * The moment stands on "nobody has been paid yet", and that stops being true
 * the instant a batch is recorded as paid, sent, failed or stopped. From then
 * on the pay card below says what happened and this has nothing true to add.
 */
export function stillUnpaid(batch: RunBatch | null): boolean {
  if (!batch) return true;
  return (
    batch.status === "DRAFT" ||
    batch.status === "AWAITING_APPROVAL" ||
    batch.status === "APPROVED"
  );
}

export function approvedRunCopy(
  facts: ApprovedRunFacts,
  batch: RunBatch | null,
): { title: string; lead: string; details: string[] } {
  const payslips = count(facts.employeeCount, "payslip", "payslips");

  return {
    title: `${periodLabel(facts.period)} payroll is approved`,
    lead: `${payslips}, ${formatKobo(facts.netKobo)} net. Nobody has been paid yet.`,
    details: [
      "Its figures are frozen.",
      settledLine(facts.settled),
      ...(batch ? [`Payment ${batch.reference} is prepared.`] : []),
    ],
  };
}

/**
 * The moment a payroll is approved, above the card that pays it.
 *
 * Approving used to be a toast over a page that did not change, and the toast
 * was gone in a few seconds. It is the one-way door of the whole product, and
 * the next thing a person needs to know is the thing it does *not* do: nobody
 * has been paid. So the answer stays on the page, carries the figure it is
 * about, and its first action goes to the card that moves the money.
 */
export function ApprovedMoment({
  facts,
  batch,
  onChoosePayment,
}: {
  facts: ApprovedRunFacts;
  /** The run's batch as it is now, so a later "Prepare the payment" is reflected. */
  batch: RunBatch | null;
  /** Take the reader to the pay card. Only offered when there is a payment. */
  onChoosePayment: () => void;
}) {
  const copy = approvedRunCopy(facts, batch);

  const actions: ReactNode = (
    <>
      {batch ? (
        <>
          <Button variant="accent" onClick={onChoosePayment}>
            Choose how to pay
          </Button>
          <ButtonLink variant="ghost" href="/payroll">
            Back to payroll
          </ButtonLink>
        </>
      ) : (
        <ButtonLink variant="accent" href="/payroll">
          Back to payroll
        </ButtonLink>
      )}
    </>
  );

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
