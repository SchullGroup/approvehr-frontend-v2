"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
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
  RunStatusBadge,
  SourceBadge,
  TotalsPanel,
} from "@/components/payroll/run-panels";
import { ApiError } from "@/lib/api/client";
import {
  formatKobo,
  periodLabel,
  type PreparedRun,
  type Payslip,
} from "@/lib/api/payroll";
import { useCan } from "@/lib/permissions";
import {
  countBySeverity,
  usePayrollActions,
  usePayrollRun,
  usePayrollRuns,
} from "@/lib/store/payroll";
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
  { id: "check", label: "Check", hint: "Prepare and fix" },
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
            ? "Prepared, but the figures do not add up"
            : `Prepared ${periodLabel(period)}`,
        tone: result.discrepancies.length > 0 ? "danger" : "success",
        detail: `${result.headcount} ${result.headcount === 1 ? "person" : "people"} · ${result.blockers} to fix · ${result.warnings} to look at`,
      });
      if (stepper.index === 0) stepper.goTo(1);
    } catch (caught) {
      toast.push({
        title: "Could not prepare this run",
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
            description="The period decides which contracts, joiners and leavers are picked up."
          />
          <CardBody className="grid max-w-2xl gap-5 sm:grid-cols-2">
            <Field label="Pay period" required>
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
              label="Name this run"
              help="Optional. Useful when a month has more than one."
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
                  It has {existing.employeeCount}{" "}
                  {existing.employeeCount === 1 ? "payslip" : "payslips"} and is{" "}
                  {existing.status === "APPROVED" || existing.status === "PAID"
                    ? "approved, so its figures are frozen."
                    : "still a draft. You can prepare it again from the next step."}
                </Callout>
              ) : (
                <Callout tone="accent" title="Preparing pays nobody">
                  It works out everybody&apos;s pay, writes the payslips, and lists
                  anything wrong with the records behind them. No money moves, no
                  loan instalment is taken, and you can do it as many times as you
                  like.
                </Callout>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {/* ---------------------------------------------------------- 2 Check */}
      {stepper.index === 1 && (
        <div className="flex flex-col gap-5">
          {!canPrepare && (
            <Callout tone="warning" title="You cannot prepare a run">
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
                {run ? "Prepare again" : `Prepare ${periodLabel(period)}`}
              </Button>
              {run && (
                <p className="text-[0.75rem] leading-relaxed text-muted">
                  {run.employeeCount}{" "}
                  {run.employeeCount === 1 ? "payslip" : "payslips"} ·{" "}
                  {formatKobo(run.grossKobo)} gross
                </p>
              )}
              {settled && (
                <p className="text-[0.75rem] leading-relaxed text-muted">
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
                <p className="text-[0.875rem] text-muted">Loading the run…</p>
              </CardBody>
            </Card>
          ) : run ? (
            <ExceptionList exceptions={exceptions} />
          ) : (
            <EmptyState
              compact
              icon={<ShieldCheck aria-hidden="true" />}
              title="Nothing prepared yet"
              description="Prepare the period and anything wrong with the records will be listed here, with the screen that fixes it."
            />
          )}
        </div>
      )}

      {/* --------------------------------------------------------- 3 Review */}
      {stepper.index === 2 && (
        <div className="flex flex-col gap-5">
          <DiscrepancyPanel discrepancies={discrepancies} />
          {run ? (
            <PayslipTable payslips={run.payslips} />
          ) : (
            <EmptyState
              compact
              icon={<ShieldCheck aria-hidden="true" />}
              title="Nothing to review"
              description="Go back a step and prepare the period first."
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
                description="Preparing was free. This is not."
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
                <dl className="flex flex-col gap-2.5 text-[0.875rem]">
                  <SummaryRow label="Status" value={<RunStatusBadge status={run.status} />} />
                  <SummaryRow label="People" value={String(run.employeeCount)} />
                  <SummaryRow label="Pays on" value={run.payDate} />
                  <SummaryRow
                    label="Stops the run"
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
function PayslipTable({ payslips }: { payslips: Payslip[] }) {
  const anyUnpaid = payslips.some((slip) => slip.unpaidDays > 0);

  return (
    <Card>
      <CardHeader
        title="Every payslip"
        description="PAYE is worked out on annual income against the bands in force for the period, after pension and housing-fund relief."
        action={
          <Badge tone="neutral" size="sm">
            {payslips.length} {payslips.length === 1 ? "payslip" : "payslips"}
          </Badge>
        }
      />
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
                  {formatKobo(slip.pensionEmployeeKobo)}
                </TD>
                <TD align="right" className="tabular text-muted">
                  {formatKobo(slip.nhfKobo)}
                </TD>
                <TD align="right" className="tabular text-muted">
                  {formatKobo(slip.payeKobo)}
                </TD>
                <TD align="right" className="tabular text-muted">
                  {slip.otherDeductionsKobo > 0 ? (
                    <>
                      {formatKobo(slip.otherDeductionsKobo)}
                      {deductionLines.length > 0 && (
                        <span className="mt-0.5 block text-[0.75rem] font-normal text-faint">
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
        <p className="text-[0.75rem] leading-relaxed text-muted">
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
