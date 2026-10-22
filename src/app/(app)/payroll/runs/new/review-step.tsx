"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Pencil, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  SegmentedControl,
  Select,
  SortableTH,
  TBody,
  TD,
  TDPrimary,
  TH,
  TR,
  TableWrap,
  TextLink,
} from "@/components/ui";
import {
  excludedNote,
  formatKobo,
  overtimeOn,
  payslipCountLabel,
  wasDeducted,
  type LineSummaryByEmployee,
  type Payslip,
  type PayrollRunDetail,
  type RunException,
} from "@/lib/api/payroll";
import { useOvertimePolicy } from "@/lib/store/overtime";
import { usePayrollActions } from "@/lib/store/payroll";
import { usePayrollSettings } from "@/lib/payroll/use-settings";
import { AdjustDrawer } from "./adjust-drawer";
import { TOUCH } from "./drawer-parts";
import {
  ADJUSTMENT_LABEL,
  adjustmentsOf,
  bonusOn,
  deductionLabels,
  deductionTotal,
  hasManualOvertime,
  visiblePayslips,
  warningsByPerson,
  type AdjustmentKind,
  type ReviewFilter,
  type ReviewView,
  type SortColumn,
} from "./review-model";

/**
 * Every payslip in the run, and the way to change one.
 *
 * ## What this replaced
 *
 * Seven columns, and four small underlined controls on every row. The one figure
 * a reader came to check, net pay, was the lightest thing in the row; the figures
 * you could change looked exactly like the ones you could not; and on a phone ten
 * payslips were a 4,666px stack with no way to find the two that mattered.
 *
 * ## What it is now
 *
 * - **A toolbar**: search, and three filters that answer the three questions a
 *   reviewer actually has: everybody, who has had something typed in, who has
 *   something to look at.
 * - **A sortable table**, with net pay as the emphasised column and the columns
 *   you can change grouped under a header that says so. Read-only figures carry
 *   no cue because there is nothing to do with them.
 * - **One button per person**, which opens the adjust drawer. Everything that can
 *   be changed is changed there, in one way.
 * - **On a phone, a card per person** with the same toolbar above it, and a
 *   button that is 44px tall.
 *
 * ## State that survives a save
 *
 * Saving rebuilds the whole run server-side. The filter, search and sort live in
 * the wizard (`view`), not here, and the wizard keeps the previous run on screen,
 * dimmed, while the new one loads. Somebody working down a payroll does not lose
 * their place every time they save a figure.
 */

/** How many people are drawn at once. A payroll of three hundred is not three hundred rows. */
const PAGE = 50;

