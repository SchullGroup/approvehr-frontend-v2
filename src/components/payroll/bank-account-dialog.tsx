"use client";

import { useState } from "react";
import { Button, Field, Input, Modal, Picker } from "@/components/ui";
import { AccountVerificationHint } from "@/components/payments/account-verification";
import { NIGERIAN_BANKS } from "@/lib/reference/banks";
import { useOpenSession } from "@/lib/use-open-session";

/**
 * The two fields a missing account number needs, over the payroll run (U84).
 *
 * "Add account number" on a run's blocker used to send the preparer to the
 * person's Pay tab (ten fields), and back to payroll by hand to press "Run
 * again", once per person. This asks for the bank and the ten digits, saves them
 * to the record the same way the Pay tab does, and the run is calculated again
 * so the blocker clears in place.
 */
export function BankAccountDialog(props: {
  open: boolean;
  /** Whose account this is: said in the title, so nobody saves it to the wrong person. */
  name: string;
  onClose: () => void;
  /** Saves to the record. Throws with the server's own sentence on a refusal. */
  onSave: (input: { bankName: string; bankAccount: string }) => Promise<void>;
}) {
  const session = useOpenSession(props.open);
  return <BankAccountForm key={session} {...props} />;
}

const BANK_OPTIONS = NIGERIAN_BANKS.map((bank) => ({
  value: bank.label,
  label: bank.label,
}));

function BankAccountForm({
  open,
  name,
  onClose,
  onSave,
}: {
  open: boolean;
  name: string;
  onClose: () => void;
  onSave: (input: { bankName: string; bankAccount: string }) => Promise<void>;
}) {
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const digits = bankAccount.replace(/\s/g, "");
  const ready = bankName !== "" && /^\d{10}$/.test(digits);

  async function save() {
    if (!ready || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ bankName, bankAccount: digits });
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : "The account number did not save. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      title={`Add ${name}'s account number`}
      description="Saved to their record, then this payroll is calculated again."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => void save()}
            loading={saving}
            disabled={!ready}
          >
            Save and recalculate
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Field label="Bank" required>
          <Picker
            value={bankName}
            onChange={setBankName}
            options={BANK_OPTIONS}
            placeholder="Choose their bank"
          />
        </Field>
        <Field
          label="Account number"
          required
          help="Ten digits."
          error={
            digits.length > 0 && !/^\d+$/.test(digits)
              ? "Digits only."
              : (error ?? undefined)
          }
        >
          <Input
            inputMode="numeric"
            autoComplete="off"
            maxLength={10}
            value={bankAccount}
            onChange={(event) => {
              setBankAccount(event.target.value);
              setError(null);
            }}
          />
        </Field>
        <AccountVerificationHint bankName={bankName} accountNumber={digits} />
      </form>
    </Modal>
  );
}
