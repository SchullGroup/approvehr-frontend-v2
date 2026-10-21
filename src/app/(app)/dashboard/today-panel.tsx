"use client";

import { useId, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  Coins,
  Eye,
  EyeOff,
  FileText,
  ListChecks,
  Megaphone,
  Pin,
  Users,
  Wallet,
} from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Disclosure,
  EmptyState,
  IconButton,
  LoadState,
  Modal,
  Money,
  Skeleton,
  Tabs,
  TextLink,
  useToast,
  type TabItem,
} from "@/components/ui";
import { InfoTooltip } from "@/components/ui/field";
import { announcementsApi } from "@/lib/api/announcements";
import { ApiError } from "@/lib/api/client";
import { naira } from "@/lib/api/insights";
import {
  calendarDaysBetween,
  sectionData,
  sectionFailed,
  type ApiTodayNotice,
  type ClockInToday,
  type TodaySectionName,
} from "@/lib/api/me";
import { periodLabel } from "@/lib/api/payroll";
import { cn } from "@/lib/cn";
import { TASK_GRADE_LABEL } from "@/lib/performance/task-grade";
import { useMeToday, type MeToday } from "@/lib/store/me-today";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDateShort } from "@/lib/time";
import { shortDate } from "@/lib/today";
import { useToday } from "@/lib/use-today";

/**
 * The Today panel: what is true for **this person, today**.
 *
 * One request (`GET /me/today`, eight sections) behind a card that is two tabs.
 * *To do* is what asks something of them: notices they have not read, policies
 * they have not accepted, a reviewer's note on a task, a clock-in that was never
 * closed. *At a glance* is what is only true: when they are paid, what they have
 * left, their next one-to-one. The panel opens on whichever has something in it.
 *
 * ## Every section stands on its own
 *
 * The API answers 200 whatever the sections do, and each comes back `ok`,
 * `unavailable` or `error` (`lib/api/me.ts`). `unavailable` is **not a zero and
 * not an error**: a person with no staff record has no leave, and "0 days left"
 * would say they had used it. So an unavailable section draws nothing, and an
 * `ok` section with nothing in it draws nothing either, except that *To do*
 * says plainly when there is nothing to do, because that is the answer the
 * person came to the tab for. A section that **failed** shows one quiet line with
 * a retry on its own tab, and the others carry on.
 *
 * Absent is never printed as a figure. No payslip is `null`, not a net pay of
 * nothing; no advance figure is not "₦0".
 *
 * ## Take-home pay is covered until asked for
 *
 * A panel on the screen everybody opens first is in view of whoever is standing
 * behind it. The payslip figure and the pay-early figure are masked by default,
 * with a tap to show them, and the mask is a fixed six dots so its width does not
 * give the magnitude away. It starts covered on every load. That is a screen
 * courtesy and not access control: the API sends the number to its owner either
 * way, and the shared hide-amounts preference (`MoneyPrivacyToggle`) still wins
 * over a reveal here.
 *
 * ## Reading a notice is what records it
 *
 * Opening a notice calls `POST /announcements/:id/read`. The row leaves the list
 * when the server has said so, and the section is re-read on its own
 * (`?sections=announcements`) so the unread count is exact: a sixth unread notice
 * may now belong among the five. There is no "mark all as read": a receipt that
 * can be given without opening the notice is not evidence of anything.
 *
 * ## Copy
 *
 * A row is at most two short lines. Anything longer lives in a tooltip or behind
 * the click. The pay-early estimate caveat is the one sentence the API requires
 * beside its figure, so it rides with the figure as a tooltip on an "Estimate"
 * label that is always visible next to it.
 */

type TabId = "todo" | "glance";

/* ------------------------------------------------------------------- shell */

export function TodayPanel() {
  const today = useMeToday();
  return (
    <LoadState
      loading={today.loading}
      error={today.error}
      subject="your day"
      onRetry={today.reload}
      hasData={today.data !== null}
      skeleton={<TodaySkeleton />}
    >
      <TodayBody today={today} />
    </LoadState>
  );
}

