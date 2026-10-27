"use client";

import { useState } from "react";
import { Button, Callout, Field, Input } from "@/components/ui";
import { formatKobo } from "@/lib/api/payroll";
import { BackToPayslip, FormFooter, TOUCH } from "./drawer-parts";
import { nairaToKobo } from "./review-model";

/**
 * The small forms the adjust drawer opens: hours, days worked, and an amount.
 *
 * Both are the inline editors the table used to carry in its cells, with the
 * same validation and the same working shown, given room. What they replace sat
 * in a table cell beside two icon buttons well under 44px; these are full-width
 * fields with a button you can press.
 *
 * **No reason is asked for, in either.** `PayrollTaxOverride.reason` and its
 * siblings are optional on the API for exactly this: a required paragraph per
 * figure is how an audit trail fills up with full stops, which is a worse record
 * than an honest blank. Who changed it and when are still recorded on every one.
 */

function ServerRefusal({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Callout tone="danger" title="Nothing was saved">
      {message}
    </Callout>
  );
}

/* ------------------------------------------------------------------- hours */

export function HoursForm({
  name,
  periodLabel,
  hourlyKobo,
  rate,
  currentHours,
  currentKobo,
  canSet,
  canRemove,
  saving,
  error,
  onSave,
  onRemove,
  onBack,
}: {
  name: string;
  periodLabel: string;
  /** What an hour of this person's time is worth, in kobo. */
  hourlyKobo: number;
  /** The company's weekday multiplier. */
  rate: number;
  /** Hours already entered by hand, when the payslip says so. */
  currentHours: number | null;
  /** What hand-entered overtime is worth on the payslip now. Zero when none. */
  currentKobo: number;
  /** Overtime is switched on for this company, so hours may be added. */
  canSet: boolean;
  /** There is something entered by hand to take off. */
  canRemove: boolean;
  saving: boolean;
  error: string | null;
  onSave: (hours: number) => void;
  onRemove: () => void;
  onBack: () => void;
}) {
  const [text, setText] = useState("");
  const parsed = Number(text);
  const valid = text.trim() !== "" && Number.isFinite(parsed) && parsed > 0;
  /* An hour's value is worked out from the person's monthly pay, which comes from
     the directory, and the directory withholds it from anybody who may not see
     salaries. `0` here means "not known", never "worth nothing": printing
     "₦0.00 × 6 hours = ₦0.00" would be a claim about somebody's pay made out of
     a figure we do not have. The server prices the hours when they are saved. */
  const priced = hourlyKobo > 0;
  const amount =
    valid && priced ? Math.round(hourlyKobo * parsed * rate) : null;

  return (
    <form
      className="flow-root -mb-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSet && valid && !saving) onSave(parsed);
      }}
    >
      <BackToPayslip onBack={onBack} disabled={saving} />

      <div className="flex flex-col gap-4">
        <p className="text-body-sm leading-relaxed text-body">
          Enter the hours {name} worked beyond their normal day. They are paid
          at the company&rsquo;s weekday overtime rate, on top of gross. Hours
          entered here replace any overtime already clocked for {periodLabel}:
          the clocked records are kept, not deleted.
        </p>

        <ServerRefusal message={error} />

        {canRemove && (
          <p className="text-body-sm text-ink">
            Entered by hand now:{" "}
            <span className="tabular font-medium">
              {currentHours === null ? "" : `${String(currentHours)} hours, `}
              {formatKobo(currentKobo)}
            </span>
            .
          </p>
        )}

        {canSet ? (
          <Field label="Overtime hours" required>
            <Input
              autoFocus
              inputMode="decimal"
              placeholder="e.g. 6"
              value={text}
              disabled={saving}
              className="max-sm:h-11"
              onChange={(event) => setText(event.target.value)}
            />
          </Field>
        ) : (
          <Callout tone="neutral" title="Overtime is switched off">
            Hours cannot be added while overtime is off in Pay setup. You can
            still take off what was entered here.
          </Callout>
        )}

        {canSet && (
          <p
            role="status"
            className="tabular text-body-sm leading-relaxed text-muted"
          >
            {!priced
              ? "What an hour is worth is worked out from their monthly pay, which is not shown to you here. The payroll prices these hours when you save."
              : amount === null
                ? `An hour is worth ${formatKobo(hourlyKobo)}, paid at ${String(rate)} times.`
                : `${formatKobo(hourlyKobo)} × ${text} hours × ${String(rate)} = ${formatKobo(amount)}`}
          </p>
        )}
      </div>

      <FormFooter
        summary={
          canRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving}
              className={`-ml-2 text-danger-text hover:bg-danger-soft ${TOUCH}`}
              onClick={onRemove}
            >
              Take the hand-entered hours off
            </Button>
          ) : undefined
        }
      >
        <Button
          type="button"
          variant="ghost"
          className={TOUCH}
          disabled={saving}
          onClick={onBack}
        >
          Cancel
        </Button>
        {canSet && (
          <Button
            type="submit"
            variant="accent"
            className={TOUCH}
            loading={saving}
            disabled={!valid || saving}
          >
            {amount === null ? "Save overtime" : `Save ${formatKobo(amount)}`}
          </Button>
        )}
      </FormFooter>
    </form>
  );
}

