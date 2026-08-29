"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CalendarClock, Play, Receipt, ShieldAlert } from "lucide-react";
import type { Point } from "@/components/ui";
import {
  AreaChart,
  Badge,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Money,
  Stat,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import {
  RunStatusBadge,
  SourceBadge,
  TotalsPanel,
} from "@/components/payroll/run-panels";
import { headcountLabel, naira, periodLabel } from "@/lib/api/payroll";
import { useCan } from "@/lib/permissions";
import {
  countBySeverity,
  usePayrollRun,
  usePayrollRuns,
} from "@/lib/store/payroll";
import { TODAY } from "@/lib/today";

/**
 * The payroll home.
 *
 * ## Why there is no chart here
 *
 * There was a donut of "where August goes", captioned `₦93.0m`. Every figure on
 * this page is one somebody reconciles against a bank statement, and an
 * abbreviated total cannot be reconciled against anything — so the split is
 * itemised in full instead. A chart whose legend has to be truncated to fit is
 * worse than no chart.
 *
 * ## Why the newest run is fetched twice over
 *
 * The list gives totals; only the detail carries the exceptions. Blockers are
 * the single most useful thing this page can tell somebody — a run they think is
 * ready and is not — so it is worth the second request.
 *
 * ## Who may look
 *
 * `GET /payroll/runs` and `GET /payroll/runs/:id` both require `VIEW_SALARIES`
 * on the API — most of the company should not see what everybody else is
 * paid — so this is the same gate, moved to the front of the screen rather
 * than left for the first request to refuse. Connected, that makes it a
 * second lock on a door already locked. It earns its place in demo mode,
 * where every store answers regardless of role unless a screen asks:
 * previewing "Employee" under `/settings/roles` must not still show the
 * company's gross and net.
 */
export function PayrollScreen() {
  const canView = useCan("VIEW_SALARIES");
  const { runs, loading, error, connected } = usePayrollRuns();

  /**
   * Net pay per calendar month, with a hole where nothing was run.
   *
   * Built over a **continuous run of months** rather than over `runs`, which is
   * the whole point. `runs` holds only the periods somebody actually prepared,
   * so plotting it directly would put February next to April and draw a
   * straight line across March — a month that never happened, rendered as a
   * gentle trend. Walking the calendar from the earliest completed run to the
   * latest and looking each month up is what makes a missing month visible as a
   * missing month.
   *
   * Only APPROVED and PAID count. CANCELLED runs moved no money, and a DRAFT's
   * figures can still change while a trend line is read as history — either one
   * on this chart would be a number nobody could reconcile against the table
   * below it.
   */
  const { netByMonth, skippedMonths } = useMemo(() => {
    const done = new Map<string, number>();
    for (const run of runs) {
      if (run.status !== "APPROVED" && run.status !== "PAID") continue;
      /* Last one wins on a duplicated period — `runs` is newest-first, so the
         earlier assignment is the more recent run. */
      if (!done.has(run.period)) done.set(run.period, naira(run.netKobo));
    }
    if (done.size === 0) return { netByMonth: [], skippedMonths: 0 };

    const months = [...done.keys()].sort();
    const first = months[0] ?? "";
    const last = months[months.length - 1] ?? "";
    const step = (key: string): string => {
      const [y, m] = key.split("-").map(Number);
      const year = y ?? 0;
      const month = m ?? 1;
      return month === 12
        ? `${String(year + 1)}-01`
        : `${String(year)}-${String(month + 1).padStart(2, "0")}`;
    };

    const points: Point[] = [];
    let skipped = 0;
    /* Bounded by the span itself, and by a sanity ceiling so a malformed period
       string cannot spin here. */
    for (let key = first, guard = 0; guard < 120; key = step(key), guard += 1) {
      const value = done.get(key) ?? null;
      if (value === null) skipped += 1;
      points.push({ label: periodLabel(key), value });
      if (key === last) break;
    }
    return { netByMonth: points, skippedMonths: skipped };
  }, [runs]);
  const current = runs[0] ?? null;
  const detail = usePayrollRun(current?.id ?? null);

  const currentPeriod = TODAY.slice(0, 7);
  const hasCurrentPeriod = runs.some((run) => run.period === currentPeriod);
  const counts = countBySeverity(detail.run?.exceptions ?? []);

  if (!canView) {
    return (
      <>
        <PageHeader title="Payroll" />
        <PageBody>
          <EmptyState
            icon={<ShieldAlert aria-hidden="true" />}
            title="You cannot view payroll"
            description={
              "Seeing what the company pays needs the “View salaries” " +
              "permission. Ask somebody who holds it."
            }
          />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Payroll"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* Another month, and the reason this is a second control rather
                than a wider first one.

                The primary action carries `?period=`, which the wizard reads as
                "somebody came here to look at a run that already exists" and so
                opens on the Check step — past the month picker. That is right
                for the ordinary case and it means the picker cannot be reached
                from this screen at all: every route out of here named this
                month, so next month's payroll looked like something the product
                could not do.

                No `?period=`, so the wizard opens on Period with the month
                stepper on it. */}
            {hasCurrentPeriod && (
              <ButtonLink href="/payroll/runs/new" variant="secondary" size="sm">
                <CalendarClock aria-hidden="true" className="size-3.5" />
                Another month
              </ButtonLink>
            )}
            <ButtonLink
              href={
                hasCurrentPeriod
                  ? `/payroll/runs/new?period=${currentPeriod}`
                  : "/payroll/runs/new"
              }
              variant="accent"
              size="sm"
            >
              <Play aria-hidden="true" className="size-3.5" />
              {hasCurrentPeriod ? "Open this month's payroll" : "Run payroll"}
            </ButtonLink>
          </div>
        }
      />

      <PageBody className="flex flex-col gap-6">
        <SourceBadge connected={connected} loading={loading} error={error} />

        {error && <LoadFailure subject="payroll" error={error} />}

        {/* An error is not an empty state. "No run yet" beside "you need
            VIEW_SALARIES" tells somebody to prepare a run they would not be
            allowed to see, which is two wrong answers rather than one. */}
        {!loading && !error && runs.length === 0 ? (
          <EmptyState
            icon={<CalendarClock aria-hidden="true" />}
            title={`No payroll run for ${periodLabel(currentPeriod)} yet`}
            description="Running payroll works out everybody's pay and lists anything wrong with their records. It pays nobody, and you can do it as many times as you like."
            action={
              <ButtonLink href="/payroll/runs/new" variant="accent">
                <Play aria-hidden="true" className="size-4" />
                Prepare {periodLabel(currentPeriod)} payroll
              </ButtonLink>
            }
          />
        ) : (
          current && (
            <>
              <Card>
                <CardHeader
                  title={`${periodLabel(current.period)} payroll`}
                  description={`Pays ${current.payDate}. ${
                    current.status === "APPROVED" || current.status === "PAID"
                      ? "Approved — the figures on it are frozen."
                      : "Not approved yet. Nothing has been paid and nothing has been settled."
                  }`}
                  action={<RunStatusBadge status={current.status} />}
                />
                <CardBody className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Stat
                    label="People paid"
                    /* Not `employeeCount` on its own. That figure is payslips,
                       which is the right answer to "how many were paid" and a
                       wrong claim under this label the moment somebody has been
                       left off — nine, where ten people work, is the same class
                       of statement as a zero standing in for an absent figure. */
                    value={headcountLabel(current)}
                    hint={
                      current.excludedCount > 0
                        ? `${current.excludedCount} left off with a reason recorded`
                        : undefined
                    }
                  />
                  <Stat
                    label="Stops payroll"
                    value={String(counts.blockers)}
                    hint={counts.blockers === 0 ? "Nothing" : "Fix these first"}
                  />
                  <Stat
                    label="Worth a look"
                    value={String(counts.warnings)}
                    hint="Does not stop payroll"
                  />
                  <Stat
                    label="Pays on"
                    value={current.payDate}
                    hint={current.label ?? undefined}
                  />
                </CardBody>
              </Card>

              {/* One line, not the full list — the run itself is where each
                  exception is read and fixed, and the stat cards above
                  already carry the counts. Repeating every row here, in the
                  same red-bordered shape the run uses, read as a wall of
                  errors rather than a summary of one. */}
              {detail.run && detail.run.exceptions.length > 0 && (
                <Callout tone={counts.blockers > 0 ? "danger" : "warning"}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span>
                      {counts.blockers > 0
                        ? `${counts.blockers} ${counts.blockers === 1 ? "thing" : "things"} to fix before this can be approved${counts.warnings > 0 ? `, ${counts.warnings} more worth a look` : ""}.`
                        : `${counts.warnings} ${counts.warnings === 1 ? "thing" : "things"} worth a look before approving. Nothing stops the run.`}
                    </span>
                    <ButtonLink
                      href={`/payroll/runs/new?period=${current.period}`}
                      size="sm"
                      variant={counts.blockers > 0 ? "accent" : "secondary"}
                    >
                      Open the run
                    </ButtonLink>
                  </div>
                </Callout>
              )}

              <TotalsPanel run={current} />
            </>
          )
        )}

        {/* ---- What payroll has cost, month by month ---------------------
            The table below carries up to 24 periods and answers "did this
            month jump?" only by reading two rows and subtracting. This is the
            same figures as a shape.

            Three rules, and each one is a claim avoided:

            - **A month with no run is a gap, not a zero.** A period nobody ran
              is simply absent from `runs`; drawing it at the axis would say the
              company paid nothing that month, and spacing by array index would
              quietly redraw the calendar so August touched June. `Point.value`
              is null and `AreaChart` breaks its line there.
            - **CANCELLED runs are excluded.** They are in this list and they
              moved no money.
            - **DRAFT is excluded too.** Those figures can still change, and a
              trend line is read as history. */}
        {netByMonth.length > 1 && (
          <Card>
            <CardHeader
              title="Net paid, month by month"
              description={
                skippedMonths > 0
                  ? `${String(skippedMonths)} ${skippedMonths === 1 ? "month has" : "months have"} no completed run and ${skippedMonths === 1 ? "is" : "are"} left blank rather than drawn as nothing paid.`
                  : "Every month with a completed run."
              }
            />
            <CardBody>
              <AreaChart
                height={160}
                points={netByMonth}
                format={(n) =>
                  `₦${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                }
                caption="Net pay by month, over the runs that were approved or paid"
              />
            </CardBody>
          </Card>
        )}

        {runs.length > 0 && (
          <Card>
            <CardHeader
              title="Every run"
              action={
                <Badge tone="neutral" size="sm">
                  {runs.length} {runs.length === 1 ? "period" : "periods"}
                </Badge>
              }
            />
            <TableWrap className="rounded-none border-0">
              <THead>
                <TH>Period</TH>
                <TH align="right">People</TH>
                <TH align="right">Gross</TH>
                <TH align="right">Net paid out</TH>
                <TH>Status</TH>
                <TH>Pays</TH>
              </THead>
              <TBody>
                {runs.map((run) => (
                  <TR key={run.id}>
                    <TDPrimary
                      title={
                        <Link
                          href={`/payroll/runs/new?period=${run.period}`}
                          className="hover:text-accent-text hover:underline underline-offset-4"
                        >
                          {periodLabel(run.period)}
                        </Link>
                      }
                      subtitle={run.label ?? undefined}
                    />
                    <TD align="right" className="tabular">
                      {/* Two lines rather than one long string: a numeric column
                          has to stay scannable, and "9" alone beside a company
                          of ten is the claim this whole field exists to stop. */}
                      {run.excludedCount > 0 ? (
                        <>
                          {run.employeeCount} of{" "}
                          {run.employeeCount + run.excludedCount}
                          <span className="mt-0.5 block text-meta font-normal text-warning-text">
                            {run.excludedCount} excluded
                          </span>
                        </>
                      ) : (
                        run.employeeCount
                      )}
                    </TD>
                    <TD align="right">
                      <Money amount={naira(run.grossKobo)} decimals />
                    </TD>
                    <TD align="right">
                      <Money amount={naira(run.netKobo)} decimals />
                    </TD>
                    <TD>
                      <RunStatusBadge status={run.status} />
                    </TD>
                    <TD className="tabular text-muted">{run.payDate}</TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          </Card>
        )}

        {!connected && (
          <p className="flex items-start gap-2 text-meta leading-relaxed text-muted">
            <Receipt aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            <span>
              These figures are illustrative. Nothing in this browser computes
              PAYE — they were produced by the payroll engine on the API for the
              demo salaries and are fixed, so a demo run shows salary, statutory
              deductions and any scheduled repayment and nothing else.
              Allowances, loans and expense claims come from the database, and a
              real run computes every figure live.
            </span>
          </p>
        )}
      </PageBody>
    </>
  );
}
