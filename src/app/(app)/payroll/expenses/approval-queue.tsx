"use client";

import { useState } from "react";
import { Check, Inbox, Paperclip, X } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Modal,
  Money,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
  Textarea,
} from "@/components/ui";
import { daysSince, type Claim, type ExpenseType } from "@/lib/store/reimbursements";

/**
 * The approval queue.
 *
 * ## Everything needed to decide is on the row
 *
 * Who claimed, what for, how much, when the money actually went out, how long
 * it has been waiting, and whether a receipt is attached. Approve and Decline
 * sit on the row itself. An approver working through fifteen claims should never
 * have to open one — opening it is for the exceptions, and the row carries
 * enough to tell an exception from a bus fare.
 *
 * The receipt column shows three different things, because "no receipt" means
 * two different things. A type that does not require one (transport, airtime —
 * a keke fare produces no paper) reads "None needed". A type that does, with
 * nothing attached, reads "Missing" in warning tone: the API refuses that at
 * submit, so a Missing here means the type's rule was tightened afterwards, and
 * that is exactly the claim worth looking at.
 *
 * ## Approve is absent on your own claim, not disabled-with-a-tooltip
 *
 * The API refuses self-approval with a 403 even for an account holding every
 * permission, so the button would never work. Decline stays, because the status
 * enum has no WITHDRAWN and declining your own claim is how you take it back.
 */
export function ApprovalQueue({
  claims,
  types,
  myEmployeeId,
  loading,
  onApprove,
  onDecline,
}: {
  claims: Claim[];
  types: ExpenseType[];
  myEmployeeId: string | null;
  loading: boolean;
  onApprove: (claim: Claim) => Promise<void>;
  onDecline: (claim: Claim, reason: string) => Promise<void>;
}) {
  const [declining, setDeclining] = useState<Claim | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  const total = claims.reduce((sum, claim) => sum + claim.amount, 0);

  async function approve(claim: Claim) {
    setWorking(claim.id);
    try {
      await onApprove(claim);
    } finally {
      setWorking(null);
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Waiting for a decision"
          description={
            claims.length === 0
              ? "Nothing waiting."
              : `${claims.length} ${claims.length === 1 ? "claim" : "claims"}, oldest cost first.`
          }
          action={
            claims.length > 0 ? (
              <span className="text-body-sm text-muted">
                Worth{" "}
                <span className="tabular font-medium text-ink">
                  <Money amount={total} decimals />
                </span>{" "}
                if you approve all of it
              </span>
            ) : undefined
          }
        />

        {claims.length === 0 ? (
          <EmptyState
            icon={<Inbox aria-hidden="true" />}
            title={loading ? "Loading…" : "Nothing waiting"}
            description={
              loading
                ? "Reading the queue."
                : "Every claim has been decided. New ones land here."
            }
          />
        ) : (
          <TableWrap
            className="rounded-none border-0"
            caption="Expense claims waiting for a decision"
          >
            <THead>
              <TH>Who</TH>
              <TH>What for</TH>
              <TH>Spent on</TH>
              <TH align="right">Amount</TH>
              <TH>Receipt</TH>
              <TH align="right">Decision</TH>
            </THead>
            <TBody>
              {claims.map((claim) => {
                const waiting = daysSince(claim.incurredOn);
                const mine = claim.employeeId === myEmployeeId;
                const busy = working === claim.id;

                return (
                  <TR key={claim.id}>
                    <TD>
                      <span className="block font-medium text-ink">
                        {claim.employeeName}
                        {mine && (
                          <span className="ml-1.5 text-meta font-normal text-muted">
                            you
                          </span>
                        )}
                      </span>
                      <span className="block text-meta text-muted">
                        {claim.employeeNo}
                      </span>
                    </TD>

                    <TD className="max-w-[22rem]">
                      <span className="block text-ink">{claim.description}</span>
                      <span className="block text-meta text-muted">
                        {claim.type}
                      </span>
                    </TD>

                    <TD>
                      <span className="tabular block text-ink">
                        {claim.incurredOn}
                      </span>
                      <span className="block text-meta text-muted">
                        {waiting === 0
                          ? "today"
                          : `${waiting} ${waiting === 1 ? "day" : "days"} ago`}
                      </span>
                    </TD>

                    <TD align="right" className="tabular font-medium text-ink">
                      <Money amount={claim.amount} decimals />
                    </TD>

                    <TD>
                      <ReceiptCell claim={claim} types={types} />
                    </TD>

                    <TD align="right">
                      <div className="flex justify-end gap-1.5">
                        {mine ? (
                          <span className="self-center text-meta text-muted">
                            Not yours to approve
                          </span>
                        ) : (
                          <Button
                            variant="approve"
                            size="sm"
                            loading={busy}
                            disabled={busy}
                            onClick={() => void approve(claim)}
                          >
                            <Check aria-hidden="true" className="size-3.5" />
                            Approve
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={() => setDeclining(claim)}
                        >
                          <X aria-hidden="true" className="size-3.5" />
                          Decline
                        </Button>
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </TableWrap>
        )}
      </Card>

      {declining && (
        <DeclineDialog
          claim={declining}
          onClose={() => setDeclining(null)}
          onDecline={async (reason) => {
            await onDecline(declining, reason);
            setDeclining(null);
          }}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

/** Three states, because "no receipt" means two different things. */
export function ReceiptCell({
  claim,
  types,
}: {
  claim: Claim;
  types: ExpenseType[];
}) {
  const rule = types.find((type) => type.id === claim.typeId);

  if (claim.hasReceipt) {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <Paperclip aria-hidden="true" className="size-3.5 shrink-0 text-muted" />
        <span
          className="max-w-[10rem] truncate text-body-sm text-body"
          title={claim.receiptKey ?? undefined}
        >
          {claim.receiptKey}
        </span>
      </span>
    );
  }

  if (rule?.requiresReceipt) {
    return (
      <Badge tone="warning" size="sm">
        Missing
      </Badge>
    );
  }

  return <span className="text-body-sm text-muted">None needed</span>;
}

/* -------------------------------------------------------------------------- */

/**
 * Declining needs a reason. The API refuses an empty one with "Say why, so they
 * know what to change." — the same sentence used here, before the round trip.
 */
function DeclineDialog({
  claim,
  onClose,
  onDecline,
}: {
  claim: Claim;
  onClose: () => void;
  onDecline: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Decline ${claim.employeeName}'s claim?`}
      description={`${claim.description} — they will read your reason.`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Keep it waiting
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={busy || reason.trim() === ""}
            onClick={() => {
              setBusy(true);
              void onDecline(reason.trim()).finally(() => setBusy(false));
            }}
          >
            Decline claim
          </Button>
        </div>
      }
    >
      <Field
        label="Why"
        required
        help="Say why, so they know what to change."
      >
        <Textarea
          autoFocus
          rows={3}
          value={reason}
          maxLength={500}
          placeholder="This one goes on the client's invoice — send it to me and I will bill it."
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
    </Modal>
  );
}
