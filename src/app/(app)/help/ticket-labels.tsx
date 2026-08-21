"use client";

import { AlertTriangle, CheckCircle2, Clock, Lock } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui";
import {
  ticketClock,
  type ApiTicket,
  type TicketClockState,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/api/helpdesk";

/**
 * The words and shapes the queue and the thread both use.
 *
 * Its own module so neither imports the other — a queue that imports the thread
 * and a thread that imports the queue's labels is a cycle, and ESM answers a
 * cycle with a half-evaluated module rather than an error you can read.
 *
 * ## Nothing here is carried by colour alone
 *
 * Every state has a label, and the two that need acting on — overdue, and about
 * to be — also have a shape. Print this screen in greyscale and it still says
 * which ticket is late.
 *
 * ## The words are the product
 *
 * "Not started", not "OPEN". "Waiting on them", not "WAITING". The person
 * reading a help desk queue at a thirty-person business is not an HR
 * professional and has never seen a status enum.
 */

export const STATUS: Record<TicketStatus, { tone: BadgeTone; label: string }> = {
  OPEN: { tone: "warning", label: "Not started" },
  IN_PROGRESS: { tone: "info", label: "Being worked on" },
  /* "Waiting on them" reads from the handler's side, which is who sees this
     column. The thread says "waiting on you" to the requester. */
  WAITING: { tone: "neutral", label: "Waiting on them" },
  RESOLVED: { tone: "success", label: "Sorted" },
};

export const PRIORITY: Record<TicketPriority, { tone: BadgeTone; label: string }> = {
  HIGH: { tone: "danger", label: "Urgent" },
  NORMAL: { tone: "neutral", label: "Normal" },
  LOW: { tone: "neutral", label: "Whenever" },
};

/** The label an internal note carries. One string, so it cannot drift. */
export const INTERNAL_LABEL = "Internal — the requester cannot see this";

const TONES: Record<TicketClockState, BadgeTone> = {
  overdue: "danger",
  resolved_late: "danger",
  due_soon: "warning",
  resolved: "success",
  on_time: "neutral",
  no_target: "neutral",
};

function clockIcon(state: TicketClockState): React.ReactNode {
  if (state === "overdue" || state === "resolved_late") {
    return <AlertTriangle aria-hidden="true" />;
  }
  if (state === "due_soon") return <Clock aria-hidden="true" />;
  if (state === "resolved") return <CheckCircle2 aria-hidden="true" />;
  return undefined;
}

/**
 * How long they have waited, and whether the promise is about to break.
 *
 * Three signals for "overdue", never one: the words "Overdue by 3 working
 * hours", a warning triangle, and only then the red. Take the colour away and
 * the cell still says it.
 *
 * `detail` adds the second line the queue wants and the thread does not.
 */
export function TicketClockBadge({
  ticket,
  minutesPerDay,
  detail = false,
}: {
  ticket: ApiTicket;
  minutesPerDay: number;
  detail?: boolean;
}) {
  const clock = ticketClock(ticket, minutesPerDay);
  const icon = clockIcon(clock.state);

  return (
    <span className="flex flex-col items-start gap-1">
      <Badge tone={TONES[clock.state]} size="sm" {...(icon ? { icon } : {})}>
        {clock.label}
      </Badge>
      {detail && ticket.status !== "RESOLVED" && (
        <span className="text-meta text-muted">
          {clock.against === "response"
            ? `${clock.waited} with no reply`
            : `open ${clock.waited}`}
        </span>
      )}
    </span>
  );
}

/** The badge that labels a note as staff-only. Text plus a padlock. */
export function InternalBadge() {
  return (
    <Badge tone="ink" size="sm" icon={<Lock aria-hidden="true" />}>
      {INTERNAL_LABEL}
    </Badge>
  );
}
