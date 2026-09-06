"use client";

import { useState } from "react";
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
  Money,
  Pagination,
  SegmentedControl,
  Select,
  SortableTH,
  Stat,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  type AppliedFilter,
  type BadgeTone,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import {
  RunStatusBadge,
  SourceBadge,
  TotalRow,
} from "@/components/payroll/run-panels";
import {
  STATUS_LABEL,
  excludedNote,
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
      <p className="px-1 text-body-sm text-muted">Finding your payslips…</p>
    );
  }

  return permissions.has("VIEW_SALARIES") ? <PayslipIndex /> : <MyPayslipIndex />;
}

function PayslipIndex() {
  const { runs, loading, error, connected } = usePayrollRuns();
  const [chosen, setChosen] = useState<string | null>(null);

  const list = useListQuery<Filters>({ filters: { delivery: "" }, pageSize: 25 });

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
      ? { sort: list.sort as NonNullable<Parameters<typeof useRunPayslips>[1]>["sort"] }
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
              DELIVERY_FILTERS.find(([value]) => value === list.filters.delivery)?.[1] ??
              list.filters.delivery,
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

  if (!loading && runs.length === 0) {
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
        <LoadFailure subject="payslips" error={(error ?? page.error)!} />
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <div className="flex flex-col gap-4">
          <Field label="Which month" className="max-w-sm">
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
                  {periodLabel(option.period)} — {STATUS_LABEL[option.status]}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Stat
              label="Payslips"
              /**
               * The count of payslips, and the headcount they cover.
               *
               * This is the screen where a bare figure misleads most: somebody
               * checking that everybody got their payslip counts the rows and
               * stops. Nine rows for a company of ten is not an error to find
               * later — it is the answer to a different question.
               */
              value={run ? headcountLabel(run) : "—"}
              {...(run && run.excludedCount > 0
                ? { hint: `${run.excludedCount} excluded from this payroll` }
                : {})}
            />
            <Stat
              label="Not sent"
              /* The server's count across the whole run, not this page's. */
              value={counts === undefined ? "—" : String(counts.notSent)}
              {...(counts === undefined
                ? {}
                : {
                    hint:
                      counts.notSent === 0 ? "All sent" : "Nobody has these yet",
                  })}
            />
            <Stat
              label="Opened"
              value={
                counts === undefined || inRun === undefined
                  ? "—"
                  : `${counts.opened} of ${inRun}`
              }
              icon={<Mail aria-hidden="true" />}
            />
          </div>
        </div>

        {run && (
          <Card>
            <CardHeader
              title={periodLabel(run.period)}
              action={<RunStatusBadge status={run.status} />}
            />
            <CardBody className="flex flex-col gap-3">
              {excludedNote(run) && (
                <p className="text-meta leading-relaxed text-warning-text">
                  {excludedNote(run)}
                </p>
              )}
              {/* `run-panels.tsx` already labels this same field "Net to
                  employees" under "What leaves the account" — future tense,
                  because on an approved run the money has not moved. */}
              <TotalRow label="Net to employees" kobo={run.netKobo} strong />
              <TotalRow label="Gross" kobo={run.grossKobo} />
              <div className="flex items-center justify-between gap-3 border-t border-line pt-3 text-body-sm">
                <span className="text-muted">Pays on</span>
                <span className="font-medium text-ink">{run.payDate}</span>
              </div>
            </CardBody>
          </Card>
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
          description={
            run
              ? `${periodLabel(run.period)} · pays ${run.payDate}`
              : "Pick a month above."
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
            sort={
              <SegmentedControl
                label="Delivery"
                value={list.filters.delivery}
                onChange={(value) => list.setFilter("delivery", value)}
                options={DELIVERY_FILTERS.map(([value, text]) => ({
                  value,
                  label:
                    counts === undefined || value === ""
                      ? text
                      : `${text} (${counts[deliveryKey(value)]})`,
                }))}
              />
            }
          />
        </CardBody>

        {page.payslips.length === 0 && !page.loading ? (
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
                      <TD className="tabular text-muted">{stamp(slip.emailedAt)}</TD>
                      <TD className="tabular text-muted">{stamp(slip.viewedAt)}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </TableWrap>

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
        &ldquo;Opened&rdquo; means somebody opened the payslip in ApproveHR, not that they read the email. A payslip can also be opened and printed
        from its own page.
      </p>
    </div>
  );
}

/** The filter value, as the key its count lives under. */
const deliveryKey = (value: string): "notSent" | "sent" | "opened" =>
  value === "not_sent" ? "notSent" : value === "sent" ? "sent" : "opened";
