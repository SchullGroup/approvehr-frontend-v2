"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  Banknote,
  CalendarDays,
  Check,
  ClipboardList,
  Clock,
  FileText,
  Receipt,
  Undo2,
  UserRoundPlus,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  EmptyState,
  Money,
  SegmentedControl,
  Stat,
  useToast,
  type BadgeTone,
} from "@/components/ui";
import {
  APPROVAL_LABEL,
  approvalRequester,
  type ApprovalItem,
  type ApprovalKind,
} from "@/lib/mock/workflows";
import { useApprovalStore } from "@/lib/store/approvals";
import { useLeaveStore } from "@/lib/store/leave";
import { buildApprovalQueue, decidedItems } from "@/lib/workflows/queue";

const ICON: Record<ApprovalKind, React.ReactNode> = {
  leave: <CalendarDays aria-hidden="true" />,
  payroll_run: <Banknote aria-hidden="true" />,
  offer: <BadgeCheck aria-hidden="true" />,
  requisition: <UserRoundPlus aria-hidden="true" />,
  expense: <Receipt aria-hidden="true" />,
  record_change: <FileText aria-hidden="true" />,
  loan: <ClipboardList aria-hidden="true" />,
};

const TONE: Record<ApprovalKind, BadgeTone> = {
  leave: "info",
  payroll_run: "accent",
  offer: "success",
  requisition: "warning",
  expense: "neutral",
  record_change: "neutral",
  loan: "warning",
};

type Filter = "all" | "money" | "people" | "overdue";

/**
 * The approval inbox.
 *
 * Ranking is the whole design. Anything with a stated deadline floats to the
 * top, then everything else by how long it has been waiting — not by module,
 * and not newest-first. An approver's real question is "what breaks if I do
 * nothing today", so the queue answers that before it answers anything else.
 */
