"use client";

import { useRef } from "react";
import { cn } from "@/lib/cn";
import { Callout, Card, CardBody, CardHeader } from "@/components/ui";
import {
  ApprovalConsequences,
  RunStatusBadge,
  TotalsPanel,
} from "@/components/payroll/run-panels";
import {
  headcountLabel,
  periodLabel,
  type PayrollRunDetail,
} from "@/lib/api/payroll";
import type { RecordedPayment } from "@/components/payroll/record-paid-dialog";
import {
  ApprovedMoment,
  stillUnpaid,
  type ApprovedRunFacts,
} from "./approved-moment";
import { BankRegisterCard } from "./bank-register-card";
import { PayPanel, WalletStrip } from "./pay-panel";

/**
 * The step where a payroll is approved, and then paid.
 *
 * ## What the page is ranked by
 *
 * What somebody came here to decide. It used to open on the wallet (three
 * figures and a low-balance callout), then the bank register download, and only
 * then "What leaves the account" and "What approving does": the decision sat
 * underneath two cards about funding it.
 *
 * Now, in the order the decision is made:
 *
 * 1. **What leaves the account**, the totals, because that is the figure being
 *    agreed to.
 * 2. **What approving does**, because that is what is being agreed to.
 * 3. **The wallet**, as the sum it is, because whether it is funded is the
 *    second question and never blocks the first.
 * 4. **The bank register**, one quiet row, because it is the other way to pay and
 *    not the thing being decided.
 *
 * The primary action is the wizard's footer button, which is always reachable.
 *
 * ## Once it is approved, paying leads
 *
 * An approved payroll's next act is paying it. The totals and the consequences
 * drop below the pay card: they are what somebody reads *before* deciding, and
 * after the decision the question is only how the money leaves.
 *
 * ## Why the pay card's own state is not in here
 *
 * Approving and recording a payment both re-read the run, and the wizard hands
 * this step no run while it does, so everything below unmounts and comes back.
 * Anything held here would be gone before it could be read, which is why the
 * answer to the click (`approvedNow`, `recordedNow`) lives on the wizard.
 */
export function ApproveStep({
  run,
  settled,
  canApprove,
  approvedNow,
  batchProblem,
  recordedNow,
  onRecorded,
  onChanged,
  blockers,
  warnings,
  onSeeChecks,
}: {
  run: PayrollRunDetail;
  /** Approved already, and not being made into an off-cycle run. */
  settled: boolean;
  canApprove: boolean;
  approvedNow: ApprovedRunFacts | null;
  batchProblem: string | null;
  recordedNow: RecordedPayment | null;
  onRecorded: (recorded: RecordedPayment) => void;
  /** Re-read the run. */
  onChanged: () => void;
  blockers: number;
  warnings: number;
  /** Back to the Check step, where the list of what is worth a look lives. */
  onSeeChecks: () => void;
}) {
  const payPanel = useRef<HTMLDivElement>(null);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
      <div className="flex flex-col gap-5">
        {/* The answer to the click comes first, and only while it is still true
            that nobody has been paid. Recording a payment ends it: the pay card
            below then says so in its own moment. */}
        {settled && approvedNow?.runId === run.id && stillUnpaid(run.batch) && (
          <ApprovedMoment
            facts={approvedNow}
            batch={run.batch}
            onChoosePayment={() => {
              /* The card itself takes focus, not its first button. That
                   button is the one that moves money, and a keyboard reader who
                   presses Enter twice on "Choose how to pay" must not land on
                   it. Tab goes from here to it. */
              const card = payPanel.current;
              if (!card) return;
              card.scrollIntoView({ block: "start" });
              card.focus({ preventScroll: true });
            }}
          />
        )}

        {settled && (
          <div
            ref={payPanel}
            tabIndex={-1}
            className="scroll-mt-24 outline-none"
          >
            <PayPanel
              run={run}
              problem={batchProblem}
              onChanged={onChanged}
              justRecorded={recordedNow}
              onRecorded={onRecorded}
            />
          </div>
        )}

        <TotalsPanel run={run} />

        <Card>
          <CardHeader
            title="What approving does"
            description="Calculating can be repeated. Approving cannot be undone."
          />
          <CardBody>
            <ApprovalConsequences run={run} />
          </CardBody>
        </Card>

        {/* Before the decision: the position, stated in advance. A shortfall
            found at the provider is found after the run is approved, the loans
            are settled and the figures are frozen. This never blocks the
            approval, and once approved it is the pay card's business instead. */}
        {!settled && <WalletStrip run={run} />}

        <BankRegisterCard run={run} />
      </div>

      <aside className="flex flex-col gap-5 lg:sticky lg:top-20 lg:h-fit">
        <Card>
          <CardHeader title={periodLabel(run.period)} />
          <CardBody>
            <dl className="flex flex-col gap-2.5 text-body-sm">
              <SummaryRow
                label="Status"
                value={<RunStatusBadge status={run.status} />}
              />
              <SummaryRow
                label="People on this payroll"
                value={headcountLabel(run)}
              />
              <SummaryRow label="Pays on" value={run.payDate} />
              <SummaryRow
                label="Stops payroll"
                value={
                  <span
                    className={cn(
                      "tabular font-medium",
                      blockers ? "text-warning-text" : "text-accent-text",
                    )}
                  >
                    {blockers}
                  </span>
                }
              />
              <SummaryRow
                label="Worth a look"
                value={
                  /* A count with nowhere to go is a dead end. The list is on the
                     Check step, so a number above nothing says where. */
                  warnings > 0 ? (
                    <button
                      type="button"
                      onClick={onSeeChecks}
                      className="inline-flex items-center gap-1.5 rounded-sm font-medium text-accent-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text max-sm:min-h-11"
                    >
                      <span className="tabular">{warnings}</span>
                      <span>See them</span>
                    </button>
                  ) : (
                    <span className="tabular">{warnings}</span>
                  )
                }
              />
            </dl>
          </CardBody>
        </Card>

        {!canApprove && (
          <Callout tone="warning" title="Somebody else approves this">
            Approving payroll is a separate permission from preparing it, on
            purpose: the person who works out the pay is not the person who
            releases it.
          </Callout>
        )}
      </aside>
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
