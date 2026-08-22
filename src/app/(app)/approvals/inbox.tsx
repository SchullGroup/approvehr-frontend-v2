"use client";

import { sourceNote } from "@/lib/demo";
import { useState } from "react";
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
import { DeclineDialog } from "@/components/portal/decline-dialog";
import { ApiError } from "@/lib/api/client";
import { employeeById } from "@/lib/mock/people";
import type { ApprovalKind } from "@/lib/mock/workflows";
import { fullName } from "@/lib/types";
import {
  useApprovalQueue,
  type QueueFilter,
} from "@/lib/store/approvals-api";
import type { QueueItem } from "@/lib/workflows/queue";

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

/**
 * The approval inbox.
 *
 * Ranking is the whole design. Anything with a stated deadline floats to the
 * top, then everything else by how long it has been waiting — not by module and
 * not newest-first. An approver's real question is "what breaks if I do nothing
 * today", so the queue answers that before it answers anything else. Connected,
 * that order is the API's; the rows are rendered in the order they arrive rather
 * than re-sorted here, so both modes rank the same way.
 *
 * ## Nothing about the queue lives on this screen
 *
 * Leave rows are the leave requests themselves — derived from them in demo mode,
 * and posted back into the leave service by the API when connected. Deciding here
 * is therefore the same write as deciding on `/people/leave`, not a second one
 * that has to agree with it. `lib/store/approvals-api.ts` holds that choice; this
 * file only renders it.
 *
 * A decision that moved nothing downstream says so, in both modes. Only leave has
 * a module behind it today.
 */
