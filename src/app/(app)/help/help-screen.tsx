"use client";

import { useState } from "react";
import { AlertTriangle, Inbox, LifeBuoy, Search, Send, UserPlus } from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Callout,
  BarChart,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  SegmentedControl,
  Select,
  Skeleton,
  Stat,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  Textarea,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  formatWorkingMinutes,
  responseTargetLine,
  ticketClock,
  type ApiTicket,
} from "@/lib/api/helpdesk";
import { useCan } from "@/lib/permissions";
import {
  useHelpdeskPulse,
  useRaiseTicket,
  useTickets,
  type TicketScope,
  type TicketView,
} from "@/lib/store/helpdesk";
import { PRIORITY, STATUS, TicketClockBadge } from "./ticket-labels";
import { TicketThread } from "./ticket-thread";
import { KbSearch } from "@/app/(app)/help/kb/kb-search";

/**
 * `/help` — one route, two readers.
 *
 * ## Why one route
 *
 * The system we are replacing has a page per audience, so a business with thirty
 * staff has to learn a filing system before it can ask a question. This is one
 * URL: a staff member sees the requests they raised and a button that gets them
 * help; somebody who handles tickets sees the queue. The link a colleague sends
 * works for whoever opens it.
 *
 * `EDIT_RECORDS` is the line, because it is the line the API draws — there is no
 * separate help desk permission in the enum, and a screen that invented one
 * would be gating on something the roles editor cannot grant.
 *
 * ## The queue row carries what triage needs, and nothing else
 *
 * Who, what, how urgent, how long they have waited, whether the promise is about
 * to break, and who has it. Everything else is one click into the thread.
 *
 * ## Working minutes, never clock hours
 *
 * Every duration here arrived already counted against the company's own working
 * day — 08:00 to 17:00 by default, weekends and public holidays excluded. So a
 * request sent at 5pm on Friday has used none of a four-working-hour target by
 * Monday morning. `formatWorkingMinutes` is the only formatter and it always says
 * "working"; converting one of these figures into a clock time would invent a
 * promise nothing behind the screen made.
 */
export function HelpScreen() {
  const handlesTickets = useCan("EDIT_RECORDS");
  return handlesTickets ? <QueueView /> : <MyRequestsView />;
}

/* ------------------------------------------------------------------- the queue */

/**
 * Five views, each one server query.
 *
 * `scope:view` in one value so the control is one control. The alternative — a
 * scope picker beside a status picker — offers combinations that mean nothing
 * ("overdue, on my desk, sorted") and makes the reader assemble the question
 * they wanted.
 */
const QUEUE_VIEWS: { value: string; label: string }[] = [
  { value: "queue:open", label: "Everything open" },
  { value: "queue:overdue", label: "Not answered in time" },
  { value: "assigned:open", label: "On my desk" },
  { value: "mine:open", label: "I raised" },
  { value: "queue:resolved", label: "Sorted" },
];