export function ReviewStep({
  run,
  periodLabel,
  employees,
  editable,
  readOnlyReason,
  refreshing,
  view,
  onViewChange,
  onSaved,
  onAdjusted,
}: {
  run: PayrollRunDetail;
  /** "September 2026". */
  periodLabel: string;
  /** Just enough of the directory to price overtime. */
  employees: readonly { id: string; grossMonthly?: number | null }[];
  /** `canPrepare && !settled` from the wizard. An approved run is the record. */
  editable: boolean;
  /** Why nothing can be changed, when `editable` is false. */
  readOnlyReason: string | null;
  /** The run is being recalculated; what is on screen is the previous one. */
  refreshing: boolean;
  view: ReviewView;
  onViewChange: (next: ReviewView) => void;
  onSaved: () => void;
  onAdjusted: (summary: string) => void;
}) {
  const overtimePolicy = useOvertimePolicy();
  const { settings: paySettings } = usePayrollSettings();
  const { lineSummary } = usePayrollActions();
  const { payslips } = run;

  /* Who is open, by **employee**, not by payslip. Every recalculation deletes and
     rebuilds every payslip, so a payslip id does not survive a save: tracking by
     it closed the drawer on the very save that was meant to leave it open. */
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  /* ------------------------------------------------ typed deduction lines */

  /**
   * Who has a deduction somebody typed.
   *
   * Not on the payslip: a typed deduction is labelled with its reason, which
   * makes it indistinguishable from a loan instalment, so the only honest source
   * is the run's own line summary. Read again whenever the run is rebuilt
   * (`preparedAt` moves), and held with the run it answered for, so a figure
   * from the previous calculation is never read against the next one.
   *
   * `null` while it is being read, and **null is not "nobody"**: the filter's
   * count is withheld until it is known, rather than shown short.
   */
  const lineKey = `${run.id}:${run.preparedAt ?? ""}`;
  const [typed, setTyped] = useState<{
    key: string;
    deductions: LineSummaryByEmployee | null;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    lineSummary(run.id)
      .then((result) => {
        if (!cancelled)
          setTyped({ key: lineKey, deductions: result.deductions });
      })
      .catch(() => {
        if (!cancelled) setTyped({ key: lineKey, deductions: null });
      });
    return () => {
      cancelled = true;
    };
  }, [lineSummary, run.id, lineKey]);
  const typedDeductions = typed?.key === lineKey ? typed.deductions : null;
  const typedUnknown = typed?.key === lineKey && typed.deductions === null;
  const typedPending = typed?.key !== lineKey;

  /* -------------------------------------------------------- which columns */

  /**
   * Which of the two optional columns this company actually works in.
   *
   * Every company used to get an Overtime column and a Bonus column on every row,
   * whether or not it had ever paid either. Both are company settings now, in Pay
   * setup, and the API refuses an addition when either is off.
   *
   * ## A switched-off column still appears when it carries money
   *
   * The switch governs what this screen **offers**, never what the payroll
   * **pays**: overtime approved in the overtime module is still detected, valued
   * and paid. Hiding a figure that is in the net pay is "absent is not zero"
   * inverted into something worse, money on the payslip and nothing on the table
   * to account for it.
   */
  const showOvertime =
    overtimePolicy.policy.enabled ||
    payslips.some((slip) => overtimeOn(slip) > 0);
  const showBonus =
    paySettings.bonus.enabled ||
    payslips.some((slip) => (bonusOn(slip)?.amountKobo ?? 0) > 0);
  const anyUnpaid = payslips.some((slip) => slip.unpaidDays > 0);

  /* ---------------------------------------------------------- the toolbar */

  const warnings = useMemo(
    () => warningsByPerson(run.exceptions),
    [run.exceptions],
  );
  const visible = useMemo(
    () => visiblePayslips(payslips, view, typedDeductions, warnings),
    [payslips, view, typedDeductions, warnings],
  );
  const adjustedCount = useMemo(
    () =>
      payslips.filter((slip) => adjustmentsOf(slip, typedDeductions).length > 0)
        .length,
    [payslips, typedDeductions],
  );
  const warningCount = useMemo(
    () => payslips.filter((slip) => warnings.has(slip.employeeId)).length,
    [payslips, warnings],
  );

  /* Any change to what is shown starts the list from its top again. */
  const change = (next: ReviewView) => {
    setLimit(PAGE);
    onViewChange(next);
  };

  /* `SortableTH` names its column with a plain string. Every header below passes
     one of `SortColumn`'s members, which is the only thing the sort understands. */
  const onSort = (name: string, startDescending = false) => {
    const column = name as SortColumn;
    const current = view.sort;
    const order =
      current?.column === column
        ? current.order === "asc"
          ? "desc"
          : "asc"
        : startDescending
          ? "desc"
          : "asc";
    change({ ...view, sort: { column, order } });
  };

  const shown = visible.slice(0, limit);
  const rest = visible.length - shown.length;
  const narrowed = visible.length !== payslips.length;
  const note = excludedNote(run);

  const adjusting =
    payslips.find((slip) => slip.employeeId === adjustingId) ?? null;
  const open = (slip: Payslip) => setAdjustingId(slip.employeeId);

  const rowProps = {
    editable,
    refreshing,
    warnings,
    typedDeductions,
    onOpen: open,
  };

  return (
    <>
      <Card>
        <CardHeader
          title="Every payslip"
          description="PAYE is worked out on annual income against the bands in force for the period, after pension and housing-fund relief."
          action={
            <Badge
              tone={run.excludedCount > 0 ? "warning" : "neutral"}
              size="sm"
            >
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

        <div className="flex flex-col gap-3 border-b border-line px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-44 max-w-full flex-1 sm:max-w-xs">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-faint"
              />
              <Input
                value={view.query}
                onChange={(event) =>
                  change({ ...view, query: event.target.value })
                }
                placeholder="Search by name or staff number"
                aria-label="Search payslips by name or staff number"
                className="pl-9 max-sm:h-11"
              />
            </div>

            <SegmentedControl<ReviewFilter>
              label="Which payslips to show"
              value={view.filter}
              onChange={(filter) => change({ ...view, filter })}
              className="max-sm:[&>button]:min-h-11"
              options={[
                { value: "all", label: `All (${String(payslips.length)})` },
                {
                  value: "adjusted",
                  label: typedPending
                    ? "With adjustments"
                    : `With adjustments (${String(adjustedCount)})`,
                },
                {
                  value: "warnings",
                  label: `With warnings (${String(warningCount)})`,
                },
              ]}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 md:hidden">
            <label className="flex w-full items-center gap-3 text-meta text-muted">
              <span className="shrink-0">Sort by</span>
              <Select
                aria-label="Sort payslips"
                className="max-sm:h-11"
                value={
                  view.sort ? `${view.sort.column}:${view.sort.order}` : ""
                }
                onChange={(event) => {
                  const [column, order] = event.target.value.split(":") as [
                    SortColumn,
                    "asc" | "desc",
                  ];
                  change({
                    ...view,
                    sort: event.target.value ? { column, order } : null,
                  });
                }}
              >
                <option value="">Run order</option>
                <option value="name:asc">Employee, A to Z</option>
                <option value="net:desc">Net pay, highest first</option>
                <option value="net:asc">Net pay, lowest first</option>
                <option value="gross:desc">Gross, highest first</option>
                <option value="paye:desc">PAYE, highest first</option>
                <option value="deductions:desc">
                  Deductions, highest first
                </option>
                {showOvertime && (
                  <option value="overtime:desc">Overtime, highest first</option>
                )}
                {showBonus && (
                  <option value="bonus:desc">Bonus, highest first</option>
                )}
                {anyUnpaid && (
                  <option value="unpaid:desc">Unpaid days, most first</option>
                )}
              </Select>
            </label>
          </div>

          {(narrowed || refreshing || typedUnknown) && (
            <p role="status" className="text-meta text-muted">
              {refreshing
                ? "Recalculating the payroll. The figures below are the previous ones until it finishes."
                : narrowed
                  ? `Showing ${String(visible.length)} of ${String(payslips.length)} payslips.`
                  : null}
              {typedUnknown && !refreshing && (
                <>
                  {narrowed ? " " : ""}
                  Deductions typed by hand could not be checked, so &ldquo;With
                  adjustments&rdquo; may miss some.
                </>
              )}
            </p>
          )}
        </div>

        {payslips.length === 0 ? (
          <EmptyState
            compact
            title="No payslips on this payroll"
            description="Everybody in the period has been left off it. Who, and why, is listed below."
          />
        ) : visible.length === 0 ? (
          <EmptyState
            compact
            title={
              view.query.trim()
                ? "Nobody matches that search"
                : view.filter === "adjusted"
                  ? "Nobody has an adjustment yet"
                  : "Nobody has a warning"
            }
            description={
              view.query.trim()
                ? "Try a different name or staff number, or clear the filter."
                : view.filter === "adjusted"
                  ? "A figure somebody typed in (overtime, a bonus, PAYE, pension or a deduction) shows here."
                  : "Everything that needed a look is on the Check step."
            }
            action={
              <Button
                variant="secondary"
                className={TOUCH}
                onClick={() => change({ ...view, filter: "all", query: "" })}
              >
                Show everybody
              </Button>
            }
          />
        ) : (
          <div
            aria-busy={refreshing}
            className={cn(refreshing && "opacity-60 transition-opacity")}
          >
            <div className="hidden md:block">
              <TableWrap
                caption={`Payslips for ${periodLabel}`}
                className="rounded-none border-0"
              >
                <ReviewHead
                  view={view}
                  onSort={onSort}
                  showOvertime={showOvertime}
                  showBonus={showBonus}
                  anyUnpaid={anyUnpaid}
                />
                <TBody>
                  {shown.map((slip) => (
                    <PayslipRow
                      key={slip.id}
                      slip={slip}
                      showOvertime={showOvertime}
                      showBonus={showBonus}
                      anyUnpaid={anyUnpaid}
                      {...rowProps}
                    />
                  ))}
                </TBody>
              </TableWrap>
            </div>

            <ul className="divide-y divide-line md:hidden">
              {shown.map((slip) => (
                <PayslipCard
                  key={slip.id}
                  slip={slip}
                  showOvertime={showOvertime}
                  showBonus={showBonus}
                  anyUnpaid={anyUnpaid}
                  {...rowProps}
                />
              ))}
            </ul>

            {rest > 0 && (
              <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">
                <Button
                  variant="secondary"
                  className={TOUCH}
                  onClick={() => setLimit((was) => was + PAGE)}
                >
                  Show {Math.min(PAGE, rest)} more
                </Button>
                <span className="text-meta text-muted">
                  {rest} {rest === 1 ? "payslip is" : "payslips are"} not shown
                  yet. Search to find somebody directly.
                </span>
              </div>
            )}
          </div>
        )}

        <CardBody className="border-t border-line">
          <p className="text-meta leading-relaxed text-muted">
            Employer pension is not in any column here. It is a company cost on
            top of gross and does not reduce anybody&apos;s pay: the totals on
            the next step show it separately.
          </p>
        </CardBody>
        <CardBody className="border-t border-line">
          <ButtonLink
            href="/payroll/payslips"
            variant="secondary"
            size="sm"
            className={TOUCH}
          >
            Open the payslips
          </ButtonLink>
        </CardBody>
      </Card>

      {/* Outside the table, deliberately. A drawer rendered inside a `<tbody>`
          is invalid HTML that browsers silently reparent, which moves it away
          from the place it was written. */}
      <AdjustDrawer
        slip={adjusting}
        runId={run.id}
        periodLabel={periodLabel}
        editable={editable}
        readOnlyReason={readOnlyReason}
        refreshing={refreshing}
        employees={employees}
        warnings={adjusting ? (warnings.get(adjusting.employeeId) ?? []) : []}
        typedDeduction={
          adjusting ? typedDeductions?.[adjusting.employeeId] : undefined
        }
        showOvertime={showOvertime}
        showBonus={showBonus}
        onClose={() => setAdjustingId(null)}
        onSaved={onSaved}
        onAdjusted={onAdjusted}
      />
    </>
  );
}

