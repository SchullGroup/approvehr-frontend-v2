"use client";

import { sourceNote } from "@/lib/demo";
import { AlertTriangle, Check, Scale, ShieldAlert, UserMinus } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  type BadgeTone,
} from "@/components/ui";
import {
  STATUS_LABEL,
  excludedNote,
  fixFor,
  formatKobo,
  headcountLabel,
  wasDeducted,
  type Discrepancy,
  type PayrollRun,
  type PayrollRunStatus,
  type RunException,
  type RunExclusion,
} from "@/lib/api/payroll";
import { notOperated } from "@/components/payroll/payslip-document";

/**
 * The panels three payroll screens share.
 *
 * They are here rather than copied because the two most important of them —
 * the exception list and the reconciliation gate — carry the product's whole
 * argument, and an argument made three slightly different ways is made badly.
 */

/* ------------------------------------------------------------ where from */

/** Which source the figures came from, stated rather than implied. */
export function SourceBadge({
  connected,
  loading = false,
  error,
}: {
  connected: boolean;
  loading?: boolean;
  error?: { message: string } | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone={connected ? "success" : "warning"} size="sm" dot>
        {sourceNote(connected)}
      </Badge>
      {loading && <span className="text-meta text-muted">Loading…</span>}
      {error && (
        <span className="text-meta text-danger-text">{error.message}</span>
      )}
    </div>
  );
}

const STATUS_TONE: Record<PayrollRunStatus, BadgeTone> = {
  DRAFT: "neutral",
  IN_REVIEW: "warning",
  APPROVED: "success",
  PAID: "info",
  CANCELLED: "neutral",
};