/* ------------------------------------------------------------- days worked */

/**
 * Paying somebody for the days they worked rather than the whole month.
 *
 * For a person on long leave who worked five days of a thirty-one-day month. The daily rate
 * is their monthly pay over the working month, shown before anything is typed so
 * the arithmetic is visible; the server does the proration, and if the preview
 * and the payslip ever disagree the payslip is right.
 */
export function DaysForm({
  name,
  periodLabel,
  monthlyKobo,
  workingDays,
  currentDays,
  saving,
  error,
  onSave,
  onRemove,
  onBack,
}: {
  name: string;
  periodLabel: string;
  /** Contractual monthly pay. Zero when this viewer may not see it. */
  monthlyKobo: number;
  /** The working month the contract is divided by. */
  workingDays: number;
  /** Days already entered by hand. Null when they are paid the whole month. */
  currentDays: number | null;
  saving: boolean;
  error: string | null;
  onSave: (days: number) => void;
  onRemove: () => void;
  onBack: () => void;
}) {
  const [text, setText] = useState(
    currentDays === null ? "" : String(currentDays),
  );
  const parsed = Number(text);
  const whole = text.trim() !== "" && Number.isInteger(parsed) && parsed >= 0;
  const tooMany = whole && parsed > workingDays;
  const valid = whole && !tooMany;
  /* Same rule as an hour's value: zero monthly pay means "not shown to you",
     never "worth nothing". */
  const priced = monthlyKobo > 0;
  const dailyKobo = Math.round(monthlyKobo / Math.max(1, workingDays));
  const amount =
    valid && priced ? Math.round((monthlyKobo * parsed) / workingDays) : null;

  return (
    <form
      className="flow-root -mb-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid && !saving) onSave(parsed);
      }}
    >
      <BackToPayslip onBack={onBack} disabled={saving} />

      <div className="flex flex-col gap-4">
        <p className="text-body-sm leading-relaxed text-body">
          Pay {name} for the days they worked in {periodLabel} instead of the
          whole month. Gross is their daily rate times the days, and PAYE,
          pension and net are worked out again from that. This is for{" "}
          {periodLabel} only; next month starts from the full month again.
        </p>

        <ServerRefusal message={error} />

        <p role="status" className="tabular text-body-sm text-ink">
          {priced
            ? `Daily rate: ${formatKobo(monthlyKobo)} ÷ ${String(workingDays)} days in the month = ${formatKobo(dailyKobo)} a day.`
            : `The month has ${String(workingDays)} days. Their daily rate comes from their monthly pay, which is not shown to you here.`}
        </p>

        {currentDays !== null && (
          <p className="text-body-sm text-ink">
            Entered by hand now:{" "}
            <span className="tabular font-medium">
              {currentDays} of {workingDays} days
            </span>
            .
          </p>
        )}

        <Field
          label="Days worked"
          required
          {...(text.trim() !== "" && !whole
            ? { error: "Whole days only." }
            : tooMany
              ? {
                  error: `The month has ${String(workingDays)} days.`,
                }
              : {})}
        >
          <Input
            autoFocus
            inputMode="numeric"
            placeholder={`0 to ${String(workingDays)}`}
            value={text}
            disabled={saving}
            className="max-sm:h-11"
            onChange={(event) => setText(event.target.value)}
          />
        </Field>

        {amount !== null && (
          <p role="status" className="tabular text-body-sm text-muted">
            {formatKobo(dailyKobo)} × {text} days = {formatKobo(amount)} gross.
          </p>
        )}
      </div>

      <FormFooter
        summary={
          currentDays !== null ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving}
              className={`-ml-2 ${TOUCH}`}
              onClick={onRemove}
            >
              Undo: pay the whole month
            </Button>
          ) : undefined
        }
      >
        <Button
          type="button"
          variant="ghost"
          className={TOUCH}
          disabled={saving}
          onClick={onBack}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="accent"
          className={TOUCH}
          loading={saving}
          disabled={!valid || saving}
        >
          {amount === null ? "Pay by days worked" : `Pay ${formatKobo(amount)}`}
        </Button>
      </FormFooter>
    </form>
  );
}

/* -------------------------------------------------------------------- loan */

/**
 * What one loan takes from this person this month.
 *
 * Starts from the scheduled instalment. More than that shortens the loan (the
 * extra comes off the end of the schedule when the payroll is approved); less
 * leaves the rest owing. It applies to this month only.
 */