function TodaySkeleton() {
  return (
    <Card as="article" className="h-full">
      <CardHeader title="Today" level={3} />
      <CardBody>
        <div aria-hidden="true" className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------- body */

function TodayBody({ today }: { today: MeToday }) {
  const timeZone = useOrgTimezone();
  const day = useToday();
  const toast = useToast();
  const [tab, setTab] = useState<TabId | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [viewing, setViewing] = useState<ApiTodayNotice | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [retrying, setRetrying] = useState<TodaySectionName | null>(null);

  /* Nobody connected, or the API has no such route: nothing to say, nothing drawn. */
  if (!today.data) return null;
  const { sections } = today.data;

  const announcements = sectionData(sections.announcements);
  const policies = sectionData(sections.policies);
  const pay = sectionData(sections.pay);
  const leave = sectionData(sections.leave);
  const advance = sectionData(sections.advance);
  const tasks = sectionData(sections.tasks);
  const oneOnOne = sectionData(sections.oneOnOne);
  const clock = sectionData(sections.clockIn);

  const retry = async (name: TodaySectionName) => {
    setRetrying(name);
    const landed = await today.refresh([name]);
    setRetrying(null);
    if (!landed) {
      toast.push({
        title: "Still could not load",
        tone: "warning",
        detail: "Try again in a moment.",
      });
    }
  };

  /** Opening is the receipt. See the header. */
  const readNotice = (notice: ApiTodayNotice) => {
    setViewing(notice);
    setViewOpen(true);
    void (async () => {
      try {
        const marked = await announcementsApi.markRead(notice.id);
        today.markNoticeRead(notice.id, marked.readAt);
      } catch (caught) {
        toast.push({
          title: "Could not record that you read this",
          tone: "warning",
          detail:
            caught instanceof ApiError
              ? caught.message
              : "Something went wrong. Try again.",
        });
      }
      /* Either way, ask the server what is true now: on success the unread
         count and the five shown are made exact, on a failure (a notice taken
         down meanwhile is a 404) the row that cannot be read goes away. */
      await today.refresh(["announcements"]);
    })();
  };

  /* ------------------------------------------------------------ to do */

  const todo: React.ReactNode[] = [];
  let todoCount = 0;
  let todoUnknown = false;

  if (sectionFailed(sections.announcements)) {
    todoUnknown = true;
    todo.push(
      <ErrorRow
        key="announcements-error"
        label="Notices"
        busy={retrying === "announcements"}
        onRetry={() => void retry("announcements")}
      />,
    );
  }
  if (announcements) {
    const unread = announcements.notices.filter((notice) => !notice.read);
    todoCount += announcements.unread;
    for (const notice of unread) {
      todo.push(
        <TodayRow
          key={`notice-${notice.id}`}
          icon={notice.pinned ? <Pin /> : <Megaphone />}
          title={notice.title}
          detail={noticeDetail(notice, timeZone)}
          trailing={
            <Button
              size="sm"
              variant="secondary"
              aria-label={`Read ${notice.title}`}
              onClick={() => readNotice(notice)}
            >
              Read
            </Button>
          }
        />,
      );
    }
    const more = announcements.unread - unread.length;
    if (more > 0) {
      todo.push(
        <MoreLine key="notices-more">
          {more} more unread. They appear here as you read these.
        </MoreLine>,
      );
    }
  }

  if (sectionFailed(sections.policies)) {
    todoUnknown = true;
    todo.push(
      <ErrorRow
        key="policies-error"
        label="Policies"
        busy={retrying === "policies"}
        onRetry={() => void retry("policies")}
      />,
    );
  }
  if (policies) {
    todoCount += policies.total;
    for (const policy of policies.outstanding) {
      todo.push(
        <TodayRow
          key={`policy-${policy.id}`}
          icon={<FileText />}
          title={policy.title}
          detail={policyDetail(policy)}
          trailing={
            <ButtonLink
              href="/settings/policies"
              size="sm"
              variant="secondary"
              aria-label={`Review ${policy.title}`}
            >
              Review
            </ButtonLink>
          }
        />,
      );
    }
    const more = policies.total - policies.outstanding.length;
    if (more > 0) {
      todo.push(
        <MoreLine key="policies-more">
          <TextLink href="/settings/policies">
            {more} more in the handbook
          </TextLink>
        </MoreLine>,
      );
    }
  }

  if (tasks) {
    todoCount += tasks.needsAttention.length;
    for (const task of tasks.needsAttention) {
      todo.push(
        <TodayRow
          key={`task-${task.id}`}
          tone="attention"
          icon={<ClipboardList />}
          title={task.goalTitle}
          titleHref="/performance/review-tasks"
          detail={task.gradeNote ?? task.description}
          trailing={
            <Badge tone="warning" size="sm">
              {TASK_GRADE_LABEL[task.grade]}
            </Badge>
          }
        />,
      );
    }
  }

  if (sectionFailed(sections.clockIn)) {
    todoUnknown = true;
    todo.push(
      <ErrorRow
        key="clockIn-error"
        label="Clock in"
        busy={retrying === "clockIn"}
        onRetry={() => void retry("clockIn")}
      />,
    );
  }
  if (clock?.earlierOpen) {
    todoCount += 1;
    todo.push(
      <TodayRow
        key="clock-earlier"
        tone="attention"
        icon={<Clock />}
        title={`No clock-out on ${shortDate(clock.earlierOpen.date)}`}
        detail={`Clocked in at ${clock.earlierOpen.clockIn}`}
        trailing={
          <ButtonLink
            href="/people/attendance"
            size="sm"
            variant="secondary"
            aria-label="Open attendance to fix the open day"
          >
            Fix
          </ButtonLink>
        }
      />,
    );
  }

  /* To do exists when something that can ask a question answered, even if the
     answer is "nothing". Tasks alone do not make it: their rows are only there
     when a reviewer sent something back. */
  const todoPresent =
    announcements !== null ||
    policies !== null ||
    clock !== null ||
    sectionFailed(sections.announcements) ||
    sectionFailed(sections.policies) ||
    sectionFailed(sections.clockIn) ||
    todo.length > 0;

  /* ---------------------------------------------------------- at a glance */

  const glance: React.ReactNode[] = [];

  if (pay?.nextPayday) {
    glance.push(
      <TodayRow
        key="payday"
        icon={<CalendarClock />}
        title={`Next payday, ${shortDate(pay.nextPayday.date)}`}
        detail={`${periodLabel(pay.nextPayday.period)} payroll`}
        trailing={
          <Badge
            tone={pay.nextPayday.state === "planned" ? "neutral" : "accent"}
            size="sm"
          >
            {PAYDAY_STATE[pay.nextPayday.state]}
          </Badge>
        }
      />,
    );
  }
  if (pay?.latestPayslip) {
    const slip = pay.latestPayslip;
    glance.push(
      <TodayRow
        key="payslip"
        icon={<Wallet />}
        title={`${periodLabel(slip.period)} payslip`}
        titleHref={`/payroll/payslips/${slip.id}`}
        detail={
          slip.paid
            ? `Paid ${shortDate(slip.payDate)}`
            : "Approved, not yet paid"
        }
        trailing={
          <MaskedAmount
            kobo={slip.netKobo}
            shown={revealed}
            onToggle={() => setRevealed((was) => !was)}
          />
        }
      />,
    );
  }
  if (sectionFailed(sections.pay)) {
    glance.push(
      <ErrorRow
        key="pay-error"
        label="Pay"
        busy={retrying === "pay"}
        onRetry={() => void retry("pay")}
      />,
    );
  }

  if (leave && leave.balances.length > 0) {
    const rows = leave.balances.map((balance) => (
      <TodayRow
        key={balance.leaveTypeId}
        icon={<CalendarDays />}
        title={balance.leaveType}
        detail={balance.pending > 0 ? `${balance.pending} pending` : undefined}
        trailing={
          <span className="tabular text-body-sm font-medium text-ink">
            {balance.remaining}
            <span className="font-normal text-muted">
              {" "}
              of {balance.entitled} left
            </span>
          </span>
        }
      />
    ));
    /* A click to reveal one row is a click for nothing, so the rest go behind
       one only when there are at least two of them. */
    const shown = rows.length > LEAVE_SHOWN + 1 ? LEAVE_SHOWN : rows.length;
    glance.push(...rows.slice(0, shown));
    if (rows.length > shown) {
      glance.push(
        <li key="leave-more" className="py-2">
          <Disclosure
            dense
            level={4}
            title="More leave types"
            meta={<Badge size="sm">{rows.length - shown}</Badge>}
          >
            <ul className="divide-y divide-line">{rows.slice(shown)}</ul>
          </Disclosure>
        </li>,
      );
    }
  }
  if (sectionFailed(sections.leave)) {
    glance.push(
      <ErrorRow
        key="leave-error"
        label="Leave"
        busy={retrying === "leave"}
        onRetry={() => void retry("leave")}
      />,
    );
  }

  if (advance) {
    /* A figure only when they could draw one. `availableKobo` is null with no
       salary on file, and "₦0" for that would be a claim about their pay. */
    const figure =
      advance.eligible && advance.availableKobo !== null
        ? advance.availableKobo
        : null;
    glance.push(
      <TodayRow
        key="advance"
        icon={<Coins />}
        title="Pay early"
        titleHref="/payroll/advances"
        detail={
          figure !== null
            ? "Ask for part of this month's pay"
            : "Not available right now"
        }
        trailing={
          figure !== null ? (
            <>
              <EstimateTag notice={advance.estimateNotice} />
              <MaskedAmount
                kobo={figure}
                shown={revealed}
                onToggle={() => setRevealed((was) => !was)}
              />
            </>
          ) : advance.refusal ? (
            /* The API's one sentence on why not, which can run to a line and a
               half, is behind an icon rather than a third line on the row. */
            <WhyNot reason={advance.refusal} />
          ) : undefined
        }
      />,
    );
  }

  if (tasks && tasks.objectives > 0) {
    const waiting =
      tasks.awaitingGrade > 0 ? `, ${tasks.awaitingGrade} awaiting grade` : "";
    glance.push(
      <TodayRow
        key="tasks"
        icon={<ListChecks />}
        title="Weekly tasks"
        titleHref="/performance/review-tasks"
        detail={
          tasks.loggedThisWeek > 0
            ? `${tasks.loggedThisWeek} logged${waiting}`
            : "Nothing logged yet this week"
        }
        trailing={
          <span className="text-meta text-muted">
            {tasks.week.daysLeft} {tasks.week.daysLeft === 1 ? "day" : "days"}{" "}
            left
          </span>
        }
      />,
    );
  }
  if (sectionFailed(sections.tasks)) {
    glance.push(
      <ErrorRow
        key="tasks-error"
        label="Tasks"
        busy={retrying === "tasks"}
        onRetry={() => void retry("tasks")}
      />,
    );
  }

  if (oneOnOne?.next) {
    const next = oneOnOne.next;
    const away = calendarDaysBetween(day, next.date);
    const when =
      away === 0 ? "Today" : away === 1 ? "Tomorrow" : shortDate(next.date);
    glance.push(
      <TodayRow
        key="one-on-one"
        icon={<Users />}
        title={`One-to-one with ${next.withName}`}
        titleHref={`/people/one-on-ones/${next.seriesId}`}
        detail={`${when}, ${next.cadenceLabel.toLowerCase()}`}
      />,
    );
  }
  if (sectionFailed(sections.oneOnOne)) {
    glance.push(
      <ErrorRow
        key="one-on-one-error"
        label="One-to-ones"
        busy={retrying === "oneOnOne"}
        onRetry={() => void retry("oneOnOne")}
      />,
    );
  }
  if (sectionFailed(sections.advance)) {
    glance.push(
      <ErrorRow
        key="advance-error"
        label="Pay early"
        busy={retrying === "advance"}
        onRetry={() => void retry("advance")}
      />,
    );
  }

  /* Nothing to ask, nothing to tell and no clock to report: the card is not
     there. "Nothing needs you today" is worth saying to somebody the panel has
     something else for; to an account where only notices apply, and none are
     up, it is furniture. */
  if (todo.length === 0 && glance.length === 0 && !clock) return null;

  const items: TabItem[] = [];
  if (todoPresent) {
    items.push({
      id: "todo",
      label: "To do",
      /* A count only when it is the whole truth: a section that failed may have
         had something in it, and a number that might be short is a claim. */
      ...(todoCount > 0 && !todoUnknown ? { count: todoCount } : {}),
    });
  }
  if (glance.length > 0) items.push({ id: "glance", label: "At a glance" });

  /* Their choice if they made one, otherwise the tab that has something in it. */
  const wanted: TabId =
    tab !== null && items.some((item) => item.id === tab)
      ? tab
      : todoPresent && (todo.length > 0 || glance.length === 0)
        ? "todo"
        : "glance";

  const content =
    wanted === "todo" ? (
      todo.length > 0 ? (
        <ul className="divide-y divide-line">{todo}</ul>
      ) : (
        <EmptyState
          compact
          icon={<CheckCircle2 />}
          title="Nothing needs you today"
          className="py-6"
        />
      )
    ) : (
      <ul className="divide-y divide-line">{glance}</ul>
    );

  return (
    <>
      <Card as="article" className="h-full">
        <CardHeader
          title="Today"
          level={3}
          {...(clock ? { action: <ClockBadge clock={clock} /> } : {})}
        />
        <CardBody>
          {items.length > 1 ? (
            <Tabs
              items={items}
              value={wanted}
              onChange={(id) => setTab(id as TabId)}
            >
              <div key={wanted} className="animate-fade">
                {content}
              </div>
            </Tabs>
          ) : (
            <div className="animate-fade">{content}</div>
          )}
        </CardBody>
      </Card>

      <Modal
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        title={viewing?.title ?? "Notice"}
        {...(viewing ? { description: noticeByline(viewing, timeZone) } : {})}
        footer={
          <Button variant="primary" onClick={() => setViewOpen(false)}>
            Close
          </Button>
        }
      >
        {viewing && (
          <div className="flex flex-col gap-3">
            {viewing.departmentNames.length > 0 && (
              <p className="text-meta text-muted">
                For {viewing.departmentNames.join(", ")}
              </p>
            )}
            {/* Plain text, paragraph breaks kept. Never `dangerouslySetInnerHTML`:
                the API stores what somebody typed, and rendering it as markup
                would put a stored-XSS surface on the screen everybody opens
                first. */}
            <p className="whitespace-pre-line text-body-sm leading-relaxed text-body">
              {viewing.body}
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------- pieces */

/** How many leave types show before the rest go behind a click (when that hides two or more). */
const LEAVE_SHOWN = 3;

const PAYDAY_STATE = {
  planned: "Planned",
  approved: "Approved",
  paid: "Paid",
} as const;

/**
 * One row, two short lines at most.
 *
 * Both lines truncate rather than wrap, with the whole text in `title`: a row
 * that wraps to four lines is how a list of eight things becomes a page. Anything
 * the reader needs the rest of is behind the button on the right.
 *
 * `tone="attention"` tints the chip in the muted ochre of the warning tokens, the
 * one colour this product uses for "look at this". Everything else is quiet.
 */
function TodayRow({
  icon,
  tone = "quiet",
  title,
  titleHref,
  detail,
  trailing,
}: {
  icon: React.ReactNode;
  tone?: "quiet" | "attention";
  title: string;
  titleHref?: string;
  detail?: string | undefined;
  trailing?: React.ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <span
        aria-hidden="true"
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg [&>svg]:size-4",
          tone === "attention"
            ? "bg-warning-soft text-warning-text"
            : "bg-sunken text-muted",
        )}
      >
        {icon}
      </span>
      {/* A floor on the text, so that a wide `trailing` (an amount, its eye and an
          "Estimate" tag) wraps under it on a phone instead of squeezing the
          title to a stub. */}
      <div className="min-w-40 flex-1">
        <p className="truncate text-body-sm font-medium text-ink" title={title}>
          {titleHref ? (
            <Link
              href={titleHref}
              className="underline-offset-4 hover:underline"
            >
              {title}
            </Link>
          ) : (
            title
          )}
        </p>
        {detail && (
          <p className="truncate text-meta text-muted" title={detail}>
            {detail}
          </p>
        )}
      </div>
      {trailing && (
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {trailing}
        </div>
      )}
    </li>
  );
}

/** A quiet line under a list, for what did not fit in it. */
function MoreLine({ children }: { children: React.ReactNode }) {
  return <li className="py-3 text-meta text-muted">{children}</li>;
}

/**
 * A section that could not be read, on its own.
 *
 * Quiet on purpose: one muted line and a retry. The other cards are fine and the
 * person is not asked to do anything about the server. The API's own `message` is
 * safe to show but adds nothing a person can act on, so it is not printed.
 */
function ErrorRow({
  label,
  busy,
  onRetry,
}: {
  label: string;
  busy: boolean;
  onRetry: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <p className="text-body-sm text-muted">{label} could not load.</p>
      <Button size="sm" variant="ghost" loading={busy} onClick={onRetry}>
        Try again
      </Button>
    </li>
  );
}

/**
 * A money figure that is covered until the person asks.
 *
 * Six dots whatever the amount, so the mask does not give the magnitude away.
 * `Money` is only mounted when it is shown, and still masks itself if the shared
 * hide-amounts preference is on.
 */
function MaskedAmount({
  kobo,
  shown,
  onToggle,
}: {
  kobo: number;
  shown: boolean;
  onToggle: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      {shown ? (
        <Money amount={naira(kobo)} decimals />
      ) : (
        <span
          aria-label="Hidden"
          className="tabular text-body-sm font-medium text-muted"
        >
          {"•".repeat(6)}
        </span>
      )}
      <IconButton
        label={shown ? "Hide amounts" : "Show amounts"}
        size="sm"
        aria-pressed={shown}
        onClick={onToggle}
      >
        {shown ? (
          <EyeOff aria-hidden="true" className="size-4" />
        ) : (
          <Eye aria-hidden="true" className="size-4" />
        )}
      </IconButton>
    </span>
  );
}

/**
 * "Estimate", with the API's caveat behind it.
 *
 * The API says this sentence must be shown wherever the pay-early figure is. The
 * word is always visible beside the figure and the whole sentence is one tap or
 * hover away (and is read out to a screen reader without either), which keeps the
 * row to two lines without leaving the figure bare.
 */
function EstimateTag({ notice }: { notice: string }) {
  const id = useId();
  return (
    <span className="inline-flex items-center gap-1 text-meta text-muted">
      Estimate
      <InfoTooltip id={id} text={notice} label="About this estimate" />
    </span>
  );
}

/** The API's reason for a refusal, one tap or hover away and read out without either. */
function WhyNot({ reason }: { reason: string }) {
  const id = useId();
  return <InfoTooltip id={id} text={reason} label="Why not" />;
}

/** The status in the header: a fact, with a way to the screen it came from. */
function ClockBadge({ clock }: { clock: ClockInToday }) {
  const label =
    clock.state === "clocked_in"
      ? clock.clockIn
        ? `In since ${clock.clockIn}`
        : "Clocked in"
      : clock.state === "clocked_out"
        ? clock.clockOut
          ? `Out at ${clock.clockOut}`
          : "Clocked out"
        : "Not clocked in";
  return (
    <Link
      href="/people/attendance"
      aria-label={`${label}. Open attendance`}
      className="inline-flex rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
    >
      <Badge tone={clock.state === "clocked_in" ? "accent" : "neutral"} dot>
        {label}
      </Badge>
    </Link>
  );
}

/* ------------------------------------------------------------------ wording */

function noticeDetail(notice: ApiTodayNotice, timeZone: string): string {
  return [
    notice.pinned ? "Pinned" : null,
    notice.postedByName,
    formatDateShort(notice.publishedAt, timeZone),
  ]
    .filter((part): part is string => part !== null)
    .join(", ");
}

function noticeByline(notice: ApiTodayNotice, timeZone: string): string {
  const when = formatDateShort(notice.publishedAt, timeZone);
  return notice.postedByName
    ? `Posted by ${notice.postedByName}, ${when}`
    : `Posted ${when}`;
}

function policyDetail(policy: {
  category: string | null;
  version: number;
  previouslyAcceptedVersion: number | null;
}): string {
  /* A re-ask says so: without it the row reads as though they never bothered,
     when they accepted the last wording and it has changed. */
  if (policy.previouslyAcceptedVersion !== null) {
    return `Version ${policy.version}, you accepted ${policy.previouslyAcceptedVersion}`;
  }
  return policy.category
    ? `${policy.category}, version ${policy.version}`
    : `Version ${policy.version}`;
}
