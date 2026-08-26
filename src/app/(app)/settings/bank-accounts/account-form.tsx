"use client";

import { useState } from "react";
import {
  Button,
  Checkbox,
  Field,
  Input,
  Modal,
  Picker,
  Select,
} from "@/components/ui";
import { NIGERIAN_BANKS } from "@/lib/reference/banks";
import type {
  ApiBankAccount,
  CreateAccountBody,
  UpdateAccountBody,
} from "@/lib/api/payments";

/**
 * Adding or editing one of the company's accounts.
 *
 * ## The account number is checked before it is sent
 *
 * Ten digits, and spaces and hyphens are forgiven because people paste from a
 * bank app. The length is not forgiven: a nine-digit account number is not a
 * payment that fails, it is a payment that lands somewhere else. The API applies
 * the same rule — this one exists so somebody finds out while they are still
 * looking at the field.
 *
 * A leading zero is meaningful, so the value stays text the whole way through
 * and the input is never `type="number"`.
 *
 * ## Editing the number of an account in use
 *
 * The API refuses it while a batch that has not gone out still points at the
 * account, and names the batches. That refusal arrives as the error on save; this
 * form does not try to guess it in advance, because the answer depends on data it
 * does not hold.
 */
export function AccountForm({
  account,
  hasPrimary,
  onClose,
  onSave,
}: {
  /** Absent when adding. */
  account?: ApiBankAccount;
  hasPrimary: boolean;
  onClose: () => void;
  onSave: (body: CreateAccountBody & UpdateAccountBody) => Promise<void>;
}) {
  const editing = account !== undefined;

  const [bankName, setBankName] = useState(account?.bankName ?? "");
  const [accountName, setAccountName] = useState(account?.accountName ?? "");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountType, setAccountType] = useState(account?.accountType ?? "Current");
  const [isPrimary, setIsPrimary] = useState(!hasPrimary);
  const [busy, setBusy] = useState(false);

  const digits = accountNumber.replace(/[\s-]/g, "");
  const numberTouched = accountNumber.trim().length > 0;
  const numberValid = /^\d{10}$/.test(digits);
  const numberError =
    numberTouched && !numberValid
      ? /\D/.test(digits)
        ? "An account number is digits only."
        : `That is ${digits.length} ${digits.length === 1 ? "digit" : "digits"}. A Nigerian account number is exactly ten.`
      : undefined;

  /* Editing leaves the number alone unless somebody types a new one — the field
     starts empty rather than pre-filled, because the stored value is masked and
     pre-filling asterisks would send asterisks. */
  const canSave =
    bankName.trim().length >= 2 &&
    accountName.trim().length >= 2 &&
    (editing ? !numberTouched || numberValid : numberValid);

  async function save() {
    setBusy(true);
    try {
      await onSave({
        bankName: bankName.trim(),
        accountName: accountName.trim(),
        ...(numberTouched ? { accountNumber: digits } : {}),
        ...(accountType.trim() ? { accountType: accountType.trim() } : {}),
        ...(isPrimary ? { isPrimary: true } : {}),
      } as CreateAccountBody & UpdateAccountBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? `Edit ${account.bankName}` : "Add a bank account"}
      description={
        editing
          ? undefined
          : "The account salaries are paid out of. It is never used to collect money."
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={!canSave || busy}
            loading={busy}
            onClick={() => void save()}
          >
            {editing ? "Save" : "Add account"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Bank" required>
          {/*
           * Was a free-text `Input` with "GTBank" as a placeholder, beside a
           * free-text bank code with "058" as its placeholder. Two problems, and
           * the second is the serious one: a typed bank name does not match
           * anything, and a typed code is a number nobody checked. The API is
           * explicit that "a wrong bank code routes money to the wrong
           * institution".
           *
           * Now the NIBSS register, and choosing a bank fills its code in.
           */}
          <Picker
            value={bankName}
            onChange={(value) => setBankName(value)}
            placeholder="Choose the bank"
            options={NIGERIAN_BANKS.map((b) => ({
              value: b.label,
              label: b.label,
            }))}
          />
        </Field>

        <Field
          label="Name on the account"
          required
          help="Exactly as the bank has it."
        >
          <Input
            value={accountName}
            placeholder="Schull Technologies Ltd"
            onChange={(e) => {
              const value = e.target.value;
              setAccountName(value);
            }}
          />
        </Field>

        <Field
          label="Account number"
          required={!editing}
          error={numberError}
          help={
            editing
              ? `Currently ${account.accountNumberMasked}. Leave empty to keep it.`
              : "Ten digits."
          }
        >
          <Input
            value={accountNumber}
            digits={10}
            autoComplete="off"
            placeholder="0123456789"
            onChange={(e) => {
              const value = e.target.value;
              setAccountNumber(value);
            }}
          />
        </Field>

        <Field label="Kind of account">
          <Select
            value={accountType}
            onChange={(e) => {
              const value = e.target.value;
              setAccountType(value);
            }}
          >
            <option value="Current">Current</option>
            <option value="Savings">Savings</option>
            <option value="Corporate">Corporate</option>
          </Select>
        </Field>

        {/* Editing cannot turn the flag off — the way to stop this account being
            the salary account is to make another one it. So the box only appears
            where pressing it does something. */}
        {!(editing && account.isPrimary) && (
          <Checkbox
            label="Pay salaries from this account"
            description={
              hasPrimary
                ? "The account currently used for salaries stops being used for them."
                : "The first account on file is always the one salaries come from."
            }
            checked={isPrimary}
            disabled={!hasPrimary}
            onChange={(e) => {
              const next = e.target.checked;
              setIsPrimary(next);
            }}
          />
        )}
      </div>
    </Modal>
  );
}