/* ------------------------------------------------------------------ table */

/**
 * The header, in two rows.
 *
 * The top row names the group of columns a person can change, so the difference
 * between a figure the engine works out (gross, net) and one somebody may type
 * over is on the page rather than learned by clicking. The second row is the
 * sortable headings.
 */
function ReviewHead({
  view,
  onSort,
  showOvertime,
  showBonus,
  anyUnpaid,
}: {
  view: ReviewView;
  onSort: (column: string, startDescending?: boolean) => void;
  showOvertime: boolean;
  showBonus: boolean;
  anyUnpaid: boolean;
}) {
  const active = view.sort?.column;
  const order = view.sort?.order ?? "asc";
  const adjustable = 2 + (showOvertime ? 1 : 0) + (showBonus ? 1 : 0);
  const leading = 2 + (anyUnpaid ? 1 : 0);

  return (
    <thead className="border-b border-line bg-canvas">
      <tr>
        <td colSpan={leading} />
        <th
          scope="colgroup"
          colSpan={adjustable}
          className="border-b border-line px-4 py-1.5 text-center text-meta font-medium text-muted"
        >
          Can be adjusted
        </th>
        <td colSpan={2} />
      </tr>
      <tr>
        <SortableTH column="name" active={active} order={order} onSort={onSort}>
          Employee
        </SortableTH>
        {anyUnpaid && (
          <SortableTH
            column="unpaid"
            active={active}
            order={order}
            onSort={onSort}
            align="right"
            startDescending
          >
            Unpaid days
          </SortableTH>
        )}
        <SortableTH
          column="gross"
          active={active}
          order={order}
          onSort={onSort}
          align="right"
          startDescending
        >
          Gross
        </SortableTH>
        {showOvertime && (
          <SortableTH
            column="overtime"
            active={active}
            order={order}
            onSort={onSort}
            align="right"
            startDescending
          >
            Overtime
          </SortableTH>
        )}
        {showBonus && (
          <SortableTH
            column="bonus"
            active={active}
            order={order}
            onSort={onSort}
            align="right"
            startDescending
          >
            Bonus
          </SortableTH>
        )}
        <SortableTH
          column="paye"
          active={active}
          order={order}
          onSort={onSort}
          align="right"
          startDescending
        >
          PAYE
        </SortableTH>
        <SortableTH
          column="deductions"
          active={active}
          order={order}
          onSort={onSort}
          align="right"
          startDescending
        >
          Deductions
        </SortableTH>
        <SortableTH
          column="net"
          active={active}
          order={order}
          onSort={onSort}
          align="right"
          startDescending
          className="bg-canvas text-ink"
        >
          Net pay
        </SortableTH>
        <TH align="right">
          <span className="sr-only">Actions</span>
        </TH>
      </tr>
    </thead>
  );
}

