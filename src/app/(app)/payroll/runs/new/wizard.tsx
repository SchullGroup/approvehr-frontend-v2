"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  StepIndicator,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  useStepper,
  useToast,
} from "@/components/ui";
import {
  ApprovalConsequences,
  DiscrepancyPanel,
  ExceptionList,
  ExcludedList,
  RunStatusBadge,
  SourceBadge,
  TotalsPanel,
} from "@/components/payroll/run-panels";
import { ExcludeFromPayrollDialog } from "@/components/payroll/exclude-dialog";
import { ApiError } from "@/lib/api/client";
import {
  excludedNote,
  formatKobo,
  headcountLabel,
  payslipCountLabel,
  periodLabel,
  type PreparedRun,
  type Payslip,
  type RunException,
  type RunExclusion,
  wasDeducted,
} from "@/lib/api/payroll";
import { useCan } from "@/lib/permissions";
import { useEmployeeMutations } from "@/lib/store/employees-api";
import {
  countBySeverity,
  usePayrollActions,
  usePayrollRun,
  usePayrollRuns,
} from "@/lib/store/payroll";
import { useSetupChecklist } from "@/lib/store/setup-checklist";
import { TODAY } from "@/lib/today";

/** Exceptions the wizard answers inline rather than by sending somebody away. */
const INLINE_FIX_CODES = new Set(["missing_pay"]);

/**
 * Running a payroll period.
 *
 * ## What this screen used to be, and why it changed
 *
 * It used to be five steps — period, pick the people, type in bonuses and
 * deductions, review, send for approval — and the middle two were the reason it
 * had to be rebuilt. Allowances, loan instalments and expense claims are now
 * *data*: they live in pay components, the loans module and the expenses module,
 * and the run assembles them. A screen that let somebody type a bonus into a box
 * would be collecting a figure the run then ignored, which is worse than not
 * offering the box.
 *
 * So the four steps are what actually happens:
 *
 *   1 Period    what is being paid, and when it lands
 *   2 Check     prepare it, then work through what came back
 *   3 Review    every payslip, itemised
 *   4 Approve   the one-way door, with what it will settle spelled out
 *
 * ## Preparing versus approving
 *
 * **Preparing settles nothing.** It works out everybody's pay and writes the
 * payslips, and it can be done as many times as you like — the normal loop is
 * prepare, read the list, fix a bank account, prepare again. If preparing
 * consumed a loan instalment, running it twice would take two months of
 * somebody's repayment, so it does not.
 *
 * **Approving is the one-way door.** It freezes the settings onto the run and
 * settles what the run consumed. The confirmation says so, in those terms,
 * because "are you sure?" tells the reader nothing they did not already know.
 *
 * A blocker refuses approval. A warning does not, and approving with one open
 * records that somebody looked at it.
 */

const STEPS = [
  { id: "period", label: "Period", hint: "Month and pay date" },
  { id: "check", label: "Check", hint: "Calculate and fix" },
  { id: "review", label: "Review", hint: "Every payslip" },
  { id: "approve", label: "Approve", hint: "Settle and freeze" },
];

const currentPeriod = TODAY.slice(0, 7);

