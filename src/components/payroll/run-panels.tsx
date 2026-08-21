"use client";

import { AlertTriangle, Check, Scale, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Badge,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  type BadgeTone,
} from "@/components/ui";
import {
  STATUS_LABEL,
  fixFor,
  formatKobo,
  type Discrepancy,
  type PayrollRun,
  type PayrollRunStatus,
  type RunException,
} from "@/lib/api/payroll";

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
        {connected ? "Live from the API" : "Demo data, this browser only"}
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
}: {
  exceptions: RunException[];
  /** Shown beside the heading when re-preparing is the way to clear these. */
  onRecheck?: React.ReactNode;
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
          <ExceptionRow key={exception.id} exception={exception} />
        ))}
      </CardBody>
    </Card>
  );
}

function ExceptionRow({ exception }: { exception: RunException }) {
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
      {fix && (
        <ButtonLink href={fix.href} size="sm" variant="secondary">
          {fix.label}
        </ButtonLink>
      )}
    </div>
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
  return (
    <Card>
      <CardHeader
        title="What leaves the account"
        description="Net pay reaches employees. Everything else is remitted on their behalf."
      />
      <CardBody className="flex flex-col gap-3">
        <TotalRow label="Net to employees" kobo={run.netKobo} strong />
        <TotalRow label="PAYE to state revenue services" kobo={run.payeKobo} />
        <TotalRow label="Pension — employee share" kobo={run.pensionEmployeeKobo} />
        <TotalRow label="National Housing Fund" kobo={run.nhfKobo} />
        <div className="mt-1 border-t border-line pt-3">
          <TotalRow
            label="Pension — employer share"
            kobo={run.pensionEmployerKobo}
            note="A company cost on top of gross. It does not reduce anyone's pay."
          />
        </div>
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
