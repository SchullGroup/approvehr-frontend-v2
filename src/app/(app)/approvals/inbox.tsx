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
  ButtonLink,
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
import { LoadFailure } from "@/components/portal/load-failure";
import { ApiError } from "@/lib/api/client";
import { employeeById } from "@/lib/mock/people";
import type { ApprovalKind } from "@/lib/mock/workflows";
import { fullName } from "@/lib/types";
import { isDecidableHere, type ApprovalRow as ApiApprovalRow } from "@/lib/api/approvals";
import {
  useApprovalQueue,
  useSentApprovals,
  type QueueFilter,
} from "@/lib/store/approvals-api";
import type { QueueItem } from "@/lib/workflows/queue";
import {
  hasAnyPermission,
  useIsManager,
  usePermissions,
} from "@/lib/permissions";

/**
 * Holding any one of these is what makes "waiting on you" a question that can
 * ever have a nonzero answer. Exported for `components/portal/shell.tsx`'s
 * sidebar badge, which used to compute the same queue with no permission
 * check at all — a plain employee's "My approvals" badge showed the whole
 * company's pending count, and the page it opened onto correctly showed
 * them nothing, which read as the badge being simply wrong. One list, so the
 * two cannot drift back apart the way they already had once.
 */
export const APPROVE_PERMISSIONS = [
  "APPROVE_LEAVE",
  "APPROVE_LEAVE_ALL",
  "APPROVE_PAYROLL",
  "APPROVE_LOANS",
  "APPROVE_EXPENSES",
] as const;

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
 *
 * ## The economics only render for somebody who can ever see them move
 *
 * "Waiting on you" was already personally scoped — `GET /approvals/summary`
 * answers "your own queue", never the company's — so a plain employee's tiles
 * were not leaking anything. The problem was the audience, not the data: a
 * stat row about deadlines and "value at stake" is furniture for somebody who
 * can never have anything routed to them, and it will read as exactly zero
 * forever, which is a worse thing to put in front of them than nothing.
 * `canApprove` — a manager's own reports, or one of the approve-granting
 * permissions — is the same question `useIsManager()`/`hasAnyPermission`
 * answer everywhere else in this product; it is not a new gate invented for
 * this screen.
 */
