"use client";

import { useState } from "react";
import {
  Button,
  Checkbox,
  Field,
  Input,
  Modal,
  Textarea,
} from "@/components/ui";
import { formatKobo } from "@/lib/api/payroll";

/**
 * Entering somebody's PAYE by hand for one payroll, in place of the bands.
 *
 * Same shape as `ExcludeFromPayrollDialog`, and the same reasoning: the
 * obvious build is a plain confirm, and it would throw away the one thing
 * that makes this different from a number silently typed over another —
 * "why does this not match the bands" has to have a written answer as
 * durable as "why was Grace not paid in August". So the reason is required
 * here too, on the same floor the API enforces.
 *
 * Pension, NHF and every other line on the payslip keep computing normally —
 * only this figure, and net pay because it is derived from this figure, take
 * what is typed here instead. Said on screen rather than assumed, because
 * "does this also change their pension" is the obvious next question.
 */
export function TaxOverrideDialog({
  open,
  name,
  periodLabel,
  computedKobo,
  currentKobo,
  currentReason,
  standingAlready,
  onClose,
  onConfirm,
  onClear,
  loading = false,
  error,
}: {
  open: boolean;
  name: string;
  /** "August 2026". An override belongs to exactly one period, like an
   *  exclusion — the figure two months from now may be different. */
  periodLabel: string;
  /**
   * What the bands compute, for reference — never touched by this dialog.
   *
   * Omitted when the payslip is already overridden: at that point the
   * bands' own figure is not something either side of this dialog still
   * has, only the figure that replaced it.
   */
  computedKobo?: number;
  /** The figure already on this payslip, if any. Prefills the field so
   *  correcting a figure starts from what is there rather than blank. */
  currentKobo?: number | null;
  currentReason?: string | null;
  /** Whether `Employee.payeManualOverride` is already set for this person. */
  standingAlready: boolean;
  onClose: () => void;
  onConfirm: (input: {
    payeKobo: number;
    reason: string;
    alsoStanding: boolean;
  }) => void;
  /** Present only when there is something to clear back to the bands. */
  onClear?: () => void;
  loading?: boolean;
  error?: string | null;
}) {
  const [amount, setAmount] = useState(() =>
    currentKobo !== undefined && currentKobo !== null
      ? String(currentKobo / 100)
      : "",
  );
  const [reason, setReason] = useState(currentReason ?? "");
  const [alsoStanding, setAlsoStanding] = useState(standingAlready);

  const parsed = Number(amount);
  const amountInvalid =
    !amount.trim() || !Number.isFinite(parsed) || parsed < 0;
  const tooShort = reason.trim().length < 4;
  const firstName = name.split(" ")[0] ?? name;
  const alreadyOverridden = currentKobo !== undefined && currentKobo !== null;

  function close() {
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={`Enter ${name}'s PAYE by hand`}
      description={
        computedKobo !== undefined
          ? `For ${periodLabel} only. The bands would put it at ${formatKobo(computedKobo)} — this replaces that figure on this one payslip, and net pay moves with it.`
          : `For ${periodLabel} only. Pension, housing fund and every other line on this payslip keep computing normally — only this figure, and net pay because it is derived from it, take what you enter here.`
      }
      size="md"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {alreadyOverridden && onClear ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={onClear}
              disabled={loading}
            >
              Clear — use the bands instead
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={close} disabled={loading}>
              Cancel
            </Button>
            <Button
              variant="accent"
              onClick={() =>
                onConfirm({
                  payeKobo: Math.round(parsed * 100),
                  reason: reason.trim(),
                  alsoStanding,
                })
              }
              disabled={amountInvalid || tooShort || loading}
              loading={loading}
            >
              {alreadyOverridden
                ? `Save ${firstName}'s figure`
                : `Enter it by hand`}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Monthly PAYE"
          required
          help="Naira. Whole figure, not annual."
        >
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="100"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="₦ a month"
          />
        </Field>

        <Field
          label="Why does this not come from the bands?"
          required
          help="Whoever asks this question next year reads exactly what you type here."
          {...(error ? { error } : {})}
        >
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Agreed with the state IRS at a different figure."
          />
        </Field>

        <Checkbox
          label={`Always enter ${firstName}'s PAYE by hand from now on`}
          checked={alsoStanding}
          onChange={(e) => setAlsoStanding(e.target.checked)}
        />
      </div>
    </Modal>
  );
}
