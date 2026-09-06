"use client";

import { useCallback, useState } from "react";
import {
  Button,
  Callout,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
  formatMoney,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  kobo,
  naira,
  type ApiLoan,
  type ApiLoanDetail,
  type ApiRepayment,
} from "@/lib/api/loans";
import { addMonths, monthLabel, priceLoan } from "@/lib/loans/schedule";
import { useLoanActions } from "@/lib/store/loans";
import { TODAY } from "@/lib/today";

/**
 * The dialogs behind the four decisions that need more than one click.
 *
 * Approving does not appear here on purpose. It is one button on the row, with
 * no dialog in front of it, because the product is called ApproveHR and the most
 * common thing anybody does in it should not cost three interactions. Everything
 * in this file is one of the four cases that genuinely needs a sentence typed:
 *
 * | | Needs | Why |
 * |---|---|---|
 * | Decline | a reason | "Declined" with nothing against it is a support call |
 * | Counter-offer | new terms | ₦200,000 over six against an application for ₦300,000 over three |
 * | Record a payment | an amount | money that came back outside payroll |
 * | Write one off | a note | somebody chose to give up company money |
 *
 * Each mirrors the API's own validation, so a refusal is rare and, when it does
 * come, is shown as the API worded it rather than paraphrased.
 *
 * ## Every dialog here takes its subject non-null, and is mounted when opened
 *
 * Callers render `{declining && <DeclineLoanModal key={declining.id} … />}`
 * rather than passing an `open` flag. That is not a style preference: a dialog
 * that stays mounted has to clear its own fields when its subject changes, which
 * means a `setState` inside an effect — a cascading render, and the thing the
 * `react-hooks/set-state-in-effect` rule exists to stop. Mounting on open makes
 * `useState(initialFromProps)` correct by construction, and the `key` handles
 * the case where one dialog is reopened for a different loan.
 */

const money = (amountKobo: number) =>
  formatMoney(naira(amountKobo), "NGN", { decimals: true });

/** Turns an ApiError into something to render, keeping the API's words. */
function useFailure() {
  const [failure, setFailure] = useState<ApiError | null>(null);
  /* Stable, so an effect that resets the dialog can depend on it honestly
     rather than silencing the dependency rule. */
  const clear = useCallback(() => setFailure(null), []);
  const capture = useCallback(
    (error: unknown) => setFailure(error instanceof ApiError ? error : null),
    [],
  );
  return { failure, clear, capture };
}

/* ------------------------------------------------------------------ decline */

/**
 * Declining, or withdrawing your own.
 *
 * The same endpoint either way — the API allows self-decline where it refuses
 * self-approval, because turning down your own application is withdrawing it and
 * that harms nobody. The copy changes because the act is not the same act.
 */