type RowShared = {
  editable: boolean;
  refreshing: boolean;
  warnings: ReadonlyMap<string, readonly RunException[]>;
  typedDeductions: LineSummaryByEmployee | null;
  onOpen: (slip: Payslip) => void;
};

function PayslipRow({
  slip,
  editable,
  refreshing,
  warnings,
  typedDeductions,
  onOpen,
  showOvertime,
  showBonus,
  anyUnpaid,
}: RowShared & {
  slip: Payslip;
  showOvertime: boolean;
  showBonus: boolean;
  anyUnpaid: boolean;
}) {
  const facts = factsOf(slip, typedDeductions);
  const mine = warnings.get(slip.employeeId) ?? [];

  return (
    <TR>
      <TDPrimary
        title={
          <TextLink href={`/payroll/payslips/${slip.id}`}>{slip.name}</TextLink>
        }
        subtitle={
          <>
            {slip.employeeNo}
            <Flags adjusted={facts.adjusted} warnings={mine} />
          </>
        }
      />
      {anyUnpaid && (
        <TD align="right" className="tabular text-body-sm">
          {slip.unpaidDays > 0 ? (
            <span className="text-warning-text">{slip.unpaidDays}</span>
          ) : (
            <span className="text-faint">—</span>
          )}
        </TD>
      )}
      <TD align="right" className="tabular text-body-sm">
        {formatKobo(slip.grossKobo)}
      </TD>
      {showOvertime && (
        <TD align="right" className="tabular text-body-sm">
          <Figure kobo={facts.overtime} marked={facts.manualOvertime} />
        </TD>
      )}
      {showBonus && (
        <TD align="right" className="tabular text-body-sm">
          <Figure kobo={facts.bonus} marked={facts.bonus > 0} />
        </TD>
      )}
      <TD align="right" className="tabular text-body-sm">
        {facts.payeOperated ? (
          <Figure kobo={slip.payeKobo} marked={slip.payeOverridden} always />
        ) : (
          <span className="text-faint">Not operated</span>
        )}
      </TD>
      <TD align="right" className="tabular text-body-sm">
        <Figure
          kobo={facts.deductions}
          marked={
            facts.adjusted.includes("statutory") ||
            facts.adjusted.includes("deductions")
          }
        />
        {facts.deductionLabels.length > 0 && (
          <span className="mt-0.5 block text-meta font-normal text-muted">
            {facts.deductionLabels.join(", ")}
          </span>
        )}
      </TD>
      {/* The figure a reader came here to check. Heavier and larger than anything
          beside it, on its own tint, so the eye lands on it before the rest. */}
      <TD
        align="right"
        className="tabular bg-canvas text-body-lg font-semibold text-ink"
      >
        {formatKobo(slip.netKobo)}
      </TD>
      <TD align="right">
        <OpenButton
          slip={slip}
          editable={editable}
          refreshing={refreshing}
          onOpen={onOpen}
        />
      </TD>
    </TR>
  );
}

