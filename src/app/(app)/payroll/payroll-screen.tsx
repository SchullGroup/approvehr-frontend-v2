"use client";

import { formatMoney } from "@/components/ui/money-format";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarClock, Play, Receipt, ShieldAlert } from "lucide-react";
import type { Point } from "@/components/ui";
import {
  AreaChart,
  Badge,
  ButtonLink,
  AttentionMark,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Money,
  Skeleton,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  TextLink,
  rowClick,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { NOTICE_LINK } from "@/components/portal/notice-line";
import { PageBody, PageHeader } from "@/components/portal/shell";
import {
  RunStatusBadge,
  SourceBadge,
  TotalsPanel,
} from "@/components/payroll/run-panels";
import {
  formatKobo,
  headcountLabel,
  naira,
  paidPeopleLabel,
  periodLabel,
  type PayrollRun,
} from "@/lib/api/payroll";
import { useCan } from "@/lib/permissions";
import { usePayrollSettings } from "@/lib/payroll/use-settings";
import {
  countBySeverity,
  usePayrollRun,
  usePayrollRuns,
} from "@/lib/store/payroll";
import { useOrgTimezone } from "@/lib/store/session";
import { TODAY } from "@/lib/today";
import { formatDay, todayIn } from "@/lib/time";

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
  const router = useRouter();
  const canView = useCan("VIEW_SALARIES");
  const { runs, loading, error, connected } = usePayrollRuns();
  const timeZone = useOrgTimezone();

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
  /* Which way this company pays decides what "still to go out" asks of it. The
     settings are read with the default (the wallet) until they land, so a bank
     company's strip can change its wording once; the runs it sits under load at
     the same moment, which keeps that to a blink at most. */
  const { settings: paySettings, loading: paySettingsLoading } =
    usePayrollSettings();
  const bankFile = !paySettingsLoading && !paySettings.payout.wallet;
  /* Every approved run, not just the newest. `runs` is newest first, and PAID is
     only reachable through a completed payment batch, so APPROVED is exactly
     "nothing records that this was paid". */
  const unpaid = runs.filter((run) => run.status === "APPROVED");

  /* `TODAY` is pinned to the demo dataset's day, not a question about a real
     company's calendar — same reasoning `periodStanding` in the run wizard
     gives for reading the company's own clock instead. Connected, the
     company's clock decides what "no run yet" means; demo mode keeps the
     fixture's own day so the seed stays coherent. */
  const currentPeriod = connected
    ? todayIn(timeZone).slice(0, 7)
    : TODAY.slice(0, 7);
  const hasCurrentPeriod = runs.some((run) => run.period === currentPeriod);
  const counts = countBySeverity(detail.run?.exceptions ?? []);

  if (!canView) {
    return (
      <>
        <PageHeader title="Payroll" />
        <PageBody>
          <EmptyState
            plain
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
              <ButtonLink
                href="/payroll/runs/new"
                variant="secondary"
                size="sm"
              >
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

        {/* Shape-matched, same pattern as record-history.tsx. `SourceBadge`
            above already says "Loading…" in words, but that is easy to miss
            above blank space — this is what fills the gap while `current`
            is still null. */}
        {loading && !error && runs.length === 0 ? (
          <Card>
            <CardBody className="flex flex-col gap-2">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-10 w-full" />
              <span className="sr-only">Loading this period’s payroll</span>
            </CardBody>
          </Card>
        ) : /* An error is not an empty state. "No run yet" beside "you need
            VIEW_SALARIES" tells somebody to prepare a run they would not be
            allowed to see, which is two wrong answers rather than one. */
        !loading && !error && runs.length === 0 ? (
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
              {/* One heading, one status. Everything the four tiles and the
                  strip under them used to say is one hover away on the mark,
                  and the run itself is where each exception is read and fixed. */}
              <Card>
                <CardHeader
                  title={`${periodLabel(current.period)} payroll`}
                  mark={[
                    `Pays ${formatDay(current.payDate)}. ${
                      current.status === "PAID"
                        ? "Paid. The money has left the account."
                        : current.status === "APPROVED"
                          ? "Approved and frozen. Nobody has been paid yet."
                          : "Not approved yet. Nothing has been paid and nothing has been settled."
                    }`,
                    `${headcountLabel(current)} on this payroll${
                      current.excludedCount > 0
                        ? `, ${current.excludedCount} left off with a reason recorded`
                        : ""
                    }.`,
                    detail.run &&
                    detail.run.exceptions.length > 0 &&
                    current.status !== "APPROVED" &&
                    current.status !== "PAID"
                      ? counts.blockers > 0
                        ? `${counts.blockers} ${counts.blockers === 1 ? "thing" : "things"} to fix before this can be approved${counts.warnings > 0 ? `, ${counts.warnings} more worth a look` : ""}.`
                        : `${counts.warnings} ${counts.warnings === 1 ? "thing" : "things"} worth a look before approving. Nothing stops the run.`
                      : null,
                  ]}
                  action={
                    <span className="flex items-center gap-4">
                      <RunStatusBadge status={current.status} />
                      {current.status !== "APPROVED" &&
                        current.status !== "PAID" && (
                          <Link
                            href={`/payroll/runs/new?period=${current.period}`}
                            className={NOTICE_LINK}
                          >
                            Open the run
                          </Link>
                        )}
                    </span>
                  }
                />
              </Card>

              {/* The last thing anybody does, and the easiest to forget.
                  -------------------------------------------------------
                  Approving is a decision with a satisfying click at the end
                  of it, and it moves no money. Somebody approves on the 25th,
                  is pulled into something else, and nothing on the screen
                  they open every morning says that thirty people are still
                  waiting — because until `PayrollRunStatus.PAID` could be
                  reached, there was no fact to render.

                  Every approved run that nobody has recorded as paid, not only
                  the newest. The strip used to read `runs[0]`, so a month
                  prepared after an unpaid one hid it, and an unpaid run was
                  one more thing nobody was told about.

                  Withheld once a run is paid, rather than turned green: a
                  finished thing does not need a card, and the header above
                  already says so. */}
              {unpaid.length > 0 && (
                <UnpaidRuns
                  runs={unpaid}
                  currentId={current.id}
                  bankFile={bankFile}
                />
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
                format={(n) => formatMoney(n, "NGN", { decimals: true })}
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
            <div className="hidden sm:block">
              <TableWrap className="rounded-none border-0">
                <THead>
                  <TH>Period</TH>
                  <TH align="right">People</TH>
                  <TH align="right">Gross</TH>
                  {/* The column spans runs of every status, most of which have
                      paid nobody. */}
                  <TH align="right">Net</TH>
                  <TH>Status</TH>
                  <TH>Pays</TH>
                </THead>
                <TBody>
                  {runs.map((run) => (
                    <TR
                      key={run.id}
                      interactive
                      onClick={rowClick(() =>
                        router.push(`/payroll/runs/new?period=${run.period}`),
                      )}
                    >
                      <TDPrimary
                        title={
                          <TextLink
                            href={`/payroll/runs/new?period=${run.period}`}
                          >
                            {periodLabel(run.period)}
                          </TextLink>
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
                      <TD className="tabular text-muted">
                        {formatDay(run.payDate)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </TableWrap>
            </div>

            <ul className="divide-y divide-line sm:hidden">
              {runs.map((run) => (
                <li
                  key={run.id}
                  onClick={rowClick(() =>
                    router.push(`/payroll/runs/new?period=${run.period}`),
                  )}
                  className="flex flex-col gap-2 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <TextLink href={`/payroll/runs/new?period=${run.period}`}>
                        {periodLabel(run.period)}
                      </TextLink>
                      {run.label && (
                        <p className="text-body-sm text-muted">{run.label}</p>
                      )}
                    </div>
                    <RunStatusBadge status={run.status} />
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-muted">
                    <span className="tabular">
                      {run.excludedCount > 0
                        ? `${run.employeeCount} of ${run.employeeCount + run.excludedCount} people`
                        : `${run.employeeCount} people`}
                    </span>
                    {run.excludedCount > 0 && (
                      <span className="tabular text-warning-text">
                        {run.excludedCount} excluded
                      </span>
                    )}
                    <span className="tabular">{formatDay(run.payDate)}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm">
                    <span className="tabular text-ink">
                      Gross <Money amount={naira(run.grossKobo)} decimals />
                    </span>
                    <span className="tabular font-medium text-ink">
                      Net <Money amount={naira(run.netKobo)} decimals />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {!connected && (
          <p className="flex items-start gap-2 text-meta leading-relaxed text-muted">
            <Receipt aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            <span>
              These figures are illustrative. Nothing in this browser computes
              PAYE: they were produced by the payroll engine on the API for the
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

/** How many older runs get a line each before the rest are only counted. */
const OLDER_UNPAID_SHOWN = 3;

/**
 * The approved runs nobody has recorded as paid.
 *
 * The newest is the strip this page has always had: the amount, one mark for
 * the rest of the sentence, and the one button. Every older one is a compact
 * line with the same button, named by its month because nothing above it says
 * which month it is.
 *
 * ## Why only three older ones get a line
 *
 * A run reached Paid only once somebody could record it, so a company that has
 * used the product for a year can hold a dozen old Approved runs whose money
 * left long ago. Twelve lines of "still to go out" above this month's payroll
 * would be a louder claim than anything here can back up. Three are shown and
 * the rest are counted, and all of them are in "Every run" below with their
 * status.
 *
 * ## What it says for a company that pays from its own bank
 *
 * "Still to go out" is a claim about money, and for that company nothing here
 * can see the bank. What is known is that the run is approved and that nobody
 * has recorded the bank paying it, so that is what the line says, and the button
 * opens the step where the file is downloaded and the payment recorded.
 */
function UnpaidRuns({
  runs,
  currentId,
  bankFile,
}: {
  runs: PayrollRun[];
  currentId: string;
  bankFile: boolean;
}) {
  const [newest, ...older] = runs;
  if (!newest) return null;
  const shown = older.slice(0, OLDER_UNPAID_SHOWN);
  const hidden = older.length - shown.length;

  return (
    <div className="flex flex-col gap-2">
      <UnpaidLine
        run={newest}
        named={newest.id !== currentId}
        bankFile={bankFile}
        primary
      />
      {shown.map((run) => (
        <UnpaidLine key={run.id} run={run} named bankFile={bankFile} />
      ))}
      {hidden > 0 && (
        <p className="text-body-sm text-muted">
          {hidden === 1
            ? "One more approved run has no record that it was paid. It is listed under Every run."
            : `${String(hidden)} more approved runs have no record that they were paid. They are listed under Every run.`}
        </p>
      )}
    </div>
  );
}

function UnpaidLine({
  run,
  named,
  bankFile,
  primary = false,
}: {
  run: PayrollRun;
  /** Said when the header above is about some other month. */
  named: boolean;
  bankFile: boolean;
  primary?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-body-sm text-muted">
      {/* `paidPeopleLabel`, never `headcountLabel`. The latter returns
          "9 of 10 \u2014 1 excluded", which inside a sentence reads as though the
          money were being split with somebody who is not being paid. The
          exclusion has its own line on the card above. */}
      <span className="font-medium text-ink">
        {named && (
          <>
            {periodLabel(run.period)}
            {run.label ? ` (${run.label})` : ""}
            {": "}
          </>
        )}
        {formatKobo(run.netKobo)}{" "}
        {bankFile ? "approved, not recorded as paid" : "still to go out"}
      </span>
      {primary && (
        <AttentionMark
          text={
            bankFile
              ? `Approved for ${paidPeopleLabel(run)}. Download the bank file for your bank, and once it has paid, record that here so the run is closed and everyone shows as paid.`
              : `Approved for ${paidPeopleLabel(run)} and not yet paid. Pay them from the wallet, or take the bank file to your bank.`
          }
        />
      )}
      <ButtonLink
        href={`/payroll/runs/new?period=${run.period}&step=approve`}
        size="sm"
        variant={primary ? "accent" : "secondary"}
      >
        {bankFile ? "Open the payment" : "Pay them"}
      </ButtonLink>
    </div>
  );
}
