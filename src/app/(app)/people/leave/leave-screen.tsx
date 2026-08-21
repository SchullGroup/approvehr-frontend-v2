"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarDays, Check, ChevronRight, Plus, Undo2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  Drawer,
  EmptyState,
  IconButton,
  ProgressMeter,
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
import { DeclineDialog } from "@/components/portal/decline-dialog";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import { daysLabel, type LeaveRow, type LeaveRowStatus } from "@/lib/api/leave";
import { useCan } from "@/lib/permissions";
import {
  usePublicHolidays,
  useLeaveBalancesFor,
  useLeaveMutations,
  useLeaveRequestDetail,
  useLeaveRequests,
} from "@/lib/store/leave-api";
import { useSession } from "@/lib/store/session";
import { TODAY, shortDate } from "@/lib/today";
import { BookLeaveDialog } from "./book-leave";

const STATUS: Record<LeaveRowStatus, { tone: BadgeTone; label: string }> = {
  pending: { tone: "warning", label: "Waiting" },
  approved: { tone: "success", label: "Approved" },
  declined: { tone: "danger", label: "Sent back" },
  cancelled: { tone: "neutral", label: "Withdrawn" },
};

/** How many balances the side card asks for. Connected, each one is a request. */
const BALANCES_SHOWN = 8;

/**
 * Whose leave the screen is about.
 *
 * `mine` is the only scope somebody without `APPROVE_LEAVE_ALL` gets. The API
 * does not restrict `GET /leave/requests` — anyone signed in can list the whole
 * company — so this is the interface declining to offer something it should not,
 * which is what `lib/permissions.ts` is for.
 */
type Scope = "everyone" | "mine";

/**
 * A stable empty array.
 *
 * Used when the signed-in account has no employee record and the scope is
 * "mine": there is exactly one `requests` binding on this screen and everything
 * reads it, rather than a filtered copy some panel forgets to use. That mistake
 * — rendering the unfiltered rows while computing a filtered `visible` — already
 * shipped once on the directory.
 */
const NO_REQUESTS: LeaveRow[] = [];

/**
 * Time off.
 *
 * Reads whichever source is live — `/api/v1/leave` when the API answers, this
 * browser's store when it does not — through `lib/store/leave-api.ts`. The badge
 * beside the title says which, because a demo that looks connected is worse than
 * one that says it is a demo.
 *
 * ## Approving here and approving in the inbox are one action
 *
 * Not two writes that have to agree. Connected, `/approvals` posts its decision
 * to an endpoint that routes into the same leave service this screen calls; in
 * demo mode the inbox's leave rows are derived from these requests. So a
 * decision made on either screen has already happened by the time you look at
 * the other one, and the balance has already moved with it.
 *
 * ## Why every row opens
 *
 * The list cannot answer the question that actually decides leave: **who else is
 * off those days.** That comes from `GET /leave/requests/:id`, one request at a
 * time, so it lives in the panel rather than in a column — along with the
 * balance the request draws down, which the API computes from the requests
 * themselves and never stores.
 */
