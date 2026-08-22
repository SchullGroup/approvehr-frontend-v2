"use client";

import { useMemo, useState } from "react";
import { BellOff, Check, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  IconButton,
  SegmentedControl,
  Skeleton,
  useToast,
  type BadgeTone,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  useNotifications,
  type InboxItem,
  type InboxTab,
  type NotificationSeverity,
} from "@/lib/store/notifications";

/**
 * The notification inbox.
 *
 * ## What a row has to contain
 *
 * Four things, in this order: what happened, who or what it concerns, when, and
 * — where a decision is waiting — the button that goes straight to it. Anything
 * else is a row explaining itself, which is the failure mode `PARITY.md` Rule 4
 * exists to prevent. "Ngozi Eze's bank account changed" with **Open record**
 * beside it, not a paragraph about why bank changes are notified.
 *
 * The verb on the button comes from `entityType`, so it names the destination
 * rather than the mechanism. "Review payroll" tells you where you are about to land;
 * "View notification" would not.
 *
 * ## Unread, without relying on colour
 *
 * Three redundant channels, because one of them is colour and colour alone is
 * not a status:
 *
 * 1. **A dot.** Present when unread, absent when read — a difference in shape
 *    and presence, legible in greyscale and to anyone colour-blind.
 * 2. **Weight.** Unread titles are semibold, read titles are not.
 * 3. **Ground.** Unread rows sit on `surface`, read rows on `canvas`.
 *
 * And for a screen reader, which sees none of that: every unread row opens with
 * a visually hidden "Unread." so the state is announced with the message rather
 * than inferred from a decoration.
 *
 * ## Grouping by day
 *
 * Rows are grouped under Today / Yesterday / a weekday / a date. "Today" is
 * relative to `notifications.now`, which is the wall clock when connected and
 * the demo dataset's own day otherwise — see the note in
 * `lib/store/notifications.ts` for why the demo does not read the clock.
 *
 * ## Mark all read is deliberately quiet
 *
 * It is a ghost button beside the filters, not a primary action in the header.
 * The point of this page is to deal with things; clearing the badge without
 * reading them is an escape hatch, and an escape hatch should not be the most
 * prominent control on the screen.
 */

const TABS: { value: InboxTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "action", label: "Needs you" },
  { value: "unread", label: "Unread" },
];

/** INFO carries no badge — most of the inbox is INFO, and a badge on everything is a badge on nothing. */
const SEVERITY: Record<
  NotificationSeverity,
  { tone: BadgeTone; label: string } | null
> = {
  CRITICAL: { tone: "danger", label: "Urgent" },
  ACTION: { tone: "accent", label: "Needs you" },
  WARNING: { tone: "warning", label: "Check this" },
  INFO: null,
};

/**
 * The button label, named after where it goes.
 *
 * Two columns because severity changes the verb, not the destination. The same
 * leave request is **Review request** when it is waiting on your decision and
 * **Open request** when it is telling you the decision was made — and a row
 * that says "Review" when there is nothing to review teaches you to ignore the
 * word. `entityType` alone cannot carry that; severity has to.
 */
const VERBS: Record<string, { decisive: string; neutral: string }> = {
  payroll_run: { decisive: "Review payroll", neutral: "Open payroll" },
  payslip: { decisive: "Open payslips", neutral: "Open payslips" },
  employee: { decisive: "Open record", neutral: "Open record" },
  leave_request: { decisive: "Review request", neutral: "Open request" },
  offer: { decisive: "Review offer", neutral: "Open offer" },
  statutory_filing: { decisive: "Open filing", neutral: "Open filing" },
  attendance: { decisive: "Fix the record", neutral: "Open timesheet" },
};

const FALLBACK_VERB = { decisive: "Open", neutral: "Open" };

const EMPTY_COPY: Record<InboxTab, { title: string; description: string }> = {
  all: {
    title: "Nothing here yet",
    description:
      "Approvals, payslips and filing reminders will appear here as they happen.",
  },
  action: {
    title: "Nothing needs you",
    description: "Anything waiting on your decision will appear here.",
  },
  unread: {
    title: "All read",
    description: "New messages will appear here as they arrive.",
  },
};

