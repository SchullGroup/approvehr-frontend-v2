"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Input, Spinner } from "@/components/ui";
import { formatKobo } from "@/lib/api/payroll";

/**
 * One field, in the cell, on the row.
 *
 * ## What this replaced, and why
 *
 * Three stacked panels — each with a paragraph of explanation, two labelled
 * fields, help text under both, and a pair of buttons — expanding inside a
 * table row. It read as a form per person. On a payroll of three hundred, which
 * is the size this product is sold at, a row that triples in height when you
 * touch it makes the table unusable: you lose your place, the rows below jump,
 * and correcting four people means four full-page scrolls.
 *
 * So: a cell becomes an input. The row does not change height. Tick to save,
 * cross to cancel, Enter and Escape do the same. Nothing else appears.
 *
 * ## The explanation went, not the meaning
 *
 * Everything those paragraphs said is still true — a bonus is one month, a pay
 * change is the contract, the overtime rate is the company's — and none of it
 * belonged in a table row, repeated per person. It is said once, above the
 * table, where somebody reads it before they start rather than three hundred
 * times while they work.
 *
 * ## The reason field went too
 *
 * `PayrollTaxOverride.reason` and its two siblings are optional on the API for
 * this: a required paragraph per row is how a trail fills up with full stops,
 * which is a worse record than an honest blank. Who changed it and when are
 * still recorded on every one.
 */

export function InlineMoney({
  /** Kobo. The figure the cell currently shows. */
  valueKobo,
  saving,
  onSave,
  onCancel,
  placeholder,
  /** Rendered under the input while typing — the working, or nothing. */
  hint,
  onChange,
}: {
  valueKobo: number | null;
  saving: boolean;
  onSave: (kobo: number) => void;
  onCancel: () => void;
  placeholder?: string;
  hint?: string;
  onChange?: (naira: number | null) => void;
}) {
  const [text, setText] = useState(
    valueKobo === null ? "" : String(valueKobo / 100),
  );
  const parsed = Number(text);
  const valid = text.trim() !== "" && Number.isFinite(parsed) && parsed >= 0;

  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-1">
        <Input
          autoFocus
          inputMode="decimal"
          value={text}
          placeholder={placeholder}
          aria-label={placeholder}
          disabled={saving}
          className="h-8 w-28 text-right"
          onChange={(event) => {
            setText(event.target.value);
            const next = Number(event.target.value);
            onChange?.(
              event.target.value.trim() === "" || !Number.isFinite(next)
                ? null
                : next,
            );
          }}
          /* Enter saves, Escape cancels. On a table somebody is working down,
             reaching for a mouse per row is the slow part. */
          onKeyDown={(event) => {
            if (event.key === "Enter" && valid) onSave(Math.round(parsed * 100));
            if (event.key === "Escape") onCancel();
          }}
        />
        <button
          type="button"
          aria-label="Save"
          disabled={!valid || saving}
          onClick={() => onSave(Math.round(parsed * 100))}
          className="flex size-8 items-center justify-center rounded-md border border-line text-accent-text hover:bg-canvas disabled:text-faint"
        >
          {saving ? <Spinner size="sm" /> : <Check aria-hidden="true" className="size-4" />}
        </button>
        <button
          type="button"
          aria-label="Cancel"
          disabled={saving}
          onClick={onCancel}
          className="flex size-8 items-center justify-center rounded-md border border-line text-muted hover:bg-canvas"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </span>
      {hint && (
        <span className="text-meta leading-tight text-muted">{hint}</span>
      )}
    </span>
  );
}

/**
 * Hours in, money shown.
 *
 * The rate is not asked for and there is no kind to pick. It is the company's
 * weekday multiplier applied to an hourly figure derived from the person's own
 * salary — `monthly x 12 / 365 / hoursPerDay`, the formula from the payslip
 * workbook this was built against. One number in, one number out.
 *
 * The amount updates as they type, because "6" meaning ₦19,726.08 is the whole
 * question somebody is asking when they type it, and making them save to find
 * out is what a slow form feels like.
 */
export function InlineHours({
  hourlyKobo,
  rate,
  saving,
  onSave,
  onCancel,
}: {
  hourlyKobo: number;
  rate: number;
  saving: boolean;
  onSave: (hours: number) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const parsed = Number(text);
  const valid = text.trim() !== "" && Number.isFinite(parsed) && parsed > 0;
  const amount = valid ? Math.round(hourlyKobo * parsed * rate) : null;

  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-1">
        <Input
          autoFocus
          inputMode="decimal"
          value={text}
          placeholder="hours"
          aria-label="Overtime hours"
          disabled={saving}
          className="h-8 w-20 text-right"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && valid) onSave(parsed);
            if (event.key === "Escape") onCancel();
          }}
        />
        <button
          type="button"
          aria-label="Save"
          disabled={!valid || saving}
          onClick={() => onSave(parsed)}
          className="flex size-8 items-center justify-center rounded-md border border-line text-accent-text hover:bg-canvas disabled:text-faint"
        >
          {saving ? <Spinner size="sm" /> : <Check aria-hidden="true" className="size-4" />}
        </button>
        <button
          type="button"
          aria-label="Cancel"
          disabled={saving}
          onClick={onCancel}
          className="flex size-8 items-center justify-center rounded-md border border-line text-muted hover:bg-canvas"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </span>
      <span className="text-meta leading-tight text-muted">
        {amount === null
          ? `${formatKobo(hourlyKobo)}/h x ${String(rate)}`
          : `${formatKobo(hourlyKobo)} x ${text}h x ${String(rate)} = ${formatKobo(amount)}`}
      </span>
    </span>
  );
}