export function RunStatusBadge({ status }: { status: PayrollRunStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} size="sm" dot>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

/* -------------------------------------------------------- the pre-flight */

/**
 * The exception list.
 *
 * This is a list somebody works through, not a notification. Every row says
 * what is wrong in a whole sentence and carries the screen that fixes it, so
 * reading the list and clearing it are the same activity.
 *
 * Blockers are separated from warnings rather than mixed and colour-coded,
 * because the distinction is not decorative: a blocker means the run would be
 * **wrong** and approval refuses it; a warning means the run would merely be
 * **surprising**, and approving it records that somebody looked.
 */
export function ExceptionList({
  exceptions,
  onRecheck,
  actionFor,
}: {
  exceptions: RunException[];
  /** Shown beside the heading when re-preparing is the way to clear these. */
  onRecheck?: React.ReactNode;
  /**
   * An extra control for a row, beside the link that fixes it.
   *
   * Some exceptions are cleared by editing a record and some by making a
   * decision, and the two are different kinds of act: `fixFor` sends somebody to
   * the field, and this renders the decision. A missing account number carries
   * both — go and add one, **or** exclude this person from the payroll and say
   * why — because refusing to pay ninety-nine people until one of them answers
   * their phone is not an outcome anybody chose.
   *
   * Optional, so a read-only surface (the payroll home) shows the same list
   * without offering writes it cannot audit.
   */
  actionFor?: (exception: RunException) => React.ReactNode;
}) {
  const blockers = exceptions.filter((e) => e.severity === "BLOCKER");
  const warnings = exceptions.filter((e) => e.severity === "WARNING");

  if (exceptions.length === 0) {
    return (
      <Callout tone="success" title="Nothing to fix">
        Every record has what payroll needs, and the figures add up. This run can
        be approved.
      </Callout>
    );
  }

  return (
    <Card>
      <CardHeader
        title={
          blockers.length > 0
            ? "Fix these before approving"
            : "Worth a look before approving"
        }
        description={
          blockers.length > 0
            ? `${blockers.length} ${blockers.length === 1 ? "stops" : "stop"} the run. ` +
              `${warnings.length} ${warnings.length === 1 ? "does" : "do"} not.`
            : `${warnings.length} ${warnings.length === 1 ? "thing" : "things"} to check. ` +
              `None of them stops the run.`
        }
        action={onRecheck}
      />
      <CardBody className="flex flex-col gap-2.5">
        {[...blockers, ...warnings].map((exception) => (
          <ExceptionRow
            key={exception.id}
            exception={exception}
            action={actionFor?.(exception)}
          />
        ))}
      </CardBody>
    </Card>
  );
}

function ExceptionRow({
  exception,
  action,
}: {
  exception: RunException;
  action?: React.ReactNode;
}) {
  const blocking = exception.severity === "BLOCKER";
  const fix = fixFor(exception.code, exception.employeeId);

  return (
    <div
      className={cn(
        "flex flex-wrap items-start gap-3 rounded-md border p-3",
        blocking
          ? "border-danger-line bg-danger-soft"
          : "border-warning-line bg-warning-soft",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 shrink-0 [&>svg]:size-4",
          blocking ? "text-danger-text" : "text-warning-text",
        )}
      >
        {blocking ? <ShieldAlert /> : <AlertTriangle />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body-sm leading-relaxed text-ink">
          {exception.message}
        </p>
        <p className="mt-0.5 text-meta text-body">
          {blocking
            ? "The run cannot be approved while this is open."
            : "You can approve with this open. Approving records that you saw it."}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {fix && (
          <ButtonLink href={fix.href} size="sm" variant="secondary">
            {fix.label}
          </ButtonLink>
        )}
        {action}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- who was left off */

/**
 * Everybody deliberately left off this payroll.
 *
 * This sits under the payslip table rather than inside it, and that is the
 * point: the table is nine rows and its badge says nine payslips, which is true
 * and, on its own, a wrong answer to the question somebody is actually asking —
 * *is everybody here?* A person left off has no payslip to put in a table, so
 * the honest form is a second list that names them.
 *
 * Four facts per row, because they are the four the record exists to keep: who,
 * why, who decided, when. A year from now this is the whole answer to "why was
 * Grace not paid in August?", which is why an exclusion is a stored decision and
 * not a filter somebody applied once.
 */
export function ExcludedList({
  exclusions,
  onPutBack,
  busyFor,
}: {
  exclusions: RunExclusion[];
  /** Omitted on a read-only surface, or once the run is approved. */
  onPutBack?: (exclusion: RunExclusion) => void;
  busyFor?: string | null;
}) {
  if (exclusions.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="Not on this payroll"
        description="Left off deliberately, with the reason recorded. Everybody here is back on next period's payroll automatically — nothing has to remember to put them there."
        action={
          <Badge tone="warning" size="sm">
            {exclusions.length}{" "}
            {exclusions.length === 1 ? "person" : "people"}
          </Badge>
        }
      />
      <CardBody className="flex flex-col gap-2.5">
        {exclusions.map((exclusion) => (
          <div
            key={exclusion.id}
            className="flex flex-wrap items-start gap-3 rounded-md border border-line p-3"
          >
            <span
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-muted [&>svg]:size-4"
            >
              <UserMinus />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body-sm font-medium text-ink">{exclusion.name}</p>
              <p className="mt-0.5 text-body-sm leading-relaxed text-body">
                {exclusion.reason}
              </p>
              <p className="mt-1 text-meta leading-relaxed text-muted">
                {exclusion.decidedBy
                  ? `Decided by ${exclusion.decidedBy}`
                  : "Decided by somebody with no employee record"}{" "}
                on {exclusion.excludedAt.slice(0, 10)}
              </p>
            </div>
            {onPutBack && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onPutBack(exclusion)}
                loading={busyFor === exclusion.employeeId}
                disabled={busyFor !== null && busyFor !== undefined}
              >
                Put back on this payroll
              </Button>
            )}
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------- the gate itself */

/**
 * The reconciliation gate.
 *
 * A run whose figures do not add up must never be presentable as fine. An audit
 * of the live incumbent on 20 August 2026 found one of its own runs paying out
 * ₦1.47m more than it cost — rendered on screen without complaint — and the
 * failure was not the arithmetic but that nothing between the arithmetic and
 * the screen ever asked whether the answer added up.
 *
 * So this shows the figures that were compared, both of them, rather than
 * saying something went wrong. The two numbers side by side are what makes the
 * problem findable.
 */
export function DiscrepancyPanel({
  discrepancies,
}: {
  discrepancies: Discrepancy[];
}) {
  if (discrepancies.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="This run does not add up"
        description="Nothing here can be approved or paid until these agree."
        action={
          <Badge tone="danger" dot>
            Refused
          </Badge>
        }
      />
      <CardBody className="flex flex-col gap-3">
        {discrepancies.map((d, i) => (
          <div
            key={`${d.code}-${d.employeeId ?? "run"}-${i}`}
            className="rounded-md border border-danger-line bg-danger-soft p-3"
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-danger-text [&>svg]:size-4"
              >
                <Scale />
              </span>
              <p className="min-w-0 flex-1 text-body-sm leading-relaxed text-ink">
                {d.message}
              </p>
            </div>
            <dl className="mt-2.5 grid gap-x-6 gap-y-1 pl-7 sm:grid-cols-2">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-meta text-body">Should be</dt>
                <dd className="tabular text-body-sm font-medium text-ink">
                  {formatKobo(d.expectedKobo)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-meta text-body">Came out as</dt>
                <dd className="tabular text-body-sm font-medium text-danger-text">
                  {formatKobo(d.actualKobo)}
                </dd>
              </div>
            </dl>
          </div>
        ))}
        <p className="text-meta leading-relaxed text-body">
          These are exact checks with no tolerance. A payment file either
          balances or it does not.
        </p>
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------ the totals */

/**
 * What leaves the account, itemised.
 *
 * Employer pension sits under its own heading rather than inside the deduction
 * list. Plenty of Nigerian payslips put it with the deductions, and staff then
 * believe their pay was cut by eighteen per cent.
 */
export function TotalsPanel({ run }: { run: PayrollRun }) {
  const note = excludedNote(run);
  return (
    <Card>
      <CardHeader
        title="What leaves the account"
        description="Net pay reaches employees. Everything else is remitted on their behalf."
        action={
          <Badge tone="neutral" size="sm">
            {headcountLabel(run)}
          </Badge>
        }
      />
      <CardBody className="flex flex-col gap-3">
        {/* Beside the totals, because these are the figures somebody reconciles
            against a bank statement — and a total that silently covers nine of
            ten people is the one thing a reconciliation cannot detect. */}
        {note && (
          <p className="text-meta leading-relaxed text-warning-text">{note}</p>
        )}
        <TotalRow label="Net to employees" kobo={run.netKobo} strong />
        {/* A deduction this employer does not operate is ABSENT from the list of
            what leaves the account, because nothing leaves the account for it.
            "PAYE ₦0.00 to state revenue services" on a payroll that deducts no
            PAYE is a remittance line for a remittance that does not exist, and
            it is one of the two ways the abolished-relief bug read. `notOperated`
            names them under the totals instead. */}
        {wasDeducted(run.operates, "paye") && (
          <TotalRow label="PAYE to state revenue services" kobo={run.payeKobo} />
        )}
        {wasDeducted(run.operates, "pension") && (
          <TotalRow label="Pension — employee share" kobo={run.pensionEmployeeKobo} />
        )}
        {wasDeducted(run.operates, "nhf") && (
          <TotalRow label="National Housing Fund" kobo={run.nhfKobo} />
        )}
        {wasDeducted(run.operates, "pension") && (
          <div className="mt-1 border-t border-line pt-3">
            <TotalRow
              label="Pension — employer share"
              kobo={run.pensionEmployerKobo}
              note="A company cost on top of gross. It does not reduce anyone's pay."
            />
          </div>
        )}
        {notOperated(run.operates).length > 0 && (
          <p className="text-meta leading-relaxed text-body">
            Nothing is remitted for{" "}
            {notOperated(run.operates)
              .map((row) => row.label)
              .join(", ")
              .replace(/, ([^,]*)$/, " or $1")}
            . This payroll did not deduct{" "}
            {notOperated(run.operates).length === 1 ? "it" : "them"}, so there is
            no schedule to file.
          </p>
        )}
        <div className="mt-1 border-t border-line pt-3">
          <TotalRow label="Total cost to the company" kobo={run.totalCostKobo} strong />
        </div>
      </CardBody>
    </Card>
  );
}

export function TotalRow({
  label,
  kobo,
  note,
  strong = false,
}: {
  label: string;
  kobo: number;
  note?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <div className="min-w-0">
        <p
          className={cn(
            "text-body-sm",
            strong ? "font-medium text-ink" : "text-body",
          )}
        >
          {label}
        </p>
        {note && (
          <p className="mt-0.5 text-meta leading-relaxed text-muted">{note}</p>
        )}
      </div>
      <p
        className={cn(
          "tabular shrink-0",
          strong ? "text-h4 text-ink" : "text-body text-body",
        )}
      >
        {formatKobo(kobo)}
      </p>
    </div>
  );
}

/* -------------------------------------------------------- what approving does */

/**
 * What approval will actually do, listed before somebody presses it.
 *
 * Preparing is free and repeatable. Approving is not: it freezes the settings
 * onto the run and settles the loan instalments and expense claims the run
 * consumed. A confirmation that says only "are you sure" tells the reader
 * nothing they did not already know.
 */
export function ApprovalConsequences({ run }: { run: PayrollRun }) {
  return (
    <ul className="flex flex-col gap-2">
      {[
        `${formatKobo(run.netKobo)} becomes payable to ${run.employeeCount} ${
          run.employeeCount === 1 ? "person" : "people"
        } on ${run.payDate}.`,
        /* Named here rather than only in the exception list, because this is the
           list somebody reads immediately before the one-way door. "Nobody
           mentioned it" is not a defence available to a screen that had the
           figure. */
        ...(run.excludedCount > 0
          ? [
              run.excludedCount === 1
                ? "1 person on the payroll for this period is deliberately not on this run and is paid nothing by it. The reason is recorded against them."
                : `${run.excludedCount} people on the payroll for this period are deliberately not on this run and are paid nothing by it. The reason is recorded against each of them.`,
            ]
          : []),
        "Any loan instalment in this run is taken and the schedule moves to the next month.",
        "Any expense claim in this run is marked paid.",
        "The payroll settings used are frozen onto the run, so these payslips still explain themselves years from now.",
      ].map((line) => (
        <li key={line} className="flex items-start gap-2.5">
          <span
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-accent-text [&>svg]:size-3.5"
          >
            <Check />
          </span>
          <span className="text-body-sm leading-relaxed text-body">{line}</span>
        </li>
      ))}
    </ul>
  );
}