export function ApprovalInbox() {
  const leave = useLeaveStore();
  const approvals = useApprovalStore();
  const [filter, setFilter] = useState<Filter>("all");
  const toast = useToast();

  /* Nothing about the queue is held here. Leave rows are derived from the leave
     requests themselves and every other row's decision lives in the approvals
     store, so this screen has no state of its own to fall out of step with
     /people/leave — which is exactly what used to happen. */
  const ranked = useMemo(
    () =>
      buildApprovalQueue({
        leaveRequests: leave.requests,
        decisions: approvals.decisions,
      }),
    [leave.requests, approvals.decisions],
  );

  const decided = useMemo(
    () =>
      decidedItems({
        leaveRequests: leave.requests,
        decisions: approvals.decisions,
      }),
    [leave.requests, approvals.decisions],
  );

  const pending = ranked;

  const filtered = ranked.filter((i) => {
    if (filter === "money") return i.amount !== undefined;
    if (filter === "people")
      return ["leave", "offer", "requisition", "record_change"].includes(i.kind);
    if (filter === "overdue") return i.waitingDays >= 5 || Boolean(i.deadline);
    return true;
  });

  const atStake = pending.reduce((sum, i) => sum + (i.amount ?? 0), 0);
  const overdue = pending.filter((i) => i.waitingDays >= 5).length;
  const withDeadline = pending.filter((i) => i.deadline).length;

  /**
   * One entry point for both kinds of row. A derived row writes through to the
   * record it represents; a seed row records its decision in the approvals
   * store. The caller does not need to know which it is holding.
   */
  function decide(item: ApprovalItem, decision: "approved" | "declined") {
    if (item.ref?.store === "leave") {
      leave.decide(
        item.ref.id,
        decision,
        decision === "declined" ? "Sent back from the approval inbox." : undefined,
      );
    } else {
      approvals.decide(item.id, decision);
    }
    toast.push({
      title:
        decision === "approved"
          ? `${item.title} approved`
          : `${item.title} sent back`,
      tone: decision === "approved" ? "success" : "info",
      detail:
        item.ref?.store === "leave"
          ? decision === "approved"
            ? "The leave request and their balance are updated."
            : "The request is back with them to revise."
          : decision === "approved"
            ? "The requester has been notified."
            : "The requester can revise and resubmit.",
    });
  }

  function reopen(item: ApprovalItem) {
    if (item.ref?.store === "leave") leave.reopen(item.ref.id);
    else approvals.reopen(item.id);
  }

  function reopenAll() {
    for (const { item } of decided) reopen(item);
    toast.push({
      title: "Decisions undone",
      tone: "info",
      detail: "Everything is back in the queue, and the records with it.",
    });
  }

  function approveAll() {
    const routine = filtered.filter((i) => !i.deadline && i.waitingDays < 5);
    if (routine.length === 0) return;

    /* Split by destination rather than looping one at a time, so the store
       commits once and the list does not re-rank between decisions. */
    for (const item of routine.filter((i) => i.ref?.store === "leave")) {
      leave.decide(item.ref!.id, "approved");
    }
    approvals.decideMany(
      routine.filter((i) => !i.ref).map((i) => i.id),
      "approved",
    );

    toast.push({
      title: `${routine.length} routine ${
        routine.length === 1 ? "request" : "requests"
      } approved`,
      tone: "success",
      detail: "Items with a deadline were left for you to review individually.",
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Waiting on you" value={String(pending.length)} />
        <Stat
          label="Value at stake"
          value={<Money amount={atStake} compact />}
          hint="across all decisions"
        />
        <Stat
          label="Has a deadline"
          value={String(withDeadline)}
          icon={<Clock aria-hidden="true" />}
          trend={withDeadline > 0 ? { direction: "down", label: "Time-bound" } : undefined}
        />
        <Stat
          label="Waiting 5+ days"
          value={String(overdue)}
          trend={overdue > 0 ? { direction: "down", label: "Ageing" } : undefined}
        />
      </div>

      {withDeadline > 0 && (
        <Callout tone="warning" title="Some of these expire">
          Requests with a deadline are shown first. The August payroll run has
          to be approved before the bank cut-off on 26 August or staff are paid
          late.
        </Callout>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Filter approvals"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "money", label: "Moves money" },
            { value: "people", label: "People" },
            { value: "overdue", label: "Needs attention" },
          ]}
        />
        <Button variant="secondary" size="sm" onClick={approveAll}>
          <Check aria-hidden="true" className="size-3.5" />
          Approve routine items
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Check aria-hidden="true" />}
            title="Nothing waiting on you"
            description="Everything routed to you has been actioned. New requests appear here the moment they are raised."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((item) => (
            <li key={item.id}>
              <ApprovalRow item={item} onDecide={decide} />
            </li>
          ))}
        </ul>
      )}

      {decided.length > 0 && (
        <Card>
          <CardBody>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[0.75rem] font-semibold tracking-wide text-muted">
                Decided today
              </p>
              {/* Undo matters here. These decisions now persist and propagate to
                  the underlying record, so a mis-click is no longer something a
                  page refresh fixes. */}
              <Button variant="ghost" size="sm" onClick={reopenAll}>
                <Undo2 aria-hidden="true" className="size-3.5" />
                Undo all
              </Button>
            </div>
            <ul className="mt-3 flex flex-col gap-2">
              {decided.map(({ item, decision }) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 text-[0.875rem]"
                >
                  <Badge
                    tone={decision === "approved" ? "success" : "neutral"}
                    size="sm"
                    dot
                  >
                    {decision === "approved" ? "Approved" : "Sent back"}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-body">
                    {item.title}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => reopen(item)}
                    aria-label={`Undo the decision on ${item.title}`}
                  >
                    Undo
                  </Button>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ApprovalRow({
  item,
  onDecide,
}: {
  item: ApprovalItem;
  onDecide: (i: ApprovalItem, d: "approved" | "declined") => void;
}) {
  const ageing = item.waitingDays >= 5;

  return (
    <Card
      className={cn(
        "group transition-shadow duration-200 hover:shadow-md",
        item.deadline && "border-warning-line",
      )}
    >
      <CardBody className="flex flex-wrap items-start gap-4">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-text transition-transform duration-300 ease-[var(--ease-out-soft)] group-hover:scale-105 [&>svg]:size-[18px]"
        >
          {ICON[item.kind]}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={TONE[item.kind]} size="sm">
              {APPROVAL_LABEL[item.kind]}
            </Badge>
            {item.deadline && (
              <Badge tone="warning" size="sm" dot>
                {item.deadline}
              </Badge>
            )}
            {ageing && !item.deadline && (
              <Badge tone="danger" size="sm">
                Waiting {item.waitingDays} days
              </Badge>
            )}
          </div>

          <h3 className="mt-1.5 text-[0.9375rem] font-semibold text-ink">
            <Link
              href={item.href}
              className="hover:text-accent-text hover:underline underline-offset-4"
            >
              {item.title}
            </Link>
          </h3>
          <p className="mt-0.5 text-[0.875rem] leading-relaxed text-body">
            {item.summary}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[0.75rem] text-muted">
            <span className="flex items-center gap-1.5">
              <Avatar name={approvalRequester(item)} size="xs" />
              {approvalRequester(item)}
            </span>
            <span>Raised {item.requestedAt}</span>
          </div>
        </div>

        {item.amount !== undefined && (
          <div className="shrink-0 text-right">
            <p className="text-[0.75rem] uppercase tracking-wide text-faint">
              Value
            </p>
            <p className="tabular text-h4 text-ink">
              <Money amount={item.amount} compact />
            </p>
          </div>
        )}

        <div className="flex w-full shrink-0 gap-2 sm:w-auto">
          <Button
            variant="approve"
            size="sm"
            onClick={() => onDecide(item, "approved")}
            className="flex-1 sm:flex-none"
          >
            <Check aria-hidden="true" className="size-3.5" />
            Approve
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onDecide(item, "declined")}
          >
            <X aria-hidden="true" className="size-3.5" />
            Send back
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
