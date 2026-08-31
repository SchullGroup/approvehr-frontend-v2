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
  Ban,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
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
  type DeductionKind,
} from "@/lib/api/payroll";
import { useCan } from "@/lib/permissions";
import { useOvertimePolicy } from "@/lib/store/overtime";
import { SheetPanel } from "./sheet-panel";
import { PayPanel, WalletStrip } from "./pay-panel";
import { LinesDialog } from "./lines-dialog";
import type { SheetRowSource } from "@/lib/payroll/adjustment-sheet";
import type { Employee } from "@/lib/types";
import { usePayrollSettings } from "@/lib/payroll/use-settings";
import { InlineHours, InlineMoney } from "./inline-edit";
import type { OvertimeHourlyBasis } from "@/lib/overtime/derive";
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
import { useDeductionSwitches } from "@/lib/store/payroll-deductions";
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

/**
 * Move a `YYYY-MM` key by whole months, through `Date` rather than by
 * arithmetic on the parts — December plus one is next January, and every
 * hand-rolled version of this gets that wrong or gets `0`-indexed months
 * wrong. Day 1 and UTC throughout, so no timezone can move the month.
 */
function shiftPeriod(period: string, months: number): string {
  const [year, month] = period.split("-").map(Number);
  const moved = new Date(Date.UTC(year!, month! - 1 + months, 1));
  return moved.toISOString().slice(0, 7);
}

/**
 * Where a period sits relative to today, which is the only thing that makes
 * one month different from another to prepare.
 *
 * A **finished** month is the ordinary case. A month **still running** can be
 * prepared — a company paying on the 25th has no choice — and the figures
 * cover it as worked so far; the API raises `period_not_finished` saying so,
 * and `unpaidDaysFor` stops counting at today so nobody is docked for a day
 * that has not happened. A month that has **not started** is a payment in
 * advance, which is ordinary for a December run made before the holidays.
 *
 * None of the three is refused. The point is that somebody moving off the
 * obvious month is told what they have moved to, before they calculate.
 *
 * ## Two rules about where the numbers come from
 *
 * **The real clock, not `TODAY`.** `TODAY` is pinned to the demo dataset's day
 * so the seed stays coherent; whether a month has ended is not a question
 * about the seed. The API decides this against `new Date()`, and this sentence
 * describes what the API is about to do.
 *
 * **No day count here.** The first draft worked one out and would have read
 * "12 days to come" beside the API's own "2 days are still to come" — one
 * fact, two numbers, on adjacent surfaces, because the two were counting from
 * different clocks. `period_not_finished` carries the figure; this carries the
 * consequence. Same rule as never re-implementing a score on this side.
 */
function periodStanding(period: string): {
  tone: "finished" | "running" | "ahead";
  line: string;
} {
  /* Reading the clock during render is safe *here* and would not be in most
     components. This route is prerendered, and the wizard uses
     `useSearchParams`, so its Suspense boundary renders the fallback on the
     server and this subtree is client-only — the date never reaches
     prerendered HTML, so there is nothing for hydration to disagree with. If
     that boundary or that hook ever goes, this becomes a build-time date
     baked into the page. `page.tsx` says the same thing from its end. */
  const thisMonth = new Date().toISOString().slice(0, 7);

  if (period < thisMonth) {
    return { tone: "finished", line: "This month is over — the usual case." };
  }
  if (period > thisMonth) {
    return {
      tone: "ahead",
      line:
        "This month has not started, so this pays it in advance. Everybody is " +
        "paid a full month, and nothing worked in it is known yet.",
    };
  }
  return {
    tone: "running",
    line:
      "This month is still running. The figures cover it as worked so far and " +
      "nobody is docked for a day that has not happened — calculate again once " +
      "it ends to pick up the rest.",
  };
}