export function LoanForm({
  name,
  scheduledKobo,
  balanceBeforeKobo,
  currentKobo,
  overridden,
  saving,
  error,
  onSave,
  onReset,
  onBack,
}: {
  name: string;
  /** The instalment the schedule would take. */
  scheduledKobo: number;
  /** Owed going into the month. */
  balanceBeforeKobo: number;
  /** What is set for this month now. */
  currentKobo: number;
  overridden: boolean;
  saving: boolean;
  error: string | null;
  onSave: (kobo: number) => void;
  onReset: () => void;
  onBack: () => void;
}) {
  const [text, setText] = useState(String(currentKobo / 100));
  const naira = Number(text.replace(/,/g, ""));
  const kobo = Math.round(naira * 100);
  const valid =
    text.trim() !== "" &&
    Number.isFinite(naira) &&
    kobo >= 0 &&
    kobo <= balanceBeforeKobo;

  return (
    <form
      className="flow-root -mb-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid && !saving) onSave(kobo);
      }}
    >
      <BackToPayslip onBack={onBack} disabled={saving} />

      <div className="flex flex-col gap-4">
        <p className="text-body-sm leading-relaxed text-body">
          How much of {name}&rsquo;s loan to take this month. The schedule says{" "}
          {formatKobo(scheduledKobo)}; they owe {formatKobo(balanceBeforeKobo)}.
          Taking more shortens the loan. Taking less leaves the rest owing.
          Only this month changes.
        </p>

        <ServerRefusal message={error} />

        <Field label="Loan deduction this month (₦)" required>
          <Input
            autoFocus
            inputMode="decimal"
            value={text}
            disabled={saving}
            className="max-sm:h-11"
            onChange={(event) => setText(event.target.value)}
          />
        </Field>

        {valid && (
          <p role="status" className="tabular text-body-sm text-muted">
            {formatKobo(Math.max(0, balanceBeforeKobo - kobo))} left after this
            month.
          </p>
        )}
      </div>

      <FormFooter
        summary={
          overridden ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving}
              className={`-ml-2 text-danger-text hover:bg-danger-soft ${TOUCH}`}
              onClick={onReset}
            >
              Back to the scheduled instalment
            </Button>
          ) : undefined
        }
      >
        <Button
          type="button"
          variant="ghost"
          className={TOUCH}
          disabled={saving}
          onClick={onBack}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="accent"
          className={TOUCH}
          loading={saving}
          disabled={!valid || saving}
        >
          Save
        </Button>
      </FormFooter>
    </form>
  );
}

/* ------------------------------------------------------------------ amount */

/**
 * One figure in naira, for a PAYE, pension or housing-fund override.
 *
 * `0` is a valid answer and is the one people are usually here for ("deduct
 * nothing from this person this month"), so the placeholder shows it.
 */
export function AmountForm({
  label,
  intro,
  now,
  valueKobo,
  placeholder = "0",
  saveLabel,
  undoLabel,
  saving,
  error,
  onSave,
  onUndo,
  onBack,
}: {
  label: string;
  /** What saving will do, leading with the consequence. */
  intro: React.ReactNode;
  /** What the figure is right now and where it came from. */
  now: React.ReactNode;
  valueKobo: number;
  placeholder?: string;
  saveLabel: string;
  /** Present only when there is a hand-entered figure to take back to the bands. */
  undoLabel?: string;
  saving: boolean;
  error: string | null;
  onSave: (kobo: number) => void;
  onUndo?: () => void;
  onBack: () => void;
}) {
  const [text, setText] = useState(String(valueKobo / 100));
  const kobo = nairaToKobo(text);

  return (
    <form
      className="flow-root -mb-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (kobo !== null && !saving) onSave(kobo);
      }}
    >
      <BackToPayslip onBack={onBack} disabled={saving} />

      <div className="flex flex-col gap-4">
        <p className="text-body-sm leading-relaxed text-body">{intro}</p>

        <ServerRefusal message={error} />

        <p className="text-body-sm text-ink">{now}</p>

        <Field
          label={label}
          required
          {...(text.trim() !== "" && kobo === null
            ? { error: "A figure, in naira." }
            : {})}
        >
          <Input
            autoFocus
            inputMode="decimal"
            placeholder={placeholder}
            value={text}
            disabled={saving}
            className="max-sm:h-11"
            onChange={(event) => setText(event.target.value)}
          />
        </Field>

        {kobo !== null && (
          <p role="status" className="tabular text-body-sm text-muted">
            Will read {formatKobo(kobo)}.
          </p>
        )}
      </div>

      <FormFooter
        summary={
          undoLabel && onUndo ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving}
              className={`-ml-2 ${TOUCH}`}
              onClick={onUndo}
            >
              {undoLabel}
            </Button>
          ) : undefined
        }
      >
        <Button
          type="button"
          variant="ghost"
          className={TOUCH}
          disabled={saving}
          onClick={onBack}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="accent"
          className={TOUCH}
          loading={saving}
          disabled={kobo === null || saving}
        >
          {saveLabel}
        </Button>
      </FormFooter>
    </form>
  );
}