function QueueView() {
  const [choice, setChoice] = useState("queue:open");
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [raising, setRaising] = useState(false);
  const [bump, setBump] = useState(0);

  const [scope, view] = choice.split(":") as [TicketScope, TicketView];
  const { categories, workingDay } = useRaiseTicket();
  const list = useTickets({ scope, view, q, categoryId }, bump);
  const pulse = useHelpdeskPulse(true, bump);

  const refresh = () => setBump((n) => n + 1);

  return (
    <>
      <PageHeader
        title="Help desk"
        meta={
          list.live || !DEMO_ENABLED ? undefined : (
            <Badge tone="warning" size="sm" dot>
              Demo data
            </Badge>
          )
        }
        action={
          <Button variant="secondary" size="sm" onClick={() => setRaising(true)}>
            <LifeBuoy aria-hidden="true" className="size-4" />
            Raise a request
          </Button>
        }
      />

      <PageBody className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Open"
            value={pulse.loading ? "—" : String(pulse.open)}
            hint="not sorted yet"
          />
          {/*
            The API's `overdue` is narrower than "breached": open, and past the
            *first-reply* target. The label says that rather than the shorter
            word, because a number under a label that overstates it is the kind
            of figure people stop trusting.
          */}
          <Stat
            label="Not answered in time"
            value={pulse.loading ? "—" : String(pulse.overdue)}
            {...(pulse.overdue > 0
              ? { trend: { direction: "down" as const, label: "Past target" } }
              : {})}
            hint="still waiting on a first reply"
          />
          <Stat
            label="Nobody on it"
            value={pulse.loading ? "—" : String(pulse.unassigned)}
            hint="open, unassigned"
          />
          <Stat
            label="Median first reply"
            value={
              pulse.medianFirstResponseMinutes === null
                ? "—"
                : formatWorkingMinutes(
                    pulse.medianFirstResponseMinutes,
                    pulse.minutesPerDay,
                  )
            }
            hint="last 30 days"
          />
        </div>

        {/* ---- What people are asking about ------------------------------
            Four counts of open tickets say how much is waiting and never say
            what any of it is about. `volume.byCategory` has been on the
            analytics response the whole time — the pulse kept three of its
            fifteen fields — and it is already `{ name, count }`, which is the
            shape a chart takes.

            Absent rather than empty when there is nothing to say: null means
            the request has not answered or this is demo mode, where the seed's
            tickets carry no category. An empty bar chart would read as "nobody
            has asked us anything". */}
        {pulse.byCategory && pulse.byCategory.length > 0 && (
          <Card>
            <CardHeader
              title="What people are asking about"
              description="Tickets raised in the last 30 days, most-asked first."
            />
            <CardBody>
              <BarChart
                colorBy="series"
                format={(n) => String(n)}
                caption="Tickets raised by category over the last 30 days"
                points={[...pulse.byCategory]
                  .sort((a, b) => b.count - a.count)
                  .map((row) => ({ label: row.name, value: row.count }))}
              />
            </CardBody>
          </Card>
        )}

        {/*
          A count and a button, not a paragraph. The number is the whole point
          and pressing it filters the queue down to exactly those tickets.
        */}
        {pulse.overdue > 0 && (
          <Callout
            tone="danger"
            title={`${pulse.overdue} ${
              pulse.overdue === 1 ? "person has" : "people have"
            } had no reply in the time you promised`}
            icon={<AlertTriangle aria-hidden="true" />}
          >
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setChoice("queue:overdue")}
            >
              Show me those
            </Button>
          </Callout>
        )}

        <Card>
          <CardHeader
            title="Queue"
            description="Soonest promise first. Requests with no target set sit at the bottom."
            action={
              <SegmentedControl
                label="Which requests"
                options={QUEUE_VIEWS}
                value={choice}
                onChange={setChoice}
              />
            }
          />

          <div className="flex flex-wrap items-end gap-3 border-b border-line px-5 py-4">
            <Field label="Search" className="min-w-[14rem] flex-1">
              <Input
                value={q}
                placeholder="Subject, reference or wording"
                icon={<Search aria-hidden="true" />}
                onChange={(event) => {
                  const value = event.target.value;
                  setQ(value);
                }}
              />
            </Field>
            <Field label="Category" className="min-w-[12rem]">
              <Select
                value={categoryId}
                onChange={(event) => {
                  const value = event.target.value;
                  setCategoryId(value);
                }}
              >
                <option value="">Every category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <TicketTable
            tickets={list.tickets}
            loading={list.loading}
            error={list.error}
            minutesPerDay={workingDay.minutesPerDay}
            triage
            onOpen={setOpenId}
            emptyTitle={
              view === "overdue"
                ? "Everybody has had a reply in time"
                : view === "resolved"
                  ? "Nothing sorted yet"
                  : "The queue is empty"
            }
            emptyDescription={
              view === "overdue"
                ? "Every request still waiting on a first reply is inside its target."
                : "Nothing is waiting on you."
            }
          />

          <Pager
            page={list.page}
            pageSize={list.pageSize}
            total={list.total}
            totalPages={list.totalPages}
          />
        </Card>
      </PageBody>

      {openId !== null && (
        <TicketThread
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={refresh}
          minutesPerDay={workingDay.minutesPerDay}
        />
      )}

      {raising && (
        <RaiseRequestModal onClose={() => setRaising(false)} onRaised={refresh} />
      )}
    </>
  );
}

/* ---------------------------------------------------------- a staff member's own */

