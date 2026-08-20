"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Download, Mail, RefreshCw, Send } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  EmptyState,
  Money,
  SegmentedControl,
  Stat,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  useToast,
  type BadgeTone,
} from "@/components/ui";
import { calculatePayslip } from "@/lib/payroll/engine";
import { usePayrollSettings } from "@/lib/payroll/use-settings";
import { useEmployeeStore } from "@/lib/store/employees";
import {
  DISTRIBUTION,
  runPeopleFrom,
  SCHEDULED_DEDUCTIONS,
  type DeliveryState,
  type Distribution,
} from "@/lib/mock/payroll";

const STATE: Record<
  DeliveryState,
  { tone: BadgeTone; label: string; rank: number }
> = {
  /* rank orders the table so what needs a human sits at the top. */
  bounced: { tone: "danger", label: "Bounced", rank: 0 },
  no_email: { tone: "danger", label: "No email", rank: 1 },
  ready: { tone: "warning", label: "Not sent", rank: 2 },
  sent: { tone: "info", label: "Sent", rank: 3 },
  delivered: { tone: "info", label: "Delivered", rank: 4 },
  viewed: { tone: "success", label: "Viewed", rank: 5 },
};

type Filter = "all" | "attention" | "unsent" | "viewed";

export function PayslipIndex() {
  const { settings } = usePayrollSettings();
  /* Same live directory the run uses, so a payslip reflects an edited record. */
  const { directory } = useEmployeeStore();
  const people = useMemo(() => runPeopleFrom(directory), [directory]);
  const [dist, setDist] = useState<Distribution[]>(DISTRIBUTION);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const rows = useMemo(() => {
    return dist
      .map((d) => {
        const person = people.find((p) => p.id === d.employeeId)!;
        const scheduled = SCHEDULED_DEDUCTIONS.get(person.id);
        const slip = calculatePayslip(
          person.id,
          person.grossMonthly,
          {
            additions: 0,
            postTaxDeductions: scheduled?.amount ?? 0,
            unpaidDays: 0,
          },
          settings,
        );
        return { person, dist: d, slip };
      })
      .sort((a, b) => STATE[a.dist.state].rank - STATE[b.dist.state].rank);
  }, [dist, settings, people]);

  const counts = useMemo(() => {
    const c = { total: dist.length, needsAttention: 0, unsent: 0, viewed: 0 };
    for (const d of dist) {
      if (d.state === "bounced" || d.state === "no_email") c.needsAttention += 1;
      if (d.state === "ready") c.unsent += 1;
      if (d.state === "viewed") c.viewed += 1;
    }
    return c;
  }, [dist]);

  const filtered = rows.filter(({ dist: d }) => {
    if (filter === "attention")
      return d.state === "bounced" || d.state === "no_email";
    if (filter === "unsent") return d.state === "ready";
    if (filter === "viewed") return d.state === "viewed";
    return true;
  });

  /* Only rows that could actually be sent are selectable — selecting someone
     with no email address just to have the send fail is a trap. */
  const sendable = filtered.filter(
    ({ dist: d }) => d.state !== "no_email" && d.email,
  );
  const allSelected =
    sendable.length > 0 && sendable.every(({ person }) => selected.has(person.id));

  function toggleAll() {
    setSelected(
      allSelected ? new Set() : new Set(sendable.map(({ person }) => person.id)),
    );
  }

  function send(ids: string[]) {
    if (ids.length === 0) return;
    setBusy(true);
    setTimeout(() => {
      setDist((list) =>
        list.map((d) =>
          ids.includes(d.employeeId) && d.email
            ? { ...d, state: "sent", sentAt: "Just now", failureReason: undefined }
            : d,
        ),
      );
      setSelected(new Set());
      setBusy(false);
      toast.push({
        title: `${ids.length} payslip${ids.length > 1 ? "s" : ""} sent`,
        tone: "success",
        detail: "Delivery status updates as the mail server responds.",
      });
    }, 800);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Payslips" value={String(counts.total)} hint="August 2026" />
        <Stat
          label="Needs attention"
          value={String(counts.needsAttention)}
          icon={<AlertTriangle aria-hidden="true" />}
          trend={
            counts.needsAttention > 0
              ? { direction: "down", label: "Undelivered" }
              : undefined
          }
        />
        <Stat label="Not yet sent" value={String(counts.unsent)} />
        <Stat
          label="Opened"
          value={`${counts.viewed} of ${counts.total}`}
          hint={`${Math.round((counts.viewed / counts.total) * 100)}% of the team`}
        />
      </div>

      {counts.needsAttention > 0 && (
        <Callout
          tone="danger"
          title={`${counts.needsAttention} employees have not received their payslip`}
        >
          A payslip is an itemised statement each employee is entitled to. These
          did not arrive — fix the address or hand the slip over another way.
        </Callout>
      )}

      <Card>
        <CardHeader
          title="Distribution"
          description="August 2026 · paid 28 August"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl
                label="Filter"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: "All" },
                  { value: "attention", label: "Attention" },
                  { value: "unsent", label: "Unsent" },
                  { value: "viewed", label: "Opened" },
                ]}
              />
              <Button variant="secondary" size="sm">
                <Download aria-hidden="true" className="size-3.5" />
                Download all
              </Button>
            </div>
          }
        />

        {selected.size > 0 && (
          <CardBody className="flex flex-wrap items-center gap-3 border-b border-line bg-accent-soft">
            <p className="text-[0.875rem] text-accent-text">
              {selected.size} selected
            </p>
            <Button
              variant="accent"
              size="sm"
              loading={busy}
              onClick={() => send([...selected])}
            >
              <Send aria-hidden="true" className="size-3.5" />
              Send selected
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </CardBody>
        )}

        {filtered.length === 0 ? (
          <EmptyState
            compact
            icon={<Mail aria-hidden="true" />}
            title="Nothing in this view"
            description="Change the filter to see other payslips."
          />
        ) : (
          <TableWrap className="rounded-none border-0">
            <THead>
              <TH>
                <Checkbox
                  checked={allSelected}
                  onChange={toggleAll}
                  label=""
                  disabled={sendable.length === 0}
                />
              </TH>
              <TH>Employee</TH>
              <TH align="right">Net pay</TH>
              <TH>Status</TH>
              <TH>Sent</TH>
              <TH>Opened</TH>
              <TH align="right">Actions</TH>
            </THead>
            <TBody>
              {filtered.map(({ person, dist: d, slip }) => {
                const canSend = Boolean(d.email);
                const state = STATE[d.state];
                const problem = d.state === "bounced" || d.state === "no_email";

                return (
                  <TR
                    key={person.id}
                    className={problem ? "bg-danger-soft" : undefined}
                  >
                    <TD>
                      <Checkbox
                        checked={selected.has(person.id)}
                        disabled={!canSend}
                        label=""
                        onChange={(e) => {
                          const on = e.target.checked;
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (on) next.add(person.id);
                            else next.delete(person.id);
                            return next;
                          });
                        }}
                      />
                    </TD>
                    <TDPrimary
                      title={
                        <Link
                          href={`/payroll/payslips/${person.id}`}
                          className="hover:text-accent-text hover:underline underline-offset-4"
                        >
                          {person.name}
                        </Link>
                      }
                      subtitle={d.email ?? "No email address on record"}
                    />
                    <TD align="right" className="tabular font-medium text-ink">
                      <Money amount={Math.round(slip.netPay)} />
                    </TD>
                    <TD>
                      <Badge tone={state.tone} size="sm" dot>
                        {state.label}
                      </Badge>
                      {d.failureReason && (
                        <p className="mt-1 max-w-[15rem] text-[0.75rem] leading-snug text-danger-text">
                          {d.failureReason}
                        </p>
                      )}
                    </TD>
                    <TD className="tabular text-muted">{d.sentAt ?? "—"}</TD>
                    <TD className="tabular text-muted">{d.viewedAt ?? "—"}</TD>
                    <TD align="right">
                      <div className="flex justify-end gap-1.5">
                        {d.state === "bounced" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => send([person.id])}
                          >
                            <RefreshCw aria-hidden="true" className="size-3.5" />
                            Retry
                          </Button>
                        )}
                        {d.state === "no_email" && (
                          <ButtonLink
                            href={`/people/${person.id}`}
                            size="sm"
                            variant="secondary"
                          >
                            Add email
                          </ButtonLink>
                        )}
                        {d.state === "ready" && (
                          <Button
                            size="sm"
                            variant="accent"
                            onClick={() => send([person.id])}
                          >
                            <Send aria-hidden="true" className="size-3.5" />
                            Send
                          </Button>
                        )}
                        <ButtonLink
                          href={`/payroll/payslips/${person.id}`}
                          size="sm"
                          variant="ghost"
                        >
                          View
                        </ButtonLink>
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </TableWrap>
        )}
      </Card>

      <p className={cn("text-[0.75rem] leading-relaxed text-muted")}>
        Opened is tracked by a pixel in the email and is indicative only — some
        mail clients block it, so a payslip can be read without registering
        here. Delivery is the figure to rely on.
      </p>
    </div>
  );
}
