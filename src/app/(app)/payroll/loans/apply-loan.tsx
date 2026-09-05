"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Wallet } from "lucide-react";
import {
  Button,
  Callout,
  DescriptionList,
  Field,
  Input,
  Modal,
  Select,
  Switch,
  Textarea,
  formatMoney,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { kobo, naira, type ApiLoanDetail } from "@/lib/api/loans";
import { addMonths, monthLabel, priceLoan } from "@/lib/loans/schedule";
import { useLoanActions } from "@/lib/store/loans";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { usePayPreview } from "@/lib/store/pay-components";
import { useSession } from "@/lib/store/session";
import { TODAY } from "@/lib/today";

/**
 * Applying for a staff loan.
 *
 * ## The form asks three things
 *
 * How much, over how many months, and what for. Everything else — who it is for,
 * when the deductions start, whether interest is charged — has a sensible answer
 * already and sits behind one disclosure. A Nigerian small-business owner who
 * lends a member of staff ₦200,000 is not filling in an origination form.
 *
 * ## And then it shows the number they are actually deciding on
 *
 * Not the amount borrowed — they already know that, they typed it. **The monthly
 * deduction and what it leaves them to live on.** "₦50,000 a month comes out of
 * your pay, leaving about ₦339,000" is the sentence somebody weighs before they
 * commit, and a form that collects an amount and a term without showing it has
 * made the applicant do payroll arithmetic in their head.
 *
 * The take-home figure is the applicant's real one, read from the API — the same
 * payslip preview the record page and the allowances panel show, computed by the
 * engine the payroll run uses. This screen used to compute it in the browser
 * from a second copy of that engine, which for a while was on the 2011 PAYE
 * bands and therefore quoted a take-home ₦683.33 a month too high.
 *
 * The "after" figure needs no engine at all, which is the point worth keeping: a
 * loan repayment is an **after-tax** deduction, so it comes off net once PAYE,
 * pension and NHF are all settled and take-home falls by exactly its own
 * amount. The single piece of arithmetic here is the cap — an instalment cannot
 * take more than there is, and the payroll run carries the remainder forward
 * rather than paying somebody a negative amount.
 *
 * When the pay figure is not available — no API, no permission to read it, or no
 * salary on the record — the deduction is still shown and the take-home line
 * says plainly that it cannot be worked out. An invented number here would be a
 * number somebody borrows against.
 */

/* ------------------------------------------------------------------ parsing */

/** `"₦500,000.50"`, `"500000"` and `"500,000"` all mean the same thing. */
function parseNaira(text: string): number | null {
  const cleaned = text.replace(/[^0-9.]/g, "");
  if (cleaned === "" || cleaned === ".") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function parseWhole(text: string): number | null {
  const value = Number(text.replace(/[^0-9]/g, ""));
  return Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * The shortest term that brings the instalment inside a third of take-home.
 *
 * A third is a judgement, not a statute: it is roughly where a deduction stops
 * being an inconvenience and starts being the reason somebody borrows again next
 * month. Used only to make the suggestion button say a real number.
 */
function comfortableTerm(
  principalKobo: number,
  interestRate: number,
  netKobo: number,
  from: number,
): number | null {
  const ceiling = Math.round(netKobo / 3);
  if (ceiling <= 0) return null;
  for (let term = from + 1; term <= 60; term += 1) {
    const priced = priceLoan({
      principalKobo,
      termMonths: term,
      interestRate,
      startPeriod: TODAY,
    });
    if (priced && priced.instalmentKobo <= ceiling) return term;
  }
  return null;
}

/* --------------------------------------------------------------- the picker */

/**
 * Who the loan is for.
 *
 * Rendered only for somebody with `EDIT_RECORDS`, which is also the permission
 * the API checks — so the request that follows cannot be one this control
 * offered and the server refuses. It exists because plenty of staff loans are
 * asked for in person and typed in by whoever was asked.
 */
function PersonPicker({
  value,
  onChange,
  selfId,
}: {
  value: string;
  onChange: (id: string) => void;
  selfId: string | null;
}) {
  const { employees, loading } = useEmployeeDirectory({ pageSize: 200 });

  return (
    <Field
      label="Who is this for?"
      help={loading ? "Loading the directory…" : undefined}
    >
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        {selfId && <option value={selfId}>Me</option>}
        {employees
          .filter((employee) => employee.id !== selfId)
          .map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.firstName} {employee.lastName} · {employee.jobTitle}
            </option>
          ))}
      </Select>
    </Field>
  );
}

