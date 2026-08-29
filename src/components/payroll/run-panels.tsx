"use client";

import { sourceNote } from "@/lib/demo";
import { AlertTriangle, Check, Scale, ShieldAlert, UserMinus } from "lucide-react";
import { cn } from "@/lib/cn";
import { useMoneyHidden } from "@/lib/store/money-privacy";
import {
  Disclosure,
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
  shortNoticeFor,
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
  const label = sourceNote(connected);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {label && (
        <Badge tone="warning" size="sm" dot>
          {label}
        </Badge>
      )}
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
  replaceFixFor,
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
  /**
   * Codes whose `actionFor` result stands in for `fixFor`'s link rather than
   * sitting beside it — the row can fill in the figure right here, so a
   * button that would only navigate away and back is not a second option, it
   * is a worse one. Absent means every row keeps its link, which is what a
   * read-only surface with no `actionFor` at all needs regardless.
   */
  replaceFixFor?: ReadonlySet<string>;
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
        {/* Blockers stay as rows, one each.
            -------------------------------
            They stop the run, there are rarely many, and each names a different
            person to go and fix. Folding them away would hide the only thing on
            this screen that has to be dealt with before anybody is paid. */}
        {blockers.map((exception) => (
          <ExceptionRow
            key={exception.id}
            exception={exception}
            action={actionFor?.(exception)}
            hideFix={replaceFixFor?.has(exception.code) ?? false}
          />
        ))}

        {/* Warnings are grouped and closed.
            -------------------------------
            Thirty-one rows saying the same sentence about thirty-one people is
            not thirty-one things to read — it is one thing, thirty-one times.
            A company with twenty-two people off a payroll had a page of
            identical amber boxes, which reads as the platform being broken
            rather than as a list of decisions somebody already made.

            So: one closed row per kind, with the count on it and the names
            inside. The closed line says what the group is, which is all most
            people need; opening it gives the same rows as before, unchanged. */}
        {groupByCode(warnings).map((group) => (
          <ExceptionGroup
            key={group.code}
            group={group}
            actionFor={actionFor}
            hideFix={replaceFixFor?.has(group.code) ?? false}
          />
        ))}
      </CardBody>
    </Card>
  );
}

/** Warnings of one kind, in the order they arrived. */
type ExceptionGroup = { code: string; rows: RunException[] };

function groupByCode(exceptions: RunException[]): ExceptionGroup[] {
  const order: string[] = [];
  const byCode = new Map<string, RunException[]>();
  for (const exception of exceptions) {
    if (!byCode.has(exception.code)) {
      byCode.set(exception.code, []);
      order.push(exception.code);
    }
    byCode.get(exception.code)!.push(exception);
  }
  return order.map((code) => ({ code, rows: byCode.get(code)! }));
}

/**
 * What a group of one kind is called, said once instead of per person.
 *
 * The API's `message` is written for exactly one employee and names them, which
 * is right on a row and wrong on a heading. These are the same facts in the
 * plural — and deliberately plain: "22 people are not on this payroll" is a
 * statement, where twenty-two amber boxes is an alarm about something nobody
 * needs alarming about.
 */
const GROUP_TITLE: Record<string, (n: number) => string> = {
  excluded_from_payroll: (n) =>
    n === 1 ? "1 person is not on this payroll" : `${String(n)} people are not on this payroll`,
  missing_pension_pin: (n) =>
    n === 1 ? "1 person has no pension PIN" : `${String(n)} people have no pension PIN`,
  missing_tax_state: (n) =>
    n === 1 ? "1 person has no PAYE state" : `${String(n)} people have no PAYE state`,
  rent_relief_unclaimed: (n) =>
    n === 1 ? "1 person has not declared rent" : `${String(n)} people have not declared rent`,
  overtime_awaiting_approval: (n) =>
    n === 1 ? "1 overtime entry is unapproved" : `${String(n)} overtime entries are unapproved`,
  overtime_entered_by_hand: (n) =>
    n === 1 ? "1 person's overtime was entered by hand" : `${String(n)} people's overtime was entered by hand`,
  no_attendance_all_period: (n) =>
    n === 1 ? "1 person has no attendance at all" : `${String(n)} people have no attendance at all`,
};

function groupTitle(group: ExceptionGroup): string {
  const named = GROUP_TITLE[group.code];
  if (named) return named(group.rows.length);
  /* An unknown code still groups and still counts — it just borrows the first
     row's own sentence for its heading rather than inventing one. A `default`
     that said "7 things" would hide which seven. */
  return group.rows.length === 1
    ? (shortNoticeFor(group.code) ?? group.rows[0]!.message)
    : `${String(group.rows.length)} × ${shortNoticeFor(group.code) ?? group.code}`;
}

