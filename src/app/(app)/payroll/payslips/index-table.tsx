"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, Mail } from "lucide-react";
import {
  Badge,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  SegmentedControl,
  Select,
  Stat,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  type BadgeTone,
} from "@/components/ui";
import {
  RunStatusBadge,
  SourceBadge,
  TotalRow,
} from "@/components/payroll/run-panels";
import {
  STATUS_LABEL,
  formatKobo,
  periodLabel,
  type Payslip,
} from "@/lib/api/payroll";
import { usePayrollRun, usePayrollRuns } from "@/lib/store/payroll";

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

type DeliveryState = "not_sent" | "sent" | "opened";

const DELIVERY: Record<
  DeliveryState,
  { tone: BadgeTone; label: string; rank: number }
> = {
  /* Rank puts what needs a human at the top. */
  not_sent: { tone: "warning", label: "Not sent", rank: 0 },
  sent: { tone: "info", label: "Sent", rank: 1 },
  opened: { tone: "success", label: "Opened", rank: 2 },
};

const deliveryOf = (slip: Payslip): DeliveryState =>
  slip.viewedAt ? "opened" : slip.emailedAt ? "sent" : "not_sent";

const stamp = (value: string | null) => (value ? value.slice(0, 10) : "—");

type Filter = "all" | "not_sent" | "opened";

export function PayslipIndex() {
  const { runs, loading, error, connected } = usePayrollRuns();
  const [chosen, setChosen] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  /* Derived rather than stored: the newest run until somebody picks another,
     which needs no effect and cannot go stale when the list reloads. */
  const runId = chosen ?? runs[0]?.id ?? null;
  const detail = usePayrollRun(runId);
  const run = detail.run;

  const payslips = [...(run?.payslips ?? [])].sort(
    (a, b) =>
      DELIVERY[deliveryOf(a)].rank - DELIVERY[deliveryOf(b)].rank ||
      a.name.localeCompare(b.name),
  );

  const counts = {
    total: payslips.length,
    notSent: payslips.filter((s) => deliveryOf(s) === "not_sent").length,
    opened: payslips.filter((s) => deliveryOf(s) === "opened").length,
  };

  const visible = payslips.filter((slip) =>
    filter === "all" ? true : deliveryOf(slip) === filter,
  );

  if (!loading && runs.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <SourceBadge connected={connected} loading={loading} error={error} />
        <EmptyState
          icon={<CalendarClock aria-hidden="true" />}
          title="No payslips yet"
          description="Payslips are written when a period is prepared. Prepare one and they will appear here."
          action={
            <ButtonLink href="/payroll/runs/new" variant="accent">
              Prepare a run
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
        loading={loading || detail.loading}
        error={error ?? detail.error}
      />

      {error && (
        <Callout tone="danger" title="Could not load payslips">
          {error.message}
        </Callout>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <div className="flex flex-col gap-4">
          <Field label="Which run" className="max-w-sm">
            <Select
              value={runId ?? ""}
              onChange={(e) => setChosen(e.target.value)}
            >
              {runs.map((option) => (
                <option key={option.id} value={option.id}>
                  {periodLabel(option.period)} — {STATUS_LABEL[option.status]}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Payslips" value={String(counts.total)} />
            <Stat
              label="Not sent"
              value={String(counts.notSent)}
              hint={counts.notSent === 0 ? "All sent" : "Nobody has these yet"}
            />
            <Stat
              label="Opened"
              value={`${counts.opened} of ${counts.total}`}
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
              <TotalRow label="Net paid out" kobo={run.netKobo} strong />
              <TotalRow label="Gross" kobo={run.grossKobo} />
              <div className="flex items-center justify-between gap-3 border-t border-line pt-3 text-[0.875rem]">
                <span className="text-muted">Pays on</span>
                <span className="font-medium text-ink">{run.payDate}</span>
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader
          title="Distribution"
          description={
            run
              ? `${periodLabel(run.period)} · pays ${run.payDate}`
              : "Pick a run above."
          }
          action={
            <SegmentedControl
              label="Filter"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "not_sent", label: "Not sent" },
                { value: "opened", label: "Opened" },
              ]}
            />
          }
        />

        {visible.length === 0 ? (
          <EmptyState
            compact
            icon={<Mail aria-hidden="true" />}
            title="Nothing in this view"
            description="Change the filter to see the other payslips."
          />
        ) : (
          <TableWrap className="rounded-none border-0">
            <THead>
              <TH>Employee</TH>
              <TH align="right">Gross</TH>
              <TH align="right">Net pay</TH>
              <TH>Delivery</TH>
              <TH>Sent</TH>
              <TH>Opened</TH>
              <TH align="right">Actions</TH>
            </THead>
            <TBody>
              {visible.map((slip) => {
                const state = DELIVERY[deliveryOf(slip)];
                const href = `/payroll/payslips/${slip.id}${
                  run ? `?run=${run.id}` : ""
                }`;
                return (
                  <TR key={slip.id}>
                    <TDPrimary
                      title={
                        <Link
                          href={href}
                          className="hover:text-accent-text hover:underline underline-offset-4"
                        >
                          {slip.name}
                        </Link>
                      }
                      subtitle={slip.employeeNo}
                    />
                    <TD align="right" className="tabular text-body">
                      {formatKobo(slip.grossKobo)}
                    </TD>
                    <TD align="right" className="tabular font-medium text-ink">
                      {formatKobo(slip.netKobo)}
                    </TD>
                    <TD>
                      <Badge tone={state.tone} size="sm" dot>
                        {state.label}
                      </Badge>
                    </TD>
                    <TD className="tabular text-muted">{stamp(slip.emailedAt)}</TD>
                    <TD className="tabular text-muted">{stamp(slip.viewedAt)}</TD>
                    <TD align="right">
                      <ButtonLink href={href} size="sm" variant="secondary">
                        Open
                      </ButtonLink>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </TableWrap>
        )}
      </Card>

      <p className="text-[0.75rem] leading-relaxed text-muted">
        Payslips are not emailed from here yet — nothing is connected to a mail
        server, and a &ldquo;Sent&rdquo; that emailed nobody would be worse than
        no button. Open a payslip and print it in the meantime.
      </p>
    </div>
  );
}