/* ------------------------------------------------------------------ cards */

/**
 * One payslip as a card, below `md`.
 *
 * Same facts as the row, in a label and value list, with net pay at the top
 * where a thumb finds it and a button that is 44px tall at the bottom. The toolbar
 * above filters these exactly as it filters the table.
 */
function PayslipCard({
  slip,
  editable,
  refreshing,
  warnings,
  typedDeductions,
  onOpen,
  showOvertime,
  showBonus,
  anyUnpaid,
}: RowShared & {
  slip: Payslip;
  showOvertime: boolean;
  showBonus: boolean;
  anyUnpaid: boolean;
}) {
  const facts = factsOf(slip, typedDeductions);
  const mine = warnings.get(slip.employeeId) ?? [];

  return (
    <li className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <TextLink
            href={`/payroll/payslips/${slip.id}`}
            className="-my-2.5 inline-block py-2.5"
          >
            {slip.name}
          </TextLink>
          <p className="text-meta text-muted">{slip.employeeNo}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-meta text-muted">Net pay</p>
          <p className="tabular text-h4 text-ink">{formatKobo(slip.netKobo)}</p>
        </div>
      </div>

      {/* Only the figures this person has. A card that printed "Overtime —" and
          "Bonus —" for everybody was two rows of nothing per payslip, which is
          most of why ten of them made a page nobody could scroll to the end of.
          The table keeps its dashes, because a column needs a cell; a card does
          not need a line. */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-body-sm">
        <CardFact label="Gross">{formatKobo(slip.grossKobo)}</CardFact>
        <CardFact label="PAYE">
          {facts.payeOperated ? (
            <Figure kobo={slip.payeKobo} marked={slip.payeOverridden} always />
          ) : (
            <span className="text-faint">Not operated</span>
          )}
        </CardFact>
        {facts.deductions > 0 && (
          <CardFact label="Deductions">
            <Figure
              kobo={facts.deductions}
              marked={
                facts.adjusted.includes("statutory") ||
                facts.adjusted.includes("deductions")
              }
            />
          </CardFact>
        )}
        {showOvertime && facts.overtime > 0 && (
          <CardFact label="Overtime">
            <Figure kobo={facts.overtime} marked={facts.manualOvertime} />
          </CardFact>
        )}
        {showBonus && facts.bonus > 0 && (
          <CardFact label="Bonus">
            <Figure kobo={facts.bonus} marked />
          </CardFact>
        )}
        {anyUnpaid && slip.unpaidDays > 0 && (
          <CardFact label="Unpaid days">
            <span className="text-warning-text">{slip.unpaidDays}</span>
          </CardFact>
        )}
      </dl>

      <div className="flex items-center justify-between gap-3">
        <Flags adjusted={facts.adjusted} warnings={mine} bare />
        <div className="ml-auto">
          <OpenButton
            slip={slip}
            editable={editable}
            refreshing={refreshing}
            onOpen={onOpen}
          />
        </div>
      </div>
    </li>
  );
}

function CardFact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-meta text-muted">{label}</dt>
      <dd className="tabular text-ink">{children}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

/** What a row needs, worked out once so the table and the card cannot differ. */
function factsOf(slip: Payslip, typedDeductions: LineSummaryByEmployee | null) {
  return {
    adjusted: adjustmentsOf(slip, typedDeductions),
    overtime: overtimeOn(slip),
    manualOvertime: hasManualOvertime(slip),
    bonus: bonusOn(slip)?.amountKobo ?? 0,
    payeOperated: wasDeducted(slip.operates, "paye"),
    deductions: deductionTotal(slip),
    deductionLabels: deductionLabels(slip),
  };
}

/**
 * A money figure, with a pencil where somebody typed it.
 *
 * A dash when there is nothing, so an empty cell reads as empty rather than as
 * broken. `always` is for a figure that is a real answer at zero (PAYE under the
 * ₦800,000 exemption is a computed nil, and a different fact from no figure).
 */
function Figure({
  kobo,
  marked = false,
  always = false,
}: {
  kobo: number;
  marked?: boolean;
  always?: boolean;
}) {
  if (kobo <= 0 && !marked && !always) {
    return <span className="text-faint">—</span>;
  }
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      {marked && (
        <>
          <Pencil
            aria-hidden="true"
            className="size-3 shrink-0 text-accent-text"
          />
          <span className="sr-only">Entered by hand: </span>
        </>
      )}
      {formatKobo(kobo)}
    </span>
  );
}