export function ApprovalInbox() {
  const [view, setView] = useState<"waiting" | "sent">("waiting");
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [declining, setDeclining] = useState<QueueItem | null>(null);
  const queue = useApprovalQueue(filter);
  const sent = useSentApprovals();
  const toast = useToast();
  const isManager = useIsManager();
  const { permissions } = usePermissions();
  const canApprove =
    isManager || hasAnyPermission(permissions, APPROVE_PERMISSIONS);

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
      /* The API's own reasons, deduplicated, never a sentence composed here.
         It knows which rows it left and why — one may be a request the caller
         raised themselves, another may need a permission they do not hold —
         and the screen used to answer a zero with a fixed claim about
         deadlines and five-day waits that its own counters could disprove. */
      const reasons = [...new Set(result.skipped.map((row) => row.reason))];
      if (result.decided === 0) {
        toast.push({
          title: "Nothing was approved",
          tone: "info",
          detail:
            reasons.length > 0
              ? reasons.join(" ")
              : "Nothing waiting counts as routine. Anything with a deadline, or sitting five days, needs you to look at it.",
        });
        return;
      }
      toast.push({
        title: `${result.decided} ${
          result.decided === 1 ? "request" : "requests"
        } approved`,
        tone: "success",
        detail:
          result.skipped.length > 0
            ? `${result.skipped.length} still waiting. ${reasons.join(" ")}`
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
        {sourceNote(queue.connected) && (
          <Badge tone="warning" size="sm" dot>
            {sourceNote(queue.connected)}
          </Badge>
        )}
        {queue.loading && (
          <span className="text-meta text-muted">Loading…</span>
        )}
      </div>

      <LoadFailure
        subject="your approvals"
        error={queue.error}
        onRetry={queue.reload}
      />

      {/* Two different questions, not two filters on one list: "what needs
          me" and "what did I send off, and who is it sitting with now" have
          different owners even for the same person, and conflating them
          would mean one of the two never gets its own empty state. */}
      <SegmentedControl
        label="Which approvals to show"
        value={view}
        onChange={setView}
        options={[
          { value: "waiting", label: "Waiting on you" },
          { value: "sent", label: "Sent by you" },
        ]}
      />

      {view === "sent" && <SentApprovalsList state={sent} />}

      {view === "waiting" && (canApprove ? (
        <>
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
                <p className="text-meta font-semibold text-muted">
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
                      {/* Undo matters here: these decisions reach the record,
                          so a mis-click is not something a refresh fixes. */}
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
        </>
      ) : (
        /* Not a smaller version of the queue above: it will read exactly zero
           forever, on every tile, for anybody who lands here. That is worse
           than nothing, because it invites the question "am I missing
           something" rather than answering "this is not part of your role." */
        <Card>
          <EmptyState
            icon={<Check aria-hidden="true" />}
            title="Nothing for you to approve"
            description="Approving requests is not part of your role here. If that changes, anything routed to you will appear on this screen."
          />
        </Card>
      ))}

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

/**
 * "What did I send off, and who is it sitting with now."
 *
 * Read-only, deliberately — a row here is never the viewer's to decide (it
 * is the other side of the same request), so there is no Approve/Decline
 * pair to get wrong here the way `ApprovalRow` has to guard against below.
 */
function SentApprovalsList({
  state,
}: {
  state: ReturnType<typeof useSentApprovals>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {sourceNote(state.connected) && (
          <Badge tone="warning" size="sm" dot>
            {sourceNote(state.connected)}
          </Badge>
        )}
        {state.loading && (
          <span className="text-meta text-muted">Loading…</span>
        )}
      </div>

      <LoadFailure
        subject="what you've sent"
        error={state.error}
        onRetry={state.reload}
      />

      {!state.loading && !state.error && state.rows.length === 0 && (
        <Card>
          <EmptyState
            icon={<ClipboardList aria-hidden="true" />}
            title="Nothing sent yet"
            description="A loan, an expense, a payroll run, leave: anything you raise that needs somebody else's decision appears here with its status, so you can see where it's sitting without having to ask."
          />
        </Card>
      )}

      {state.rows.length > 0 && (
        <ul className="flex flex-col gap-3">
          {state.rows.map((row) => (
            <li key={row.id}>
              <SentApprovalRow row={row} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const STATUS_TONE: Record<ApiApprovalRow["status"], BadgeTone> = {
  pending: "warning",
  approved: "success",
  declined: "danger",
  withdrawn: "neutral",
};

const STATUS_LABEL: Record<ApiApprovalRow["status"], string> = {
  pending: "Waiting",
  approved: "Approved",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

function SentApprovalRow({ row }: { row: ApiApprovalRow }) {
  return (
    <Card>
      <CardBody className="flex flex-wrap items-start gap-4">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-text [&>svg]:size-[18px]"
        >
          {ICON[row.kind]}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={TONE[row.kind]} size="sm">
              {row.kindLabel}
            </Badge>
            <Badge tone={STATUS_TONE[row.status]} size="sm" dot>
              {STATUS_LABEL[row.status]}
            </Badge>
          </div>

          <h3 className="mt-1.5 text-body font-semibold text-ink">
            {row.title}
          </h3>
          {row.summary && (
            <p className="mt-0.5 text-body-sm leading-relaxed text-body">
              {row.summary}
            </p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-3 text-meta text-muted">
            <span>Sent {row.requestedAt}</span>
            {row.status === "pending" && row.sentTo && (
              <span>Waiting on {row.sentTo}</span>
            )}
            {row.status !== "pending" && row.decidedAt && (
              <span>Decided {row.decidedAt.slice(0, 10)}</span>
            )}
          </div>
          {row.status === "declined" && row.decisionNote && (
            <p className="mt-2 text-body-sm text-danger-text">
              {row.decisionNote}
            </p>
          )}
        </div>

        {row.amount !== null && (
          <div className="shrink-0 text-right">
            <p className="text-meta text-faint">Value</p>
            <p className="tabular text-body font-semibold text-ink">
              <Money amount={row.amount} decimals />
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

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
          className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-text transition-transform duration-300 ease-out-soft group-hover:scale-105 [&>svg]:size-[18px]"
        >
          {ICON[item.kind]}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={TONE[item.kind]} size="sm">
              {item.kindLabel}
            </Badge>
            {item.deadline && (
              <Badge
                tone={item.pastDeadline ? "danger" : "warning"}
                size="sm"
                dot
              >
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
            <p className="text-meta text-faint">Value</p>
            {/* Never abbreviated. This is a figure somebody reconciles against a
                bank statement, and ₦93.0m is not that figure. */}
            <p className="tabular text-body font-semibold text-ink">
              <Money amount={item.amount} decimals />
            </p>
          </div>
        )}

        {/* Payroll, loan and expense approvals cannot be decided from this
            inbox — their permission checks (and, for payroll, a step-up
            re-authentication) live only on their own screens, so `decide()`
            now refuses these outright rather than pretend to act. A button
            here would be one that always fails; the real one is one click
            away. */}
        {isDecidableHere(item.kind) ? (
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
        ) : (
          <div className="flex w-full shrink-0 sm:w-auto">
            <ButtonLink
              href={item.href}
              variant="secondary"
              size="sm"
              className="flex-1 sm:flex-none"
            >
              Open {item.kindLabel.toLowerCase()}
            </ButtonLink>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
