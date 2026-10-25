"use client";

import { useState } from "react";
import { payslipsCsv } from "@/lib/api/exports";
import { useCan } from "@/lib/permissions";
import { ExportButton } from "@/components/portal/export-button";
import Link from "next/link";
import { CalendarClock, Mail } from "lucide-react";
import {
  Badge,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  FilterBar,
  LoadState,
  Money,
  Pagination,
  Select,
  SortableTH,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  loadPhase,
  type AppliedFilter,
  type BadgeTone,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { RunStatusBadge, SourceBadge } from "@/components/payroll/run-panels";
import {
  STATUS_LABEL,
  headcountLabel,
  naira,
  periodLabel,
  type PayslipDelivery,
} from "@/lib/api/payroll";
import {
  deliveryOf,
  usePayrollRuns,
  useRunPayslips,
} from "@/lib/store/payroll";
import { useListQuery } from "@/lib/use-list-query";
import { SendPayslips } from "./send-panel";
import { usePermissions } from "@/lib/permissions";
import { MyPayslipIndex } from "./my-payslip-index";

/**
 * Payslips for one run, and whether each one reached the person.
 *
 * ## Delivery has three states, not six
 *
 * This screen used to show `bounced` and `no email address` alongside sent and
 * opened, driven by a hand-written fixture. The product does not track either:
 * `Payslip` carries `publishedAt`, `emailedAt` and `viewedAt` and nothing else.
 * Showing a bounce reason the database has no column for taught the demo
 * audience something untrue about what they were buying, so the states are now
 * the three the schema actually supports.
 *
 * ## And there is no send button
 *
 * Emailing a payslip needs a mail transport, and nothing has one — the backend
 * is explicit that a capability with no credential **refuses** rather than
 * returning something that looks like success. A green "Sent" that emailed
 * nobody is the worst thing this screen could do, so the action is absent and
 * the reason is one line rather than a paragraph.
 *
 * Opening a payslip and printing it does work, in both modes, and that is the
 * route out today.
 */

const DELIVERY: Record<PayslipDelivery, { tone: BadgeTone; label: string }> = {
  not_sent: { tone: "warning", label: "Not sent" },
  sent: { tone: "info", label: "Sent" },
  opened: { tone: "success", label: "Opened" },
};

const stamp = (value: string | null) => (value ? value.slice(0, 10) : "—");

/** What the delivery filter offers. `""` is "do not filter on it". */
const DELIVERY_FILTERS = [
  ["", "Everyone"],
  ["not_sent", "Not sent"],
  ["sent", "Sent, not opened"],
  ["opened", "Opened"],
] as const;

type Filters = { delivery: string };

/**
 * ## What this screen stopped doing
 *
 * It read the whole run — `usePayrollRun`, which nests every payslip with every
 * itemised line — then sorted that array, filtered it, and put three counts
 * above it. Two consequences, both invisible on a company of ten:
 *
 * - **The response.** Two thousand payslips with their lines is megabytes, on a
 *   screen that shows twenty-five rows.
 * - **The counts.** `payslips.filter(…).length` is the array in hand. On one page
 *   of a large run, "Not sent: 0" meant "none of these twenty-five", and the
 *   figure sat in a `Stat` card labelled *Not sent* with nothing to say otherwise.
 *
 * `useRunPayslips` pages it, and the API returns the three delivery counts in the
 * envelope so each one is a `count` query over the whole run. The run's own
 * totals come from the **list** response, which already carries every headline
 * figure this screen renders — so the nested read is not made at all.
 */
/**
 * Routes to the company register or to "your payslips", by permission.
 *
 * `VIEW_SALARIES` is what the register's own endpoints require — see
 * `PayslipIndex` below — so it is the same test here, rather than a second
 * opinion the two could someday disagree with. Waits out `loading` first: a
 * payroll officer's screen deciding "not privileged" before their permissions
 * have arrived would flash the wrong page.
 */
export function PayslipRoute() {
  const { permissions, loading } = usePermissions();

  if (loading) {
    return (
      <LoadState loading error={null} subject="your payslips" skeleton="page">
        {null}
      </LoadState>
    );
  }

  return permissions.has("VIEW_SALARIES") ? (
    <PayslipIndex />
  ) : (
    <MyPayslipIndex />
  );
}

function PayslipIndex() {
  const runsState = usePayrollRuns();
  const { runs, loading, error, connected } = runsState;
  /* Both, matching the API's own gate exactly. `EXPORT_DATA` alone gets the
     staff register; a payslip file is money and needs the money permission
     too. */
  /* Two calls on their own lines, then combined. `useCan(a) && useCan(b)`
     short-circuits, which makes the second one a conditional hook — the rule
     exists because on the render where the first is false React sees a
     different hook order. Caught by eslint rather than by a symptom. */
  const mayExport = useCan("EXPORT_DATA");
  const maySeePay = useCan("VIEW_SALARIES");
  const mayExportPay = mayExport && maySeePay;
  const [chosen, setChosen] = useState<string | null>(null);

  const list = useListQuery<Filters>({
    filters: { delivery: "" },
    pageSize: 25,
  });

  /* Derived rather than stored: the newest run until somebody picks another,
     which needs no effect and cannot go stale when the list reloads. */
  const runId = chosen ?? runs[0]?.id ?? null;
  /* The run's headline figures come from the list, not from a second request.
     `PayrollRun` already carries the status, the totals, the pay date and the
     excluded count — everything the panel on the right renders. */
  const run = runs.find((option) => option.id === runId) ?? null;

  const page = useRunPayslips(runId, {
    page: list.page,
    pageSize: list.pageSize,
    ...(list.params.q ? { q: list.params.q } : {}),
    ...(list.filters.delivery
      ? { delivery: list.filters.delivery as PayslipDelivery }
      : {}),
    ...(list.sort
      ? {
          sort: list.sort as NonNullable<
            Parameters<typeof useRunPayslips>[1]
          >["sort"],
        }
      : {}),
    order: list.order,
  });

  const counts = page.counts;
  /* Every payslip on the run under the current search — the denominator the
     "Opened" card needs. Absent until the server has answered, because a
     confident "0 of 0" beside a request in flight is a claim. */
  const inRun =
    counts === undefined
      ? undefined
      : counts.notSent + counts.sent + counts.opened;

  const applied: AppliedFilter[] = [
    ...(list.filters.delivery
      ? [
          {
            label: "Delivery",
            value:
              DELIVERY_FILTERS.find(
                ([value]) => value === list.filters.delivery,
              )?.[1] ?? list.filters.delivery,
            onClear: () => list.setFilter("delivery", ""),
          },
        ]
      : []),
    ...(list.params.q
      ? [
          {
            label: "Search",
            value: list.params.q,
            onClear: () => list.setSearch(""),
          },
        ]
      : []),
  ];

  /* The read that says which months exist. Until it has answered there is no
     run to ask about, and `page` below is idle — so "nothing here" would be the
     answer to a question nobody had asked yet. After a failure the same
     emptiness would carry a Run payroll button. Neither is said. */
  const { reload } = runsState;
  const phase = loadPhase({ loading, error, hasData: runs.length > 0 });
  if (phase !== "ready") {
    return (
      <LoadState
        loading={loading}
        error={error}
        subject="the payslips"
        onRetry={reload}
        hasData={runs.length > 0}
      >
        {null}
      </LoadState>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <SourceBadge connected={connected} loading={loading} error={error} />
        <EmptyState
          icon={<CalendarClock aria-hidden="true" />}
          title="No payslips yet"
          /*
           * "Payslips are written when a period is prepared. Prepare one" was
           * three pieces of internal vocabulary in one sentence: `prepare` and
           * `period` are the engine's own words, and "a run" is a noun that no
           * first-time user has met. It also read as an instruction to do
           * something whose consequences were unstated — the reason somebody
           * hesitates over a payroll button is the fear that money moves.
           *
           * So: say what a payslip is, in whose words, and say what this does
           * not do.
           */
          description="Payslips are created when you run payroll for a month, one for each person. Nothing is paid until you approve it."
          action={
            <ButtonLink href="/payroll/runs/new" variant="accent">
              Run payroll
            </ButtonLink>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <SourceBadge
        connected={connected}
        loading={loading || page.loading}
        error={error ?? page.error}
      />

      {(error ?? page.error) && (
        <LoadFailure
          subject="payslips"
          error={(error ?? page.error)!}
          onRetry={page.error ? page.reload : reload}
        />
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Which month" className="w-72 max-w-full">
            <Select
              value={runId ?? ""}
              onChange={(event) => {
                setChosen(event.target.value);
                /* A different month is a different list. Page 4 of August is
                   not page 4 of September. */
                list.setPage(1);
              }}
            >
              {runs.map((option) => (
                <option key={option.id} value={option.id}>
                  {periodLabel(option.period)}, {STATUS_LABEL[option.status]}
                </option>
              ))}
            </Select>
          </Field>
          {run && (
            <span className="pb-2">
              <RunStatusBadge status={run.status} />
            </span>
          )}
        </div>

        {/* Both permissions, and only connected. A payslip file with the money
            columns blank is a list of names, so the API refuses it outright and
            the button is absent rather than present and refused. */}
        {run && connected && mayExportPay && (
          <ExportButton
            label="Download payslips"
            download={() => payslipsCsv(run.id, run.period.slice(0, 7))}
          />
        )}
      </div>

      {run && (
        <SendPayslips
          runId={run.id}
          approved={run.status === "APPROVED" || run.status === "PAID"}
          notSent={counts?.notSent}
          onSent={() => {
            /* The three delivery counts are the server's, over the whole run.
               Nothing here patches them — a send moves rows between the three
               states and the page they sit on, and a local adjustment would be
               a second answer to a question the API already answers. */
            page.reload();
          }}
        />
      )}

      <Card>
        <CardHeader
          title="Distribution"
          /* The three tiles that stood above the table are one hover away; the
             money stays on the table, where the rows add up to it. */
          mark={
            run
              ? [
                  `${headcountLabel(run)} on this payroll.`,
                  counts === undefined
                    ? null
                    : `${counts.notSent} not sent${
                        inRun === undefined
                          ? ""
                          : `, ${counts.opened} of ${inRun} opened`
                      }.`,
                  `Pays on ${run.payDate}.`,
                ]
              : null
          }
          action={
            run ? (
              <span className="text-body-sm text-muted">
                Net to employees{" "}
                <Money
                  amount={naira(run.netKobo)}
                  decimals
                  className="font-semibold text-ink"
                />
              </span>
            ) : null
          }
        />

        <CardBody>
          <FilterBar
            search={list.search}
            onSearchChange={list.setSearch}
            searchPlaceholder="Search a name or staff number"
            searchLabel="Search this month's payslips"
            applied={applied}
            onClearAll={list.clearFilters}
            count={page.total}
            noun={["payslip", "payslips"]}
          >
            <Field label="Delivery">
              <Select
                value={list.filters.delivery}
                onChange={(event) =>
                  list.setFilter(
                    "delivery",
                    event.target.value as typeof list.filters.delivery,
                  )
                }
              >
                {DELIVERY_FILTERS.map(([value, text]) => (
                  <option key={value} value={value}>
                    {counts === undefined || value === ""
                      ? text
                      : `${text} (${counts[deliveryKey(value)]})`}
                  </option>
                ))}
              </Select>
            </Field>
          </FilterBar>
        </CardBody>

        {page.error ? null : page.payslips.length === 0 && !page.loading ? (
          <EmptyState
            compact
            icon={<Mail aria-hidden="true" />}
            title={applied.length > 0 ? "Nothing matches" : "Nothing here"}
            description={
              applied.length > 0
                ? "Clear a filter to see the other payslips."
                : "This month has no payslips on it."
            }
          />
        ) : (
          <>
            <div className="hidden sm:block">
              <TableWrap className="rounded-none border-x-0 border-b-0">
                <THead>
                  <SortableTH
                    column="name"
                    active={list.sort}
                    order={list.order}
                    onSort={list.toggleSort}
                  >
                    Employee
                  </SortableTH>
                  <SortableTH
                    column="gross"
                    active={list.sort}
                    order={list.order}
                    onSort={list.toggleSort}
                    align="right"
                    startDescending
                  >
                    Gross
                  </SortableTH>
                  <SortableTH
                    column="net"
                    active={list.sort}
                    order={list.order}
                    onSort={list.toggleSort}
                    align="right"
                    startDescending
                  >
                    Net pay
                  </SortableTH>
                  <TH>Delivery</TH>
                  <SortableTH
                    column="emailedAt"
                    active={list.sort}
                    order={list.order}
                    onSort={list.toggleSort}
                  >
                    Sent
                  </SortableTH>
                  <SortableTH
                    column="viewedAt"
                    active={list.sort}
                    order={list.order}
                    onSort={list.toggleSort}
                  >
                    Opened
                  </SortableTH>
                </THead>
                <TBody>
                  {page.payslips.map((slip) => {
                    const state = DELIVERY[deliveryOf(slip)];
                    const href = `/payroll/payslips/${slip.id}${
                      run ? `?run=${run.id}` : ""
                    }`;
                    return (
                      /**
                       * The whole row opens the payslip, and it is still one
                       * link.
                       *
                       * There was an Open button in an Actions column — a
                       * seventh column, on every row, for the only thing this
                       * table does. The row is the target now.
                       *
                       * `after:absolute after:inset-0` stretches the name's
                       * existing link across the row rather than putting an
                       * `onClick` on the `<tr>`. That keeps everything a link
                       * gives free and a handler does not: middle-click and
                       * ⌘-click open a payslip in a new tab, the status bar
                       * shows where the row goes, Tab reaches it, and Enter
                       * follows it. A clickable `<tr>` would need `role`,
                       * `tabIndex` and a key handler to get halfway there.
                       *
                       * `relative` on the row is what the stretched link is
                       * measured against — without it the overlay would size
                       * itself to the nearest positioned ancestor, which is the
                       * whole table.
                       */
                      <TR key={slip.id} interactive className="relative">
                        <TDPrimary
                          title={
                            <Link
                              href={href}
                              className="after:absolute after:inset-0 hover:text-accent-text hover:underline underline-offset-4"
                            >
                              {slip.name}
                            </Link>
                          }
                          subtitle={slip.employeeNo}
                        />
                        <TD align="right">
                          <Money amount={naira(slip.grossKobo)} decimals />
                        </TD>
                        <TD align="right">
                          <Money amount={naira(slip.netKobo)} decimals />
                        </TD>
                        <TD>
                          <Badge tone={state.tone} size="sm" dot>
                            {state.label}
                          </Badge>
                        </TD>
                        <TD className="tabular text-muted">
                          {stamp(slip.emailedAt)}
                        </TD>
                        <TD className="tabular text-muted">
                          {stamp(slip.viewedAt)}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </TableWrap>
            </div>

            <ul className="divide-y divide-line sm:hidden">
              {page.payslips.map((slip) => {
                const state = DELIVERY[deliveryOf(slip)];
                const href = `/payroll/payslips/${slip.id}${
                  run ? `?run=${run.id}` : ""
                }`;
                return (
                  <li
                    key={slip.id}
                    className="relative flex flex-col gap-2 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={href}
                          className="text-body-sm font-medium text-ink after:absolute after:inset-0 hover:text-accent-text hover:underline underline-offset-4"
                        >
                          {slip.name}
                        </Link>
                        <p className="mt-0.5 text-meta text-muted">
                          {slip.employeeNo}
                        </p>
                      </div>
                      <Badge tone={state.tone} size="sm" dot>
                        {state.label}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-body-sm text-muted">Gross</span>
                      <span className="tabular text-body-sm text-body">
                        <Money amount={naira(slip.grossKobo)} decimals />
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-body-sm text-muted">Net pay</span>
                      <span className="tabular text-body-sm font-medium text-ink">
                        <Money amount={naira(slip.netKobo)} decimals />
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-muted">
                      <span>Sent {stamp(slip.emailedAt)}</span>
                      <span>Opened {stamp(slip.viewedAt)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>

            <Pagination
              page={list.page}
              pageSize={list.pageSize}
              total={page.total}
              onPageChange={list.setPage}
              onPageSizeChange={list.setPageSize}
              noun={["payslip", "payslips"]}
              loading={page.loading}
            />
          </>
        )}
      </Card>

      {/* This used to say payslips could not be emailed from here at all —
          "a Sent that emailed nobody would be worse than no button", which was
          exactly right while nothing wrote `emailedAt`. They can now, and a
          note saying otherwise directly under a Send button is the screen
          contradicting itself. What is left is the half that is still true and
          still asked. */}
      <p className="text-meta leading-relaxed text-muted">
        &ldquo;Sent&rdquo; means a mail provider accepted it, and
        &ldquo;Opened&rdquo; means somebody opened the payslip in ApproveHR, not
        that they read the email. A payslip can also be opened and printed from
        its own page.
      </p>
    </div>
  );
}

/** The filter value, as the key its count lives under. */
const deliveryKey = (value: string): "notSent" | "sent" | "opened" =>
  value === "not_sent" ? "notSent" : value === "sent" ? "sent" : "opened";