export function ApprovalInbox() {
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [declining, setDeclining] = useState<QueueItem | null>(null);
  const queue = useApprovalQueue(filter);
  const toast = useToast();

  const decide = async (
    item: QueueItem,
    decision: "approved" | "declined",
    note?: string,
  ) => {
    try {
      const outcome = await queue.decide(item, decision, note);
      toast.push({
        title:
          decision === "approved"
            ? `${item.title} approved`
            : `${item.title} went back`,
        tone: outcome.subjectMoved
          ? decision === "approved"
            ? "success"
            : "info"
          : "warning",
        detail:
          outcome.note ??
          (decision === "approved"
            ? "The request and the balance behind it are updated."
            : "It is back with them to revise."),
      });
    } catch (failure) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          failure instanceof ApiError
            ? failure.message
            : "Something went wrong. Try again.",
      });
    }
  };

  const undo = async (item: QueueItem) => {
    try {
      await queue.reopen(item);
      toast.push({
        title: "Back in the queue",
        tone: "info",
        detail: `${item.title} is waiting on a decision again.`,
      });
    } catch (failure) {
      toast.push({
        title: "Could not undo that",
        tone: "danger",
        detail:
          failure instanceof ApiError
            ? failure.message
            : "Something went wrong. Try again.",
      });
    }
  };

  const approveRoutine = async () => {
    try {
      const result = await queue.approveRoutine();
      if (result.decided === 0) {
        toast.push({
          title: "Nothing routine to approve",
          tone: "info",
          detail:
            "Everything waiting either has a deadline or has been sitting for five days. Those need you to look.",
        });
        return;
      }
      toast.push({
        title: `${result.decided} ${
          result.decided === 1 ? "request" : "requests"
        } approved`,
        tone: "success",
        detail:
          result.skipped > 0
            ? `${result.skipped} could not be approved and are still waiting.`
            : "Anything with a deadline was left for you to look at individually.",
      });
    } catch (failure) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          failure instanceof ApiError
            ? failure.message
            : "Something went wrong. Try again.",
      });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Which source these decisions are being written to, stated rather than
          implied. Connected, approving here writes to the database. */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={queue.connected ? "success" : "warning"} size="sm" dot>
          {sourceNote(queue.connected)}
        </Badge>
        {queue.loading && (
          <span className="text-meta text-muted">Loading…</span>
        )}
      </div>

      {queue.error && (
        <Callout tone="danger" title="Could not read your approvals">
          {queue.error.message}
        </Callout>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Waiting on you" value={String(queue.counts.pending)} />
        <Stat
          label="Value at stake"
          value={<Money amount={queue.counts.atStake} decimals size="xl" />}
          hint="across every decision waiting"
        />
        <Stat
          label="Has a deadline"
          value={String(queue.counts.withDeadline)}
          icon={<Clock aria-hidden="true" />}
          trend={
            queue.counts.withDeadline > 0
              ? { direction: "down", label: "Time-bound" }
              : undefined
          }
        />
        <Stat
          label="Waiting 5+ days"
          value={String(queue.counts.ageing)}
          trend={
            queue.counts.ageing > 0
              ? { direction: "down", label: "Ageing" }
              : undefined
          }
        />
      </div>

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
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void approveRoutine()}
          disabled={queue.routineCount === 0}
        >
          <Check aria-hidden="true" className="size-3.5" />
          {queue.routineCount === 0
            ? "Nothing routine to approve"
            : `Approve ${queue.routineCount} routine ${
                queue.routineCount === 1 ? "item" : "items"
              }`}
        </Button>
      </div>

      {queue.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Check aria-hidden="true" />}
            title="Nothing waiting on you"
            description="Everything routed to you has been actioned. New requests appear here the moment they are raised."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {queue.items.map((item) => (
            <li key={item.id}>
              <ApprovalRow
                item={item}
                onApprove={() => void decide(item, "approved")}
                onSendBack={() => setDeclining(item)}
              />
            </li>
          ))}
        </ul>
      )}

      {queue.decided.length > 0 && (
        <Card>
          <CardBody>
            <p className="text-meta font-semibold tracking-wide text-muted">
              Just decided
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {queue.decided.map(({ item, decision }) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 text-body-sm"
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
                  {/* Undo matters here: these decisions reach the record, so a
                      mis-click is not something a refresh fixes. */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void undo(item)}
                    aria-label={`Undo the decision on ${item.title}`}
                  >
                    <Undo2 aria-hidden="true" className="size-3.5" />
                    Undo
                  </Button>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <DeclineDialog
        open={declining !== null}
        what={declining ? declining.title : ""}
        onClose={() => setDeclining(null)}
        onConfirm={async (note) => {
          if (declining) await decide(declining, "declined", note);
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ApprovalRow({
  item,
  onApprove,
  onSendBack,
}: {
  item: QueueItem;
  onApprove: () => void;
  onSendBack: () => void;
}) {
  const ageing = item.waitingDays >= 5;
  /* Only a seed row knows who raised it. The API's approval row does not carry
     a requester, and its title already names the person it is about, so the
     line is left off rather than filled with a guess. */
  const raisedBy = item.requestedById
    ? employeeById(item.requestedById)
    : undefined;
  const requester = raisedBy ? fullName(raisedBy) : null;

  return (
    <Card
      className={cn(
        "group transition-shadow duration-200 hover:shadow-md",
        item.deadline && "border-warning-line",
        item.pastDeadline && "border-danger-line",
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
              {item.kindLabel}
            </Badge>
            {item.deadline && (
              <Badge tone={item.pastDeadline ? "danger" : "warning"} size="sm" dot>
                {item.deadline}
              </Badge>
            )}
            {ageing && !item.deadline && (
              <Badge tone="danger" size="sm">
                Waiting {item.waitingDays} days
              </Badge>
            )}
          </div>

          <h3 className="mt-1.5 text-body font-semibold text-ink">
            <Link
              href={item.href}
              className="hover:text-accent-text hover:underline underline-offset-4"
            >
              {item.title}
            </Link>
          </h3>
          <p className="mt-0.5 text-body-sm leading-relaxed text-body">
            {item.summary}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-3 text-meta text-muted">
            {requester && (
              <span className="flex items-center gap-1.5">
                <Avatar name={requester} size="xs" />
                {requester}
              </span>
            )}
            <span>Raised {item.requestedAt}</span>
          </div>
        </div>

        {item.amount !== undefined && (
          <div className="shrink-0 text-right">
            <p className="text-meta uppercase tracking-wide text-faint">
              Value
            </p>
            {/* Never abbreviated. This is a figure somebody reconciles against a
                bank statement, and ₦93.0m is not that figure. */}
            <p className="tabular text-body font-semibold text-ink">
              <Money amount={item.amount} decimals />
            </p>
          </div>
        )}

        <div className="flex w-full shrink-0 gap-2 sm:w-auto">
          <Button
            variant="approve"
            size="sm"
            onClick={onApprove}
            className="flex-1 sm:flex-none"
          >
            <Check aria-hidden="true" className="size-3.5" />
            Approve
          </Button>
          <Button variant="secondary" size="sm" onClick={onSendBack}>
            <X aria-hidden="true" className="size-3.5" />
            Send back
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
