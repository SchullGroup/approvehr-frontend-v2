"use client";

import { useCallback, useMemo, useState } from "react";
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
import {
  allocatePayment,
  describeSplit,
  sharesList,
} from "@/lib/loans/payment-split";
import { addMonths, monthLabel, priceLoan } from "@/lib/loans/schedule";
import { useLoanActions, useLoanToday } from "@/lib/store/loans";
import { StartMonthSelect, useStartMonths } from "./start-months";

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
 * An administrator stopping a loan that was already approved: made by mistake, or for the wrong person
 * or amount. It is kept in history as cancelled, with the reason. What was repaid stays repaid.
 */
export function CancelLoanModal({
  loan,
  onClose,
  onDone,
}: {
  loan: ApiLoan;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { cancel } = useLoanActions();
  const toast = useToast();
  const { failure, clear, capture } = useFailure();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    clear();
    try {
      await cancel(loan.id, reason.trim());
      toast.push({
        title: `Cancelled ${loan.employeeName}'s loan`,
        tone: "success",
        detail: "It is in history now. Nothing more comes off their pay.",
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
      title={`Cancel ${loan.employeeName}'s loan`}
      description={`${money(loan.principalKobo)} over ${loan.termMonths} months. ${money(loan.outstandingKobo)} is still to be repaid.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep it
          </Button>
          <Button
            variant="danger"
            loading={saving}
            disabled={reason.trim().length < 3}
            onClick={() => void submit()}
          >
            Cancel the loan
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
          label="Why is it being cancelled?"
          required
          error={failure?.messageFor("reason")}
          help="Kept with the loan. Anything already repaid stays on its schedule, and the rest is written off."
        >
          <Textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Approved for the wrong person."
          />
        </Field>
      </div>
    </Modal>
  );
}

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
        title: own
          ? "Application withdrawn"
          : `Declined ${loan.employeeName}'s loan`,
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
      title={
        own
          ? "Withdraw this application"
          : `Decline ${loan.employeeName}'s loan`
      }
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
          label={
            own ? "Why are you withdrawing it?" : "Why are you declining it?"
          }
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

/* ------------------------------------------------------------ first deduction */

/**
 * Change the month a loan starts coming off, while nothing has come off it.
 *
 * For a loan entered with the wrong first month. The amounts and the number of
 * instalments stay; every date moves.
 */
export function RescheduleLoanModal({
  loan,
  onClose,
}: {
  loan: ApiLoanDetail;
  onClose: () => void;
}) {
  const { reschedule } = useLoanActions();
  const today = useLoanToday();
  const toast = useToast();
  const { failure, clear, capture } = useFailure();
  const [startsIn, setStartsIn] = useState("0");
  const [saving, setSaving] = useState(false);
  const startPeriod = addMonths(today, Number(startsIn));
  const startMonths = useStartMonths({
    today,
    employeeId: loan.employeeId,
    scope: "all",
    excludeLoanId: loan.id,
  });

  async function submit() {
    setSaving(true);
    clear();
    try {
      await reschedule(loan.id, startPeriod);
      toast.push({
        title: `${loan.employeeName}'s loan now starts in ${monthLabel(startPeriod)}`,
        tone: "success",
        detail:
          "A payroll already calculated picks it up when you run it again.",
      });
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
      title="Change the first deduction"
      description={`${loan.employeeName}'s loan. The amounts stay; every date moves.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={saving}
            onClick={() => void submit()}
          >
            Move it to {monthLabel(startPeriod)}
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
          label="First deduction"
          error={failure?.messageFor("startPeriod")}
          {...(startMonths.endsLabel
            ? { help: `Their other loan finishes ${startMonths.endsLabel}.` }
            : {})}
        >
          <StartMonthSelect
            value={startsIn}
            onChange={setStartsIn}
            months={startMonths}
          />
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------- spread */

/**
 * Spread what is still owed over a number of months.
 *
 * For a loan whose schedule is too lumpy to pay: two loans combined into one on a one-month term left ₦310,000 due at
 * once. Nothing owed changes, only when it comes off. The instalments before the chosen month stay as they are, and a
 * smaller figure set for the payroll being worked is respected. The reason is the record.
 */
export function SpreadLoanModal({
  loan,
  onClose,
}: {
  loan: ApiLoanDetail;
  onClose: () => void;
}) {
  const { respread } = useLoanActions();
  const today = useLoanToday();
  const toast = useToast();
  const { failure, clear, capture } = useFailure();
  const [months, setMonths] = useState("5");
  const [startsIn, setStartsIn] = useState("1");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const startPeriod = addMonths(today, Number(startsIn));
  const count = Number(months);
  const valid =
    Number.isInteger(count) &&
    count >= 1 &&
    count <= 60 &&
    reason.trim().length >= 3;

  async function submit() {
    setSaving(true);
    clear();
    try {
      await respread(loan.id, {
        startPeriod,
        termMonths: count,
        reason: reason.trim(),
      });
      toast.push({
        title: `${loan.employeeName}'s loan is spread over ${String(count)} ${count === 1 ? "month" : "months"}`,
        tone: "success",
        detail: `From ${monthLabel(startPeriod)}. A payroll already calculated picks it up when you run it again.`,
      });
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
      title="Spread over months"
      description={`${loan.employeeName}'s loan still owes ${money(loan.outstandingKobo)}. What is owed does not change, only when it comes off.`}
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
            Spread it
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
        <p className="text-body-sm leading-relaxed text-body">
          Everything still owed from {monthLabel(startPeriod)} on is divided
          into equal monthly instalments. Instalments before then stay as they
          are, including a smaller figure set for the payroll being worked: the
          difference is spread too.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Over how many months"
            required
            error={failure?.messageFor("termMonths")}
          >
            <Input
              inputMode="numeric"
              value={months}
              disabled={saving}
              onChange={(event) => setMonths(event.target.value)}
            />
          </Field>
          <Field
            label="Starting"
            required
            error={failure?.messageFor("startPeriod")}
          >
            <Select
              value={startsIn}
              onChange={(event) => setStartsIn(event.target.value)}
            >
              {Array.from({ length: 13 }, (_, i) => (
                <option key={i} value={String(i)}>
                  {monthLabel(addMonths(today, i))}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field
          label="Why?"
          required
          error={failure?.messageFor("reason")}
          help="Kept with the loan, for whoever asks later."
        >
          <Textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Two loans were combined on a one-month term; too much to pay at once."
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
  /**
   * Told the loan as approved, so the caller can say what was approved. The
   * modal does not announce it: its toast named the figure and was gone in six
   * seconds, and the caller's card at the top of the page stays.
   */
  onDone?: (approved: ApiLoanDetail) => void;
}) {
  const { approve } = useLoanActions();
  const today = useLoanToday();
  const { failure, clear, capture } = useFailure();
  /* Seeded from what was applied for, because a counter-offer is an edit to it. */
  const [amount, setAmount] = useState(String(naira(loan.principalKobo)));
  const [term, setTerm] = useState(String(loan.termMonths));
  const [startsIn, setStartsIn] = useState("0");
  const [saving, setSaving] = useState(false);

  const principal = Number(amount.replace(/[^0-9.]/g, ""));
  const months = Number(term.replace(/[^0-9]/g, ""));
  const startPeriod = addMonths(today, Number(startsIn));
  const startMonths = useStartMonths({
    today,
    employeeId: loan.employeeId,
    scope: "all",
    excludeLoanId: loan.id,
  });
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
      const approved = await approve(loan.id, {
        principalKobo: priced.principalKobo,
        termMonths: months,
        startPeriod,
      });
      onDone?.(approved);
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
          help={
            startMonths.endsLabel
              ? `Their current loan finishes ${startMonths.endsLabel}.`
              : "This month comes off the payroll being worked the next time it is calculated."
          }
        >
          <StartMonthSelect
            value={startsIn}
            onChange={setStartsIn}
            months={startMonths}
          />
        </Field>

        {priced && (
          <div className="rounded-lg border border-line bg-canvas p-4 text-ink">
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
 *
 * ## More than the instalment is fine
 *
 * Anything over what is owing on this instalment comes off the next ones in
 * order, and the loan finishes sooner. The dialog says where it will go as the
 * amount is typed and refuses more than the loan still owes from here on. Both
 * come from `allocatePayment`, a port of the API's, run over the schedule already
 * on screen: the server still decides, and its refusal still shows if it
 * disagrees.
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

  const rows = useMemo(
    () =>
      loan.schedule.map((row) => ({
        sequence: row.sequence,
        dueKobo: row.amountKobo,
        paidKobo: row.paidAmountKobo,
        status: row.status,
      })),
    [loan.schedule],
  );
  /* What the loan still owes from this instalment on, read off the schedule on
     screen. The most that can be recorded here. */
  const maxKobo = useMemo(
    () => allocatePayment(rows, repayment.sequence, 1).maxKobo,
    [rows, repayment.sequence],
  );
  const spills = maxKobo > repayment.remainingKobo;

  const split = valid
    ? allocatePayment(rows, repayment.sequence, kobo(value))
    : null;
  /* Only the over-the-whole-balance case is the screen's to refuse. Anything
     else the API refuses is shown as the API worded it. */
  const tooMuch =
    split && !split.ok && split.refusal.kind === "TOO_MUCH"
      ? split.refusal.message
      : null;
  const where = split?.ok ? describeSplit(split.shares, money) : null;

  async function submit() {
    if (!valid || tooMuch) return;
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
        detail:
          split?.ok && split.shares.length > 1
            ? `Instalments ${sharesList(split.shares)} of ${loan.termMonths}.`
            : `Instalment ${repayment.sequence} of ${loan.termMonths}.`,
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
      description={`${money(repayment.remainingKobo)} still owing on this one.${
        spills ? " Anything more comes off the next months." : ""
      }`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={saving}
            disabled={!valid || tooMuch !== null}
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
          error={failure?.messageFor("amountKobo") ?? tooMuch ?? undefined}
          help={
            spills
              ? `Less than the full instalment is fine: the rest stays owing. The most you can record is ${money(maxKobo)}.`
              : "Less than the full instalment is fine: the rest stays owing."
          }
        >
          <Input
            value={amount}
            inputMode="decimal"
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>
        {where && (
          <p role="status" className="-mt-2 text-body-sm text-body">
            {where}.
          </p>
        )}
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
/**
 * Taking a payment recorded by hand back out.
 *
 * For the figure that was put in as two pieces, or on the wrong instalment: it comes off the loan whole, with
 * what it spilled onto, and can be recorded again. The reason is the record.
 */
export function UndoPaymentModal({
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
  const { undoPayment } = useLoanActions();
  const toast = useToast();
  const { failure, clear, capture } = useFailure();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    clear();
    try {
      await undoPayment(loan.id, repayment.sequence, reason.trim());
      toast.push({
        title: "Payment taken back",
        tone: "success",
        detail: `It can be recorded again on ${loan.employeeName}'s loan.`,
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
      title={`Undo the payment on instalment ${repayment.sequence}`}
      description={`${money(repayment.paidAmountKobo)} comes off the record, with anything it spilled onto the next instalments. Nothing is deducted for it until it is recorded again.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={saving}
            disabled={reason.trim().length < 3}
            onClick={() => void submit()}
          >
            Undo the payment
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
          error={failure?.messageFor("reason")}
          help="Kept with the loan, for whoever asks later."
        >
          <Textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Recorded in two pieces; recording it again as one."
          />
        </Field>
      </div>
    </Modal>
  );
}

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