export function PayrollRunWizard() {
  const router = useRouter();
  const toast = useToast();
  const stepUp = useStepUp();
  const params = useSearchParams();

  /* A period in the URL means somebody came from the dashboard to look at a run
     that already exists, so the rail opens on the checks rather than on a form
     they have already filled in. Read at first render, not in an effect. */
  const periodParam = params.get("period");

  /**
   * Which step to open on.
   *
   * A period in the URL already meant "skip the form they filled in on the
   * screen before", and `?step=` is the same idea one further: a run that is
   * approved and unpaid is linked to from the payroll home with one job — pay
   * these people — and landing them on Check to press Continue twice is a link
   * that half-works.
   *
   * Matched **by id, never by index**, so reordering `STEPS` cannot silently
   * send somebody to a different screen. An unknown value falls back to the
   * period rule rather than throwing: a link somebody typed wrong should open
   * the wizard, not break it.
   */
  const stepParam = params.get("step");
  const requested = STEPS.findIndex((step) => step.id === stepParam);
  const stepper = useStepper(
    STEPS,
    requested >= 0 ? requested : periodParam ? 1 : 0,
  );

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

  /**
   * Moving the month carries the pay date with it.
   *
   * Without this, stepping from August to September leaves the pay date on
   * 2026-08-28 — a September payroll paying in August, which the form would
   * show without complaint. The day of the month is what somebody chose and
   * is kept; it is clamped to the new month's length, so the 31st becomes the
   * 30th in September rather than silently rolling into October.
   */
  const withPayDate = (nextPeriod: string) => {
    const lastDay = new Date(
      Date.UTC(
        Number(nextPeriod.slice(0, 4)),
        Number(nextPeriod.slice(5, 7)),
        0,
      ),
    ).getUTCDate();
    const day = Math.min(Number(payDate.slice(8, 10)) || 28, lastDay);
    return {
      period: nextPeriod,
      payDate: `${nextPeriod}-${String(day).padStart(2, "0")}`,
    };
  };

  const moveMonth = (months: number) =>
    patch(withPayDate(shiftPeriod(period, months)));

  const standing = periodStanding(period);

  const [prepared, setPrepared] = useState<PreparedRun | null>(null);
  const [busy, setBusy] = useState<"prepare" | "approve" | "cancel" | null>(
    null,
  );
  /**
   * Why approving produced no payment, when it produced none.
   *
   * Carried in state rather than derived from `run.batch === null`, because the
   * two are different facts: a null batch says there is none, and this says
   * what stopped it being built. A screen that could only see the absence would
   * offer "prepare the payment" against a company with no bank account and let
   * them press it until they gave up.
   */
  const [batchProblem, setBatchProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

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
        /* Omitted rather than sent empty. The field is optional now, and an
           empty string would fail the API's own floor — which exists to
           refuse a token answer, not an absent one. */
        ...(reason ? { reason } : {}),
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

      /* Stay here.
         -------------------------------------------------------------------
         This used to `router.push("/payroll")`, which ended the journey one
         step before the point of it: the payroll is approved and nobody has
         been paid. The reader was returned to a list and left to work out for
         themselves that there was a payments screen somewhere carrying the
         thing they actually came to do.

         Reloading flips `settled` and the step renders `PayPanel` in place —
         pay them, or take the file to the bank. Leaving is still one click
         away and is now a decision rather than the only option. */
      setBatchProblem(result.batchProblem);
      reloadRuns();
      detail.reload();
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

  /**
   * Backs out of a run before it is approved.
   *
   * `actions.cancel` and its refusals have existed since this file was
   * written — tested at the API layer, wired all the way through the store
   * — with nothing anywhere that ever called it. A run prepared by mistake,
   * for the wrong month, or simply abandoned had no way out: nothing here
   * moves money or settles anything, so there was never a reason for that.
   *
   * Nothing is lost that mattered. `cancel` only ever changes `status` —
   * every payslip, exclusion and hand-entered figure stays on the row,
   * and preparing this period again reopens it and rebuilds from scratch
   * (`payroll/service.ts`'s own comment on `prepare`). So this is a real
   * escape hatch, not a soft delete dressed up as one.
   */
  async function cancelRun() {
    if (!runId) return;
    setBusy("cancel");
    try {
      await actions.cancel(runId);
      setCancelling(false);
      toast.push({
        title: `${periodLabel(period)} cancelled`,
        tone: "info",
        detail: "Prepare it again whenever you're ready to start over.",
      });
      router.push("/payroll");
    } catch (caught) {
      setCancelling(false);
      toast.push({
        title: "Could not cancel this run",
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

      <div className="flex items-start justify-between gap-3">
        <StepIndicator
          steps={displaySteps}
          index={stepper.index}
          furthest={stepper.furthest}
          onStepSelect={stepper.goTo}
        />
        {/* Only while there is something to back out of. Gone once approved —
            that door only opens forwards — and gone once already cancelled,
            since pressing Calculate is what starts this period over. */}
        {run && (run.status === "DRAFT" || run.status === "IN_REVIEW") && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-danger-text hover:bg-danger-soft"
            onClick={() => setCancelling(true)}
          >
            <Ban aria-hidden="true" className="size-3.5" />
            Cancel this payroll
          </Button>
        )}
      </div>

      {/* --------------------------------------------------------- 1 Period */}
      {stepper.index === 0 && (
        <Card>
          <CardHeader
            title="What are you paying?"
            description="The month decides whose contracts, new starters and exits are picked up."
          />
          <CardBody className="grid max-w-2xl gap-5 sm:grid-cols-2">
            {/* The month was a bare `type="month"` input, which *could* already
                reach any period and gave nobody a reason to think so — a
                spinner most people read as a fixed value. The arrows are the
                affordance; the native input stays behind them for jumping a
                year rather than stepping to one. Same class of defect as the
                logo and the assistant: present, correct, findable by nobody. */}
            <Field label="Pay month" required>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  aria-label={`Previous month, ${periodLabel(shiftPeriod(period, -1))}`}
                  onClick={() => moveMonth(-1)}
                >
                  <ChevronLeft aria-hidden="true" className="size-4" />
                </Button>
                <Input
                  type="month"
                  className="flex-1"
                  value={period}
                  onChange={(e) =>
                    e.target.value && patch(withPayDate(e.target.value))
                  }
                />
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  aria-label={`Next month, ${periodLabel(shiftPeriod(period, 1))}`}
                  onClick={() => moveMonth(1)}
                >
                  <ChevronRight aria-hidden="true" className="size-4" />
                </Button>
              </div>
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
            {/* What moving off this month means, stated where the month is
                chosen rather than after Calculate. `period_not_finished` says
                the same thing on the exception list for the run itself — this
                is the half somebody reads *before* spending the calculation. */}
            <p
              className={cn(
                "text-body-sm leading-relaxed sm:col-span-2",
                standing.tone === "finished" ? "text-muted" : "text-body",
              )}
            >
              {standing.tone !== "finished" && (
                <CalendarClock
                  aria-hidden="true"
                  className="mr-1.5 inline size-4 -translate-y-px text-warning-text"
                />
              )}
              {standing.line}
            </p>

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

            {existing && (
              <div className="sm:col-span-2">
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
              </div>
            )}
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
              action={
                <div className="flex items-center gap-2">
                  {/* One button, not the disclosure this used to be — see
                      SheetPanel's own doc comment for the reasoning. Sitting
                      in this card's header rather than lower on the page is
                      the point: it is the first thing here once a run exists,
                      not something to find by scrolling past the exceptions.
                      Gated on `run` for the same reason the panel always was
                      — there is nothing to download or upload until a run
                      exists, so the button is absent rather than a click that
                      would open onto nothing. */}
                  {run && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setSheetOpen(true)}
                    >
                      <FileSpreadsheet
                        aria-hidden="true"
                        className="size-3.5"
                      />
                      Work in a spreadsheet
                    </Button>
                  )}
                  {run && <RunStatusBadge status={run.status} />}
                </div>
              }
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

          {/* The spreadsheet, behind the button in the card header above.
              -----------------------------------------------------------------
              This sat as an always-present, closed-by-default disclosure
              between the Calculate card and the exception list — visible, but
              one more thing on a page already asking somebody to read a list
              of what is wrong. A single button opening a modal is a clearer
              front door: templates and upload both live behind it, and
              nothing about the page changes until somebody has actually come
              here to do this.

              Fourth instance of the class this codebase keeps recording: the
              capability was built, correct, and where nobody was looking. */}
          {run && sheetOpen && (
            <SheetPanel
              runId={run.id}
              period={run.period.slice(0, 7)}
              sources={sheetSources(run.payslips, directory.employees)}
              editable={canPrepare && !settled}
              onClose={() => setSheetOpen(false)}
              onApplied={(summary) => {
                /* The toast, not a message inside the panel: applying rebuilds
                   the run and unmounts that subtree, so anything the panel
                   held would be gone before it could be read. */
                setSheetOpen(false);
                toast.push({
                  title: "Sheet applied",
                  tone: "success",
                  detail: `${summary}. The payroll has been worked out again.`,
                });
                void prepare();
                directory.reload();
              }}
            />
          )}

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

              {/* The "Changing a figure by hand" callout stood here, and is
                  gone at the product owner's instruction.

                  It existed because the same person had twice failed to find
                  the tax, overtime and bonus controls — they are on the *next*
                  step, and this one is about what is wrong with the records.
                  Every word of it was true. It was also four sentences and a
                  button explaining an interaction that should announce itself:
                  the Review table has an Overtime column, a Bonus column and a
                  PAYE column, each of which opens an input where you click it.

                  The lesson it was written for still stands — a control the
                  reader cannot find is a control they do not have. What was
                  wrong was the remedy: make the control legible, do not put a
                  paragraph in front of it. If those columns ever stop looking
                  editable, fix the columns rather than restoring this. */}
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
                onAdjusted={(summary) => {
                  /* The toast, not a message inside the modal — saving
                     rebuilds the run and unmounts the table, so anything held
                     down there is gone before anybody reads it. Same
                     arrangement as the spreadsheet panel above. */
                  toast.push({
                    title: "Saved",
                    tone: "success",
                    detail: `${summary}. The payroll has been worked out again.`,
                  });
                }}
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
            {/* Paying leads once there is anything to pay.
                ---------------------------------------------------------
                An approved payroll's next act is paying it, and this used to
                be a different screen somebody had to know existed. The totals
                and the consequences drop below it: they are what somebody
                reads *before* deciding, and after the decision the question is
                only "how does the money leave". */}
            {settled && (
              <PayPanel
                run={run}
                problem={batchProblem}
                onChanged={detail.reload}
              />
            )}

            {/* Before the decision: the position, stated in advance.
                ---------------------------------------------------------
                A shortfall found at the provider is found after the run is
                approved, the loans are settled and the figures are frozen.
                This never blocks the approval — see `WalletStrip` — it only
                makes sure nobody meets the number for the first time on the
                far side of a one-way door. */}
            {!settled && <WalletStrip run={run} />}

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
                  {/* Directly beneath a SummaryRow reading "Status: In
                      review". */}
                  <SummaryRow
                    label="People on this payroll"
                    value={headcountLabel(run)}
                  />
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
            <span className="flex items-center gap-3">
              {/* Why the button is dead, at the button.
                  ---------------------------------------------------------
                  `canContinue` goes false on a blocker, and the only
                  explanation sat in the exception list several screens
                  above. Somebody who had just excluded two people and
                  scrolled to the footer found a grey control and nowhere to
                  read why.

                  Counted rather than named: the list above is where the
                  names are, and repeating one of them here would make a
                  reader think it was the only one. */}
              {stepper.index > 0 && blocked && (
                <span className="text-meta text-muted">
                  {counts.blockers + discrepancies.length === 1
                    ? "1 thing still stops this run."
                    : `${counts.blockers + discrepancies.length} things still stop this run.`}
                </span>
              )}
              <Button
                variant="accent"
                onClick={stepper.next}
                disabled={!canContinue}
              >
                Continue
                <ArrowRight aria-hidden="true" className="size-4" />
              </Button>
            </span>
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

      {run && (
        <ConfirmDialog
          open={cancelling}
          onClose={() => setCancelling(false)}
          onConfirm={() => void cancelRun()}
          tone="danger"
          confirmLabel="Cancel this payroll"
          loading={busy === "cancel"}
          title={`Cancel ${periodLabel(run.period)}?`}
          body={
            <p>
              Nothing has been paid or approved for {periodLabel(run.period)},
              so there is nothing to undo — this just marks it cancelled. You
              can prepare this period again from scratch whenever you&rsquo;re
              ready.
            </p>
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
      label: facts.pay.settings
        ? "What you deduct is decided"
        : "What you deduct is not decided yet",
      ok: facts.pay.settings,
      detail: "PAYE, pension and NHF — each a switch, in payroll settings.",
      href: "/settings/payroll",
      linkLabel: "Decide it",
    },
    {
      /* The label states what IS, never what should be. Three rows here used
         to carry a fixed affirmative — "A default PAYE state is set" sat above
         a "Set it" button on a company that had never set one, so the sentence
         read as done and only the amber triangle disagreed with it. The two
         payroll-checks rows below already flip their wording on `ok`; these
         now do the same. */
      label: facts.company.taxState
        ? "A default PAYE state is set"
        : "No default PAYE state yet",
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
      label: facts.pay.hasPrimaryBankAccount
        ? "Your company has a payout account on file"
        : "Your company has no payout account on file",
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
  onAdjusted,
  onDirectoryReload,
}: {
  payslips: Payslip[];
  /** For the count. A badge saying "9 payslips" beside a company of ten is
      true and, on its own, the wrong answer to "is everybody here?". */
  run: { employeeCount: number; excludedCount: number };
  runId: string;
  /** "August 2026". */
  periodLabel: string;
  /**
   * Just enough of the directory to price overtime and read a contract.
   *
   * There is no tax-override dialog any more and there must not be one again:
   * changing the tax is one input in the cell, typed and saved, with no
   * confirmation in front of it. A figure a reviewer is correcting while
   * reading a table is not a decision that needs a second click — approving
   * the payroll is, and that is the one dialog left on this screen.
   */
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
   * What a modal did, for the wizard's toast.
   *
   * The same arrangement `SheetPanel` uses and for the same reason: saving
   * rebuilds the run, which unmounts this whole subtree, so a confirmation
   * held here is destroyed before it can be read. It belongs to the wizard,
   * which survives.
   */
  onAdjusted: (summary: string) => void;
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
  /**
   * Which single cell is being edited, if any.
   *
   * One cell at a time and no expansion. The row keeps its height, so a table
   * of three hundred does not jump under somebody working down it — which is
   * the whole reason the stacked panels came out.
   */
  const [editing, setEditing] = useState<{
    slipId: string;
    field: "overtime" | "bonus" | "pay" | "paye";
  } | null>(null);
  /**
   * Whose bonus or deduction lines are open in the modal.
   *
   * A modal rather than a cell for both, because a bonus is frequently more
   * than one thing — ₦50,000 for the Lagos install and ₦20,000 for the weekend
   * cover — and a single amount with a single reason forces two facts into one
   * sentence nobody can reconcile a year later. The table still shows one
   * figure, which is what a payroll table is for.
   */
  const [linesOpen, setLinesOpen] = useState<{
    employeeId: string;
    name: string;
    kind: "bonus" | "deduction";
  } | null>(null);

  const [editingDeduction, setEditingDeduction] = useState<{
    slipId: string;
    kind: DeductionKind;
  } | null>(null);
  const [adjustSaving, setAdjustSaving] = useState<
    "overtime" | "bonus" | "pay" | "paye" | "deduction" | null
  >(null);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  const beginEdit = (
    slip: Payslip,
    field: "overtime" | "bonus" | "pay" | "paye",
  ) => {
    setAdjustError(null);
    setEditing({ slipId: slip.id, field });
  };
  const editingCell = (slip: Payslip, field: string) =>
    editing?.slipId === slip.id && editing.field === field;
  const overtimePolicy = useOvertimePolicy();
  const { settings: paySettings } = usePayrollSettings();
  const workingDays = paySettings.workingDaysPerMonth;

  const closeAdjust = () => {
    setEditing(null);
    setAdjustError(null);
  };

  /**
   * One place every by-hand write goes through.
   *
   * Each returns a rebuilt run, so the table has to reload rather than patch a
   * figure locally — the whole period is recomputed server-side and a local
   * patch would show one moved number beside five stale ones.
   */
  const adjust = async (
    which: "overtime" | "bonus" | "pay" | "paye" | "deduction",
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

  /**
   * Hours only. The rate is the company's weekday multiplier and no reason is
   * asked for — see `inline-edit.tsx` and `PayrollTaxOverride.reason`.
   */
  const saveOvertime = (slip: Payslip, hours: number) =>
    adjust("overtime", () =>
      actions.setOvertimeOverride(runId, {
        employeeId: slip.employeeId,
        hours,
        kind: "WEEKDAY",
      }),
    );

  const clearOvertime = (slip: Payslip) =>
    adjust("overtime", () =>
      actions.clearOvertimeOverride(runId, slip.employeeId),
    );

  /** The tax figure, alone. No reason, no standing preference, no dialog. */
  const savePaye = (slip: Payslip, payeKobo: number) =>
    adjust("paye", () =>
      actions.setTaxOverride(runId, { employeeId: slip.employeeId, payeKobo }),
    );

  const clearPaye = (slip: Payslip) =>
    adjust("paye", () => actions.clearTaxOverride(runId, slip.employeeId));

  /**
   * A statutory deduction, by hand. Same shape as the tax one: no reason
   * asked for, no standing preference, and the run rebuilds server-side —
   * pension is pre-tax, so PAYE and net move with it once the reload lands.
   */
  const saveDeduction = (
    slip: Payslip,
    kind: DeductionKind,
    amountKobo: number,
  ) =>
    adjust("deduction", async () => {
      const result = await actions.setDeductionOverride(runId, {
        employeeId: slip.employeeId,
        kind,
        amountKobo,
      });
      setEditingDeduction(null);
      return result;
    });

  const clearDeduction = (slip: Payslip, kind: DeductionKind) =>
    adjust("deduction", async () => {
      const result = await actions.clearDeductionOverride(
        runId,
        slip.employeeId,
        kind,
      );
      setEditingDeduction(null);
      return result;
    });

  /* `saveBonus` and `clearBonusFor` were here and are gone with the inline
     bonus cell. `setBonus`/`clearBonus` still exist on the store and on the
     API — they are the single-figure route, which the spreadsheet upload and
     the ETL both use — but nothing on this screen writes a bonus one amount at
     a time any more. Deleted rather than left: a helper nobody calls is a
     helper the next person wires a second entry point to. */

  const savePay = (
    slip: Payslip,
    input: { grossMonthlyKobo: number; reason: string },
  ) =>
    adjust("pay", () =>
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
          {/* Overtime and bonus are entered here, in the cell, on the row.
              Housing fund came out to make room: it is a computed statutory
              line nobody edits from this screen, it is on the payslip, and a
              column somebody only reads is worth less than one they work in. */}
          <TH align="right">Overtime</TH>
          <TH align="right">Bonus</TH>
          {/* Pension came out with Housing fund, and for the same reason: it is
              a statutory figure nobody edits from this screen, it is on the
              payslip in full, and every column that is only read costs the ones
              that are worked in. What is left is the two figures somebody
              enters, the tax they may override, and the totals either side. */}
          <TH align="right">
            <span className="flex flex-col items-end gap-1">
              PAYE
              <PayeSwitch editable={editable} onChanged={onSaved} />
            </span>
          </TH>
          {/* Everything taken off besides PAYE, as one figure.
              -----------------------------------------------
              This was "Other", and it carried only the pre-tax and post-tax
              deduction lines — so with the Pension column gone and NHF never
              having had one, **the row did not add up**: gross minus PAYE minus
              Other was short of net by pension plus NHF, ₦9,500 on a ₦100,000
              salary, with nothing on screen to account for it. The product
              owner's question was "why does the net not include the overtime
              and bonus" — it did, and the row was unreadable, which comes to
              the same thing on a screen somebody approves money from.

              Removing the pension column was right. Leaving the figure out of
              the arithmetic was not: a payroll table whose own figures do not
              reconcile is the defect this product is sold against. */}
          <TH align="right">Deductions</TH>
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
                          +{formatKobo(line.amountKobo)}{" "}
                          {shortLabel(line.label)}
                        </span>
                      ))}
                      {/* "Change pay" used to sit under every gross figure —
                          ten times on a ten-person payroll, three hundred on a
                          real one, for an act almost nobody performs while
                          working a month up.

                          It is also the one control here that is **not about
                          this payroll**: it rewrites `Employee.grossMonthly`,
                          the contract, from a table headed with a single
                          month. That mismatch is what made it unreadable — the
                          product owner's words were "I don't understand the
                          change pay here".

                          A pay rise belongs on the person's record, which the
                          employee name already links to. Editing stays in this
                          table for the three things that genuinely belong to
                          one period: overtime, a bonus, and the tax. */}
                    </span>
                  </TD>
                  {/* Overtime: hours in, money out, in the cell. */}
                  <TD align="right" className="tabular text-muted">
                    {editingCell(slip, "overtime") ? (
                      <InlineHours
                        hourlyKobo={hourlyFor(
                          monthlyOf(slip, employees),
                          overtimePolicy.policy.hoursPerDay,
                          workingDays,
                          overtimePolicy.policy.hourlyBasis,
                        )}
                        rate={overtimePolicy.policy.weekdayRate}
                        saving={adjustSaving === "overtime"}
                        onSave={(hours) => void saveOvertime(slip, hours)}
                        onCancel={closeAdjust}
                      />
                    ) : (
                      <CellValue
                        amountKobo={overtimeOn(slip)}
                        editable={editable}
                        /* Names the unit: hours is what goes in the box and
                           money is what comes out of it, which the column
                           heading alone does not say. The bonus cell just
                           reads "Add" — its heading already names the thing,
                           and two words wrap in a column this narrow. */
                        addLabel="Add hours"
                        onEdit={() => beginEdit(slip, "overtime")}
                        onClear={
                          hasManualOvertime(slip)
                            ? () => void clearOvertime(slip)
                            : undefined
                        }
                      />
                    )}
                  </TD>

                  {/* Bonus: one figure in the table, several named lines
                      behind it.
                      -------------------------------------------------------
                      This was an inline amount, which could hold ₦70,000 and
                      one reason — so "Lagos install" and "weekend cover" had
                      to be typed into one sentence, and twelve months later
                      nobody can say which project the ₦50,000 belonged to.
                      The modal keeps the amounts apart; the cell keeps showing
                      the total, because a payroll table is a column of totals.

                      No inline clear beside it any more: an empty list saved
                      from the modal is the removal, and the button there says
                      so in words rather than a bin icon on a figure. */}
                  <TD align="right" className="tabular text-muted">
                    <CellValue
                      amountKobo={bonusOn(slip)?.amountKobo ?? 0}
                      editable={editable}
                      addLabel="Add"
                      onEdit={() =>
                        setLinesOpen({
                          employeeId: slip.employeeId,
                          name: slip.name,
                          kind: "bonus",
                        })
                      }
                    />
                  </TD>

                  {/* PAYE: one input in the cell, and nothing else.
                      The expanding form that used to open here was the size of
                      the row it sat in. What it explained is said once above
                      the table; the reason is optional on the API for exactly
                      this. */}
                  <TD align="right" className="tabular text-muted">
                    {!wasDeducted(slip.operates, "paye") ? (
                      <span className="text-faint">Not operated</span>
                    ) : editingCell(slip, "paye") ? (
                      <InlineMoney
                        valueKobo={slip.payeKobo}
                        saving={adjustSaving === "paye"}
                        placeholder="PAYE"
                        onSave={(kobo) => void savePaye(slip, kobo)}
                        onCancel={closeAdjust}
                      />
                    ) : (
                      <span className="flex flex-col items-end gap-0.5">
                        {/* The tax is editable here and always has been — and
                            like the two columns beside it, nothing on screen
                            said so.

                            Overtime and a bonus can announce themselves by
                            being empty ("Add hours"), and PAYE cannot: it
                            always carries the engine's own figure, so there is
                            no blank to fill. The cue has to be on the number.
                            The same dotted underline the add-labels use marks
                            it as a figure you may type over, and "Change" sits
                            under it in the same slot the overridden state uses
                            for "Edited · undo" — so the row does not move
                            height when it flips between them.

                            A reader who may not edit gets neither: the plain
                            figure, which is what it is. */}
                        <button
                          type="button"
                          disabled={!editable}
                          onClick={() => beginEdit(slip, "paye")}
                          aria-label={`Change the PAYE for ${slip.name}`}
                          className={cn(
                            "rounded px-1 text-right disabled:pointer-events-none",
                            slip.payeOverridden ? "text-ink" : undefined,
                            editable &&
                              "underline decoration-dotted underline-offset-2 hover:bg-canvas hover:text-accent-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-text",
                          )}
                        >
                          {formatKobo(slip.payeKobo)}
                        </button>
                        {editable && !slip.payeOverridden && (
                          <button
                            type="button"
                            onClick={() => beginEdit(slip, "paye")}
                            tabIndex={-1}
                            className="text-meta whitespace-nowrap font-normal text-accent-text underline-offset-2 hover:underline"
                          >
                            Change
                          </button>
                        )}
                        {slip.payeOverridden && (
                          <button
                            type="button"
                            disabled={!editable}
                            onClick={() => void clearPaye(slip)}
                            title={slip.payeOverrideReason ?? undefined}
                            className="text-meta font-normal text-muted underline-offset-2 hover:text-danger-text hover:underline disabled:pointer-events-none"
                          >
                            Edited · undo
                          </button>
                        )}
                      </span>
                    )}
                  </TD>
                  <TD align="right" className="tabular text-muted">
                    <Deductions
                      slip={slip}
                      lines={deductionLines}
                      editable={editable}
                      editingKind={
                        editingDeduction?.slipId === slip.id
                          ? editingDeduction.kind
                          : null
                      }
                      saving={adjustSaving === "deduction"}
                      onEdit={(kind) =>
                        setEditingDeduction({ slipId: slip.id, kind })
                      }
                      onCancelEdit={() => setEditingDeduction(null)}
                      onSave={(kind, amountKobo) =>
                        void saveDeduction(slip, kind, amountKobo)
                      }
                      onClear={(kind) => void clearDeduction(slip, kind)}
                      onEditLines={() =>
                        setLinesOpen({
                          employeeId: slip.employeeId,
                          name: slip.name,
                          kind: "deduction",
                        })
                      }
                    />
                  </TD>
                  <TD align="right" className="tabular font-medium text-ink">
                    {formatKobo(slip.netKobo)}
                  </TD>
                </TR>
                {/* One narrow row for an error, and only when there is one.
                    The forms themselves are in the cells; nothing expands. */}
                {adjustError && editing?.slipId === slip.id && (
                  <TR>
                    <TD
                      colSpan={anyUnpaid ? 9 : 8}
                      className="bg-danger-soft py-2"
                    >
                      <span className="text-body-sm text-ink">
                        {adjustError}
                      </span>
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

      {/* Outside the table, deliberately.
          -------------------------------------------------------------------
          A dialog rendered inside a `<tbody>` is invalid HTML that browsers
          silently reparent, which moves it out of the row it was written in
          and takes its React portal boundary with it. Rendered here it is a
          sibling of the table and its position is the one written down. */}
      {linesOpen && (
        <LinesDialog
          runId={runId}
          employeeId={linesOpen.employeeId}
          name={linesOpen.name}
          kind={linesOpen.kind}
          onClose={() => {
            setLinesOpen(null);
          }}
          onSaved={(summary) => {
            /* Closed first, then the run is re-read. Saving rebuilds every
               payslip, so leaving the modal open over a table that is about
               to change under it shows somebody the figures they just left. */
            setLinesOpen(null);
            onAdjusted(summary);
            onSaved();
          }}
        />
      )}
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
      {/* One line, two fields.
          ---------------------
          This was a paragraph, two labelled fields with help text under each,
          and a standing-preference checkbox — a form the size of the table row
          it sits in, for typing one number. The explanation is now the row's
          own hint and everything else is inline.

          The reason is still required and still free text, because "why does
          this not match the bands" has to have a written answer for as long as
          the figure stands. What went is the instruction telling somebody how
          to write it. */}
      <div className="flex flex-wrap items-end gap-3">
        <span className="w-40">
          <Field label="PAYE this month" required>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="100"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="₦ a month"
            />
          </Field>
        </span>

        <span className="min-w-48 flex-1">
          <Field label="Reason" required {...(error ? { error } : {})}>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Agreed with the state IRS at a different figure."
            />
          </Field>
        </span>
      </div>

      <p className="text-meta leading-relaxed text-muted">
        {overridden
          ? `${formatKobo(slip.payeKobo)} for ${periodLabel}, entered by hand.`
          : `The bands put this at ${formatKobo(slip.payeKobo)} for ${periodLabel}.`}{" "}
        Net pay moves with what you enter; pension and housing fund do not.
      </p>

      <Checkbox
        label={`Always enter ${firstName}'s PAYE by hand`}
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

/** Both forms of the bonus line: a reason is optional, so the label has two. */
function isBonusLine(label: string): boolean {
  return label === "Bonus" || label.startsWith("Bonus — ");
}

/**
 * The run, as the spreadsheet's rows.
 *
 * Hours come back out of the label the API wrote — `"Overtime, entered by hand
 * (6.00h at 1.5x)"` — because `Payslip` carries lines and money, not the
 * minutes behind them. Reading a figure out of a label is a fragility this
 * codebase has been bitten by before, so it is confined to one function with
 * one regex, and it fails to `null` rather than to a guess: a sheet that came
 * down with a blank overtime cell asks somebody to type the hours again, which
 * is recoverable. A sheet that came down with the *wrong* hours in it is not.
 */
function sheetSources(
  payslips: readonly Payslip[],
  employees: readonly Employee[],
): SheetRowSource[] {
  const byId = new Map(employees.map((e) => [e.id, e]));
  return payslips.map((payslip) => {
    const overtime = payslip.lines.find((l) =>
      l.label.startsWith("Overtime, entered by hand"),
    );
    const hours = overtime
      ? /\(([\d.]+)h/.exec(overtime.label)?.[1]
      : undefined;
    const bonus = payslip.lines.find(
      (l) => l.kind === "EARNING" && isBonusLine(l.label),
    );
    return {
      payslip,
      employee: byId.get(payslip.employeeId),
      overtimeHours: hours === undefined ? null : Number(hours),
      bonusKobo: bonus?.amountKobo ?? null,
    };
  });
}

/**
 * The bonus on this run, if there is one.
 *
 * Matches `"Bonus"` as well as `"Bonus — why"`. The first version of this
 * looked for `"Bonus — "` alone, which was right while a reason was compulsory
 * and silently stopped finding anything the day it stopped being — so a bonus
 * awarded without one rendered as an empty cell offering to add the bonus that
 * was already sitting on the payslip.
 */
function bonusOn(slip: Payslip): { amountKobo: number; reason: string } | null {
  const line = slip.lines.find(
    (l) => l.kind === "EARNING" && isBonusLine(l.label),
  );
  if (!line) return null;
  return {
    amountKobo: line.amountKobo,
    reason: line.label === "Bonus" ? "" : line.label.replace(/^Bonus — /, ""),
  };
}

/** "Bonus — Q3 target" under a figure is enough; the full line is on the payslip. */
function shortLabel(label: string): string {
  if (label.startsWith("Overtime, entered by hand")) return "overtime";
  if (label === "Bonus") return "bonus";
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

/**
 * A figure in an editable cell: the amount, and a way in.
 *
 * A dash when there is nothing, so an empty cell is obviously empty rather than
 * obviously broken. The control appears on hover and on focus rather than
 * always, because three hundred rows each showing "Add" is a wall of links.
 */
/**
 * A figure in a cell you can work in.
 *
 * ## An empty one says "Add", not "—"
 *
 * It used to render a faint dash inside a button. On a payroll where nobody has
 * overtime that is a column of ten dashes, and **nothing whatever indicates
 * they can be clicked** — the product owner's words were "I don't like the way
 * to edit and add overtime", which is what an invisible control feels like from
 * the outside rather than a complaint about the input itself.
 *
 * A dash is the right glyph for a figure that is genuinely absent and not
 * yours to change; it is the wrong one for an empty box waiting for a number.
 * So the two states are now told apart: a reader who may not edit still sees
 * the dash, and a reader who may sees the word for what would happen.
 *
 * Same treatment in all three editable columns, because a control that
 * announces itself in one and hides in the next is worse than either.
 */
/**
 * Everything taken off besides PAYE, so the row reconciles.
 *
 * ## The identity this exists to make visible
 *
 * `engine.ts` computes net as
 *
 *     gross − pension − nhf − preTax − paye − postTax
 *
 * The table shows Gross, Overtime, Bonus, PAYE and Net. Pension had a column
 * and lost it; NHF never had one; and the old "Other" cell carried only
 * `otherDeductionsKobo`, which is the pre-tax and post-tax lines alone. So two
 * terms of that identity were on nobody's screen and **the row was short of
 * its own net** by pension plus NHF — ₦9,500 on a ₦100,000 salary.
 *
 * Nothing was mispaid: every figure the API sent was right, and net already
 * included the overtime and the bonus. What was wrong is that a person could
 * not check it, on the screen where they approve the money. A table that does
 * not add up is indistinguishable from one that is wrong, and this product is
 * sold on the difference.
 *
 * ## Why one column and not three
 *
 * Pension came out because a statutory figure nobody edits from here costs a
 * column that somebody works in. That reasoning holds. What it does not license
 * is dropping the figure from the arithmetic — so it is a term inside one
 * total, with the breakdown beneath it, exactly as the Gross cell already names
 * its overtime and bonus.
 *
 * ## Absent, not zero
 *
 * A deduction the employer does not operate is not counted and not named. A
 * company with no pension scheme sees NHF alone; one that operates neither sees
 * only whatever loans and claims the run carries. `wasDeducted` reads an
 * unknown operation as deducted, which is what every payslip written before the
 * switches existed actually was.
 */

/**
 * Whether this company deducts PAYE at all, right where the figure sits.
 *
 * ## Why this exists
 *
 * The PAYE cell already lets somebody type a figure over the engine's own —
 * and does, whether or not the company deducts PAYE at all, because a
 * hand-entered figure stands either way (`payroll/engine.ts`). What it cannot
 * do is offer that control when nothing is operated: `wasDeducted` reads
 * `NOT_OPERATED` and the cell renders the plain word "Not operated", with no
 * button under it — there is nothing to click, because there is no figure to
 * override yet. A company whose real tax situation is "we deduct it, just not
 * through the bands" — Crafwell is the case this was built for — had no way
 * to reach that control from this screen at all. The full explanation and the
 * consequence of switching lives on `/settings/payroll`; this is the fast path
 * to the one thing somebody actually came here to do.
 *
 * ## What it does, and does not, decide
 *
 * Toggling this writes `PayrollSettings.payeEnabled` for the **company**, not
 * for this run alone — the same field `/settings/payroll` writes, through the
 * same store. It is not a second copy of that switch; it is the same one,
 * reachable from here because this is where the problem is noticed. Recalculates
 * immediately (`onChanged`, the same callback the sheet upload and the lines
 * modal already use to trigger it), so the cells below reflect the new setting
 * without a second trip to Check.
 *
 * ## Absent, not disabled-and-silent
 *
 * Nothing renders in demo mode (`useDeductionSwitches` returns `available:
 * false` with no API) and nothing renders while the read is still in flight —
 * a switch that might be showing the wrong state is worse than no switch for
 * the half-second it takes to answer.
 */
function PayeSwitch({
  editable,
  onChanged,
}: {
  /** `canPrepare && !settled` from the table. An approved run's tax policy is
      history, not a decision still open — same reasoning as every other
      control in this table. */
  editable: boolean;
  onChanged: () => void;
}) {
  const { settings: response, loading, available, save } = useDeductionSwitches();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  /* `response.settings` is null until the company has a settings row at all —
     which cannot be true here, since a run cannot have been prepared without
     one existing. Guarded anyway rather than asserted, because "cannot happen"
     is exactly the reasoning that produced the ₦0 payroll incident this
     codebase does not repeat. */
  if (!available || loading || !response?.settings) return null;

  const on = response.settings.payeEnabled;

  async function toggle() {
    if (!editable || saving) return;
    setSaving(true);
    setFailed(null);
    try {
      await save({ payeEnabled: !on });
      onChanged();
    } catch (error) {
      setFailed(error instanceof Error ? error.message : "Could not save that.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-1.5">
        <span className="text-meta font-normal normal-case text-muted">
          {on ? "On" : "Off"}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={
            on
              ? "This company deducts PAYE. Switch it off."
              : "This company does not deduct PAYE. Switch it on so the figure can be entered."
          }
          disabled={!editable || saving}
          onClick={() => void toggle()}
          title={
            editable
              ? "Changes what this company deducts, for every payroll — not just this one."
              : "This run is settled, so its tax policy cannot change from here."
          }
          className={cn(
            "relative h-4 w-7 shrink-0 rounded-full transition-colors duration-200",
            on ? "bg-success-strong" : "bg-line-strong",
            editable
              ? "cursor-pointer"
              : "cursor-not-allowed opacity-50",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute left-0.5 top-0.5 size-3 rounded-full bg-white shadow-sm",
              "transition-transform duration-200 ease-[var(--ease-out-soft)]",
              on && "translate-x-3",
            )}
          />
        </button>
      </span>
      {failed && (
        <span className="max-w-32 whitespace-normal text-right text-meta font-normal normal-case text-danger-text">
          {failed}
        </span>
      )}
    </span>
  );
}

/**
 * The deductions total, and what it is made of.
 *
 * Pension had its own column once and was removed, on the grounds that a
 * statutory figure nobody usually changes does not earn a column of its own on
 * a table people scan. That was right, and it used to leave the breakdown
 * behind a click of its own before any figure inside it could be reached —
 * "let me see what came off" and "let me change it" were two separate
 * decisions with two separate clicks between them. They are one now: the
 * parts are always in view, the way Overtime's hours and Bonus's lines
 * already are, and reaching a figure is the same single click it is
 * everywhere else in this table.
 *
 * **Only what is operated appears.** A company with no pension scheme has no
 * pension row here at all — not a row reading ₦0.00, which would be a claim
 * that a scheme exists and took nothing. That is the same distinction the
 * whole feature turns on, one layer up, and it is what makes this list short
 * for most companies: NHF defaults off for anybody who has not asked for it,
 * so its row simply is not there.
 */
function Deductions({
  slip,
  lines,
  editable,
  editingKind,
  saving,
  onEdit,
  onCancelEdit,
  onSave,
  onClear,
  onEditLines,
}: {
  slip: Payslip;
  lines: readonly { label: string }[];
  editable: boolean;
  /** Which figure in the breakdown is being typed into, if any. */
  editingKind: DeductionKind | null;
  saving: boolean;
  onEdit: (kind: DeductionKind) => void;
  onCancelEdit: () => void;
  onSave: (kind: DeductionKind, amountKobo: number) => void;
  onClear: (kind: DeductionKind) => void;
  /** Open the modal that holds this person's hand-entered deduction lines. */
  onEditLines: () => void;
}) {
  const overridden = slip.overriddenDeductions ?? [];
  const parts: {
    label: string;
    kobo: number;
    kind?: DeductionKind;
  }[] = [];

  if (wasDeducted(slip.operates, "pension")) {
    parts.push({
      label: "Pension",
      kobo: slip.pensionEmployeeKobo,
      kind: "PENSION_EMPLOYEE",
    });
  }
  if (wasDeducted(slip.operates, "nhf")) {
    parts.push({ label: "NHF", kobo: slip.nhfKobo, kind: "NHF" });
  }
  if (slip.otherDeductionsKobo > 0) {
    parts.push({
      /* Named from the lines when there is exactly one, because "Loan" tells
         somebody more than "Other" does. Several collapse to one row rather
         than listing them: this is a breakdown of a column, not a payslip. */
      label: lines.length === 1 ? (lines[0]?.label ?? "Other") : "Other",
      kobo: slip.otherDeductionsKobo,
    });
  }

  const total =
    (wasDeducted(slip.operates, "pension") ? slip.pensionEmployeeKobo : 0) +
    (wasDeducted(slip.operates, "nhf") ? slip.nhfKobo : 0) +
    slip.otherDeductionsKobo;

  /* Nothing operated and nothing deducted. A dash, and no control — there is
     no breakdown of nothing, and offering one would be a button that opens an
     empty panel. */
  if (parts.length === 0) return <>—</>;

  return (
    <>
      <span
        className={cn("block text-right", overridden.length > 0 && "text-ink")}
      >
        {total === 0 ? "—" : formatKobo(total)}
      </span>

      <span className="mt-1 block rounded-md border border-line bg-surface p-2 text-left">
        {parts.map((part) => {
          const isEdited = part.kind ? overridden.includes(part.kind) : false;
          return (
            <span
              key={part.label}
              className="flex items-baseline justify-between gap-3 py-0.5"
            >
              <span className="text-meta text-muted">{part.label}</span>
              <span className="flex items-baseline gap-2">
                {/* Only the statutory two are editable. "Other" is loans and
                      claims, which are their own modules' records — editing
                      the sum of them here would be a figure with nothing
                      behind it. */}
                {part.kind && editingKind === part.kind ? (
                  <InlineMoney
                    valueKobo={part.kobo}
                    saving={saving}
                    onSave={(kobo) => onSave(part.kind as DeductionKind, kobo)}
                    onCancel={onCancelEdit}
                    /* Zero is the answer people are usually here for, so it
                         is the one the placeholder shows. */
                    placeholder="0"
                    hint="0 deducts nothing from this person this month"
                  />
                ) : part.kind && editable ? (
                  <button
                    type="button"
                    onClick={() => onEdit(part.kind as DeductionKind)}
                    className={cn(
                      "tabular rounded px-1 underline decoration-dotted underline-offset-2",
                      "hover:bg-canvas hover:text-accent-text",
                      isEdited ? "text-ink" : "text-body",
                    )}
                  >
                    {formatKobo(part.kobo)}
                  </button>
                ) : (
                  <span className="tabular px-1 text-body">
                    {formatKobo(part.kobo)}
                  </span>
                )}
                {isEdited && editable && (
                  <button
                    type="button"
                    onClick={() => onClear(part.kind as DeductionKind)}
                    className="text-meta font-normal text-muted underline-offset-2 hover:text-danger-text hover:underline"
                  >
                    Edited · undo
                  </button>
                )}
              </span>
            </span>
          );
        })}

        {/* Hand-entered deductions live behind this, and only these.
              -----------------------------------------------------------
              "Other" above is loans, expense claims **and** anything typed
              here, and the frontend cannot tell them apart in the total —
              nor should it try, because a loan instalment belongs to the loan
              and editing the sum of three things would be a figure with
              nothing behind it. The modal reads the typed lines from the API,
              so it shows exactly the ones somebody may change. */}
        {editable && (
          <span className="mt-1 block border-t border-line pt-1.5">
            <button
              type="button"
              onClick={onEditLines}
              className="text-meta font-normal text-accent-text underline-offset-2 hover:underline"
            >
              Add or edit a deduction
            </button>
          </span>
        )}
      </span>
    </>
  );
}

function CellValue({
  amountKobo,
  editable,
  onEdit,
  onClear,
  /** What clicking an empty cell would do. Shown in place of a dash. */
  addLabel = "Add",
}: {
  amountKobo: number;
  editable: boolean;
  onEdit: () => void;
  onClear?: () => void;
  addLabel?: string;
}) {
  if (!editable) {
    return amountKobo > 0 ? <>{formatKobo(amountKobo)}</> : <>—</>;
  }
  return (
    <span className="group flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={onEdit}
        className="rounded px-1 text-right hover:bg-canvas hover:text-accent-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-text"
      >
        {amountKobo > 0 ? (
          formatKobo(amountKobo)
        ) : (
          <span className="text-meta whitespace-nowrap text-accent-text underline decoration-dotted underline-offset-2">
            {addLabel}
          </span>
        )}
      </button>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="text-meta font-normal text-muted underline-offset-2 hover:text-danger-text hover:underline"
        >
          Remove
        </button>
      )}
    </span>
  );
}

/** What this run is paying them in hand-entered or clocked overtime. */
function overtimeOn(slip: Payslip): number {
  return slip.lines
    .filter(
      (line) => line.kind === "EARNING" && line.label.startsWith("Overtime"),
    )
    .reduce((total, line) => total + line.amountKobo, 0);
}

/**
 * What an hour of this person's time is worth, for the live preview.
 *
 * `monthly x 12 / 365 / hoursPerDay` on the calendar-day basis — the formula
 * from the payslip workbook this was built against — and
 * `monthly / workingDays / hoursPerDay` on the other. It **renders the
 * working**; the server computes what is actually paid, and if the two ever
 * disagree the server is right.
 */
function hourlyFor(
  monthlyKobo: number,
  hoursPerDay: number,
  workingDaysPerMonth: number,
  basis: OvertimeHourlyBasis,
): number {
  const hours = Math.max(1, hoursPerDay);
  return basis === "CALENDAR_DAYS"
    ? Math.round((monthlyKobo * 12) / 365 / hours)
    : Math.round(monthlyKobo / Math.max(1, workingDaysPerMonth) / hours);
}
