"use client";

import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import {
  formatKobo,
  MONTHLY_PAY_EFFECT,
  OVERTIME_KIND_LABEL,
  type OvertimeOverrideKind,
} from "@/lib/api/payroll";
import type { OvertimeHourlyBasis } from "@/lib/overtime/derive";

/**
 * The three things a payroll figure can be corrected by, as inline forms.
 *
 * `PayeByHand` in `wizard.tsx` was the first of these and is left where it is;
 * these are its siblings and follow its shape deliberately — a left accent rule,
 * the consequence stated before the fields, a required reason, and a Clear that
 * only appears when there is something to clear.
 *
 * ## Two of these expire and one does not
 *
 * A bonus and hand-entered overtime belong to **one run**. They hang off it,
 * next month starts with none, and nobody has to remember to take them off.
 *
 * Monthly pay is the contract. Changing it here changes every future payroll
 * too, and `MONTHLY_PAY_EFFECT` says so on the form — written once in
 * `lib/api/payroll.ts` so the sentence cannot drift from the one the API's own
 * doc comment makes.
 *
 * That difference is the only thing about this screen somebody could get badly
 * wrong, so each form states its own scope in its first line rather than
 * relying on the reader to know which is which.
 */

/** Shared shell: the accent rule, the explanation, and the buttons. */
function ByHand({
  explanation,
  saving,
  error,
  canSave,
  saveLabel,
  onSave,
  onCancel,
  onClear,
  clearLabel,
  children,
}: {
  explanation: React.ReactNode;
  saving: boolean;
  error: string | null;
  canSave: boolean;
  saveLabel: string;
  onSave: () => void;
  onCancel: () => void;
  onClear?: () => void;
  clearLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-l-2 border-accent px-4 py-4">
      <p className="text-body-sm leading-relaxed text-muted">{explanation}</p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">{children}</div>

      {error && (
        <p
          role="status"
          className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-body-sm text-ink"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="accent"
          size="sm"
          loading={saving}
          disabled={!canSave}
          onClick={onSave}
        >
          {saveLabel}
        </Button>
        <Button size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        {onClear && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onClear}
            disabled={saving}
            className="text-danger-text"
          >
            {clearLabel ?? "Clear"}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- overtime */

/**
 * Hours, and which multiplier applies. **Never a rate.**
 *
 * The hourly figure is the person's own salary divided by the working month and
 * the policy's hours per day, so it is shown rather than asked for — and the
 * whole calculation is spelled out live, because "₦24,000" with no working is
 * the kind of figure this product exists not to put on a screen.
 */
export function OvertimeByHand({
  name,
  /** Their monthly pay, for showing the arithmetic. */
  grossMonthlyKobo,
  /** The company's working month and the policy's hours per day. */
  workingDaysPerMonth,
  hoursPerDay,
  basis,
  rates,
  current,
  saving,
  error,
  onSave,
  onCancel,
  onClear,
}: {
  name: string;
  grossMonthlyKobo: number;
  workingDaysPerMonth: number;
  hoursPerDay: number;
  /** Which convention prices an hour. See `hourlyOf`. */
  basis: OvertimeHourlyBasis;
  rates: Record<OvertimeOverrideKind, number>;
  current: { hours: number; kind: OvertimeOverrideKind; reason: string } | null;
  saving: boolean;
  error: string | null;
  onSave: (input: {
    hours: number;
    kind: OvertimeOverrideKind;
    reason: string;
  }) => void;
  onCancel: () => void;
  onClear?: () => void;
}) {
  const [hours, setHours] = useState(current ? String(current.hours) : "");
  const [kind, setKind] = useState<OvertimeOverrideKind>(
    current?.kind ?? "WEEKDAY",
  );
  const [reason, setReason] = useState(current?.reason ?? "");

  const parsed = Number(hours);
  const hoursInvalid = !hours.trim() || !Number.isFinite(parsed) || parsed <= 0;
  const tooShort = reason.trim().length < 4;
  const first = name.split(" ")[0] ?? name;

  /* The same arithmetic the API does, shown rather than trusted. It is a
     preview: the figure that lands on the payslip is computed server-side from
     the policy, and this is here so nobody is asked to accept a number with no
     working. It has to follow the company's own basis — the two differ by
     about a third, and a preview showing the other one would be worse than
     showing none. */
  const hourly = hourlyOf(
    grossMonthlyKobo,
    workingDaysPerMonth,
    hoursPerDay,
    basis,
  );
  const rate = rates[kind];
  const preview = hoursInvalid ? null : Math.round(hourly * parsed * rate);

  return (
    <ByHand
      explanation={
        <>
          Hours for {first} on this payroll only, for when the clock could not
          answer. <strong className="text-ink">The rate is not typed</strong> —
          it comes from your overtime policy, so these hours are worth exactly
          what clocked ones would be. Anything already approved from clock-ins is
          set aside for this run and stays payable on a later one.
        </>
      }
      saving={saving}
      error={error}
      canSave={!saving && !hoursInvalid && !tooShort}
      saveLabel={current ? "Save the hours" : "Add the hours"}
      onSave={() => onSave({ hours: parsed, kind, reason: reason.trim() })}
      onCancel={onCancel}
      {...(onClear ? { onClear, clearLabel: "Use the clock again" } : {})}
    >
      <span className="w-32">
        <Field label="Hours" required>
          <Input
            inputMode="decimal"
            value={hours}
            placeholder="6"
            onChange={(event) => setHours(event.target.value)}
          />
        </Field>
      </span>
      <span className="w-44">
        <Field label="Which rate" required>
          <Select
            value={kind}
            onChange={(event) =>
              setKind(event.target.value as OvertimeOverrideKind)
            }
          >
            {(
              Object.keys(OVERTIME_KIND_LABEL) as OvertimeOverrideKind[]
            ).map((option) => (
              <option key={option} value={option}>
                {OVERTIME_KIND_LABEL[option]} · {rates[option]}x
              </option>
            ))}
          </Select>
        </Field>
      </span>
      <span className="min-w-0 flex-1">
        <Field
          label="Why it was not clocked"
          required
          help={
            preview === null
              ? `${formatKobo(hourly)} an hour. ${basisWorking(workingDaysPerMonth, hoursPerDay, basis)}`
              : `${formatKobo(hourly)} an hour x ${hours}h x ${String(rate)} = ${formatKobo(preview)}`
          }
        >
          <Input
            value={reason}
            placeholder="Saturday stock count, no reader on site"
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </span>
    </ByHand>
  );
}

/**
 * What an hour is worth, before the multiplier.
 *
 * Mirrors `hourlyRateKobo` on the API. A second implementation of a money
 * figure is exactly what this codebase warns about, so it is worth being
 * precise about what this one is for: **it renders the working, it does not
 * decide the pay.** The figure on the payslip is computed server-side from the
 * policy, and this exists so nobody is asked to accept a number with none of it
 * shown. If the two ever disagree, the server is right and this is the bug.
 */
function hourlyOf(
  grossMonthlyKobo: number,
  workingDaysPerMonth: number,
  hoursPerDay: number,
  basis: OvertimeHourlyBasis,
): number {
  const hours = Math.max(1, hoursPerDay);
  if (basis === "CALENDAR_DAYS") {
    return Math.round((grossMonthlyKobo * 12) / 365 / hours);
  }
  return Math.round(grossMonthlyKobo / Math.max(1, workingDaysPerMonth) / hours);
}

/** "an 8-hour", "a 6-hour". Only 8, 11 and 18 take "an" in this range. */
function anHour(hoursPerDay: number): string {
  const article = [8, 11, 18].includes(hoursPerDay) ? "an" : "a";
  return `${article} ${String(hoursPerDay)}-hour`;
}

/** The divisor in words, so the figure above is not a bare assertion. */
function basisWorking(
  workingDaysPerMonth: number,
  hoursPerDay: number,
  basis: OvertimeHourlyBasis,
): string {
  return basis === "CALENDAR_DAYS"
    ? `A year's pay over 365 days and ${anHour(hoursPerDay)} day.`
    : `Their pay over ${String(workingDaysPerMonth)} working days and ${anHour(hoursPerDay)} day.`;
}

/* ---------------------------------------------------------------- bonus */

/** A one-off payment. The reason becomes the payslip line. */
export function BonusByHand({
  name,
  current,
  saving,
  error,
  onSave,
  onCancel,
  onClear,
}: {
  name: string;
  current: { amountKobo: number; reason: string } | null;
  saving: boolean;
  error: string | null;
  onSave: (input: { amountKobo: number; reason: string }) => void;
  onCancel: () => void;
  onClear?: () => void;
}) {
  const [amount, setAmount] = useState(
    current ? String(current.amountKobo / 100) : "",
  );
  const [reason, setReason] = useState(current?.reason ?? "");

  const parsed = Number(amount);
  const amountInvalid = !amount.trim() || !Number.isFinite(parsed) || parsed <= 0;
  const tooShort = reason.trim().length < 4;
  const first = name.split(" ")[0] ?? name;

  return (
    <ByHand
      explanation={
        <>
          A one-off payment for {first} on this payroll.{" "}
          <strong className="text-ink">This month only</strong> — next month
          starts without it. It is taxed, and it does not raise their pension or
          housing-fund deduction, because a discretionary payment is not part of
          either base.
        </>
      }
      saving={saving}
      error={error}
      canSave={!saving && !amountInvalid && !tooShort}
      saveLabel={current ? "Save the bonus" : "Add the bonus"}
      onSave={() =>
        onSave({ amountKobo: Math.round(parsed * 100), reason: reason.trim() })
      }
      onCancel={onCancel}
      {...(onClear ? { onClear, clearLabel: "Take it off" } : {})}
    >
      <span className="w-44">
        <Field label="Amount" required>
          <Input
            inputMode="decimal"
            value={amount}
            placeholder="100000"
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>
      </span>
      <span className="min-w-0 flex-1">
        <Field
          label="What it is for"
          required
          help="This is the line they see on their payslip, so write it for them."
        >
          <Input
            value={reason}
            placeholder="Q3 sales target"
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </span>
    </ByHand>
  );
}

/* ----------------------------------------------------------- monthly pay */

/**
 * The one control here that is not about this payroll.
 *
 * It writes the employment record, so the consequence is stated first, in bold,
 * before the field — and again under the button. Everything else on this screen
 * expires with the period and this does not, which is the only thing about it
 * somebody could get badly wrong.
 */
export function PayByHand({
  name,
  currentKobo,
  saving,
  error,
  onSave,
  onCancel,
}: {
  name: string;
  /** Null where nobody ever set one — the `missing_pay` case. */
  currentKobo: number | null;
  saving: boolean;
  error: string | null;
  onSave: (input: { grossMonthlyKobo: number; reason: string }) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(
    currentKobo === null ? "" : String(currentKobo / 100),
  );
  const [reason, setReason] = useState("");

  const parsed = Number(amount);
  const amountInvalid = !amount.trim() || !Number.isFinite(parsed) || parsed <= 0;
  const tooShort = reason.trim().length < 4;
  const unchanged = currentKobo !== null && Math.round(parsed * 100) === currentKobo;
  const first = name.split(" ")[0] ?? name;

  return (
    <ByHand
      explanation={
        <>
          {currentKobo === null ? (
            <>
              {first} has no agreed monthly pay, which is why they have no
              payslip. Setting it here puts them on this payroll.{" "}
            </>
          ) : (
            <>Change what {first} is paid every month. </>
          )}
          <strong className="text-ink">{MONTHLY_PAY_EFFECT}</strong>
        </>
      }
      saving={saving}
      error={error}
      canSave={!saving && !amountInvalid && !tooShort && !unchanged}
      saveLabel="Change their pay"
      onSave={() =>
        onSave({
          grossMonthlyKobo: Math.round(parsed * 100),
          reason: reason.trim(),
        })
      }
      onCancel={onCancel}
    >
      <span className="w-44">
        <Field
          label="Monthly pay"
          required
          {...(unchanged ? { help: "That is what it already is." } : {})}
        >
          <Input
            inputMode="decimal"
            value={amount}
            placeholder="400000"
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>
      </span>
      <span className="min-w-0 flex-1">
        <Field
          label="Why it is changing"
          required
          help="Kept against their record, not against this payroll."
        >
          <Input
            value={reason}
            placeholder="Promotion to senior officer, agreed 1 August"
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </span>
    </ByHand>
  );
}
