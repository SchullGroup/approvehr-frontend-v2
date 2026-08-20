"use client";

import { useEffect, useMemo, useState } from "react";
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
import { employees as employeesApi, toEmployee } from "@/lib/api/endpoints";
import { kobo, naira, type ApiLoanDetail } from "@/lib/api/loans";
import { addMonths, monthLabel, priceLoan } from "@/lib/loans/schedule";
import { calculatePayslip, NO_VARIATION } from "@/lib/payroll/engine";
import { usePayrollSettings } from "@/lib/payroll/use-settings";
import { useLoanActions } from "@/lib/store/loans";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { useEmployeeStore } from "@/lib/store/employees";
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
 * The take-home figure runs through the same payroll engine that computes a real
 * payslip, with the instalment as a post-tax deduction — which is what a loan
 * repayment is. It is not tax-deductible, so it comes off after PAYE, and the
 * "about" in the copy is doing honest work: a real month can carry a bonus,
 * unpaid days or a mid-month rise.
 *
 * When the pay figure is not available, the deduction is still shown and the
 * take-home line says plainly that it cannot be worked out. An invented number
 * here would be a number somebody borrows against.
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

/** Common terms, offered as one tap each so nobody has to think in months. */
const QUICK_TERMS = [3, 6, 9, 12, 18, 24];

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

/* -------------------------------------------------------------- the pay seam */

/**
 * The target's contractual monthly gross, in naira, or `null`.
 *
 * Demo mode reads the **live** local store rather than the seed array, so a
 * salary edited on `/people/[id]` shows up here — the mistake `HANDOVER.md`
 * records against `RUN_PEOPLE`. Connected, it asks for the one employee rather
 * than paging the directory: a form needs one number, and loading two hundred
 * records to find it is slowest for the company with the most staff.
 */
function useMonthlyGross(employeeId: string | null): {
  gross: number | null;
  loading: boolean;
} {
  const { isConnected } = useSession();
  const local = useEmployeeStore();
  const [fetched, setFetched] = useState<{ id: string; gross: number | null } | null>(
    null,
  );

  useEffect(() => {
    if (!isConnected || !employeeId) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const row = await employeesApi.get(employeeId, controller.signal);
        if (!cancelled) setFetched({ id: employeeId, gross: toEmployee(row).grossMonthly });
      } catch {
        /* No pay on this record, or no permission to read it. Either way the
           preview says so rather than guessing. */
        if (!cancelled) setFetched({ id: employeeId, gross: null });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, employeeId]);

  if (!isConnected) {
    const found = local.all.find((employee) => employee.id === employeeId);
    return { gross: found?.grossMonthly ?? null, loading: false };
  }

  const matched = fetched !== null && fetched.id === employeeId;
  return {
    gross: matched ? fetched.gross : null,
    loading: Boolean(employeeId) && !matched,
  };
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
  const { settings } = usePayrollSettings();
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
  const { gross } = useMonthlyGross(applicantId);

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

  /* The whole point of the screen. Both figures come from the payroll engine, so
     the "after" line is the same arithmetic a payslip would run — the instalment
     enters as a post-tax deduction, which is what a loan repayment is. */
  const effect = useMemo(() => {
    if (!priced || gross === null || gross <= 0) return null;
    const before = calculatePayslip("preview", gross, NO_VARIATION, settings);
    const monthly = naira(priced.instalmentKobo);
    const after = calculatePayslip(
      "preview",
      gross,
      { additions: 0, postTaxDeductions: monthly, unpaidDays: 0 },
      settings,
    );
    return { monthly, netBefore: before.netPay, netAfter: after.netPay };
  }, [priced, gross, settings]);

  const overCommitted =
    effect !== null && effect.netAfter <= 0
      ? "none"
      : effect !== null && effect.monthly > effect.netBefore / 3
        ? "tight"
        : null;

  const suggestion =
    overCommitted && priced && effect
      ? comfortableTerm(
          priced.principalKobo,
          interestRate,
          kobo(effect.netBefore),
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
        ...(forSomebodyElse && applicantId ? { employeeId: applicantId } : {}),
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
          help="In naira. Type it however you like — 500000 or 500,000."
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
          help="Longer means less comes out each month, and more months of it."
        >
          <div className="flex flex-col gap-2">
            <Input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              inputMode="numeric"
              autoComplete="off"
              className="max-w-32"
            />
            <div className="flex flex-wrap gap-1.5">
              {QUICK_TERMS.map((quick) => (
                <Button
                  key={quick}
                  type="button"
                  size="sm"
                  variant={months === quick ? "primary" : "ghost"}
                  aria-pressed={months === quick}
                  onClick={() => setTerm(String(quick))}
                >
                  {quick} months
                </Button>
              ))}
            </div>
          </div>
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
            <p className="text-[0.9375rem] leading-relaxed text-ink">
              <strong className="font-semibold">
                {money(priced.instalmentKobo)} a month
              </strong>{" "}
              comes out of {forSomebodyElse ? "their" : "your"} pay for{" "}
              {months} {months === 1 ? "month" : "months"}
              {/* Only when something is actually left. A deduction bigger than
                  the pay it comes out of has no "leaving about" — printing a
                  negative take-home would be arithmetic nobody can act on, and
                  the warning underneath is the thing to read instead. */}
              {effect && effect.netAfter > 0 ? (
                <>
                  , leaving about{" "}
                  <strong className="font-semibold">
                    {formatMoney(effect.netAfter, "NGN", { decimals: true })}
                  </strong>{" "}
                  to take home.
                </>
              ) : (
                "."
              )}
            </p>

            {effect && effect.netAfter > 0 ? (
              <p className="mt-1.5 text-[0.875rem] text-body">
                Take-home now{" "}
                {formatMoney(effect.netBefore, "NGN", { decimals: true })} ·
                first deduction {monthLabel(startPeriod)} · last{" "}
                {monthLabel(
                  priced.lines[priced.lines.length - 1]?.dueDate ?? startPeriod,
                )}
              </p>
            ) : (
              <p className="mt-1.5 text-[0.875rem] text-body">
                First deduction {monthLabel(startPeriod)}, last{" "}
                {monthLabel(
                  priced.lines[priced.lines.length - 1]?.dueDate ?? startPeriod,
                )}
                .
                {effect
                  ? ` Take-home now ${formatMoney(effect.netBefore, "NGN", {
                      decimals: true,
                    })}.`
                  : " Take-home is not shown because this record has no monthly pay on it."}
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
                      : `${money(priced.finalInstalmentKobo)} — the balancing figure`,
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
            <p className="text-[0.875rem] leading-relaxed">
              {money(kobo(effect.monthly))} a month is more than the whole
              take-home of{" "}
              {formatMoney(effect.netBefore, "NGN", { decimals: true })}.
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
            <p className="text-[0.875rem] leading-relaxed">
              {money(kobo(effect.monthly))} out of{" "}
              {formatMoney(effect.netBefore, "NGN", { decimals: true })} a month.
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
                  {monthLabel(addMonths(TODAY, 0))} — this month&rsquo;s payroll
                </option>
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
