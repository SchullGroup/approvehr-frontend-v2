"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
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
  Button,
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
  TextLink,
  TH,
  THead,
  TR,
  TableWrap,
  useStepper,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import {
  ApprovalConsequences,
  DiscrepancyPanel,
  ExceptionList,
  ExcludedList,
  RunStatusBadge,
  SourceBadge,
} from "@/components/payroll/run-panels";
import { ExcludeFromPayrollDialog } from "@/components/payroll/exclude-dialog";
import { useStepUp } from "@/components/portal/step-up";
import { ApiError } from "@/lib/api/client";
import {
  formatKobo,
  naira,
  payslipCountLabel,
  periodLabel,
  type PayrollRunDetail,
  type PreparedRun,
  type Payslip,
  type RunException,
  type RunExclusion,
  type LineSummaryByEmployee,
} from "@/lib/api/payroll";
import { useCan } from "@/lib/permissions";
import { SheetPanel } from "./sheet-panel";
import type { ApprovedRunFacts } from "./approved-moment";
import { ApproveStep } from "./approve-step";
import { BankRegisterCard } from "./bank-register-card";
import { RUN_BREADCRUMB } from "./breadcrumb";
import { OverflowMenu } from "./overflow-menu";
import { PreflightChecklist } from "./preflight-checklist";
import { ReviewStep } from "./review-step";
import { DEFAULT_REVIEW_VIEW, type ReviewView } from "./review-model";
import type { RecordedPayment } from "@/components/payroll/record-paid-dialog";
import type { SheetRowSource } from "@/lib/payroll/adjustment-sheet";
import type { Employee } from "@/lib/types";
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
import { useOrgTimezone } from "@/lib/store/session";
import { fullName } from "@/lib/types";
import { TODAY } from "@/lib/today";
import { todayIn } from "@/lib/time";

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
 * about the seed. The real clock is the *company's*, via `timeZone` — a
 * payroll period is a calendar concept the whole company shares, and reading
 * it against whichever browser happens to be open would tell two colleagues
 * in different countries two different things about the same run.
 *
 * **No day count here.** The first draft worked one out and would have read
 * "12 days to come" beside the API's own "2 days are still to come" — one
 * fact, two numbers, on adjacent surfaces, because the two were counting from
 * different clocks. `period_not_finished` carries the figure; this carries the
 * consequence. Same rule as never re-implementing a score on this side.
 */
function periodStanding(
  period: string,
  timeZone: string,
): {
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
  const thisMonth = todayIn(timeZone).slice(0, 7);

  if (period < thisMonth) {
    return { tone: "finished", line: "This month is over: the usual case." };
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
      "nobody is docked for a day that has not happened. Calculate again once " +
      "it ends to pick up the rest.",
  };
}