/**
 * One kind of warning, closed.
 *
 * No icon and no tint on the closed line. `PARITY.md` Rule 5 allows a reveal
 * for anything that is not costing money right now, and none of these are —
 * the card's own description already says "none of them stops the run". Amber
 * on top of that is the product shouting about its own normal state.
 */
function ExceptionGroup({
  group,
  actionFor,
  hideFix,
}: {
  group: ExceptionGroup;
  actionFor?: (exception: RunException) => React.ReactNode;
  hideFix: boolean;
}) {
  /* One of a kind is not a group. A closed reveal hiding a single sentence
     costs a click and saves nothing. */
  if (group.rows.length === 1) {
    return (
      <ExceptionRow
        exception={group.rows[0]!}
        action={actionFor?.(group.rows[0]!)}
        hideFix={hideFix}
        plain
      />
    );
  }

  return (
    <Disclosure
      title={groupTitle(group)}
      level={3}
      meta={
        <span className="text-meta font-semibold uppercase tracking-[0.08em] text-muted">
          {group.rows.length}
        </span>
      }
    >
      <div className="flex flex-col gap-2">
        {group.rows.map((exception) => (
          <ExceptionRow
            key={exception.id}
            exception={exception}
            action={actionFor?.(exception)}
            hideFix={hideFix}
            plain
          />
        ))}
      </div>
    </Disclosure>
  );
}

function ExceptionRow({
  exception,
  action,
  hideFix = false,
  plain = false,
}: {
  exception: RunException;
  action?: React.ReactNode;
  hideFix?: boolean;
  /**
   * Inside a group, where the heading has already said what these are.
   *
   * No tint and no icon: twenty-two amber boxes behind one reveal is the same
   * alarm the reveal was added to stop. A blocker is never plain — those keep
   * their colour wherever they render, because they are the one thing on this
   * screen that stops a payroll.
   */
  plain?: boolean;
}) {
  const blocking = exception.severity === "BLOCKER";
  const fix = hideFix ? null : fixFor(exception.code, exception.employeeId);
  const quiet = plain && !blocking;

  return (
    <div
      className={cn(
        "flex flex-wrap items-start gap-3 rounded-md border p-3",
        blocking
          ? "border-danger-line bg-danger-soft"
          : quiet
            ? "border-line bg-surface"
            : "border-warning-line bg-warning-soft",
      )}
    >
      {!quiet && (
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 shrink-0 [&>svg]:size-4",
          blocking ? "text-danger-text" : "text-warning-text",
        )}
      >
        {blocking ? <ShieldAlert /> : <AlertTriangle />}
      </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-body-sm leading-relaxed text-ink">
          {shortNoticeFor(exception.code) ?? exception.message}
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

  /**
   * Always closed, however many there are.
   *
   * This was a card with every excluded person expanded, which on a company of
   * thirty was a page of near-identical rows below the payslip table. They are
   * decisions somebody already made and recorded — the opposite of something
   * needing attention — so the closed line states the fact and the names are
   * one click away.
   *
   * The count stays on the closed line, because *how many* is the part that
   * belongs beside the payslip table's own "8 of 30". `PARITY.md` Rule 5: a
   * reveal is for what is settled, and the warning that must never go behind
   * one is something costing money right now. Nothing here is.
   *
   * The badge is neutral rather than amber for the same reason. Twenty-two
   * people left off on purpose is not a fault.
   */
  return (
    <Card>
      <Disclosure
        title="Not on this payroll"
        /**
         * Level 3, to match the exception groups it sits among.
         *
         * It was level 2, which `Disclosure` renders at `text-body-lg` — 17px
         * against the 15px of every grouped exception directly above it, and
         * the 14px of its own description directly below. Three sizes in one
         * stack, and the largest belonging to the least urgent thing on it.
         *
         * The component's rule is right and this call site was breaking it: a
         * level-2 disclosure **heads a page section**. This one does not. It is
         * a peer of "22 people are not on this payroll" and "8 people have no
         * pension PIN", which are level 3, and it reads as one of them because
         * that is what it is.
         */
        level={3}
        meta={
          <span className="text-meta font-semibold uppercase tracking-[0.08em] text-muted">
            {exclusions.length}{" "}
            {exclusions.length === 1 ? "person" : "people"}
          </span>
        }
        hint="Left off deliberately, with the reason recorded. Everybody here is back on next period's payroll automatically — nothing has to remember to put them there."
      >
      <div className="flex flex-col gap-2.5">
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
      </div>
      </Disclosure>
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
  /* Same mask `Money` renders — six dots, whatever the figure — so a company's
     total cost is covered by the same click as everything else on the page.
     Not built on `Money` itself: its inner span always renders `font-medium
     text-ink`, which is exactly the emphasis `strong` exists to withhold from
     the deduction lines sitting above the total. */
  const hidden = useMoneyHidden();
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
          strong ? "text-h4 text-ink" : "text-body",
        )}
      >
        {hidden ? "•".repeat(6) : formatKobo(kobo)}
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