function MyRequestsView() {
  const [view, setView] = useState<TicketView>("open");
  const [openId, setOpenId] = useState<string | null>(null);
  const [raising, setRaising] = useState(false);
  const [bump, setBump] = useState(0);

  const { workingDay } = useRaiseTicket();
  const list = useTickets({ scope: "mine", view }, bump);

  return (
    <>
      <PageHeader
        title="Get help"
        meta={
          list.live || !DEMO_ENABLED ? undefined : (
            <Badge tone="warning" size="sm" dot>
              Demo data
            </Badge>
          )
        }
        action={
          <Button variant="accent" size="sm" onClick={() => setRaising(true)}>
            <LifeBuoy aria-hidden="true" className="size-4" />
            Get help
          </Button>
        }
      />

      <PageBody className="flex flex-col gap-6">
        {/* Search first. Most requests are questions somebody already answered. */}
        <Card>
          <CardBody>
            <KbSearch label="What do you need help with?" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Your requests"
            action={
              <SegmentedControl
                label="Which of your requests"
                options={[
                  { value: "open", label: "Still open" },
                  { value: "resolved", label: "Sorted" },
                ]}
                value={view}
                onChange={setView}
              />
            }
          />

          <TicketTable
            tickets={list.tickets}
            loading={list.loading}
            error={list.error}
            minutesPerDay={workingDay.minutesPerDay}
            triage={false}
            onOpen={setOpenId}
            emptyTitle={
              view === "resolved"
                ? "Nothing sorted yet"
                : "You have not asked anything"
            }
            emptyDescription={
              view === "resolved"
                ? "Anything HR closes off shows up here with what they did about it."
                : "Ask a question and it lands with whoever handles that kind of thing."
            }
            emptyAction={
              view === "open" ? (
                <Button variant="accent" size="sm" onClick={() => setRaising(true)}>
                  Get help
                </Button>
              ) : undefined
            }
          />

          <Pager
            page={list.page}
            pageSize={list.pageSize}
            total={list.total}
            totalPages={list.totalPages}
          />
        </Card>
      </PageBody>

      {openId !== null && (
        <TicketThread
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => setBump((n) => n + 1)}
          minutesPerDay={workingDay.minutesPerDay}
        />
      )}

      {raising && (
        <RaiseRequestModal
          onClose={() => setRaising(false)}
          onRaised={() => setBump((n) => n + 1)}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------- the table */

/**
 * One table, two audiences.
 *
 * `triage` adds the three columns only somebody working the queue needs — who
 * raised it, who has it, and the second line under the clock. A staff member
 * looking at their own five requests does not need to be told they raised them.
 */
function TicketTable({
  tickets,
  loading,
  error,
  minutesPerDay,
  triage,
  onOpen,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: {
  tickets: ApiTicket[];
  loading: boolean;
  error: ApiError | null;
  minutesPerDay: number;
  triage: boolean;
  onOpen: (id: string) => void;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: React.ReactNode;
}) {
  if (error) {
    return (
      <div className="p-5">
        <LoadFailure subject="the requests" error={error} />
      </div>
    );
  }

  if (loading && tickets.length === 0) {
    return (
      <div className="flex flex-col gap-2 p-5">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <EmptyState
        icon={<Inbox aria-hidden="true" />}
        title={emptyTitle}
        description={emptyDescription}
        {...(emptyAction ? { action: emptyAction } : {})}
      />
    );
  }

  return (
    <TableWrap
      className="rounded-none border-0 border-t"
      caption="Requests, soonest promise first"
    >
      <THead>
        <TH>Request</TH>
        {triage && <TH>Raised by</TH>}
        <TH>Category</TH>
        <TH>Urgency</TH>
        <TH>Waiting</TH>
        {triage && <TH>Who has it</TH>}
        <TH>Where it is up to</TH>
      </THead>
      <TBody>
        {tickets.map((ticket) => {
          const late = ticketClock(ticket, minutesPerDay).state === "overdue";
          return (
            <TR
              key={ticket.id}
              interactive
              onClick={() => onOpen(ticket.id)}
              className={late ? "bg-danger-soft" : undefined}
            >
              <TDPrimary
                title={
                  /* A button, not only a clickable row. A `tr` with an onClick
                     is unreachable by keyboard and absent from the
                     accessibility tree — the row click stays a convenience for
                     a mouse, and this is the control that opens the thread. */
                  <button
                    type="button"
                    className="text-left font-medium text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpen(ticket.id);
                    }}
                  >
                    {ticket.subject}
                  </button>
                }
                subtitle={`${ticket.reference} · ${ticket.commentCount} message${
                  ticket.commentCount === 1 ? "" : "s"
                }`}
              />
              {triage && (
                <TD>
                  {ticket.requester ? (
                    <span className="flex items-center gap-2">
                      <Avatar name={ticket.requester.name} size="xs" />
                      <span className="truncate">{ticket.requester.name}</span>
                    </span>
                  ) : (
                    <span className="text-muted">Not recorded</span>
                  )}
                </TD>
              )}
              <TD>
                <Badge tone="neutral" size="sm">
                  {ticket.categoryName ?? ticket.category}
                </Badge>
              </TD>
              <TD>
                <Badge tone={PRIORITY[ticket.priority].tone} size="sm">
                  {PRIORITY[ticket.priority].label}
                </Badge>
              </TD>
              <TD>
                <TicketClockBadge
                  ticket={ticket}
                  minutesPerDay={minutesPerDay}
                  detail={triage}
                />
              </TD>
              {triage && (
                <TD>
                  {ticket.assignee ? (
                    ticket.assignee.name
                  ) : (
                    <Badge
                      tone="warning"
                      size="sm"
                      icon={<UserPlus aria-hidden="true" />}
                    >
                      Nobody yet
                    </Badge>
                  )}
                </TD>
              )}
              <TD>
                <Badge tone={STATUS[ticket.status].tone} size="sm" dot>
                  {STATUS[ticket.status].label}
                </Badge>
              </TD>
            </TR>
          );
        })}
      </TBody>
    </TableWrap>
  );
}

/* ------------------------------------------------------------------- the pager */

function Pager({
  page,
  pageSize,
  total,
  totalPages,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}) {
  if (total === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);

  return (
    <div className="flex items-center justify-between border-t border-line px-5 py-3">
      <p className="tabular text-body-sm text-muted">
        {first}–{last} of {total}
      </p>
      {totalPages > 1 && (
        <p className="tabular text-body-sm text-muted">
          Page {page} of {totalPages}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ raising a request */

/**
 * Three fields, and the one number the person actually wants.
 *
 * Category, subject, description. **No priority field**: asking somebody to
 * grade their own problem produces a queue of urgent everything, and whoever
 * triages sets it in a second. The API defaults it to normal.
 *
 * Picking a category prints its promise — "Usually answered within 4 working
 * hours" — because that is the only thing on this form the person came for. It
 * stays in working hours and is never turned into a clock time: the target is
 * measured against the company's open hours, so a request sent at 5pm on Friday
 * is not late by Monday.
 */
function RaiseRequestModal({
  onClose,
  onRaised,
}: {
  onClose: () => void;
  onRaised: () => void;
}) {
  const { categories, workingDay, raise } = useRaiseTicket();
  const toast = useToast();
  const [categoryId, setCategoryId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const chosen = categories.find((category) => category.id === categoryId) ?? null;
  const promise = chosen
    ? (responseTargetLine(
        chosen.sla?.firstResponseMinutes ?? null,
        workingDay.minutesPerDay,
      ) ?? "No reply target set for this category.")
    : undefined;

  const ready = categoryId !== "" && subject.trim().length >= 4;

  const submit = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await raise({
        subject: subject.trim(),
        categoryId,
        ...(body.trim() ? { body: body.trim() } : {}),
      });
      toast.push({
        title: "Sent",
        tone: "success",
        ...(chosen
          ? { detail: `Filed under ${chosen.name}. Replies land in this list.` }
          : {}),
      });
      onRaised();
      onClose();
    } catch (error) {
      setFailure(
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Get help"
      description="Three things and it is on somebody's desk."
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={!ready || busy}
            onClick={() => void submit()}
          >
            <Send aria-hidden="true" className="size-4" />
            {busy ? "Sending…" : "Send request"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* The best request is the one nobody had to raise. */}
        <KbSearch
          label="Search first — this may already be answered"
          limit={4}
        />

        {failure && (
          <Callout tone="danger" title="Not sent">
            {failure}
          </Callout>
        )}

        <Field
          label="What is it about"
          required
          {...(promise ? { help: promise } : {})}
        >
          <Select
            value={categoryId}
            onChange={(event) => {
              const value = event.target.value;
              setCategoryId(value);
            }}
          >
            <option value="">Pick one</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="In a few words" required>
          <Input
            value={subject}
            autoFocus
            placeholder="My July payslip is missing"
            onChange={(event) => {
              const value = event.target.value;
              setSubject(value);
            }}
          />
        </Field>

        {/*
          The one line about a capability nobody has wired. There is no upload
          seam behind this product yet, so there is no attach control here to
          press — saying so beside the box that does work is the honest version.
        */}
        <Field
          label="What is happening"
          help="You cannot attach a file yet — type the details, and whoever picks it up will ask for anything else in the replies."
        >
          <Textarea
            value={body}
            rows={5}
            placeholder="What you expected, what happened instead, and anything you have already tried."
            onChange={(event) => {
              const value = event.target.value;
              setBody(value);
            }}
          />
        </Field>
      </div>
    </Modal>
  );
}