export function NotificationsInbox() {
  const [tab, setTab] = useState<InboxTab>("all");
  const notifications = useNotifications(tab);
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const groups = useMemo(
    () => groupByDay(notifications.items, notifications.now),
    [notifications.items, notifications.now],
  );

  /* Mutations report their own failure — the API's message is the useful part. */
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Notifications"
        description="What needs you, and what just happened."
        meta={
          <>
            {notifications.unread > 0 && (
              <Badge tone="accent" size="sm">
                {notifications.unread} unread
              </Badge>
            )}
            {DEMO_ENABLED && !notifications.live && (
              <Badge tone="neutral" size="sm">
                Demo data, this browser only
              </Badge>
            )}
          </>
        }
      />

      <PageBody className="flex flex-col gap-5">
        {notifications.error && (
          <LoadFailure subject="your notifications" error={notifications.error} />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            options={TABS}
            value={tab}
            onChange={setTab}
            label="Filter notifications"
          />
          <Button
            variant="ghost"
            size="sm"
            disabled={notifications.unread === 0 || busy}
            onClick={() => void run(() => notifications.markAllRead())}
          >
            Mark all read
          </Button>
        </div>

        {notifications.loading && notifications.items.length === 0 ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-[4.5rem] w-full" />
            <Skeleton className="h-[4.5rem] w-full" />
            <Skeleton className="h-[4.5rem] w-full" />
            <span className="sr-only">Loading your notifications</span>
          </div>
        ) : notifications.items.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface">
            <EmptyState
              icon={<BellOff aria-hidden="true" />}
              title={EMPTY_COPY[tab].title}
              description={EMPTY_COPY[tab].description}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <section key={group.key} aria-labelledby={`day-${group.key}`}>
                <h2
                  id={`day-${group.key}`}
                  className="mb-2 text-meta font-semibold uppercase tracking-wide text-faint"
                >
                  {group.heading}
                </h2>
                <ul role="list" className="flex flex-col gap-2">
                  {group.items.map((item) => (
                    <Row
                      key={item.id}
                      item={item}
                      now={notifications.now}
                      busy={busy}
                      onOpen={() => {
                        /* Following the action is reading it. Fire and forget:
                           navigation has already started and a failed mark-read
                           must not hold up the page you asked for. */
                        if (!item.read) void notifications.markRead(item.id);
                      }}
                      onMarkRead={() =>
                        void run(() => notifications.markRead(item.id))
                      }
                      onDismiss={() =>
                        void run(() => notifications.remove(item.id))
                      }
                    />
                  ))}
                </ul>
              </section>
            ))}

            {notifications.hasMore && (
              <div className="flex justify-center">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={notifications.loading}
                  onClick={notifications.showMore}
                >
                  {notifications.loading ? "Loading…" : "Show older"}
                </Button>
              </div>
            )}
          </div>
        )}
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function Row({
  item,
  now,
  busy,
  onOpen,
  onMarkRead,
  onDismiss,
}: {
  item: InboxItem;
  now: Date;
  busy: boolean;
  onOpen: () => void;
  onMarkRead: () => void;
  onDismiss: () => void;
}) {
  const severity = SEVERITY[item.severity];
  const decisive = item.severity === "ACTION" || item.severity === "CRITICAL";
  const verbs =
    (item.entityType ? VERBS[item.entityType] : undefined) ?? FALLBACK_VERB;
  const verb = decisive ? verbs.decisive : verbs.neutral;

  return (
    <li
      className={cn(
        "flex flex-wrap items-start gap-3 rounded-md border border-line p-3.5 sm:flex-nowrap",
        item.read ? "bg-canvas" : "bg-surface",
      )}
    >
      {/* Presence, not hue: the dot is there when unread and gone when read. */}
      <span
        aria-hidden="true"
        className="mt-1.5 flex size-2.5 shrink-0 items-center justify-center"
      >
        {!item.read && (
          <span className="size-2 rounded-full bg-accent" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "flex flex-wrap items-center gap-2 text-body text-ink",
            item.read ? "font-normal" : "font-semibold",
          )}
        >
          {/* The one channel a screen reader can actually use. */}
          {!item.read && <span className="sr-only">Unread.</span>}
          <span>{item.title}</span>
          {severity && (
            <Badge tone={severity.tone} size="sm">
              {severity.label}
            </Badge>
          )}
        </p>

        {item.body && (
          <p className="mt-1 text-body-sm leading-relaxed text-body">
            {item.body}
          </p>
        )}

        <time
          dateTime={item.createdAt}
          title={fullStamp(item.createdAt)}
          className="mt-1.5 block text-meta text-faint"
        >
          {whenLabel(item.createdAt, now)}
        </time>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {item.actionHref && (
          <ButtonLink
            href={item.actionHref}
            variant={decisive ? "accent" : "secondary"}
            size="sm"
            onClick={onOpen}
          >
            {verb}
          </ButtonLink>
        )}
        {!item.read && (
          <IconButton
            label={`Mark “${item.title}” read`}
            size="sm"
            disabled={busy}
            onClick={onMarkRead}
          >
            <Check aria-hidden="true" className="size-4" />
          </IconButton>
        )}
        <IconButton
          label={`Remove “${item.title}”`}
          size="sm"
          disabled={busy}
          onClick={onDismiss}
        >
          <X aria-hidden="true" className="size-4" />
        </IconButton>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------ day grouping */

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Local day parts, not UTC.
 *
 * `createdAt` is a timestamp rather than a calendar date, so "which day was
 * that" is a question about the reader's day and not the server's. Nigeria is
 * UTC+1 with no daylight saving, which is exactly the hour that would move a
 * late-evening notification into tomorrow if this used UTC getters the way
 * `lib/today.ts` does for date-only values.
 */
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

function dayHeading(date: Date, now: Date): string {
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  /* A weekday name is only unambiguous inside the last week. */
  if (days < 7) return WEEKDAYS[date.getDay()];
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** Relative while it is still news, then the clock time — the day is in the heading. */
function whenLabel(iso: string, now: Date): string {
  const then = new Date(iso);
  const minutes = Math.max(0, Math.round((now.getTime() - then.getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  return `${pad(then.getHours())}:${pad(then.getMinutes())}`;
}

/** The exact moment, for the tooltip and for anyone who needs to be sure. */
function fullStamp(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

type DayGroup = { key: string; heading: string; items: InboxItem[] };

/**
 * Newest day first, and unread first **inside** each day.
 *
 * The store hands rows over in the API's order — unread first, then newest —
 * which is right for a badge and wrong for a page grouped by day: an unread
 * message from Tuesday sorts above Wednesday's read ones, so the headings come
 * out "Today, Yesterday, Today, Yesterday" and the reader assumes the screen is
 * broken. It was doing exactly that before this function re-sorted.
 *
 * So the grouping is strictly chronological and the unread priority applies
 * within a day. Nothing is lost: an unread row still carries a dot, a heavier
 * title and its own ground, and "Needs you" and "Unread" are one click away for
 * anyone who wants only those. A heading that appears twice is a bug; a heading
 * that appears once with the unread rows at its top is an inbox.
 */
function groupByDay(items: InboxItem[], now: Date): DayGroup[] {
  const groups = new Map<string, DayGroup>();

  /* Days in reverse-chronological order, whatever order the rows arrived in. */
  for (const item of [...items].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )) {
    const date = new Date(item.createdAt);
    const day = dayKey(date);
    const group = groups.get(day);
    if (group) {
      group.items.push(item);
      continue;
    }
    groups.set(day, {
      key: day,
      heading: dayHeading(date, now),
      items: [item],
    });
  }

  return [...groups.values()].map((group) => ({
    ...group,
    items: group.items.sort((a, b) =>
      a.read === b.read ? 0 : a.read ? 1 : -1,
    ),
  }));
}
