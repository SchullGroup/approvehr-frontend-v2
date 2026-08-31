"use client";

import { useState } from "react";
import { Button, Field, Modal, Textarea } from "@/components/ui";

/**
 * Leaving somebody off one payroll.
 *
 * ## Why this is a form and not a confirmation
 *
 * The obvious build is a confirm dialog — "Exclude Grace Effiong from August?
 * Yes / No" — and it would ship the same behaviour. It would also throw away the
 * only thing that makes this feature different from a filter in the interface. A
 * filter lets the run go out just as well and leaves nothing behind; a year
 * later somebody has to answer *"why was Grace not paid in August?"*, and the
 * only acceptable answer is a stored reason with a name and a date on it.
 *
 * So the reason is the primary control, it is required, and the help text says
 * who it is for: not the person typing, but whoever reads the run next year. The
 * API refuses a blank one as well — this is not the only guard, and a form is
 * never the right place for the only guard.
 *
 * ## Why the consequences are listed here rather than discovered afterwards
 *
 * Three of them, because each is a thing somebody would otherwise find out the
 * hard way: no payslip at all rather than a payslip for nothing, nothing owed by
 * this run, and **back next period automatically**. The last one is what makes
 * excluding a safe thing to do — an exclusion that quietly persisted would be a
 * person unpaid for months, which is worse than the blocker it replaced.
 */
export function ExcludeFromPayrollDialog({
  open,
  name,
  periodLabel,
  onClose,
  onConfirm,
  loading = false,
  error,
}: {
  open: boolean;
  /** Whose payroll this is about. Named throughout, never "this employee". */
  name: string;
  /** "August 2026". An exclusion belongs to exactly one period. */
  periodLabel: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  loading?: boolean;
  /** A refusal from the API or the store, shown on the field it belongs to. */
  error?: string | null;
}) {
  const [reason, setReason] = useState("");

  /* The same floor the API's schema enforces. Nothing shorter than this is a
     reason, and a `min(1)` would be satisfied by a full stop. */
  /**
   * Blank is allowed. A token answer is not.
   *
   * Optional at the product owner's instruction, matching the tax override
   * one model along — a required paragraph is how a field fills up with full
   * stops, and a coerced sentence is not evidence of anything.
   *
   * The floor survives for anybody who does start typing, because leaving it
   * empty and typing "x" are different acts: the first is choosing not to
   * explain, the second is defeating a dialog, and only the second is worth
   * refusing. Same rule the API applies.
   */
  const typed = reason.trim();
  const tooShort = typed.length > 0 && typed.length < 4;
  const firstName = name.split(" ")[0] ?? name;

  function close() {
    setReason("");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={`Leave ${name} off ${periodLabel} payroll`}
      description="Everybody else gets paid. This person does not, and who decided goes on the record either way."
      size="md"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="secondary" onClick={close} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="accent"
            onClick={() => onConfirm(typed)}
            disabled={tooShort || loading}
            loading={loading}
          >
            Exclude {firstName}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Why are they not being paid this period?"
          optional
          help="Whoever asks this question next year reads exactly what you type here. Leave it blank and the run records that no reason was given."
          {...(error ? { error } : {})}
        >
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="No account number yet — being paid by hand this month."
          />
        </Field>

        <ul className="flex flex-col gap-1.5 rounded-md border border-line bg-canvas p-3">
          {[
            `${name} gets no payslip on this run — not a payslip for nothing, no payslip at all.`,
            "Nothing is owed to them by this run. Any loan instalment or expense claim of theirs waits for the next one.",
            "They are back on next period's payroll automatically. Nothing has to remember to put them there.",
          ].map((line) => (
            <li
              key={line}
              className="flex gap-2 text-body-sm leading-relaxed text-body"
            >
              <span aria-hidden="true" className="text-faint">
                —
              </span>
              <span className="min-w-0">{line}</span>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
