"use client";

import {
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  Disclosure,
  EmptyState,
  Field,
  Input,
  Select,
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
import { useStepUp } from "@/components/portal/step-up";
import { ApiError } from "@/lib/api/client";
import {
  excludedNote,
  formatKobo,
  headcountLabel,
  naira,
  payslipCountLabel,
  periodLabel,
  type PreparedRun,
  type Payslip,
  type RunException,
  type RunExclusion,
  wasDeducted,
} from "@/lib/api/payroll";
import { useCan } from "@/lib/permissions";
import { useOvertimePolicy } from "@/lib/store/overtime";
import { usePayrollSettings } from "@/lib/payroll/use-settings";
import { BonusByHand, OvertimeByHand, PayByHand } from "./by-hand";
import type { OvertimeOverrideKind } from "@/lib/api/payroll";
import {
  useEmployeeDirectory,
  useEmployeeMutations,
} from "@/lib/store/employees-api";
import { useGrades } from "@/lib/store/grades";
import { NIGERIAN_STATES } from "@/lib/reference/lists";
import {
  countBySeverity,
  usePayrollActions,
  usePayrollRun,
  usePayrollRuns,
} from "@/lib/store/payroll";
import { useSetupChecklist } from "@/lib/store/setup-checklist";
import { fullName } from "@/lib/types";
import { TODAY } from "@/lib/today";

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
  const stepUp = useStepUp();
  const params = useSearchParams();

  /* A period in the URL means somebody came from the dashboard to look at a run
     that already exists, so the rail opens on the checks rather than on a form
     they have already filled in. Read at first render, not in an effect. */
  const periodParam = params.get("period");
  const stepper = useStepper(STEPS, periodParam ? 1 : 0);

  const canPrepare = useCan("RUN_PAYROLL");
  const canApprove = useCan("APPROVE_PAYROLL");

  const {
    runs,
    connected,
    loading,
    error,
    reload: reloadRuns,
  } = usePayrollRuns();
  const actions = usePayrollActions();

  const [draft, setDraft] = useState<{
    period: string;
    payDate: string;
    label: string;
  } | null>(null);
  const period = draft?.period ?? periodParam ?? currentPeriod;
  const payDate = draft?.payDate ?? `${period}-28`;
  const label = draft?.label ?? "";

  const patch = (
    next: Partial<{ period: string; payDate: string; label: string }>,
  ) => setDraft({ period, payDate, label, ...next });

  const [prepared, setPrepared] = useState<PreparedRun | null>(null);
  const [busy, setBusy] = useState<"prepare" | "approve" | null>(null);
  const [confirming, setConfirming] = useState(false);

  /**
   * Stands in for `MissingPayTable`'s own button — see the note on that
   * component for why one button beats two. `missingPayRef` fires the save;
   * `missingPayStatus` is what the footer button reads to decide whether it
   * currently means that, or means "Continue" as normal.
   */
  const missingPayRef = useRef<MissingPayHandle>(null);
  const [missingPayStatusRaw, setMissingPayStatusRaw] =
    useState<MissingPayStatus | null>(null);
  const onMissingPayStatusChange = useCallback(
    (status: MissingPayStatus) => setMissingPayStatusRaw(status),
    [],
  );

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

  const allExceptions = useMemo(() => run?.exceptions ?? [], [run]);
  /* `missing_pay` and `missing_tax_state` each get a section of their own
     below, not a row per person in the generic list — see `MissingPayTable`
     and `MissingTaxStateSection`. Filtered out here so nobody shows up twice.
     `missing_tax_state` alone can be thirty-odd near-identical paragraphs on
     an org with no PAYE state set anywhere — the same wall this replaces for
     pay. */
  const exceptions = useMemo(
    () =>
      allExceptions.filter(
        (e) => e.code !== "missing_pay" && e.code !== "missing_tax_state",
      ),
    [allExceptions],
  );
  const missingPay = useMemo(
    () => allExceptions.filter((e) => e.code === "missing_pay" && e.employeeId),
    [allExceptions],
  );
  const missingTaxState = useMemo(
    () =>
      allExceptions.filter(
        (e) => e.code === "missing_tax_state" && e.employeeId,
      ),
    [allExceptions],
  );
  const counts = countBySeverity(allExceptions);
  const discrepancies = prepared?.discrepancies ?? [];
  const settled = run?.status === "APPROVED" || run?.status === "PAID";
  /* Names and departments for the missing-pay table — the exception itself
     carries only an id. 200 is the API's own cap on a list request (see
     `lib/http.ts`) — asking for more refuses the whole request with a 400
     rather than quietly capping it, which silently emptied this table the
     first time this was tried. `record-page.tsx` reaches for the same
     number for the same reason. */
  const directory = useEmployeeDirectory({ pageSize: 200 });
  const missingPayRows = useMemo(
    () =>
      missingPay
        .map((exception) => {
          const person = directory.employees.find(
            (e) => e.id === exception.employeeId,
          );
          if (!person) return null;
          return {
            employeeId: exception.employeeId as string,
            name: fullName(person),
            department: person.department,
            salaryGradeId: person.salaryGradeId ?? null,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null),
    [missingPay, directory.employees],
  );
  /* `MissingPayTable` unmounts the moment this empties — a save just cleared
     the last of it — and an unmount reports nothing, so the raw state alone
     would carry on showing its last label ("Set pay for 1") forever. Derived
     rather than reset from an effect: "empty" is already the fact that
     matters, on every render, not a change to react to. */
  const missingPayStatus =
    missingPayRows.length === 0 ? null : missingPayStatusRaw;
  const missingTaxStateRows = useMemo(
    () =>
      missingTaxState
        .map((exception) => {
          const person = directory.employees.find(
            (e) => e.id === exception.employeeId,
          );
          if (!person) return null;
          return {
            employeeId: exception.employeeId as string,
            name: fullName(person),
            department: person.department,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null),
    [missingTaxState, directory.employees],
  );

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
      const exclusion = run?.exclusions.find(
        (row) => row.employeeId === employeeId,
      );
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
      /* The one-way door, so it is the act a company is most likely to put a
         code in front of. `run` acts first and only asks for a code if the API
         refuses — so a company with the switch off notices nothing, and this
         screen carries no copy of the rule about who requires what. */
      const result = await stepUp.run(() => actions.approve(runId), {
        action: "PAYROLL_APPROVE",
        subjectId: runId,
      });
      setConfirming(false);
      toast.push({
        title: `${periodLabel(period)} approved`,
        tone: "success",
        detail:
          result.settled.loans +
            result.settled.claims +
            result.settled.overtime >
          0
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
              className="sm:col-span-2"
            >
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
              {missingPayRows.length > 0 && (
                <MissingPayTable
                  ref={missingPayRef}
                  runId={run.id}
                  rows={missingPayRows}
                  disabled={busy !== null}
                  onSaved={() => void prepare()}
                  onStatusChange={onMissingPayStatusChange}
                />
              )}
              {missingTaxStateRows.length > 0 && (
                <MissingTaxStateSection
                  rows={missingTaxStateRows}
                  disabled={busy !== null}
                  onSaved={() => void prepare()}
                />
              )}
              <ExceptionList exceptions={exceptions} actionFor={actionFor} />
              {/* Under the list rather than inside it. The exception rows say
                  what happened; this says who is not on the payroll, in four
                  facts a person can act on a year from now. */}
              <ExcludedList
                exclusions={run.exclusions}
                {...(canPrepare && !settled ? { onPutBack: putBack } : {})}
                busyFor={puttingBack}
              />

              {/* Where the per-person figures are.
                  ---------------------------------
                  This step is about what is *wrong* with the records; the
                  figures themselves are one step on, in the payslip table. A
                  product owner looking for "change the tax" stood on exactly
                  this screen and could not find it, which is the third time in
                  this codebase a working feature has been invisible for want of
                  a sentence pointing at it.

                  Absent once the run is approved: nothing there is editable
                  then — but it still says the controls exist, which the first
                  version did not.

                  That was the mistake. Hiding a frozen control is right;
                  hiding the *explanation* of it leaves somebody looking at an
                  approved run with no way to learn the capability is there at
                  all, and that is exactly what happened — a product owner
                  reported the feature "not implemented" while looking at this
                  screen on an approved payroll.

                  Fourth instance in this codebase of a working feature being
                  findable by nobody. The rule, now stated for the last time:
                  **absent-when-refused applies to the control, never to the
                  sentence that says the control exists.** */}
              {canPrepare && (
                <Callout
                  tone={settled ? "neutral" : "info"}
                  title="Changing a figure by hand"
                >
                  <p>
                    Tax, overtime, a bonus and somebody&rsquo;s monthly pay are
                    each entered on the <strong className="text-ink">Review</strong>{" "}
                    step, against the person they belong to — under their gross
                    figure, where every payslip is listed.
                  </p>
                  <p className="mt-2">
                    Tax, overtime and a bonus apply to one payroll only. Pay is
                    the contract, so changing it there changes their record from
                    then on.
                  </p>
                  {settled ? (
                    <p className="mt-2">
                      <strong className="text-ink">
                        This payroll is approved, so none of it can be changed
                        now.
                      </strong>{" "}
                      Its figures are the record of what was paid. The controls
                      are there on the next payroll you prepare.
                    </p>
                  ) : (
                    <p className="mt-2">
                      <Button size="sm" onClick={() => stepper.goTo(2)}>
                        Go to the payslips
                      </Button>
                    </p>
                  )}
                </Callout>
              )}
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
              <PayslipTable
                payslips={run.payslips}
                run={run}
                runId={run.id}
                periodLabel={periodLabel(period)}
                employees={directory.employees}
                editable={canPrepare && !settled}
                onSaved={() => void prepare()}
                onDirectoryReload={directory.reload}
              />
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
          </div>

          <aside className="flex flex-col gap-5 lg:sticky lg:top-20 lg:h-fit">
            <Card>
              <CardHeader title={periodLabel(run.period)} />
              <CardBody>
                <dl className="flex flex-col gap-2.5 text-body-sm">
                  <SummaryRow
                    label="Status"
                    value={<RunStatusBadge status={run.status} />}
                  />
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
                  <SummaryRow
                    label="Worth a look"
                    value={String(counts.warnings)}
                  />
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
              disabled={!run || settled || blocked || !canApprove}
            >
              {busy !== "approve" && (
                <Check aria-hidden="true" className="size-4" />
              )}
              {settled ? "Already approved" : "Approve this run"}
            </Button>
          ) : missingPayStatus ? (
            <Button
              variant="accent"
              onClick={() => void missingPayRef.current?.save()}
              loading={missingPayStatus.saving}
              disabled={!missingPayStatus.ready}
            >
              {missingPayStatus.label}
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

      {/* Renders only while a code is being asked for, which is only ever after
          the API has refused the approval — a company with the switch off never
          sees it. */}
      {stepUp.dialog}

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
            </div>
          }
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** The one true sentence for every exclusion this table can create. */
const MISSING_PAY_EXCLUSION_REASON =
  "No monthly pay was on file when this payroll was checked.";

/**
 * Everybody `missing_pay` names, worked through as one list rather than one
 * exception at a time.
 *
 * The old shape was a red-bordered warning card per person, each with its
 * own "Set pay" button — the same figure, thirty times over, styled like
 * thirty separate problems. This is one thing: a table of the people
 * nobody has agreed a salary for yet.
 *
 * Everybody starts **included and ticked**, because the ordinary case is
 * "these are new starters, go and get their numbers" — not "most of these
 * people should not be paid". Unticking one is the other real case — pay
 * genuinely is not agreed yet, or they should not be on this period at all
 * — and it excludes them the same way `missing_bank_account`'s own button
 * does, with a reason, because "why was Grace not paid in August" must
 * always have an answer. The reason here is written once, for all of them,
 * because it is the same true sentence for every row on this exact list:
 * nobody had set their pay when this payroll was checked.
 *
 * One save for the page rather than one button per row — typing eight
 * figures and pressing eight buttons is the thing this replaces. Pay is
 * still exactly `useEmployeeMutations().update`'s ordinary write, so a
 * figure set here and one set from the record page cannot disagree.
 */
export type MissingPayHandle = { save: () => Promise<void> };

/** What the wizard's own footer button needs to stand in for this table's own. */
export type MissingPayStatus = {
  ready: boolean;
  saving: boolean;
  label: string;
};

const MissingPayTable = forwardRef<
  MissingPayHandle,
  {
    runId: string;
    rows: readonly {
      employeeId: string;
      name: string;
      department: string;
      salaryGradeId: string | null;
    }[];
    disabled?: boolean;
    onSaved: () => void;
    /**
     * Mirrors just enough state up to the wizard's own footer to stand in
     * for the button this card used to carry itself — see the note above
     * the render below for why there is only one button now, not two.
     */
    onStatusChange: (status: MissingPayStatus) => void;
  }
>(function MissingPayTable(
  { runId, rows, disabled, onSaved, onStatusChange },
  ref,
) {
  const employees = useEmployeeMutations();
  const actions = usePayrollActions();
  const grades = useGrades({ pageSize: 100 });
  const [pay, setPay] = useState<Record<string, string>>({});
  /* Seeded from whatever grade each person is already on — picking up pay for
     somebody already graded during hiring should not blank that back out. */
  const [grade, setGrade] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      rows
        .filter((row) => row.salaryGradeId)
        .map((row) => [row.employeeId, row.salaryGradeId as string]),
    ),
  );
  /* Which rows somebody has typed a pay figure into by hand — picking a grade
     stops touching the field the moment it holds one, so a typed number is
     never quietly overwritten by a later grade change. */
  const [payTouched, setPayTouched] = useState<Set<string>>(new Set());
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const included = rows.filter((row) => !excluded.has(row.employeeId));
  const allIncluded = excluded.size === 0;
  const noneIncluded = included.length === 0;
  const ready = included.every((row) => {
    const amount = Number(pay[row.employeeId]);
    return pay[row.employeeId]?.trim() && Number.isFinite(amount) && amount > 0;
  });
  const label = noneIncluded
    ? `Exclude ${rows.length} ${rows.length === 1 ? "person" : "people"}`
    : `Set pay for ${included.length}${
        excluded.size > 0 ? `, exclude ${excluded.size}` : ""
      }`;

  function pickGrade(employeeId: string, gradeId: string) {
    setGrade((prior) => ({ ...prior, [employeeId]: gradeId }));
    if (payTouched.has(employeeId)) return;
    const picked = grades.rows.find((g) => g.id === gradeId);
    if (picked) {
      setPay((prior) => ({
        ...prior,
        [employeeId]: String(naira(picked.midGrossKobo)),
      }));
    }
  }

  function editPay(employeeId: string, value: string) {
    setPay((prior) => ({ ...prior, [employeeId]: value }));
    setPayTouched((prior) =>
      prior.has(employeeId) ? prior : new Set(prior).add(employeeId),
    );
  }

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    const failed: string[] = [];
    for (const row of included) {
      try {
        await employees.update(row.employeeId, {
          grossMonthly: Number(pay[row.employeeId]),
          ...(grade[row.employeeId]
            ? { salaryGradeId: grade[row.employeeId] }
            : {}),
        });
      } catch {
        failed.push(row.name);
      }
    }
    for (const row of rows.filter((r) => excluded.has(r.employeeId))) {
      try {
        await actions.exclude(runId, {
          employeeId: row.employeeId,
          reason: MISSING_PAY_EXCLUSION_REASON,
        });
      } catch {
        failed.push(row.name);
      }
    }
    setSaving(false);
    if (failed.length > 0) {
      setError(
        `Everybody else went through. This did not: ${failed.join(", ")}. Try them again.`,
      );
    }
    onSaved();
  }, [
    included,
    pay,
    grade,
    rows,
    excluded,
    employees,
    actions,
    runId,
    onSaved,
  ]);

  useImperativeHandle(ref, () => ({ save }), [save]);

  /* Reported up rather than rendered here: the wizard's own footer button
     stands in for this card's, so whether it reads "Continue" or "Set pay for
     N" depends on state that lives in this component. A ref alone would not
     do — the footer has to re-render when this changes, and a ref update
     never triggers that on its own. */
  useEffect(() => {
    onStatusChange({ ready, saving, label });
  }, [ready, saving, label, onStatusChange]);

  return (
    <Card>
      <CardHeader
        title={`${rows.length} ${rows.length === 1 ? "person has" : "people have"} no pay set`}
        description="Ticked people are paid what you enter below. Untick anyone who should not be on this payroll — they come off with a reason recorded, same as excluding them anywhere else."
      />
      {!grades.loading && grades.rows.length === 0 && (
        <p className="px-5 pb-3 text-meta text-muted">
          No salary grades yet.{" "}
          <Link
            href="/payroll/pay-setup?tab=grades"
            className="text-accent hover:underline"
          >
            Add one in Pay setup
          </Link>{" "}
          to pick a band per person and prefill pay from its mid-point.
        </p>
      )}
      <TableWrap className="rounded-none border-0 border-t border-line">
        <THead>
          <TH className="w-56">
            <Checkbox
              label="Include"
              checked={allIncluded}
              indeterminate={!allIncluded && !noneIncluded}
              onChange={() =>
                setExcluded(
                  allIncluded
                    ? new Set(rows.map((r) => r.employeeId))
                    : new Set(),
                )
              }
            />
          </TH>
          <TH>Name</TH>
          <TH>Department</TH>
          <TH className="w-56">Salary grade</TH>
          <TH className="w-48">Monthly gross</TH>
        </THead>
        <TBody>
          {rows.map((row) => {
            const isIncluded = !excluded.has(row.employeeId);
            return (
              <TR key={row.employeeId}>
                <TD>
                  <Checkbox
                    label="Include them"
                    checked={isIncluded}
                    onChange={() =>
                      setExcluded((prior) => {
                        const next = new Set(prior);
                        if (isIncluded) next.add(row.employeeId);
                        else next.delete(row.employeeId);
                        return next;
                      })
                    }
                  />
                </TD>
                <TDPrimary title={row.name} />
                <TD className="text-body">{row.department}</TD>
                <TD>
                  <Select
                    aria-label={`Salary grade for ${row.name}`}
                    value={grade[row.employeeId] ?? ""}
                    disabled={disabled || saving || !isIncluded}
                    onChange={(event) =>
                      pickGrade(row.employeeId, event.target.value)
                    }
                  >
                    <option value="">Not on a grade</option>
                    {grades.rows.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.code} {g.name}
                      </option>
                    ))}
                  </Select>
                </TD>
                <TD>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="1000"
                    placeholder="₦ a month"
                    aria-label={`Monthly gross for ${row.name}`}
                    value={pay[row.employeeId] ?? ""}
                    disabled={disabled || saving || !isIncluded}
                    onChange={(event) =>
                      editPay(row.employeeId, event.target.value)
                    }
                  />
                </TD>
              </TR>
            );
          })}
        </TBody>
      </TableWrap>
      {error && (
        <CardBody className="border-t border-line pt-4">
          <p className="text-meta text-danger-text">{error}</p>
        </CardBody>
      )}
    </Card>
  );
});