export function PayrollRunWizard() {
  const router = useRouter();
  const toast = useToast();
  const params = useSearchParams();

  /* A period in the URL means somebody came from the dashboard to look at a run
     that already exists, so the rail opens on the checks rather than on a form
     they have already filled in. Read at first render, not in an effect. */
  const periodParam = params.get("period");
  const stepper = useStepper(STEPS, periodParam ? 1 : 0);

  const canPrepare = useCan("RUN_PAYROLL");
  const canApprove = useCan("APPROVE_PAYROLL");

  const { runs, connected, loading, error, reload: reloadRuns } = usePayrollRuns();
  const actions = usePayrollActions();

  const [draft, setDraft] = useState<{
    period: string;
    payDate: string;
    label: string;
  } | null>(null);
  const period = draft?.period ?? periodParam ?? currentPeriod;
  const payDate = draft?.payDate ?? `${period}-28`;
  const label = draft?.label ?? "";

  const patch = (next: Partial<{ period: string; payDate: string; label: string }>) =>
    setDraft({ period, payDate, label, ...next });

  const [prepared, setPrepared] = useState<PreparedRun | null>(null);
  const [busy, setBusy] = useState<"prepare" | "approve" | null>(null);
  const [ackWarnings, setAckWarnings] = useState(false);
  const [confirming, setConfirming] = useState(false);

  /**
   * Who is being excluded, and any refusal from the last attempt.
   *
   * The exception rows carry an `employeeId` and a message, not a name, so the
   * person being excluded is looked up on the run's own payslips — which is the
   * only place a name and an id sit together on this screen.
   */
  const [excluding, setExcluding] = useState<{
    employeeId: string;
    name: string;
  } | null>(null);
  const [excludeError, setExcludeError] = useState<string | null>(null);
  const [excludeBusy, setExcludeBusy] = useState(false);
  const [puttingBack, setPuttingBack] = useState<string | null>(null);

  /* The run for the chosen period, whether this session prepared it or a
     previous one did. Derived, so changing the period switches runs with no
     effect and no stale detail. */
  const existing = runs.find((run) => run.period === period) ?? null;
  const runId = existing?.id ?? null;
  const detail = usePayrollRun(runId);
  const run = detail.run;

  const exceptions = useMemo(() => run?.exceptions ?? [], [run]);
  const counts = countBySeverity(exceptions);
  const discrepancies = prepared?.discrepancies ?? [];
  const settled = run?.status === "APPROVED" || run?.status === "PAID";

  const blocked = counts.blockers > 0 || discrepancies.length > 0;
  const canContinue = [
    Boolean(period && payDate),
    Boolean(run) && !blocked,
    Boolean(run) && !blocked,
    false,
  ][stepper.index];

  const doneFlags = [
    Boolean(period && payDate),
    Boolean(run) && !blocked,
    Boolean(run) && !blocked,
    settled,
  ];
  const displaySteps = stepper.steps.map((step, i) => ({
    ...step,
    isComplete: i <= stepper.furthest && Boolean(doneFlags[i]),
  }));

  async function prepare() {
    setBusy("prepare");
    try {
      const result = await actions.prepare({
        period,
        payDate,
        ...(label.trim() ? { label: label.trim() } : {}),
      });
      setPrepared(result);
      setAckWarnings(false);
      reloadRuns();
      detail.reload();
      toast.push({
        title:
          result.discrepancies.length > 0
            ? "Calculated, but the figures do not add up"
            : `Prepared ${periodLabel(period)}`,
        tone: result.discrepancies.length > 0 ? "danger" : "success",
        detail:
          `${result.headcount} ${result.headcount === 1 ? "person" : "people"}` +
          (result.excluded > 0 ? ` · ${result.excluded} excluded` : "") +
          ` · ${result.blockers} to fix · ${result.warnings} to look at`,
      });
      if (stepper.index === 0) stepper.goTo(1);
    } catch (caught) {
      toast.push({
        title: "Could not calculate this payroll",
        tone: "danger",
        detail:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setBusy(null);
    }
  }

  /**
   * A name for an employee id, from the run's own rows.
   *
   * The blocker knows the id; the payslip knows the name. Somebody who has
   * already been excluded has no payslip, so their name comes off the exclusion
   * instead — which is the reason those records are on the run rather than only
   * being sentences in the exception list.
   */
  function nameOf(employeeId: string): string {
    return (
      run?.payslips.find((slip) => slip.employeeId === employeeId)?.name ??
      run?.exclusions.find((row) => row.employeeId === employeeId)?.name ??
      "this person"
    );
  }

  async function exclude(reason: string) {
    if (!runId || !excluding) return;
    setExcludeBusy(true);
    setExcludeError(null);
    try {
      const result = await actions.exclude(runId, {
        employeeId: excluding.employeeId,
        reason,
      });
      setPrepared(result.run);
      setAckWarnings(false);
      setExcluding(null);
      reloadRuns();
      detail.reload();
      toast.push({
        title: `${result.name} is not on ${periodLabel(period)} payroll`,
        tone: "success",
        detail:
          `${result.run.headcount} ${result.run.headcount === 1 ? "person" : "people"} ` +
          `still to be paid · ${result.run.blockers} to fix · back next period automatically`,
      });
    } catch (caught) {
      /* On the field rather than in a toast: the refusal is almost always about
         the reason, and a toast disappears while the form is still open. */
      setExcludeError(
        caught instanceof ApiError
          ? caught.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setExcludeBusy(false);
    }
  }

  async function putBack(exclusion: RunExclusion) {
    if (!runId) return;
    setPuttingBack(exclusion.employeeId);
    try {
      const result = await actions.putBack(runId, exclusion.employeeId);
      setPrepared(result.run);
      setAckWarnings(false);
      reloadRuns();
      detail.reload();
      toast.push({
        title: `${result.name} is back on ${periodLabel(period)} payroll`,
        tone: "success",
        detail:
          result.run.blockers > 0
            ? `${result.run.blockers} to fix before this can be approved — whatever stopped them is still there.`
            : `${result.run.headcount} ${result.run.headcount === 1 ? "person" : "people"} to be paid.`,
      });
    } catch (caught) {
      toast.push({
        title: "Could not put them back on this payroll",
        tone: "danger",
        detail:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setPuttingBack(null);
    }
  }

  /**
   * The decision beside the problem.
   *
   * Only where a decision is what clears the row. A missing account number gets
   * both: the link that goes and adds one, and this — because ninety-nine
   * salaries should not wait on one person answering their phone. An exclusion
   * gets the way back out of it. Everything else gets nothing, because there is
   * no decision to offer and a button that only navigates is already `fixFor`'s
   * job.
   */
  function actionFor(exception: RunException): React.ReactNode {
    if (!exception.employeeId || !canPrepare || settled) return null;
    const employeeId = exception.employeeId;

    /* Set right here rather than sent to the record and back — this figure is
       exactly what the exception is about, so a redirect for one number is a
       detour, not a fix. Recalculates on save, the same as pressing
       "Calculate again" — a stale figure sitting beside a payslip that has
       already moved on is worse than the trip back through Calculate. */
    if (exception.code === "missing_pay") {
      return (
        <SetPayInline
          employeeId={employeeId}
          disabled={busy !== null}
          onSaved={() => void prepare()}
        />
      );
    }

    if (exception.code === "missing_bank_account") {
      return (
        <Button
          variant="secondary"
          size="sm"
          disabled={busy !== null || excludeBusy}
          onClick={() => {
            setExcludeError(null);
            setExcluding({ employeeId, name: nameOf(employeeId) });
          }}
        >
          Exclude from this payroll
        </Button>
      );
    }

    if (exception.code === "excluded_from_payroll") {
      const exclusion = run?.exclusions.find((row) => row.employeeId === employeeId);
      if (!exclusion) return null;
      return (
        <Button
          variant="secondary"
          size="sm"
          loading={puttingBack === employeeId}
          disabled={puttingBack !== null || busy !== null}
          onClick={() => void putBack(exclusion)}
        >
          Put back on this payroll
        </Button>
      );
    }

    return null;
  }

  async function approve() {
    if (!runId) return;
    setBusy("approve");
    try {
      const result = await actions.approve(runId);
      setConfirming(false);
      toast.push({
        title: `${periodLabel(period)} approved`,
        tone: "success",
        detail:
          result.settled.loans + result.settled.claims + result.settled.overtime > 0
            ? `${result.settled.loans} loan instalment${result.settled.loans === 1 ? "" : "s"} and ${result.settled.claims} expense claim${result.settled.claims === 1 ? "" : "s"} settled.`
            : "Nothing else needed settling.",
      });
      router.push("/payroll");
    } catch (caught) {
      setConfirming(false);
      toast.push({
        title: "Could not approve this run",
        tone: "danger",
        detail:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SourceBadge connected={connected} loading={loading} error={error} />

      <StepIndicator
        steps={displaySteps}
        index={stepper.index}
        furthest={stepper.furthest}
        onStepSelect={stepper.goTo}
      />

      {/* --------------------------------------------------------- 1 Period */}
      {stepper.index === 0 && (
        <Card>
          <CardHeader
            title="What are you paying?"
            description="The month decides whose contracts, new starters and exits are picked up."
          />
          <CardBody className="grid max-w-2xl gap-5 sm:grid-cols-2">
            <Field label="Pay month" required>
              <Input
                type="month"
                value={period}
                onChange={(e) => patch({ period: e.target.value })}
              />
            </Field>
            <Field
              label="Payment date"
              required
              help="Most employers pay a few days before month end."
            >
              <Input
                type="date"
                value={payDate}
                onChange={(e) => patch({ payDate: e.target.value })}
              />
            </Field>
            <Field
              optional
              label="Name this run"
              help="Useful when a month has more than one."
              className="sm:col-span-2">
              <Input
                value={label}
                placeholder={`${periodLabel(period)} salaries`}
                onChange={(e) => patch({ label: e.target.value })}
              />
            </Field>

            <div className="sm:col-span-2">
              {existing ? (
                <Callout
                  tone="info"
                  title={`${periodLabel(period)} is already prepared`}
                >
                  {/* Two sentences, because one was ambiguous. `and is approved`
                      appended to `payslipCountLabel` produced "9 of 10 payslips
                      — 1 excluded and is approved", where the trailing clause
                      reads as though the *exclusion* had been approved rather
                      than the payroll. The count gets its own full stop. */}
                  It has {payslipCountLabel(existing)}.{" "}
                  {existing.status === "APPROVED" || existing.status === "PAID"
                    ? "It is approved, so its figures are frozen."
                    : "It is still a draft — you can prepare it again from the next step."}
                </Callout>
              ) : (
                <Callout tone="accent" title="This works out the payroll">
                  Repeat it as often as you like — nothing is paid until you
                  approve.
                </Callout>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {stepper.index === 0 && <PreflightChecklist />}

      {/* ---------------------------------------------------------- 2 Check */}
      {stepper.index === 1 && (
        <div className="flex flex-col gap-5">
          {!canPrepare && (
            <Callout tone="warning" title="You cannot run payroll yet">
              Preparing payroll needs the &ldquo;Run payroll&rdquo; permission.
              Somebody who has it can prepare this period, and you will still be
              able to review and approve it.
            </Callout>
          )}

          <Card>
            <CardHeader
              title={`${periodLabel(period)}, paying ${payDate}`}
              description={
                run
                  ? `Prepared${run.preparedAt ? ` ${run.preparedAt.slice(0, 10)}` : ""}. Preparing again replaces the payslips and settles nothing.`
                  : "Nothing has been worked out for this period yet."
              }
              action={run ? <RunStatusBadge status={run.status} /> : undefined}
            />
            <CardBody className="flex flex-wrap items-center gap-3">
              <Button
                variant={run ? "secondary" : "accent"}
                onClick={() => void prepare()}
                loading={busy === "prepare"}
                disabled={!canPrepare || settled || busy !== null}
              >
                {busy !== "prepare" && (
                  <RefreshCw aria-hidden="true" className="size-4" />
                )}
                {run ? "Calculate again" : `Calculate ${periodLabel(period)}`}
              </Button>
              {run && (
                <p className="text-meta leading-relaxed text-muted">
                  {payslipCountLabel(run)} · {formatKobo(run.grossKobo)} gross
                </p>
              )}
              {settled && (
                <p className="text-meta leading-relaxed text-muted">
                  This run is approved. Its figures are frozen and cannot be
                  prepared again.
                </p>
              )}
            </CardBody>
          </Card>

          <DiscrepancyPanel discrepancies={discrepancies} />

          {detail.loading ? (
            <Card>
              <CardBody>
                <p className="text-body-sm text-muted">Loading the run…</p>
              </CardBody>
            </Card>
          ) : run ? (
            <>
              <ExceptionList
                exceptions={exceptions}
                actionFor={actionFor}
                replaceFixFor={INLINE_FIX_CODES}
              />
              {/* Under the list rather than inside it. The exception rows say
                  what happened; this says who is not on the payroll, in four
                  facts a person can act on a year from now. */}
              <ExcludedList
                exclusions={run.exclusions}
                {...(canPrepare && !settled ? { onPutBack: putBack } : {})}
                busyFor={puttingBack}
              />
            </>
          ) : (
            <EmptyState
              compact
              icon={<ShieldCheck aria-hidden="true" />}
              title="Nothing calculated yet"
              description="Calculate the month and anything wrong with the records will be listed here, with the screen that fixes it."
            />
          )}
        </div>
      )}

      {/* --------------------------------------------------------- 3 Review */}
      {stepper.index === 2 && (
        <div className="flex flex-col gap-5">
          <DiscrepancyPanel discrepancies={discrepancies} />
          {run ? (
            <>
              <PayslipTable payslips={run.payslips} run={run} />
              <ExcludedList
                exclusions={run.exclusions}
                {...(canPrepare && !settled ? { onPutBack: putBack } : {})}
                busyFor={puttingBack}
              />
            </>
          ) : (
            <EmptyState
              compact
              icon={<ShieldCheck aria-hidden="true" />}
              title="Nothing to review"
              description="Go back a step and calculate the month first."
            />
          )}
        </div>
      )}

      {/* -------------------------------------------------------- 4 Approve */}
      {stepper.index === 3 && run && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
          <div className="flex flex-col gap-5">
            <TotalsPanel run={run} />

            <Card>
              <CardHeader
                title="What approving does"
                description="Calculating can be repeated. Approving cannot be undone."
              />
              <CardBody>
                <ApprovalConsequences run={run} />
              </CardBody>
            </Card>

            {counts.warnings > 0 && (
              <Card>
                <CardBody>
                  <Checkbox
                    checked={ackWarnings}
                    onChange={(e) => setAckWarnings(e.target.checked)}
                    label={`I have read ${counts.warnings} thing${counts.warnings === 1 ? "" : "s"} worth a look`}
                    description="None of them stops the run. Approving records that they were seen."
                  />
                </CardBody>
              </Card>
            )}
          </div>

          <aside className="flex flex-col gap-5 lg:sticky lg:top-20 lg:h-fit">
            <Card>
              <CardHeader title={periodLabel(run.period)} />
              <CardBody>
                <dl className="flex flex-col gap-2.5 text-body-sm">
                  <SummaryRow label="Status" value={<RunStatusBadge status={run.status} />} />
                  <SummaryRow label="People paid" value={headcountLabel(run)} />
                  <SummaryRow label="Pays on" value={run.payDate} />
                  <SummaryRow
                    label="Stops payroll"
                    value={
                      <span
                        className={cn(
                          "tabular font-medium",
                          counts.blockers
                            ? "text-danger-text"
                            : "text-success-text",
                        )}
                      >
                        {counts.blockers}
                      </span>
                    }
                  />
                  <SummaryRow label="Worth a look" value={String(counts.warnings)} />
                </dl>
              </CardBody>
            </Card>

            {!canApprove && (
              <Callout tone="warning" title="Somebody else approves this">
                Approving payroll is a separate permission from preparing it, on
                purpose — the person who works out the pay is not the person who
                releases it.
              </Callout>
            )}
          </aside>
        </div>
      )}

      {/* Footer */}
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-1 py-3">
        <Button variant="ghost" onClick={() => router.push("/payroll")}>
          Save &amp; exit
        </Button>
        <div className="flex items-center gap-2">
          {!stepper.isFirst && (
            <Button variant="secondary" onClick={stepper.back}>
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back
            </Button>
          )}
          {stepper.isLast ? (
            <Button
              variant="approve"
              onClick={() => setConfirming(true)}
              loading={busy === "approve"}
              disabled={
                !run ||
                settled ||
                blocked ||
                !canApprove ||
                (counts.warnings > 0 && !ackWarnings)
              }
            >
              {busy !== "approve" && <Check aria-hidden="true" className="size-4" />}
              {settled ? "Already approved" : "Approve this run"}
            </Button>
          ) : (
            <Button
              variant="accent"
              onClick={stepper.next}
              disabled={!canContinue}
            >
              Continue
              <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {excluding && (
        <ExcludeFromPayrollDialog
          open
          name={excluding.name}
          periodLabel={periodLabel(period)}
          onClose={() => {
            setExcluding(null);
            setExcludeError(null);
          }}
          onConfirm={(reason) => void exclude(reason)}
          loading={excludeBusy}
          error={excludeError}
        />
      )}

      {run && (
        <ConfirmDialog
          open={confirming}
          onClose={() => setConfirming(false)}
          onConfirm={() => void approve()}
          tone="primary"
          confirmLabel={`Approve ${formatKobo(run.netKobo)}`}
          loading={busy === "approve"}
          title={`Approve ${periodLabel(run.period)}?`}
          body={
            <div className="flex flex-col gap-3">
              <p>
                This is the one step that cannot be undone from here. It will:
              </p>
              <ApprovalConsequences run={run} />
              {counts.warnings > 0 && (
                <p>
                  {counts.warnings} warning{counts.warnings === 1 ? "" : "s"} will
                  be recorded against the run as seen and accepted.
                </p>
              )}
            </div>
          }
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The one figure a `missing_pay` exception is actually about, typed in
 * beside the row it names rather than on a different screen.
 *
 * Same act as `useEmployeeMutations().update`'s ordinary callers — this is
 * not a special payroll-only write, it is the record's own `grossMonthly`,
 * so a figure set here and one set from the record page cannot disagree.
 * `onSaved` recalculates the run, matching what pressing "Calculate again"
 * already does after any other fix — a payslip left showing the old figure
 * would be a right number sitting under a stale one.
 */
function SetPayInline({
  employeeId,
  disabled,
  onSaved,
}: {
  employeeId: string;
  disabled?: boolean;
  onSaved: () => void;
}) {
  const employees = useEmployeeMutations();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const amount = Number(value);
    if (!value.trim() || !Number.isFinite(amount) || amount <= 0) {
      setError("Enter an amount above zero.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await employees.update(employeeId, { grossMonthly: amount });
      onSaved();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Could not save. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          inputMode="decimal"
          min="0"
          step="1000"
          placeholder="Monthly gross, ₦"
          aria-label="Monthly gross pay"
          value={value}
          disabled={disabled || saving}
          className="w-36"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled}
          loading={saving}
          onClick={() => void submit()}
        >
          Set pay
        </Button>
      </div>
      {error && <p className="text-meta text-danger-text">{error}</p>}
    </div>
  );
}

/**
 * What the company itself has and has not decided, before anybody's own
 * record even enters into it — inline, never a redirect.
 *
 * The complaint this answers was literal: getting sent away to Settings mid
 * wizard, with no way back to where the thought started. Nothing here
 * navigates on its own. Every row states a fact and offers a link a person
 * can choose to follow; declining one changes nothing about what Calculate
 * does next; `useSetupChecklist` is the same read `/settings` itself answers
 * from, so this cannot tell a different story from the hub that owns it.
 *
 * Deliberately not a second copy of the exception list: nothing here repeats
 * once Calculate has actually run — the run's own exceptions, one per
 * person, are what step two shows from that point on. This is only for the
 * question a person has before they have anybody to name yet.
 */
function PreflightChecklist() {
  /* Nothing shown while loading or on a read failure — better than a
     skeleton competing with the period form for attention, and there is
     nothing to act on until it answers. */
  const { facts } = useSetupChecklist();
  if (!facts) return null;

  type Row = {
    label: string;
    ok: boolean;
    detail?: string;
    href?: string;
    linkLabel?: string;
  };

  const rows: Row[] = [
    {
      label: "What you deduct is decided",
      ok: facts.pay.settings,
      detail: "PAYE, pension and NHF — each a switch, in payroll settings.",
      href: "/settings/payroll",
      linkLabel: "Decide it",
    },
    {
      label: "A default PAYE state is set",
      ok: facts.company.taxState,
      detail: "Falls back to this for anybody with no state of their own.",
      href: "/settings/company",
      linkLabel: "Set it",
    },
  ];

  if (facts.payrollChecks.employees > 0) {
    const { employees, missingBankAccount, missingPensionPin, requirePensionPin } =
      facts.payrollChecks;
    rows.push({
      label:
        missingBankAccount === 0
          ? "Everybody has a bank account"
          : `${missingBankAccount} of ${employees} have no bank account`,
      ok: missingBankAccount === 0,
      detail: "Payroll cannot pay somebody with no account on file.",
      href: "/people",
      linkLabel: "Open the directory",
    });
    if (requirePensionPin) {
      rows.push({
        label:
          missingPensionPin === 0
            ? "Everybody has a pension PIN"
            : `${missingPensionPin} of ${employees} have no pension PIN`,
        ok: missingPensionPin === 0,
        detail: "Recorded, not pay-blocking — only the remittance schedule is incomplete without it.",
        href: "/people",
        linkLabel: "Open the directory",
      });
    }
  }

  /* Null rather than a row offline — the demo has no payment book, and a
     false claim of "no payout account" beside a company that has one is
     exactly the wrong figure this product is sold against. */
  if (facts.pay.hasPrimaryBankAccount !== null) {
    rows.push({
      label: "Your company has a payout account on file",
      ok: facts.pay.hasPrimaryBankAccount,
      detail: "Needed to build a payment batch once this run is approved.",
      href: "/settings/bank-accounts",
      linkLabel: "Add one",
    });
  }

  const outstanding = rows.filter((row) => !row.ok).length;

  return (
    <Card>
      <CardHeader
        title="Before you run this"
        description={
          outstanding === 0
            ? "Nothing here would stop or surprise this payroll today."
            : `${outstanding} ${outstanding === 1 ? "thing" : "things"} worth sorting first. None of this stops Calculate — whoever it is about is still named, on the next step, either way.`
        }
      />
      <CardBody className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-line p-3"
          >
            <div className="flex min-w-0 items-start gap-2.5">
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 shrink-0 [&>svg]:size-4",
                  row.ok ? "text-success-text" : "text-warning-text",
                )}
              >
                {row.ok ? <Check /> : <AlertTriangle />}
              </span>
              <div className="min-w-0">
                <p className="text-body-sm text-ink">{row.label}</p>
                {row.detail && (
                  <p className="mt-0.5 text-meta leading-relaxed text-muted">
                    {row.detail}
                  </p>
                )}
              </div>
            </div>
            {!row.ok && row.href && (
              <ButtonLink href={row.href} size="sm" variant="secondary">
                {row.linkLabel}
              </ButtonLink>
            )}
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}

/**
 * Every payslip in the run.
 *
 * Deductions are shown with their labels underneath rather than as one "other
 * deductions" figure, because the figure on its own raises the question it
 * should have answered. The unpaid-days column appears only when somebody has
 * some — a column of zeroes is noise, and a column of twenty-ones is the single
 * most important thing on the screen.
 */
function PayslipTable({
  payslips,
  run,
}: {
  payslips: Payslip[];
  /** For the count. A badge saying "9 payslips" beside a company of ten is
      true and, on its own, the wrong answer to "is everybody here?". */
  run: { employeeCount: number; excludedCount: number };
}) {
  const anyUnpaid = payslips.some((slip) => slip.unpaidDays > 0);
  const note = excludedNote(run);

  return (
    <Card>
      <CardHeader
        title="Every payslip"
        description="PAYE is worked out on annual income against the bands in force for the period, after pension and housing-fund relief."
        action={
          <Badge tone={run.excludedCount > 0 ? "warning" : "neutral"} size="sm">
            {payslipCountLabel(run)}
          </Badge>
        }
      />
      {note && (
        <CardBody className="border-b border-line">
          <p className="text-body-sm leading-relaxed text-warning-text">{note}</p>
        </CardBody>
      )}
      <TableWrap className="rounded-none border-0">
        <THead>
          <TH>Employee</TH>
          {anyUnpaid && <TH align="right">Unpaid days</TH>}
          <TH align="right">Gross</TH>
          <TH align="right">Pension</TH>
          <TH align="right">Housing fund</TH>
          <TH align="right">PAYE</TH>
          <TH align="right">Other</TH>
          <TH align="right">Net</TH>
        </THead>
        <TBody>
          {payslips.map((slip) => {
            const deductionLines = slip.lines.filter((l) => l.kind === "DEDUCTION");
            return (
              <TR key={slip.id}>
                <TDPrimary
                  title={
                    <Link
                      href={`/payroll/payslips/${slip.id}`}
                      className="hover:text-accent-text hover:underline underline-offset-4"
                    >
                      {slip.name}
                    </Link>
                  }
                  subtitle={slip.employeeNo}
                />
                {anyUnpaid && (
                  <TD align="right" className="tabular">
                    {slip.unpaidDays > 0 ? (
                      <span className="text-warning-text">
                        {slip.unpaidDays}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TD>
                )}
                <TD align="right" className="tabular text-body">
                  {formatKobo(slip.grossKobo)}
                </TD>
                <TD align="right" className="tabular text-muted">
                  {wasDeducted(slip.operates, "pension") ? (
                    formatKobo(slip.pensionEmployeeKobo)
                  ) : (
                    <span className="text-faint">Not operated</span>
                  )}
                </TD>
                <TD align="right" className="tabular text-muted">
                  {wasDeducted(slip.operates, "nhf") ? (
                    formatKobo(slip.nhfKobo)
                  ) : (
                    <span className="text-faint">Not operated</span>
                  )}
                </TD>
                <TD align="right" className="tabular text-muted">
                  {wasDeducted(slip.operates, "paye") ? (
                    formatKobo(slip.payeKobo)
                  ) : (
                    <span className="text-faint">Not operated</span>
                  )}
                </TD>
                <TD align="right" className="tabular text-muted">
                  {slip.otherDeductionsKobo > 0 ? (
                    <>
                      {formatKobo(slip.otherDeductionsKobo)}
                      {deductionLines.length > 0 && (
                        <span className="mt-0.5 block text-meta font-normal text-faint">
                          {deductionLines.map((l) => l.label).join(", ")}
                        </span>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </TD>
                <TD align="right" className="tabular font-medium text-ink">
                  {formatKobo(slip.netKobo)}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </TableWrap>
      <CardBody className="border-t border-line">
        <p className="text-meta leading-relaxed text-muted">
          Employer pension is not in any column here. It is a company cost on top
          of gross and does not reduce anybody&apos;s pay — the totals on the next
          step show it separately.
        </p>
      </CardBody>
      <CardBody className="border-t border-line">
        <ButtonLink href="/payroll/payslips" variant="secondary" size="sm">
          Open the payslips
        </ButtonLink>
      </CardBody>
    </Card>
  );
}
