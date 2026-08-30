"use client";

import { useState } from "react";
import {
  Button,
  Callout,
  Field,
  Input,
  Modal,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { formatKobo } from "@/lib/api/payroll";
import { usePaymentActions } from "@/lib/store/payments";

/**
 * One copy, because two surfaces need it.
 *
 * A person reaches "the bank paid this" from two places — the run they took
 * the file from, and the payment's own page — and both are the right place to
 * be when the thought occurs. What they must not be is two forms: this one
 * records a date that a ledger line is stamped with and later reconciled
 * against a statement, and a second copy would drift until one of them stopped
 * asking for the date or started defaulting it to today.
 *
 * Same reasoning as `MONTHLY_PAY_EFFECT` and `HOLIDAY_DELETE_EFFECTS` one
 * module along: a consequence described in two places is a consequence that
 * eventually gets described two ways.
 */
/**
 * Saying that a bank paid, on a date, against a reference.
 *
 * A dialog rather than a button, because two of the three things it records
 * are typed. **The date is the one that matters**: recording on Monday what
 * the bank did on Friday is the ordinary case, and a ledger line stamped with
 * the wrong day is one that will not reconcile against a statement — which is
 * the entire reason somebody keeps a ledger.
 *
 * Both fields are optional at the API and both are offered here, because a
 * person who has the bank's reference to hand should be able to put it in and
 * one who does not should not be blocked.
 */
export function RecordPaidDialog({
  batchId,
  reference,
  amountKobo,
  people,
  onClose,
  onRecorded,
}: {
  batchId: string;
  reference: string;
  amountKobo: number;
  people: string;
  onClose: () => void;
  onRecorded: (summary: string) => void;
}) {
  const actions = usePaymentActions();
  const [paidOn, setPaidOn] = useState("");
  const [bankRef, setBankRef] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  async function record() {
    setSaving(true);
    setFailed(null);
    try {
      const result = await actions.markPaid(batchId, {
        ...(paidOn ? { paidOn } : {}),
        ...(bankRef.trim() ? { reference: bankRef.trim() } : {}),
      });
      onRecorded(
        `${formatKobo(result.totalKobo)} recorded as paid against ${result.reference}.`,
      );
    } catch (error) {
      setFailed(
        error instanceof ApiError
          ? error.message
          : "Nothing was recorded. Try again.",
      );
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Record that your bank paid this"
      description={`${formatKobo(amountKobo)} to ${people}, on ${reference}.`}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="approve"
            loading={saving}
            disabled={saving}
            onClick={() => void record()}
          >
            Record it as paid
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {failed && (
          <Callout tone="danger" title="Nothing was recorded">
            {failed}
          </Callout>
        )}

        {/* Said before the click, in the words that make it safe. This writes
            a line in the ledger; it does not move a naira, and nobody reading
            this screen afterwards should be able to think it did. */}
        <Callout tone="info" title="This moves no money">
          It records what your bank has already done, so the wallet balance
          catches up with the account. Nothing is sent to anybody.
        </Callout>

        <Field
          label="When the bank paid"
          help="The date on the bank's own record, not today. A ledger line has to reconcile against a statement."
        >
          <Input
            type="date"
            value={paidOn}
            onChange={(event) => {
              setPaidOn(event.target.value);
            }}
          />
        </Field>

        <Field
          label="The bank's reference"
          help="Optional. It is what lets this line be matched to the one on your statement."
        >
          <Input
            placeholder="e.g. NIP-99887766"
            value={bankRef}
            maxLength={120}
            onChange={(event) => {
              setBankRef(event.target.value);
            }}
          />
        </Field>
      </div>
    </Modal>
  );
}