export function LeaveScreen() {
  const search = useSearchParams();
  const toast = useToast();
  const canDecide = useCan("APPROVE_LEAVE_ALL");
  const session = useSession();

  /* `session.employeeId` is the person on the payroll. Never `user.id`, which is
     an account: both carry an `id`, a `firstName` and a `lastName`, so nothing
     in the type system catches the swap — it only shows up as one person's name
     beside another person's leave. */
  const employeeId = session.employeeId;

  const [scope, setScope] = useState<Scope>("everyone");
  /* Somebody who cannot decide leave for everyone is only shown their own. */
  const onlyMine = !canDecide || scope === "mine";

  const {
    requests: fetched,
    loading,
    error,
    connected,
    reload,
  } = useLeaveRequests({
    pageSize: 200,
    /* Connected this is the API's own filter, so the count in the header is the
       real one rather than the length of a page filtered afterwards. */
    ...(onlyMine && employeeId ? { employeeId } : {}),
  });

  /* An account with no employee record has no leave of its own, and must not be
     shown everybody else's as a consolation. */
  const noRecord = onlyMine && employeeId === null && !session.isLoading;
  const requests = noRecord ? NO_REQUESTS : fetched;

  const holidays = usePublicHolidays();
  const mutations = useLeaveMutations();

  /* Opened from the approvals inbox as `?request=<id>`, so "decide this" and
     "look at it properly" are one click apart. Read once, as the initial value:
     a click after that is the user's, and an effect syncing the two would fight
     them for control of the panel. */
  const [openId, setOpenId] = useState<string | null>(() =>
    search.get("request"),
  );
  const [booking, setBooking] = useState(false);
  const [declining, setDeclining] = useState<LeaveRow | null>(null);

  const detail = useLeaveRequestDetail(openId);

  /* Connected, the data is real and so is the date. In demo mode the seed is a
     fixed snapshot and `TODAY` is its "now" — using the real clock there would
     age the whole dataset until it stopped making sense. */
  const today = connected ? new Date().toISOString().slice(0, 10) : TODAY;

  const pending = requests.filter((r) => r.status === "pending");

  const monthAhead = useMemo(() => {
    const edge = new Date(`${today}T00:00:00.000Z`);
    edge.setUTCDate(edge.getUTCDate() + 31);
    const limit = edge.toISOString().slice(0, 10);
    return requests.filter(
      (r) => r.status === "approved" && r.from >= today && r.from <= limit,
    );
  }, [requests, today]);

  const daysBooked = requests
    .filter((r) => r.status === "approved")
    .reduce((sum, r) => sum + r.days, 0);

  const oldestPending = pending.reduce<number | null>((oldest, r) => {
    if (!r.requestedAt) return oldest;
    const days = Math.max(
      0,
      Math.round(
        (new Date(today).getTime() - new Date(r.requestedAt).getTime()) /
          86_400_000,
      ),
    );
    return oldest === null || days > oldest ? days : oldest;
  }, null);

  /* The people this screen is actually showing, so the balances card is about
     them rather than about whoever happens to be first in the directory. */
  const shown = useMemo(() => {
    const seen = new Map<string, string>();
    for (const request of requests) {
      if (!seen.has(request.employeeId)) {
        seen.set(request.employeeId, request.employeeName);
      }
      if (seen.size >= BALANCES_SHOWN) break;
    }
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [requests]);

  const balances = useLeaveBalancesFor(
    shown.map((person) => person.id),
    "Annual",
  );

  /* Annual leave taken against annual leave granted, for the people on screen.
     A low figure late in the year is a liability, not a saving: untaken leave
     still has to be paid out. */
  const utilisation = useMemo(() => {
    let entitled = 0;
    let taken = 0;
    for (const person of shown) {
      const balance = balances.of(person.id);
      if (!balance) continue;
      entitled += balance.entitled;
      taken += balance.taken;
    }
    return entitled === 0 ? null : Math.round((taken / entitled) * 100);
  }, [shown, balances]);

  /** Every write reports its own failure. The API's message is the useful part. */
  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      reload();
      toast.push({ title: success, tone: "success" });
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

  const approve = (request: LeaveRow) =>
    run(
      () => mutations.decide(request.id, "approved"),
      `${request.employeeName}'s leave approved`,
    );

  const sendBack = (request: LeaveRow, note: string) =>
    run(
      () => mutations.decide(request.id, "declined", note),
      `${request.employeeName}'s request went back to them`,
    );

  const undo = (request: LeaveRow) =>
    run(
      () => mutations.reopen(request.id),
      `${request.employeeName}'s request is waiting again`,
    );

  return (
    <>
      <PageHeader
        title="Time off"
        description={
          onlyMine
            ? "Your requests, your balance, and what you have left."
            : "Requests, balances, and who is away when."
        }
        meta={
          <Badge tone={connected ? "success" : "warning"} size="sm" dot>
            {connected ? "Live from the API" : "Demo data, this browser only"}
          </Badge>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ButtonLink href="/approvals" variant="secondary" size="sm">
              Approvals inbox
            </ButtonLink>
            <Button variant="accent" size="sm" onClick={() => setBooking(true)}>
              <Plus aria-hidden="true" className="size-4" />
              Book leave
            </Button>
          </div>
        }
      />

      <PageBody className="flex flex-col gap-6">
        {error && (
          <Callout tone="danger" title="Could not read the requests">
            {error.message}
          </Callout>
        )}

        {noRecord && (
          <Callout tone="info" title="This account has no employee record">
            Leave belongs to a person on the payroll, and this sign-in is not
            linked to one yet. Ask HR to connect them.
          </Callout>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Waiting on a decision"
            value={String(pending.length)}
            hint={
              oldestPending !== null
                ? `oldest ${daysLabel(oldestPending)}`
                : undefined
            }
          />
          <Stat
            label="Away in the next month"
            value={String(monthAhead.length)}
            hint="approved, starting within 31 days"
          />
          <Stat label="Days approved this year" value={String(daysBooked)} />
          <Stat
            label="Annual leave used"
            value={utilisation === null ? "—" : `${utilisation}%`}
            trend={
              utilisation !== null && utilisation < 50
                ? { direction: "down", label: "Accruing liability" }
                : undefined
            }
            hint="of entitlement, people shown below"
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <Card>
            <CardHeader
              title="Requests"
              description="Waiting first, then by start date."
              action={
                <div className="flex items-center gap-3">
                  {loading && (
                    <span className="text-[0.75rem] text-muted">Loading…</span>
                  )}
                  {/* Offered only to somebody who can see everybody's. For
                      anyone else there is nothing to switch between. */}
                  {canDecide && (
                    <SegmentedControl
                      label="Whose leave to show"
                      value={scope}
                      onChange={setScope}
                      options={[
                        { value: "everyone", label: "Everyone" },
                        { value: "mine", label: "Mine" },
                      ]}
                    />
                  )}
                </div>
              }
            />
            {requests.length === 0 && !loading ? (
              <EmptyState
                icon={<CalendarDays aria-hidden="true" />}
                title={onlyMine ? "You have no leave booked" : "No leave booked yet"}
                description="Book leave and it appears here, and in the approvals inbox, straight away."
                action={
                  <Button
                    variant="accent"
                    size="sm"
                    onClick={() => setBooking(true)}
                  >
                    <Plus aria-hidden="true" className="size-4" />
                    Book leave
                  </Button>
                }
              />
            ) : (
              <TableWrap className="rounded-none border-0">
                <THead>
                  <TH>Employee</TH>
                  <TH>Type</TH>
                  <TH>Dates</TH>
                  <TH align="right">Days</TH>
                  <TH>Approver</TH>
                  <TH>Status</TH>
                  <TH align="right">Decision</TH>
                  <TH align="right">
                    <span className="sr-only">Open</span>
                  </TH>
                </THead>
                <TBody>
                  {requests.map((r) => (
                    <TR key={r.id}>
                      <TDPrimary
                        title={
                          <Link
                            href={`/people/${r.employeeId}`}
                            className="hover:text-accent-text hover:underline underline-offset-4"
                          >
                            {r.employeeName}
                          </Link>
                        }
                        subtitle={r.reason ?? r.decisionNote ?? undefined}
                      />
                      <TD>{r.leaveType}</TD>
                      <TD className="tabular whitespace-nowrap">
                        {r.from} → {r.to}
                      </TD>
                      <TD align="right" className="tabular font-medium text-ink">
                        {r.days}
                      </TD>
                      <TD>{r.approverName ?? "—"}</TD>
                      <TD>
                        <Badge tone={STATUS[r.status].tone} size="sm" dot>
                          {STATUS[r.status].label}
                        </Badge>
                        {r.decidedAt && r.status !== "pending" && (
                          <span className="mt-0.5 block text-[0.75rem] text-faint">
                            {shortDate(r.decidedAt)}
                          </span>
                        )}
                      </TD>
                      <TD align="right">
                        {!canDecide ? (
                          <span className="text-[0.75rem] text-faint">—</span>
                        ) : r.status === "pending" ? (
                          <div className="flex justify-end gap-1.5">
                            <Button
                              variant="approve"
                              size="sm"
                              onClick={() => void approve(r)}
                              aria-label={`Approve ${r.employeeName}'s leave`}
                            >
                              <Check aria-hidden="true" className="size-3.5" />
                              Approve
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setDeclining(r)}
                              aria-label={`Send back ${r.employeeName}'s request`}
                            >
                              <X aria-hidden="true" className="size-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void undo(r)}
                            aria-label={`Undo the decision on ${r.employeeName}'s request`}
                          >
                            <Undo2 aria-hidden="true" className="size-3.5" />
                            Undo
                          </Button>
                        )}
                      </TD>
                      <TD align="right">
                        <IconButton
                          label={`Open ${r.employeeName}'s ${r.leaveType} request`}
                          size="sm"
                          variant="ghost"
                          onClick={() => setOpenId(r.id)}
                        >
                          <ChevronRight aria-hidden="true" className="size-4" />
                        </IconButton>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </TableWrap>
            )}
          </Card>

          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader
                title="Annual leave left"
                description="Pending days are already held back."
              />
              <CardBody className="flex flex-col gap-3.5">
                {balances.loading && (
                  <p className="text-[0.875rem] text-muted">Loading balances…</p>
                )}
                {shown.length === 0 && !balances.loading && (
                  <p className="text-[0.875rem] text-muted">
                    Nobody has booked leave yet.
                  </p>
                )}
                {shown.map((person) => {
                  const balance = balances.of(person.id);
                  if (!balance) return null;
                  return (
                    <div key={person.id}>
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="truncate text-[0.875rem] text-body">
                          {person.name}
                        </span>
                        <span
                          className={cn(
                            "tabular shrink-0 text-[0.75rem]",
                            balance.remaining <= 3
                              ? "text-warning-text"
                              : "text-muted",
                          )}
                        >
                          {balance.remaining} left
                          {balance.pending > 0 && ` · ${balance.pending} pending`}
                        </span>
                      </div>
                      <ProgressMeter
                        value={balance.taken}
                        max={balance.entitled}
                        size="sm"
                        tone={balance.remaining <= 3 ? "warning" : "accent"}
                      />
                    </div>
                  );
                })}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Public holidays"
                description={
                  holidays.connected
                    ? "The company calendar."
                    : "Maintained for you."
                }
                action={
                  <CalendarDays aria-hidden="true" className="size-4 text-faint" />
                }
              />
              <CardBody className="flex flex-col gap-2">
                {holidays.loading && (
                  <p className="text-[0.875rem] text-muted">Loading holidays…</p>
                )}

                {/* The seed list is not shown here as a stand-in. A date nobody
                    has published is a date nobody should roster against. */}
                {holidays.unavailable && (
                  <p className="text-[0.875rem] text-muted">
                    The API does not publish a holiday calendar yet, so none is
                    shown. Nigerian dates move at short notice and a stale list
                    is worse than no list.
                  </p>
                )}

                {!holidays.loading &&
                  !holidays.unavailable &&
                  holidays.holidays.length === 0 && (
                    <p className="text-[0.875rem] text-muted">
                      Nothing on the calendar yet.
                    </p>
                  )}

                {holidays.holidays.map((h) => (
                  <div
                    key={`${h.date}-${h.name}`}
                    className="flex items-center gap-3 rounded-md border border-line p-2.5"
                  >
                    <span className="tabular w-20 shrink-0 text-[0.75rem] text-muted">
                      {h.confirmed ? h.date.slice(5) : "TBC"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[0.875rem] text-ink">
                      {h.name}
                    </span>
                    {!h.confirmed && (
                      <Badge tone="warning" size="sm">
                        Awaiting proclamation
                      </Badge>
                    )}
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>
        </div>
      </PageBody>

      <RequestPanel
        open={openId !== null}
        onClose={() => setOpenId(null)}
        loading={detail.loading}
        detail={detail.detail}
        canDecide={canDecide}
        onApprove={approve}
        onSendBack={setDeclining}
        onUndo={undo}
      />

      <DeclineDialog
        open={declining !== null}
        what={
          declining ? `${declining.employeeName}'s ${declining.leaveType} leave` : ""
        }
        onClose={() => setDeclining(null)}
        onConfirm={async (note) => {
          if (declining) await sendBack(declining, note);
        }}
      />

      <BookLeaveDialog
        open={booking}
        onClose={() => setBooking(false)}
        onCreated={reload}
        requests={requests}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One request, with the two things a decision actually turns on.
 *
 * The balance, and who else is off. Connected they come from the API, which can
 * see the whole company; in demo mode they are derived from this browser's
 * requests, which can only see what it holds. Neither is presented as the other.
 */
function RequestPanel({
  open,
  onClose,
  loading,
  detail,
  canDecide,
  onApprove,
  onSendBack,
  onUndo,
}: {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  detail: ReturnType<typeof useLeaveRequestDetail>["detail"];
  canDecide: boolean;
  onApprove: (request: LeaveRow) => void;
  onSendBack: (request: LeaveRow) => void;
  onUndo: (request: LeaveRow) => void;
}) {
  const request = detail?.request;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={
        request ? `${request.leaveType} leave — ${request.employeeName}` : "Request"
      }
      description={
        request
          ? `${request.from} to ${request.to} · ${daysLabel(request.days)}`
          : undefined
      }
      footer={
        request && canDecide ? (
          <div className="flex flex-wrap justify-end gap-2">
            {request.status === "pending" ? (
              <>
                <Button variant="secondary" onClick={() => onSendBack(request)}>
                  <X aria-hidden="true" className="size-3.5" />
                  Send back
                </Button>
                <Button
                  variant="approve"
                  onClick={() => {
                    onApprove(request);
                    onClose();
                  }}
                >
                  <Check aria-hidden="true" className="size-3.5" />
                  Approve
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                onClick={() => {
                  onUndo(request);
                  onClose();
                }}
              >
                <Undo2 aria-hidden="true" className="size-3.5" />
                Undo the decision
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      {loading && <p className="text-[0.875rem] text-muted">Loading…</p>}

      {!loading && !request && (
        <p className="text-[0.875rem] text-muted">
          That request is no longer here. It may have been withdrawn.
        </p>
      )}

      {request && (
        <div className="flex flex-col gap-6">
          <DescriptionList
            items={[
              { term: "Status", value: STATUS[request.status].label },
              { term: "Job title", value: request.employeeJobTitle ?? "—" },
              {
                term: "Raised",
                value: request.requestedAt ? shortDate(request.requestedAt) : "—",
              },
              { term: "Approver", value: request.approverName ?? "Not routed" },
              { term: "Reason given", value: request.reason ?? "None given" },
              {
                term: "Decision note",
                value: request.decisionNote ?? "—",
              },
            ]}
          />

          {detail?.balance && (
            <div>
              <p className="text-[0.75rem] font-semibold tracking-wide text-muted">
                {detail.balance.leaveType} balance
              </p>
              <p className="mt-1 text-[0.875rem] text-body">
                {detail.balance.remaining} of {detail.balance.entitled} days left
                {detail.balance.pending > 0 &&
                  `, with ${detail.balance.pending} still waiting on a decision`}
                .
              </p>
              <ProgressMeter
                className="mt-2"
                value={detail.balance.taken}
                max={detail.balance.entitled}
                size="sm"
                tone={detail.balance.remaining <= 3 ? "warning" : "accent"}
              />
              {detail.balance.remaining < 0 && (
                <p className="mt-2 text-[0.875rem] text-warning-text">
                  Approving this takes them past their entitlement. The days over
                  are unpaid unless you say otherwise.
                </p>
              )}
            </div>
          )}

          <div>
            <p className="text-[0.75rem] font-semibold tracking-wide text-muted">
              Who else is off those days
            </p>
            {detail && detail.clashes.length === 0 ? (
              <p className="mt-1 text-[0.875rem] text-body">
                Nobody else. Cover is not a problem here.
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {detail?.clashes.map((clash) => (
                  <li
                    key={clash.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-line p-2.5 text-[0.875rem]"
                  >
                    <Link
                      href={`/people/${clash.employeeId}`}
                      className="min-w-0 flex-1 truncate text-ink hover:text-accent-text hover:underline underline-offset-4"
                    >
                      {clash.employeeName}
                    </Link>
                    <span className="tabular text-[0.75rem] text-muted">
                      {clash.from} → {clash.to}
                    </span>
                    <Badge tone={STATUS[clash.status].tone} size="sm">
                      {STATUS[clash.status].label}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