export function DeclineLoanModal({
  loan,
  own = false,
  onClose,
  onDone,
}: {
  loan: ApiLoan;
  own?: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { decline } = useLoanActions();
  const toast = useToast();
  const { failure, clear, capture } = useFailure();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    clear();
    try {
      await decline(loan.id, reason.trim());
      toast.push({
        title: own ? "Application withdrawn" : `Declined ${loan.employeeName}'s loan`,
        tone: "success",
        detail: own ? undefined : "They will see the reason you gave.",
      });
      onDone?.();
      onClose();
    } catch (error) {
      capture(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={own ? "Withdraw this application" : `Decline ${loan.employeeName}'s loan`}
      description={
        own
          ? "Nothing is deducted and you can apply again whenever you like."
          : `${money(loan.principalKobo)} over ${loan.termMonths} months.`
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep it open
          </Button>
          <Button
            variant="danger"
            loading={saving}
            disabled={reason.trim().length < 3}
            onClick={() => void submit()}
          >
            {own ? "Withdraw it" : "Decline it"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {failure && (
          <Callout tone="danger" title="That did not go through">
            {failure.message}
          </Callout>
        )}
        <Field
          label={own ? "Why are you withdrawing it?" : "Why are you declining it?"}
          required
          error={failure?.messageFor("reason")}
          help={
            own
              ? "For your own record."
              : "They see this, so write it as you would say it to them."
          }
        >
          <Textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={
              own
                ? "Sorted it another way."
                : "Twelve months instead of four keeps the deduction under a third of your pay. Reapply and I will approve it."
            }
          />
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ counter-offer */

/**
 * Approving different terms from the ones applied for.
 *
 * One endpoint with the plain Approve, so a counter-offer is not a separate
 * decision to chase — the alternative is making the employee reapply, which
 * turns one conversation into three.
 */
export function CounterOfferModal({
  loan,
  onClose,
  onDone,
}: {
  loan: ApiLoanDetail;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { approve } = useLoanActions();
  const toast = useToast();
  const { failure, clear, capture } = useFailure();
  /* Seeded from what was applied for, because a counter-offer is an edit to it. */
  const [amount, setAmount] = useState(String(naira(loan.principalKobo)));
  const [term, setTerm] = useState(String(loan.termMonths));
  const [startsIn, setStartsIn] = useState<"0" | "1" | "2">("1");
  const [saving, setSaving] = useState(false);

  const principal = Number(amount.replace(/[^0-9.]/g, ""));
  const months = Number(term.replace(/[^0-9]/g, ""));
  const startPeriod = addMonths(TODAY, Number(startsIn));
  const priced =
    principal > 0 && months > 0
      ? priceLoan({
          principalKobo: kobo(principal),
          termMonths: months,
          interestRate: loan.interestRate,
          startPeriod,
        })
      : null;

  async function submit() {
    if (!priced) return;
    setSaving(true);
    clear();
    try {
      await approve(loan.id, {
        principalKobo: priced.principalKobo,
        termMonths: months,
        startPeriod,
      });
      toast.push({
        title: `Approved ${money(priced.principalKobo)} over ${months} months`,
        tone: "success",
        detail: `${money(priced.instalmentKobo)} comes out from ${monthLabel(startPeriod)}.`,
      });
      onDone?.();
      onClose();
    } catch (error) {
      capture(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="Approve different terms"
      description={`${loan.employeeName} asked for ${money(loan.principalKobo)} over ${loan.termMonths} months.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="approve"
            loading={saving}
            disabled={!priced}
            onClick={() => void submit()}
          >
            Approve these terms
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {failure && (
          <Callout tone="danger" title="That did not go through">
            {failure.message}
          </Callout>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount" error={failure?.messageFor("principalKobo")}>
            <Input
              value={amount}
              inputMode="decimal"
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
          <Field label="Months" error={failure?.messageFor("termMonths")}>
            <Input
              value={term}
              inputMode="numeric"
              onChange={(event) => setTerm(event.target.value)}
            />
          </Field>
        </div>

        <Field
          label="First deduction"
          error={failure?.messageFor("startPeriod")}
          help="Payroll that has already been calculated cannot take this month's."
        >
          <Select
            value={startsIn}
            onChange={(event) => setStartsIn(event.target.value as "0" | "1" | "2")}
          >
            <option value="0">{monthLabel(addMonths(TODAY, 0))}</option>
            <option value="1">{monthLabel(addMonths(TODAY, 1))}</option>
            <option value="2">{monthLabel(addMonths(TODAY, 2))}</option>
          </Select>
        </Field>

        {priced && (
          <div className="rounded-lg border border-line bg-canvas p-4 text-body text-ink">
            <strong className="font-semibold">
              {money(priced.instalmentKobo)} a month
            </strong>{" "}
            from {monthLabel(startPeriod)} until{" "}
            {monthLabel(
              priced.lines[priced.lines.length - 1]?.dueDate ?? startPeriod,
            )}
            .
            {priced.interestKobo > 0 && (
              <span className="text-body">
                {" "}
                Includes {money(priced.interestKobo)} interest.
              </span>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------- a payment in */

/**
 * A payment that did not come out of payroll — a transfer, cash, a cheque.
 *
 * Prefilled with what the instalment still owes, because that is what somebody
 * paying it off hands over nine times in ten. Bookkeeping rather than a
 * decision, which is why the API asks for `EDIT_RECORDS` and not approval.
 */
export function PayInstalmentModal({
  loan,
  repayment,
  onClose,
  onDone,
}: {
  loan: ApiLoanDetail;
  repayment: ApiRepayment;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { pay } = useLoanActions();
  const toast = useToast();
  const { failure, clear, capture } = useFailure();
  /* Prefilled with what is still owing — what somebody clearing it hands over
     nine times in ten. */
  const [amount, setAmount] = useState(String(naira(repayment.remainingKobo)));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const value = Number(amount.replace(/[^0-9.]/g, ""));
  const valid = value > 0;

  async function submit() {
    if (!valid) return;
    setSaving(true);
    clear();
    try {
      await pay(loan.id, repayment.sequence, {
        amountKobo: kobo(value),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      toast.push({
        title: `${money(kobo(value))} recorded`,
        tone: "success",
        detail: `Instalment ${repayment.sequence} of ${loan.termMonths}.`,
      });
      onDone?.();
      onClose();
    } catch (error) {
      capture(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Record a payment for instalment ${repayment.sequence}`}
      description={`${money(repayment.remainingKobo)} still owing on this one.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={saving}
            disabled={!valid}
            onClick={() => void submit()}
          >
            Record it
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {failure && (
          <Callout tone="danger" title="That did not go through">
            {failure.message}
          </Callout>
        )}
        <Field
          label="How much came in?"
          required
          error={failure?.messageFor("amountKobo")}
          help="Less than the full instalment is fine: the rest stays owing."
        >
          <Input
            value={amount}
            inputMode="decimal"
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>
        <Field label="Note" help="How it came in, if it matters later.">
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Bank transfer, 14 August"
          />
        </Field>
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------------- writing off */

/**
 * Writing an instalment off.
 *
 * The note is required and is the whole point: a waiver is somebody choosing to
 * give up company money, and the note is the record of who and why. The API
 * refuses without one, so this button stays disabled until there is one.
 */
export function WaiveInstalmentModal({
  loan,
  repayment,
  onClose,
  onDone,
}: {
  loan: ApiLoanDetail;
  repayment: ApiRepayment;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { waive } = useLoanActions();
  const toast = useToast();
  const { failure, clear, capture } = useFailure();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    clear();
    try {
      await waive(loan.id, repayment.sequence, note.trim());
      toast.push({
        title: `${money(repayment.remainingKobo)} written off`,
        tone: "success",
        detail: `${loan.employeeName} no longer owes instalment ${repayment.sequence}.`,
      });
      onDone?.();
      onClose();
    } catch (error) {
      capture(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Write off instalment ${repayment.sequence}`}
      description={`${loan.employeeName} stops owing ${money(repayment.remainingKobo)}. This does not come back.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={saving}
            disabled={note.trim().length < 3}
            onClick={() => void submit()}
          >
            Write it off
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {failure && (
          <Callout tone="danger" title="That did not go through">
            {failure.message}
          </Callout>
        )}
        <Field
          label="Why?"
          required
          error={failure?.messageFor("note")}
          help="This is the only record of the decision. Write it for whoever reads it in two years."
        >
          <Textarea
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Agreed with the MD as part of the September settlement."
          />
        </Field>
      </div>
    </Modal>
  );
}
