"use client";

import Link from "next/link";
import { ArrowRight, CalendarClock, Play, Receipt } from "lucide-react";
import {
  Badge,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Callout,
  EmptyState,
  Stat,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import {
  ExceptionList,
  RunStatusBadge,
  SourceBadge,
  TotalsPanel,
} from "@/components/payroll/run-panels";
import { formatKobo, periodLabel } from "@/lib/api/payroll";
import { countBySeverity, usePayrollRun, usePayrollRuns } from "@/lib/store/payroll";
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
 */
export function PayrollScreen() {
  const { runs, loading, error, connected } = usePayrollRuns();
  const current = runs[0] ?? null;
  const detail = usePayrollRun(current?.id ?? null);

  const currentPeriod = TODAY.slice(0, 7);
  const hasCurrentPeriod = runs.some((run) => run.period === currentPeriod);
  const counts = countBySeverity(detail.run?.exceptions ?? []);

  return (
    <>
      <PageHeader
        title="Payroll"
        description="Runs, what each one owes, and anything that would make it wrong."
        action={
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
        }
      />

      <PageBody className="flex flex-col gap-6">
        <SourceBadge connected={connected} loading={loading} error={error} />

        {error && (
          <Callout tone="danger" title="Could not load payroll">
            {error.message}
          </Callout>
        )}

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
                    value={String(current.employeeCount)}
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

              {detail.run && detail.run.exceptions.length > 0 && (
                <ExceptionList
                  exceptions={detail.run.exceptions}
                  onRecheck={
                    <ButtonLink
                      href={`/payroll/runs/new?period=${current.period}`}
                      size="sm"
                      variant="secondary"
                    >
                      Open the run
                    </ButtonLink>
                  }
                />
              )}

              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
                <TotalsPanel run={current} />

                <Card>
                  <CardHeader title="Next" />
                  <CardBody className="flex flex-col gap-2.5">
                    {[
                      {
                        href: "/payroll/payslips",
                        label: "Payslips",
                        meta: `${current.employeeCount} for ${periodLabel(current.period)}`,
                      },
                      {
                        href: "/payroll/statutory",
                        label: "Statutory filings",
                        meta: "PAYE, pension, NHF",
                      },
                      {
                        href: "/payroll/pay-setup",
                        label: "Allowances and deductions",
                        meta: "What goes into a payroll",
                      },
                    ].map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center gap-2 rounded-md border border-line p-3 text-body-sm text-ink transition-colors hover:bg-canvas"
                      >
                        <span className="min-w-0 flex-1">{item.label}</span>
                        <span className="shrink-0 text-meta text-muted">
                          {item.meta}
                        </span>
                        <ArrowRight
                          aria-hidden="true"
                          className="size-3.5 shrink-0 text-faint"
                        />
                      </Link>
                    ))}
                  </CardBody>
                </Card>
              </div>
            </>
          )
        )}

        {runs.length > 0 && (
          <Card>
            <CardHeader
              title="Every run"
              description="Newest month first."
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
                      {run.employeeCount}
                    </TD>
                    <TD align="right" className="tabular text-body">
                      {formatKobo(run.grossKobo)}
                    </TD>
                    <TD align="right" className="tabular font-medium text-ink">
                      {formatKobo(run.netKobo)}
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