export function PayrollRunWizard() {
  const router = useRouter();
  const toast = useToast();
  const stepUp = useStepUp();
  const params = useSearchParams();
  const timeZone = useOrgTimezone();

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

  const standing = periodStanding(period, timeZone);

  const [prepared, setPrepared] = useState<PreparedRun | null>(null);
  /**
   * Whether this is an extra payroll beside a month that already has one.
   *
   * A terminal settlement for somebody who left on the 12th, a bonus paid on
   * its own, a correction to a month already approved. Until `PayrollRun.
   * sequence` existed there was one row per month and an approved run could not
   * be re-prepared, so the callout below was a dead end rather than a choice.
   */
  const [offCycle, setOffCycle] = useState(false);
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
  /**
   * What the person has just done on this step, kept here so it outlives the
   * re-read.
   *
   * Approving and recording a payment both re-read the run, and `usePayrollRun`
   * hands back no run while it does — this whole step unmounts and comes back.
   * Anything held by `PayPanel` or the moment itself would be gone before it
   * could be read, which is why these live on the one component that does not
   * unmount. Neither survives leaving the page, on purpose: they are the
   * answer to a click, not part of the run's record.
   */
  const [approvedNow, setApprovedNow] = useState<ApprovedRunFacts | null>(null);
  const [recordedNow, setRecordedNow] = useState<RecordedPayment | null>(null);
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

  /**
   * The Review step's filter, search and sort, held here and not in the step.
   *
   * Every save rebuilds the run and `usePayrollRun` hands back no run while it
   * re-reads, which unmounts whatever was reading it. State kept down there goes
   * with it, and somebody working through three hundred payslips would be sent
   * back to the top of an unfiltered list after each one.
   */
  const [reviewView, setReviewView] = useState<ReviewView>(DEFAULT_REVIEW_VIEW);

  /**
   * The previous run, kept on screen while the next one loads.
   *
   * Review shows it dimmed with a line saying it is recalculating, rather than
   * going blank. It is **only** used for Review, and only for the same run: a
   * different period is a different run and gets a loading state, not the last
   * one's figures. Held in state and compared during render, the same way
   * `frozenLines` was, so there is no effect and no ref read in render.
   */
  const [lastRun, setLastRun] = useState<PayrollRunDetail | null>(null);
  if (run && run !== lastRun) setLastRun(run);
  /* Matched on the period, not the run's id. Saving reloads the list of runs as
     well as this one, and while it does `runId` is null: keying on it would
     drop the kept run at the one moment it is needed, which is exactly the
     moment the drawer and the filter would be lost. */
  const reviewRun =
    run ??
    (lastRun !== null && lastRun.period.slice(0, 7) === period
      ? lastRun
      : null);
  const reviewRefreshing = run === null && reviewRun !== null;
  /* Whether Review is looking at an approved run, from the run it is showing.
     `settled` reads the live run, which is absent during a reload, so for that
     moment it would call an approved payroll editable. */
  const reviewSettled =
    (reviewRun?.status === "APPROVED" || reviewRun?.status === "PAID") &&
    !offCycle;

  /**
   * Fetched when the sheet panel opens, not before — it is one extra request
   * on a screen most visits never open, and the whole reason it exists is to
   * answer "what does everyone already carry" honestly (see `LineSummary`'s
   * own note in `api/payroll.ts`). `null` while loading; the panel shows
   * that as "reading the payroll" rather than starting every bonus and
   * deduction cell blank and asking somebody to trust it.
   */
  const [sheetLineSummary, setSheetLineSummary] = useState<{
    bonuses: LineSummaryByEmployee;
    deductions: LineSummaryByEmployee;
  } | null>(null);

  useEffect(() => {
    if (!sheetOpen || !run) return;
    /* No synchronous reset here: the panel is only mounted while `sheetOpen`
       is true, so there is nothing stale on screen to clear when this effect
       starts — closing and reopening unmounts and remounts it. The one gap
       is switching `run.id` while the panel stays open, which the modal does
       not allow to happen. */
    let cancelled = false;
    actions
      .lineSummary(run.id)
      .then((result) => {
        if (!cancelled) setSheetLineSummary(result);
      })
      .catch(() => {
        /* Same "empty is honest" fallback the action itself uses offline —
           a failed read here should not stop the sheet from opening with
           blank bonus/deduction cells, only from claiming to know more than
           it does. */
        if (!cancelled) setSheetLineSummary({ bonuses: {}, deductions: {} });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetOpen, run?.id]);

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
  /**
   * Whether this period is closed to further preparation.
   *
   * An approved run's figures are frozen and `prepare` refuses it, correctly.
   * **An off-cycle run is the way past that** — it makes a *new* run beside the
   * approved one rather than reopening it — so ticking that box has to unfreeze
   * the button. Without this the checkbox is present and does nothing, which is
   * the dead control this codebase keeps recording.
   */
  const approvedAlready = run?.status === "APPROVED" || run?.status === "PAID";
  const settled = approvedAlready && !offCycle;
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
        ...(offCycle ? { offCycle: true } : {}),
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
            ? `${result.run.blockers} to fix before this can be approved: whatever stopped them is still there.`
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

      /* Said on the page, in place, and not as a toast.
         -------------------------------------------------------------------
         A toast was gone in a few seconds, over a page that did not change,
         for the one act in this product that cannot be undone. The moment
         below carries the same facts — the figure, what was settled — and
         stays until the reader leaves. It is taken from this run's own
         figures, which approving has just frozen, so nothing needs asking
         again. */
      if (run) {
        setApprovedNow({
          runId,
          period: run.period,
          netKobo: run.netKobo,
          employeeCount: run.employeeCount,
          settled: result.settled,
        });
      }

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

  /* Backing out of a run is an act on the whole payroll, not a step in it, so it
     lives in the page header, away from Back and Continue. Only while there is
     something to back out of: gone once approved (that door only opens
     forwards), and gone once already cancelled, since pressing Calculate is what
     starts the period over. */
  const canCancel =
    run !== null && (run.status === "DRAFT" || run.status === "IN_REVIEW");

  return (
    <>
      <PageHeader
        breadcrumb={RUN_BREADCRUMB}
        title="Run payroll"
        {...(canCancel
          ? {
              action: (
                <OverflowMenu
                  label="More actions for this payroll"
                  items={[
                    {
                      key: "cancel",
                      label: "Cancel this payroll",
                      icon: <Ban />,
                      tone: "danger",
                      onSelect: () => setCancelling(true),
                    },
                  ]}
                />
              ),
            }
          : {})}
      />
      <PageBody>
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
                      {existing.status === "APPROVED" ||
                      existing.status === "PAID"
                        ? "It is approved, so its figures are frozen."
                        : "It is still a draft: you can prepare it again from the next step."}
                      {/* The way out of what used to be a dead end. An approved
                      payroll cannot be re-prepared — correctly — and before
                      `sequence` a leaver's final pay had nowhere to go. */}
                      <span className="mt-3 flex">
                        <Checkbox
                          checked={offCycle}
                          onChange={(event) =>
                            setOffCycle(event.target.checked)
                          }
                          label="Pay somebody outside this payroll"
                          description="A final settlement, a bonus, or a correction. It becomes a separate run in the same month and leaves the one above untouched."
                        />
                      </span>
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
                  Preparing payroll needs the &ldquo;Run payroll&rdquo;
                  permission. Somebody who has it can prepare this period, and
                  you will still be able to review and approve it.
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
                    {run
                      ? "Calculate again"
                      : `Calculate ${periodLabel(period)}`}
                  </Button>
                  {run && (
                    <p className="text-meta leading-relaxed text-muted">
                      {payslipCountLabel(run)} · {formatKobo(run.grossKobo)}{" "}
                      gross
                    </p>
                  )}
                  {settled && (
                    <p className="text-meta leading-relaxed text-muted">
                      This run is approved. Its figures are frozen and cannot be
                      prepared again. To pay somebody outside it, a final
                      settlement, a bonus, a correction, go back to Period and
                      tick &ldquo;Pay somebody outside this payroll&rdquo;.
                    </p>
                  )}
                  {approvedAlready && offCycle && (
                    <p className="text-meta leading-relaxed text-warning-text">
                      This will make a <strong>separate</strong> payroll for{" "}
                      {periodLabel(period)}, beside the approved one. Nothing
                      about the approved run changes.
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
              {run && (
                <SheetPanel
                  open={sheetOpen}
                  runId={run.id}
                  period={run.period.slice(0, 7)}
                  sources={
                    sheetLineSummary
                      ? sheetSources(
                          run.payslips,
                          directory.employees,
                          sheetLineSummary,
                        )
                      : null
                  }
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
                  <ExceptionList
                    exceptions={exceptions}
                    actionFor={actionFor}
                  />
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
              {reviewRun ? (
                <>
                  <ReviewStep
                    run={reviewRun}
                    periodLabel={periodLabel(period)}
                    employees={directory.employees}
                    editable={canPrepare && !reviewSettled}
                    readOnlyReason={
                      reviewSettled
                        ? "This payroll is approved, so its figures are frozen."
                        : !canPrepare
                          ? "Adjusting a payslip needs the \u201cRun payroll\u201d permission."
                          : null
                    }
                    refreshing={reviewRefreshing}
                    view={reviewView}
                    onViewChange={setReviewView}
                    onSaved={() => void prepare()}
                    onAdjusted={(summary) => {
                      /* The toast, not a message inside the drawer: saving
                         rebuilds the run, and the wizard is what survives
                         that. */
                      toast.push({
                        title: "Saved",
                        tone: "success",
                        detail: `${summary}. The payroll has been worked out again.`,
                      });
                    }}
                  />
                  <ExcludedList
                    exclusions={reviewRun.exclusions}
                    {...(canPrepare && !reviewSettled
                      ? { onPutBack: putBack }
                      : {})}
                    busyFor={puttingBack}
                  />
                  <BankRegisterCard run={reviewRun} />
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
            <ApproveStep
              run={run}
              settled={settled}
              canApprove={canApprove}
              approvedNow={approvedNow}
              batchProblem={batchProblem}
              recordedNow={recordedNow}
              onRecorded={setRecordedNow}
              onChanged={detail.reload}
              blockers={counts.blockers}
              warnings={counts.warnings}
              onSeeChecks={() => stepper.goTo(1)}
            />
          )}

          {/* Footer */}
          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-1 py-3">
            <Button
              variant="ghost"
              className="max-sm:min-h-11"
              onClick={() => router.push("/payroll")}
            >
              Save &amp; exit
            </Button>
            <div className="flex items-center gap-2">
              {!stepper.isFirst && (
                <Button
                  variant="secondary"
                  className="max-sm:min-h-11"
                  onClick={stepper.back}
                >
                  <ArrowLeft aria-hidden="true" className="size-4" />
                  Back
                </Button>
              )}
              {stepper.isLast ? (
                /* Nothing at all once the run is approved. This used to be a
               disabled "Already approved" button: a control that does nothing,
               beside the two that do (the pay card above carries what happens
               next). */
                settled ? null : (
                  <Button
                    variant="approve"
                    className="max-sm:min-h-11"
                    onClick={() => setConfirming(true)}
                    loading={busy === "approve"}
                    disabled={!run || blocked || !canApprove}
                  >
                    {busy !== "approve" && (
                      <Check aria-hidden="true" className="size-4" />
                    )}
                    Approve this run
                  </Button>
                )
              ) : missingPayStatus ? (
                <Button
                  variant="accent"
                  className="max-sm:min-h-11"
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
                    className="max-sm:min-h-11"
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
                    This is the one step that cannot be undone from here. It
                    will:
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
                  Nothing has been paid or approved for{" "}
                  {periodLabel(run.period)}, so there is nothing to undo: this
                  just marks it cancelled. You can prepare this period again
                  from scratch whenever you&rsquo;re ready.
                </p>
              }
            />
          )}
        </div>
      </PageBody>
    </>
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
        description="Ticked people are paid what you enter below. Untick anyone who should not be on this payroll: they come off with a reason recorded, same as excluding them anywhere else."
      />
      {!grades.loading && grades.rows.length === 0 && (
        <p className="px-5 pb-3 text-meta text-muted">
          No salary grades yet.{" "}
          <TextLink href="/payroll/pay-setup?tab=grades">
            Add one in Pay setup
          </TextLink>{" "}
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
      hint="Tax is deducted correctly either way: this is only the state filing."
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
 * The run, as the spreadsheet's rows.
 *
 * Hours come back out of the label the API wrote — `"Overtime, entered by hand
 * (6.00h at 1.5x)"` — because `Payslip` carries lines and money, not the
 * minutes behind them. Reading a figure out of a label is a fragility this
 * codebase has been bitten by before, so it is confined to one function with
 * one regex, and it fails to `null` rather than to a guess: a sheet that came
 * down with a blank overtime cell asks somebody to type the hours again, which
 * is recoverable. A sheet that came down with the *wrong* hours in it is not.
 *
 * Bonus and deduction come from `lineSummary`, not the payslip's own lines —
 * deliberately, and not for the reason overtime uses a label regex at all.
 * A bonus line is labelled `"Bonus"` or `"Bonus — {reason}"`, which is
 * matchable; a deduction line is labelled `line.reason || "Deduction"`, so
 * when a reason is given the label **is** the reason, indistinguishable from
 * any other deduction line (a loan repayment, PAYE) that happens to share
 * text. `payrollApi.lineSummary` answers both from the underlying
 * `PayrollBonus` / `PayrollDeductionLine` rows directly, and says "many"
 * rather than guess when a person carries more than one — see `LineSummary`.
 */
function sheetSources(
  payslips: readonly Payslip[],
  employees: readonly Employee[],
  lineSummary: {
    bonuses: LineSummaryByEmployee;
    deductions: LineSummaryByEmployee;
  } | null,
): SheetRowSource[] {
  const byId = new Map(employees.map((e) => [e.id, e]));
  return payslips.map((payslip) => {
    const overtime = payslip.lines.find((l) =>
      l.label.startsWith("Overtime, entered by hand"),
    );
    const hours = overtime
      ? /\(([\d.]+)h/.exec(overtime.label)?.[1]
      : undefined;
    return {
      payslip,
      employee: byId.get(payslip.employeeId),
      overtimeHours: hours === undefined ? null : Number(hours),
      bonus: lineSummary?.bonuses[payslip.employeeId] ?? { state: "none" },
      deduction: lineSummary?.deductions[payslip.employeeId] ?? {
        state: "none",
      },
    };
  });
}