/* ----------------------------------------------------------------- the form */

/**
 * Mounted when opened, rather than kept alive behind an `open` flag.
 *
 * A form that stays mounted has to clear itself when it is reopened, and that
 * means a `setState` in an effect — a cascading render, and what
 * `react-hooks/set-state-in-effect` exists to prevent. Callers render
 * `{applying && <ApplyLoanModal … />}` and every field starts empty because it
 * is a new mount.
 */
export function ApplyLoanModal({
  onClose,
  onApplied,
  /** Fixes the applicant. Used by `MyLoans`, where the answer is never in doubt. */
  forEmployeeId,
  canApplyForOthers = false,
}: {
  onClose: () => void;
  onApplied?: (loan: ApiLoanDetail) => void;
  forEmployeeId?: string | null;
  canApplyForOthers?: boolean;
}) {
  const { employeeId: selfId } = useSession();
  const { apply } = useLoanActions();
  const toast = useToast();

  const fixedId = forEmployeeId ?? selfId ?? null;
  const [target, setTarget] = useState<string>(fixedId ?? "");
  const [amount, setAmount] = useState("");
  const [term, setTerm] = useState("6");
  const [reason, setReason] = useState("");
  const [startsIn, setStartsIn] = useState<"0" | "1" | "2">("1");
  const [charging, setCharging] = useState(false);
  const [rate, setRate] = useState("5");
  const [showMore, setShowMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);

  const applicantId = canApplyForOthers ? target || fixedId : fixedId;
  const forSomebodyElse = Boolean(
    applicantId && selfId && applicantId !== selfId,
  );
  /**
   * Whether the request should name the applicant explicitly, as against
   * relying on the API's own `actor.employeeId` fallback.
   *
   * Not the same question as `forSomebodyElse`, which is "is this applicant
   * someone other than me" and exists for the pronoun in the copy below. This
   * one is "did this screen choose an applicant at all" — true whenever
   * `canApplyForOthers` picked somebody, even if that somebody is the caller
   * themselves, and even when the caller's own login has no linked employee
   * record (`selfId === null`) to compare against. Using `forSomebodyElse`
   * here was the bug: with no employee record on their own login, it could
   * never be true, so `employeeId` was never sent and the API fell back to
   * `actor.employeeId` — also null — and refused with "This login is not
   * linked to an employee record" no matter who was chosen in the picker.
   */
  const explicitApplicant = canApplyForOthers && Boolean(applicantId);
  /**
   * The applicant's payslip, from the API.
   *
   * `GET /pay-components/preview/:employeeId` — their real net, with their real
   * allowances and deductions in it, rather than a figure derived from the
   * headline salary. Offline it is unavailable and every figure below that
   * depends on it disappears; there is no browser-side engine to fall back to
   * any more, and a loan is the last place to want an estimate.
   *
   * Not debounced: nothing the applicant types changes this request. Only the
   * instalment moves, and that is arithmetic on the answer rather than a new
   * question.
   */
  const pay = usePayPreview(applicantId);
  const netBeforeKobo = pay.data?.payslip.netKobo ?? null;

  const principal = parseNaira(amount);
  const months = parseWhole(term);
  const interestRate = charging ? (parseNaira(rate) ?? 0) / 100 : 0;
  const startPeriod = addMonths(TODAY, Number(startsIn));

  const priced = useMemo(
    () =>
      principal !== null && months !== null
        ? priceLoan({
            principalKobo: kobo(principal),
            termMonths: months,
            interestRate,
            startPeriod,
          })
        : null,
    [principal, months, interestRate, startPeriod],
  );

  /**
   * The whole point of the screen, in whole kobo.
   *
   * `netBeforeKobo` is the engine's. The instalment is subtracted from it and
   * capped at what is there — the same cap `computePayslip` applies, for the
   * same reason: a month of unpaid leave is enough to make an instalment
   * unrecoverable, and the loan carries the remainder rather than the payslip
   * going negative.
   */
  const effect = useMemo(() => {
    if (!priced || netBeforeKobo === null || netBeforeKobo <= 0) return null;
    const monthlyKobo = priced.instalmentKobo;
    const takenKobo = Math.min(monthlyKobo, netBeforeKobo);
    return {
      monthlyKobo,
      netBeforeKobo,
      netAfterKobo: netBeforeKobo - takenKobo,
    };
  }, [priced, netBeforeKobo]);

  const overCommitted =
    effect !== null && effect.netAfterKobo <= 0
      ? "none"
      : effect !== null && effect.monthlyKobo > effect.netBeforeKobo / 3
        ? "tight"
        : null;

  const suggestion =
    overCommitted && priced && effect
      ? comfortableTerm(
          priced.principalKobo,
          interestRate,
          effect.netBeforeKobo,
          months ?? 1,
        )
      : null;

  const ready = priced !== null && Boolean(applicantId);

  async function submit() {
    if (!priced || !months || principal === null) return;
    setSubmitting(true);
    setFailure(null);
    try {
      const loan = await apply({
        ...(explicitApplicant && applicantId ? { employeeId: applicantId } : {}),
        principalKobo: priced.principalKobo,
        termMonths: months,
        ...(interestRate > 0 ? { interestRate } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        startPeriod,
      });
      toast.push({
        title: "Sent for approval",
        tone: "success",
        detail: `${formatMoney(naira(priced.instalmentKobo), "NGN", {
          decimals: true,
        })} a month from ${monthLabel(startPeriod)}, once somebody approves it.`,
      });
      onApplied?.(loan);
      onClose();
    } catch (error) {
      setFailure(error instanceof ApiError ? error : null);
    } finally {
      setSubmitting(false);
    }
  }

  const money = (amountKobo: number) =>
    formatMoney(naira(amountKobo), "NGN", { decimals: true });

  return (
    <Modal
      open
      onClose={onClose}
      title="Apply for a loan"
      description="Three questions, then you see what it costs you a month."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            onClick={() => void submit()}
            disabled={!ready}
            loading={submitting}
          >
            Send for approval
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {failure && (
          <Callout tone="danger" title="That did not go through">
            {failure.message}
          </Callout>
        )}

        {canApplyForOthers && (
          <PersonPicker value={target} onChange={setTarget} selfId={selfId} />
        )}

        <Field
          label="How much do you need?"
          required
          error={failure?.messageFor("principalKobo")}
          help="In naira. Type it however you like: 500000 or 500,000."
        >
          <Input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            autoComplete="off"
            placeholder="500,000"
          />
        </Field>

        <Field
          label="Over how many months?"
          required
          error={failure?.messageFor("termMonths")}
        >
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            inputMode="numeric"
            autoComplete="off"
            className="max-w-32"
          />
        </Field>

        <Field
          label="What is it for?"
          error={failure?.messageFor("reason")}
          help="One line. Whoever approves it reads this and nothing else."
        >
          <Textarea
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="School fees for my daughter's second term."
          />
        </Field>

        {/* ------------------------------------------------ what it costs */}

        {priced && (
          <div className="rounded-lg border border-line bg-canvas p-4">
            <p className="text-body leading-relaxed">
              <strong className="font-semibold">
                {money(priced.instalmentKobo)} a month
              </strong>{" "}
              comes out of {forSomebodyElse ? "their" : "your"} pay for{" "}
              {months} {months === 1 ? "month" : "months"}
              {/* Only when something is actually left. A deduction bigger than
                  the pay it comes out of has no "leaving about" — printing a
                  negative take-home would be arithmetic nobody can act on, and
                  the warning underneath is the thing to read instead. */}
              {effect && effect.netAfterKobo > 0 ? (
                <>
                  , leaving about{" "}
                  <strong className="font-semibold">
                    {money(effect.netAfterKobo)}
                  </strong>{" "}
                  to take home.
                </>
              ) : (
                "."
              )}
            </p>

            {effect && effect.netAfterKobo > 0 ? (
              <p className="mt-1.5 text-body-sm text-body">
                Take-home now {money(effect.netBeforeKobo)} · first deduction{" "}
                {monthLabel(startPeriod)} · last{" "}
                {monthLabel(
                  priced.lines[priced.lines.length - 1]?.dueDate ?? startPeriod,
                )}
              </p>
            ) : (
              <p className="mt-1.5 text-body-sm text-body">
                First deduction {monthLabel(startPeriod)}, last{" "}
                {monthLabel(
                  priced.lines[priced.lines.length - 1]?.dueDate ?? startPeriod,
                )}
                .
                {effect
                  ? ` Take-home now ${money(effect.netBeforeKobo)}.`
                  : pay.available
                    ? " Take-home is not shown because there is no pay figure on this record we can read."
                    : " Take-home is worked out by the payroll engine on the API, which is not answering, so it is not shown."}
              </p>
            )}

            <DescriptionList
              className="mt-4"
              columns={2}
              items={[
                { term: "Borrowing", value: money(priced.principalKobo) },
                {
                  term: "Interest",
                  value:
                    priced.interestKobo === 0
                      ? "None"
                      : `${money(priced.interestKobo)} · ${(
                          interestRate * 100
                        ).toFixed(2)}% a year`,
                },
                { term: "Total to repay", value: money(priced.totalKobo) },
                {
                  term:
                    priced.finalInstalmentKobo === priced.instalmentKobo
                      ? "Every month"
                      : "Last month",
                  value:
                    priced.finalInstalmentKobo === priced.instalmentKobo
                      ? money(priced.instalmentKobo)
                      : `${money(priced.finalInstalmentKobo)} (the balancing figure)`,
                },
              ]}
            />
          </div>
        )}

        {/* The rule: a sentence explaining a problem should be a button fixing
            it. So the warning names the figure and the button changes the term. */}
        {overCommitted === "none" && effect && (
          <Callout
            tone="danger"
            icon={<AlertTriangle aria-hidden="true" />}
            title="That leaves nothing to live on"
          >
            <p className="text-body-sm leading-relaxed">
              {money(effect.monthlyKobo)} a month is more than the whole
              take-home of {money(effect.netBeforeKobo)}.
            </p>
            {suggestion && (
              <Button
                size="sm"
                className="mt-2"
                onClick={() => setTerm(String(suggestion))}
              >
                Spread it over {suggestion} months instead
              </Button>
            )}
          </Callout>
        )}

        {overCommitted === "tight" && effect && (
          <Callout
            tone="warning"
            icon={<Wallet aria-hidden="true" />}
            title="More than a third of take-home"
          >
            <p className="text-body-sm leading-relaxed">
              {money(effect.monthlyKobo)} out of {money(effect.netBeforeKobo)} a
              month.
            </p>
            {suggestion && (
              <Button
                size="sm"
                className="mt-2"
                onClick={() => setTerm(String(suggestion))}
              >
                Spread it over {suggestion} months instead
              </Button>
            )}
          </Callout>
        )}

        {/* ------------------------------------------------- everything else */}

        {showMore ? (
          <div className="flex flex-col gap-4 rounded-lg border border-line p-4">
            <Field
              label="When do deductions start?"
              error={failure?.messageFor("startPeriod")}
            >
              <Select
                value={startsIn}
                onChange={(event) =>
                  setStartsIn(event.target.value as "0" | "1" | "2")
                }
              >
                <option value="0">
                  {monthLabel(addMonths(TODAY, 0))} (this month&rsquo;s payroll)</option>
                <option value="1">{monthLabel(addMonths(TODAY, 1))}</option>
                <option value="2">{monthLabel(addMonths(TODAY, 2))}</option>
              </Select>
            </Field>

            <Switch
              label="Charge interest on this loan"
              description="Most staff loans here are interest-free. Leave this alone unless yours is not."
              checked={charging}
              onChange={(event) => setCharging(event.target.checked)}
            />

            {charging && (
              <Field
                label="Rate a year"
                error={failure?.messageFor("interestRate")}
                help="A flat annual rate, as a percentage. 5% on ₦300,000 over six months is ₦7,500."
              >
                <Input
                  value={rate}
                  onChange={(event) => setRate(event.target.value)}
                  inputMode="decimal"
                  className="max-w-32"
                />
              </Field>
            )}
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => setShowMore(true)}
          >
            Change the start month or add interest
          </Button>
        )}
      </div>
    </Modal>
  );
}