/** What is notable about a person, next to their name. */
function Flags({
  adjusted,
  warnings,
  bare = false,
}: {
  adjusted: readonly AdjustmentKind[];
  warnings: readonly RunException[];
  /** No margin above it: it is not sitting under a name. */
  bare?: boolean;
}) {
  if (adjusted.length === 0 && warnings.length === 0) return null;
  const toFix = warnings.filter((w) => w.severity === "BLOCKER").length;
  return (
    <span className={cn("flex flex-wrap gap-1.5", !bare && "mt-1.5")}>
      {adjusted.length > 0 && (
        <Badge tone="accent" size="sm" icon={<Pencil />}>
          Adjusted
          <span className="sr-only">
            : {adjusted.map((kind) => ADJUSTMENT_LABEL[kind]).join(", ")}
          </span>
        </Badge>
      )}
      {warnings.length > 0 && (
        <Badge
          tone={toFix > 0 ? "danger" : "warning"}
          size="sm"
          icon={<AlertTriangle />}
        >
          {toFix > 0
            ? `${String(toFix)} to fix`
            : warnings.length === 1
              ? "1 warning"
              : `${String(warnings.length)} warnings`}
        </Badge>
      )}
    </span>
  );
}

/**
 * The one control on a row.
 *
 * "Adjust" where the figures can be changed, "Details" where they cannot, so the
 * same place opens the same drawer and says honestly what it is for. The visible
 * word is short because there is one per row; the accessible name carries the
 * person, so a screen reader hears forty different buttons rather than forty
 * identical ones.
 */
function OpenButton({
  slip,
  editable,
  refreshing,
  onOpen,
  block = false,
}: {
  slip: Payslip;
  editable: boolean;
  refreshing: boolean;
  onOpen: (slip: Payslip) => void;
  block?: boolean;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      block={block}
      disabled={refreshing}
      aria-label={
        editable ? `Adjust ${slip.name}'s payslip` : `Details for ${slip.name}`
      }
      className={TOUCH}
      onClick={() => onOpen(slip)}
    >
      {editable && <Pencil aria-hidden="true" className="size-3.5" />}
      {editable ? "Adjust" : "Details"}
    </Button>
  );
}