/**
 * Everybody with no PAYE state set, collapsed to one line rather than one
 * warning card each.
 *
 * `missing_tax_state` never blocks a payroll — the API's own message says so:
 * tax is deducted correctly either way, only the state filing is left
 * incomplete. That is exactly the case `Disclosure`'s own rule carves out for
 * closed-by-default — nothing here needs acting on *now*, unlike a missing
 * bank account — so this is the one exception in the list that goes behind a
 * reveal rather than staying open on the page.
 *
 * The fix is genuinely per person: `prepare` reads `Employee.taxState`
 * straight off the row, with no fallback to the organisation's own default, so
 * setting one in Settings does nothing for somebody already on file with
 * nothing set. A bulk editor is the only thing that actually closes this.
 */
function MissingTaxStateSection({
  rows,
  disabled,
  onSaved,
}: {
  rows: readonly { employeeId: string; name: string; department: string }[];
  disabled?: boolean;
  onSaved: () => void;
}) {
  const employees = useEmployeeMutations();
  const [state, setState] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filled = rows.filter((row) => state[row.employeeId]);

  async function save() {
    setSaving(true);
    setError(null);
    const failed: string[] = [];
    for (const row of filled) {
      try {
        await employees.update(row.employeeId, {
          taxState: state[row.employeeId],
        });
      } catch {
        failed.push(row.name);
      }
    }
    setSaving(false);
    if (failed.length > 0) {
      setError(
        `Everybody else went through. This did not: ${failed.join(", ")}. Try them again.`,
      );
    } else {
      setState({});
    }
    onSaved();
  }

  return (
    <Disclosure
      title={`${rows.length} ${rows.length === 1 ? "person has" : "people have"} no PAYE state set`}
      hint="Tax is deducted correctly either way — this is only the state filing."
      level={4}
      region={false}
    >
      <div className="flex flex-col gap-4">
        <TableWrap className="rounded-none border-0">
          <THead>
            <TH>Name</TH>
            <TH>Department</TH>
            <TH className="w-56">PAYE state</TH>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.employeeId}>
                <TDPrimary title={row.name} />
                <TD className="text-body">{row.department}</TD>
                <TD>
                  <Select
                    aria-label={`PAYE state for ${row.name}`}
                    placeholder="Not set"
                    value={state[row.employeeId] ?? ""}
                    disabled={disabled || saving}
                    onChange={(event) =>
                      setState((prior) => ({
                        ...prior,
                        [row.employeeId]: event.target.value,
                      }))
                    }
                  >
                    {NIGERIAN_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </TD>
              </TR>
            ))}
          </TBody>
        </TableWrap>
        <div className="flex flex-col gap-2">
          {error && <p className="text-meta text-danger-text">{error}</p>}
          <div>
            <Button
              variant="secondary"
              disabled={disabled || saving || filled.length === 0}
              loading={saving}
              onClick={() => void save()}
            >
              Save {filled.length > 0 ? filled.length : ""}
            </Button>
          </div>
        </div>
      </div>
    </Disclosure>
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
  const pathname = usePathname();
  const search = useSearchParams();
  /* Where "Add one" below sends the bank-accounts screen's own Back link —
     otherwise it lands on the generic Settings page, not back on this run. */
  const here = `${pathname}${search.toString() ? `?${search.toString()}` : ""}`;
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
    const {
      employees,
      missingBankAccount,
      missingPensionPin,
      requirePensionPin,
    } = facts.payrollChecks;
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
        detail:
          "Recorded, not pay-blocking — only the remittance schedule is incomplete without it.",
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
      href: `/settings/bank-accounts?from=${encodeURIComponent(here)}`,
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
  runId,
  periodLabel: period,
  employees,
  editable,
  onSaved,
  onDirectoryReload,
}: {
  payslips: Payslip[];
  /** For the count. A badge saying "9 payslips" beside a company of ten is
      true and, on its own, the wrong answer to "is everybody here?". */
  run: { employeeCount: number; excludedCount: number };
  runId: string;
  /** "August 2026", for the tax-override dialog's own copy. */
  periodLabel: string;
  /** Just enough of the directory to know who already has the standing
   *  "always enter this by hand" preference — see `TaxOverrideDialog`. */
  employees: readonly {
    id: string;
    payeManualOverride?: boolean;
    /**
     * Their contractual monthly pay, in **naira** — the one money field on
     * `Employee` that is not kobo, which `HANDOVER.md` records as a legacy the
     * type is waiting to shed.
     *
     * Read from the directory rather than backed out of the payslip. A payslip
     * prorated for unpaid days carries the prorated figure, and the API values
     * overtime on the full month — so deriving it from `grossKobo` would show
     * everybody with a docked day an hourly rate lower than the one they are
     * actually paid.
     */
    grossMonthly?: number | null;
  }[];
  /** `canPrepare && !settled` from the wizard. An approved run's figures are
   *  the record; nothing here offers to change them. */
  editable: boolean;
  onSaved: () => void;
  /**
   * Refetches `employees` after a save. Setting the "always" checkbox
   * changes the very list this component reads it from — without this, the
   * dialog would reopen showing the checkbox unticked immediately after
   * ticking and saving it, because `employees` is a separate fetch from the
   * run and nothing else would tell it the flag just moved.
   */
  onDirectoryReload: () => void;
}) {
  const anyUnpaid = payslips.some((slip) => slip.unpaidDays > 0);
  const note = excludedNote(run);

  const actions = usePayrollActions();
  const [overriding, setOverriding] = useState<Payslip | null>(null);
  /** Which row has the three by-hand forms open, if any. */
  const [adjusting, setAdjusting] = useState<Payslip | null>(null);
  const [adjustSaving, setAdjustSaving] = useState<
    "overtime" | "bonus" | "pay" | null
  >(null);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const overtimePolicy = useOvertimePolicy();
  const { settings: paySettings } = usePayrollSettings();
  const workingDays = paySettings.workingDaysPerMonth;

  const closeAdjust = () => {
    setAdjusting(null);
    setAdjustError(null);
  };
  const toggleAdjust = (slip: Payslip) => {
    setAdjustError(null);
    setAdjusting((open) => (open?.id === slip.id ? null : slip));
  };

  /**
   * One place every by-hand write goes through.
   *
   * Each returns a rebuilt run, so the table has to reload rather than patch a
   * figure locally — the whole period is recomputed server-side and a local
   * patch would show one moved number beside five stale ones.
   */
  const adjust = async (
    which: "overtime" | "bonus" | "pay",
    action: () => Promise<unknown>,
  ) => {
    setAdjustSaving(which);
    setAdjustError(null);
    try {
      await action();
      /* `onSaved` is what the tax override already uses: the run is rebuilt
         server-side, so the table reloads rather than patching one figure and
         leaving five stale ones beside it. */
      closeAdjust();
      onSaved();
    } catch (caught) {
      setAdjustError(
        caught instanceof ApiError
          ? caught.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setAdjustSaving(null);
    }
  };

  const saveOvertime = (
    slip: Payslip,
    input: { hours: number; kind: OvertimeOverrideKind; reason: string },
  ) =>
    adjust(
      "overtime",
      () =>
        actions.setOvertimeOverride(runId, {
          employeeId: slip.employeeId,
          ...input,
        }),
    );

  const clearOvertime = (slip: Payslip) =>
    adjust(
      "overtime",
      () => actions.clearOvertimeOverride(runId, slip.employeeId),
    );

  const saveBonus = (slip: Payslip, input: { amountKobo: number; reason: string }) =>
    adjust(
      "bonus",
      () => actions.setBonus(runId, { employeeId: slip.employeeId, ...input }),
    );

  const clearBonusFor = (slip: Payslip) =>
    adjust(
      "bonus",
      () => actions.clearBonus(runId, slip.employeeId),
    );

  const savePay = (
    slip: Payslip,
    input: { grossMonthlyKobo: number; reason: string },
  ) =>
    adjust(
      "pay",
      () =>
        actions.setMonthlyPay(runId, {
          employeeId: slip.employeeId,
          ...input,
        }),
    );
  const [saving, setSaving] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  function close() {
    setOverriding(null);
    setOverrideError(null);
  }

  /* One row open at a time. Opening a second while one is half-typed would
     leave two forms claiming the same column, and the figure being replaced is
     the one in the row above each of them. */
  function toggle(slip: Payslip) {
    if (overriding?.id === slip.id) close();
    else {
      setOverriding(slip);
      setOverrideError(null);
    }
  }

  async function confirmOverride(input: {
    payeKobo: number;
    reason: string;
    alsoStanding: boolean;
  }) {
    if (!overriding) return;
    setSaving(true);
    setOverrideError(null);
    try {
      await actions.setTaxOverride(runId, {
        employeeId: overriding.employeeId,
        ...input,
      });
      onSaved();
      onDirectoryReload();
      close();
    } catch (caught) {
      setOverrideError(
        caught instanceof ApiError
          ? caught.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function clearOverride() {
    if (!overriding) return;
    setSaving(true);
    setOverrideError(null);
    try {
      await actions.clearTaxOverride(runId, overriding.employeeId);
      onSaved();
      onDirectoryReload();
      close();
    } catch (caught) {
      setOverrideError(
        caught instanceof ApiError
          ? caught.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

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
          <p className="text-body-sm leading-relaxed text-warning-text">
            {note}
          </p>
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
            const deductionLines = slip.lines.filter(
              (l) => l.kind === "DEDUCTION",
            );
            const open = overriding?.id === slip.id;
            return (
              <Fragment key={slip.id}>
                <TR>
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
                    <span className="flex flex-col items-end gap-0.5">
                      <span>{formatKobo(slip.grossKobo)}</span>
                      {/* What was added by hand, named under the figure. "Clearly
                          shown in the table" is the whole request: a gross that
                          moved with nothing saying why is the claim this product
                          exists to refuse. */}
                      {adjustmentsOn(slip).map((line) => (
                        <span
                          key={line.id}
                          className="text-meta font-normal text-accent-text"
                        >
                          +{formatKobo(line.amountKobo)} {shortLabel(line.label)}
                        </span>
                      ))}
                      {editable && (
                        <button
                          type="button"
                          onClick={() => toggleAdjust(slip)}
                          className="text-meta font-normal text-muted underline-offset-2 hover:text-accent-text hover:underline"
                        >
                          {adjusting?.id === slip.id ? "Close" : "Adjust"}
                        </button>
                      )}
                    </span>
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
                      <span className="flex flex-col items-end gap-0.5">
                        <span
                          className={
                            slip.payeOverridden ? "text-ink" : undefined
                          }
                        >
                          {formatKobo(slip.payeKobo)}
                        </span>
                        {slip.payeOverridden ? (
                          <button
                            type="button"
                            title={slip.payeOverrideReason ?? undefined}
                            onClick={() => toggle(slip)}
                            disabled={!editable}
                            className="text-meta font-normal text-accent-text underline-offset-2 hover:underline disabled:pointer-events-none disabled:text-faint"
                          >
                            {open ? "Close" : "Entered by hand"}
                          </button>
                        ) : (
                          editable && (
                            <button
                              type="button"
                              onClick={() => toggle(slip)}
                              className="text-meta font-normal text-muted underline-offset-2 hover:text-accent-text hover:underline"
                            >
                              {open ? "Close" : "Enter manually"}
                            </button>
                          )
                        )}
                      </span>
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
                {adjusting?.id === slip.id && (
                  <TR>
                    <TD colSpan={anyUnpaid ? 8 : 7} className="bg-canvas p-0">
                      <div className="flex flex-col divide-y divide-line">
                        <OvertimeByHand
                          name={slip.name}
                          grossMonthlyKobo={monthlyOf(slip, employees)}
                          workingDaysPerMonth={workingDays}
                          hoursPerDay={overtimePolicy.policy.hoursPerDay}
                          basis={overtimePolicy.policy.hourlyBasis}
                          rates={{
                            WEEKDAY: overtimePolicy.policy.weekdayRate,
                            WEEKEND: overtimePolicy.policy.weekendRate,
                            PUBLIC_HOLIDAY: overtimePolicy.policy.holidayRate,
                          }}
                          current={null}
                          saving={adjustSaving === "overtime"}
                          error={adjustError}
                          onSave={(input) => void saveOvertime(slip, input)}
                          onCancel={closeAdjust}
                          {...(hasManualOvertime(slip)
                            ? { onClear: () => void clearOvertime(slip) }
                            : {})}
                        />
                        <BonusByHand
                          name={slip.name}
                          current={bonusOn(slip)}
                          saving={adjustSaving === "bonus"}
                          error={adjustError}
                          onSave={(input) => void saveBonus(slip, input)}
                          onCancel={closeAdjust}
                          {...(bonusOn(slip)
                            ? { onClear: () => void clearBonusFor(slip) }
                            : {})}
                        />
                        <PayByHand
                          name={slip.name}
                          currentKobo={monthlyOf(slip, employees) || null}
                          saving={adjustSaving === "pay"}
                          error={adjustError}
                          onSave={(input) => void savePay(slip, input)}
                          onCancel={closeAdjust}
                        />
                      </div>
                    </TD>
                  </TR>
                )}
                {open && (
                  <TR>
                    <TD colSpan={anyUnpaid ? 8 : 7} className="bg-canvas p-0">
                      <PayeByHand
                        slip={slip}
                        periodLabel={period}
                        standingAlready={
                          employees.find((e) => e.id === slip.employeeId)
                            ?.payeManualOverride ?? false
                        }
                        saving={saving}
                        error={overrideError}
                        onCancel={close}
                        onSave={(input) => void confirmOverride(input)}
                        {...(slip.payeOverridden
                          ? { onClear: () => void clearOverride() }
                          : {})}
                      />
                    </TD>
                  </TR>
                )}
              </Fragment>
            );
          })}
        </TBody>
      </TableWrap>
      <CardBody className="border-t border-line">
        <p className="text-meta leading-relaxed text-muted">
          Employer pension is not in any column here. It is a company cost on
          top of gross and does not reduce anybody&apos;s pay — the totals on
          the next step show it separately.
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

/**
 * Entering somebody's PAYE by hand, in the row it belongs to.
 *
 * This was a modal, and a modal was wrong for it: the figure being replaced is
 * in the cell directly above this form, and covering the table to type over one
 * number in it meant losing sight of the number. It opens under the row now,
 * with the bands' own figure quoted in the description so both are on screen at
 * once.
 *
 * **The reason stays required, and stays here.** The obvious inline build is an
 * amount field and nothing else, and it would throw away the one thing that
 * makes this different from a number silently typed over another — "why does
 * this not match the bands" has to have a written answer as durable as "why was
 * Grace not paid in August". The API enforces the same four-character floor and
 * says so in its own words; this refuses first so nobody types a figure, saves,
 * and is sent back.
 *
 * Pension, NHF and every other line keep computing normally — only this figure
 * and net pay, which is derived from it, take what is typed here. Said on
 * screen rather than assumed, because "does this also change their pension" is
 * the obvious next question.
 */
function PayeByHand({
  slip,
  periodLabel,
  standingAlready,
  saving,
  error,
  onSave,
  onCancel,
  onClear,
}: {
  slip: Payslip;
  /** "August 2026". An override belongs to exactly one period, like an
   *  exclusion — the figure two months from now may be different. */
  periodLabel: string;
  /** Whether `Employee.payeManualOverride` is already set for this person. */
  standingAlready: boolean;
  saving: boolean;
  error: string | null;
  onSave: (input: {
    payeKobo: number;
    reason: string;
    alsoStanding: boolean;
  }) => void;
  onCancel: () => void;
  /** Present only when there is something to clear back to the bands. */
  onClear?: () => void;
}) {
  const overridden = slip.payeOverridden;
  const [amount, setAmount] = useState(String(slip.payeKobo / 100));
  const [reason, setReason] = useState(slip.payeOverrideReason ?? "");
  const [alsoStanding, setAlsoStanding] = useState(standingAlready);

  const parsed = Number(amount);
  const amountInvalid =
    !amount.trim() || !Number.isFinite(parsed) || parsed < 0;
  const tooShort = reason.trim().length < 4;
  const firstName = slip.name.split(" ")[0] ?? slip.name;

  return (
    <div className="flex flex-col gap-4 border-l-2 border-accent px-4 py-4">
      <p className="text-body-sm leading-relaxed text-muted">
        {overridden
          ? `${formatKobo(slip.payeKobo)} for ${periodLabel}, entered by hand.`
          : `The bands put ${firstName}'s PAYE at ${formatKobo(slip.payeKobo)} for ${periodLabel}.`}{" "}
        What you enter replaces it on this one payslip and net pay moves with
        it. Pension, housing fund and every other line keep computing normally.
      </p>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <Field label="Monthly PAYE" required help="Naira, not annual.">
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="100"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="₦ a month"
            className="sm:w-44"
          />
        </Field>

        <div className="flex-1">
          <Field
            label="Why does this not come from the bands?"
            required
            help="Whoever asks this question next year reads exactly what you type here."
            {...(error ? { error } : {})}
          >
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Agreed with the state IRS at a different figure."
            />
          </Field>
        </div>
      </div>

      <Checkbox
        label={`Always enter ${firstName}'s PAYE by hand from now on`}
        checked={alsoStanding}
        onChange={(e) => setAlsoStanding(e.target.checked)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="accent"
          size="sm"
          onClick={() =>
            onSave({
              payeKobo: Math.round(parsed * 100),
              reason: reason.trim(),
              alsoStanding,
            })
          }
          disabled={amountInvalid || tooShort || saving}
          loading={saving}
        >
          {overridden ? `Save ${firstName}'s figure` : "Enter it by hand"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
        {onClear && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={saving}
            className="ml-auto"
          >
            Clear — use the bands instead
          </Button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------- what was added by hand, named */

/**
 * Earning lines somebody typed, as opposed to ones the engine worked out.
 *
 * Matched on the label, because `PayslipLine` carries no code column — the
 * labels are generated in exactly one place (`payroll/assemble.ts`) with fixed
 * prefixes for this. Fragile enough to say out loud: change a prefix there and
 * these stop being named under the gross figure, though nothing is mispaid.
 */
function adjustmentsOn(slip: Payslip) {
  return slip.lines.filter(
    (line) =>
      line.kind === "EARNING" &&
      (line.label.startsWith("Overtime, entered by hand") ||
        line.label.startsWith("Bonus")),
  );
}

function hasManualOvertime(slip: Payslip): boolean {
  return slip.lines.some((line) =>
    line.label.startsWith("Overtime, entered by hand"),
  );
}

/** The bonus on this run, if there is one, as the form wants it. */
function bonusOn(slip: Payslip): { amountKobo: number; reason: string } | null {
  const line = slip.lines.find((l) => l.label.startsWith("Bonus — "));
  if (!line) return null;
  return {
    amountKobo: line.amountKobo,
    reason: line.label.replace(/^Bonus — /, ""),
  };
}

/** "Bonus — Q3 target" under a figure is enough; the full line is on the payslip. */
function shortLabel(label: string): string {
  if (label.startsWith("Overtime, entered by hand")) return "overtime";
  if (label.startsWith("Bonus — ")) return label.replace(/^Bonus — /, "");
  return label;
}

/**
 * What this person is paid a month, in kobo.
 *
 * From the **directory**, not from the payslip. The first version of this
 * backed the figure out of `grossKobo` by subtracting the allowance lines,
 * which is right for somebody paid a full month and wrong for everybody else:
 * a payslip prorated for unpaid days carries the prorated contract, while the
 * API values overtime on the whole month. Adaeze, with five unpaid days, would
 * have been shown an hourly rate well below the one she is actually paid.
 *
 * `Employee.grossMonthly` is in naira — the one money field on that type that
 * is not kobo, which `HANDOVER.md` records as a legacy waiting to be shed.
 *
 * Returns 0 when the directory has not answered or the person has no agreed
 * figure. Both callers handle that: the overtime form shows the divisor with a
 * zero rate rather than a wrong one, and the pay field opens empty, which is
 * exactly the `missing_pay` case.
 */
function monthlyOf(
  slip: Payslip,
  employees: readonly { id: string; grossMonthly?: number | null }[],
): number {
  const person = employees.find((row) => row.id === slip.employeeId);
  return person?.grossMonthly ? Math.round(person.grossMonthly * 100) : 0;
}
