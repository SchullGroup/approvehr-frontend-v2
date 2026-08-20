"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Check, Plus, Undo2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  ProgressMeter,
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
import { PageBody, PageHeader } from "@/components/portal/shell";
import { EMPLOYEES, employeeById } from "@/lib/mock/people";
import {
  PUBLIC_HOLIDAYS,
  leaveEmployee,
  type LeaveRequest,
  type LeaveStatus,
} from "@/lib/mock/workflows";
import { useLeaveStore } from "@/lib/store/leave";
import { useLeaveBalances } from "@/lib/store/leave-balances";
import { remainingDays } from "@/lib/workflows/leave";
import { fullName } from "@/lib/types";
import { TODAY, shortDate } from "@/lib/today";
import { BookLeaveDialog } from "./book-leave";

const STATUS: Record<LeaveStatus, { tone: BadgeTone; label: string }> = {
  pending: { tone: "warning", label: "Pending" },
  approved: { tone: "success", label: "Approved" },
  declined: { tone: "danger", label: "Declined" },
  cancelled: { tone: "neutral", label: "Cancelled" },
};

/**
 * Time off.
 *
 * Every number on this screen is derived from the one leave store, including the
 * balances — `taken` and `pending` are computed from the requests rather than
 * stored, so approving a row here moves the bar beside it and the same figure on
 * the employee's own record. The approval inbox reads the same store, so a
 * decision made there has already happened by the time you arrive here.
 */
export function LeaveScreen() {
  const leave = useLeaveStore();
  const balances = useLeaveBalances();
  const toast = useToast();
  const [booking, setBooking] = useState(false);

  const requests = leave.requests;
  const pending = requests.filter((r) => r.status === "pending");
  const approvedUpcoming = requests.filter(
    (r) => r.status === "approved" && r.from >= TODAY,
  );
  const daysBooked = requests
    .filter((r) => r.status === "approved")
    .reduce((s, r) => s + r.days, 0);

  /* Company-wide annual leave utilisation. A low number this late in the year is
     a liability, not a saving — untaken leave still has to be paid out. */
  const utilisation = useMemo(() => {
    const annual = EMPLOYEES.map((e) =>
      balances.forEmployee(e.id).find((b) => b.type === "Annual"),
    ).filter((b): b is NonNullable<typeof b> => b !== undefined);
    const entitled = annual.reduce((s, b) => s + b.entitled, 0);
    const taken = annual.reduce((s, b) => s + b.taken, 0);
    return entitled === 0 ? 0 : Math.round((taken / entitled) * 100);
  }, [balances]);

  const oldestPending = pending.reduce<number | null>((oldest, r) => {
    if (!r.requestedAt) return oldest;
    const days = Math.max(
      0,
      Math.round(
        (new Date(TODAY).getTime() - new Date(r.requestedAt).getTime()) /
          86_400_000,
      ),
    );
    return oldest === null || days > oldest ? days : oldest;
  }, null);

  function decide(request: LeaveRequest, decision: "approved" | "declined") {
    leave.decide(
      request.id,
      decision,
      decision === "declined" ? "Sent back from the time-off screen." : undefined,
    );
    toast.push({
      title:
        decision === "approved"
          ? `${leaveEmployee(request)}'s leave approved`
          : `${leaveEmployee(request)}'s request sent back`,
      tone: decision === "approved" ? "success" : "info",
      detail:
        decision === "approved"
          ? `${request.days} ${
              request.days === 1 ? "day" : "days"
            } moved from pending to taken. It has cleared your approval inbox.`
          : "It has cleared your approval inbox and is back with them.",
    });
  }

  return (
    <>
      <PageHeader
        title="Time off"
        description="Requests, balances, and who is away when."
        action={
          <Button variant="accent" size="sm" onClick={() => setBooking(true)}>
            <Plus aria-hidden="true" className="size-4" />
            Book leave
          </Button>
        }
      />

      <PageBody className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Awaiting approval"
            value={String(pending.length)}
            hint={
              oldestPending !== null
                ? `oldest ${oldestPending} ${oldestPending === 1 ? "day" : "days"}`
                : undefined
            }
          />
          <Stat
            label="Away in the next month"
            value={String(approvedUpcoming.length)}
          />
          <Stat label="Days booked this year" value={String(daysBooked)} />
          <Stat
            label="Annual leave used"
            value={`${utilisation}%`}
            trend={
              utilisation < 50
                ? { direction: "down", label: "Accruing liability" }
                : undefined
            }
            hint="of entitlement"
          />
        </div>

        {pending.length > 0 && (
          <Callout tone="info" title="These are the same rows as your approvals inbox">
            Deciding here and deciding there are the same action on the same
            record — the balance below moves either way, and the row leaves both
            screens at once.
          </Callout>
        )}

        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <Card>
            <CardHeader
              title="Requests"
              description="Pending first, then most recent."
            />
            <TableWrap className="rounded-none border-0">
              <THead>
                <TH>Employee</TH>
                <TH>Type</TH>
                <TH>Dates</TH>
                <TH align="right">Days</TH>
                <TH>Approver</TH>
                <TH>Status</TH>
                <TH align="right">Decision</TH>
              </THead>
              <TBody>
                {[...requests]
                  .sort((a, b) =>
                    a.status === "pending" && b.status !== "pending"
                      ? -1
                      : b.status === "pending" && a.status !== "pending"
                        ? 1
                        : b.from.localeCompare(a.from),
                  )
                  .map((r) => {
                    const approver = r.approverId
                      ? employeeById(r.approverId)
                      : null;
                    const balance = balances.forType(r.employeeId, r.type);
                    return (
                      <TR key={r.id} interactive>
                        <TDPrimary
                          title={
                            <Link
                              href={`/people/${r.employeeId}`}
                              className="hover:text-accent-text hover:underline underline-offset-4"
                            >
                              {leaveEmployee(r)}
                            </Link>
                          }
                          subtitle={r.reason ?? r.decisionNote}
                        />
                        <TD>{r.type}</TD>
                        <TD className="tabular whitespace-nowrap">
                          {r.from} → {r.to}
                        </TD>
                        <TD align="right" className="tabular font-medium text-ink">
                          {r.days}
                        </TD>
                        <TD>{approver ? fullName(approver) : "—"}</TD>
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
                          {r.status === "pending" ? (
                            <div className="flex justify-end gap-1.5">
                              <Button
                                variant="approve"
                                size="sm"
                                onClick={() => decide(r, "approved")}
                                aria-label={`Approve ${leaveEmployee(r)}'s leave`}
                              >
                                <Check aria-hidden="true" className="size-3.5" />
                                Approve
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => decide(r, "declined")}
                                aria-label={`Send back ${leaveEmployee(r)}'s request`}
                              >
                                <X aria-hidden="true" className="size-3.5" />
                              </Button>
                            </div>
                          ) : r.decidedAt === TODAY ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => leave.reopen(r.id)}
                              aria-label={`Undo the decision on ${leaveEmployee(r)}'s request`}
                            >
                              <Undo2 aria-hidden="true" className="size-3.5" />
                              Undo
                            </Button>
                          ) : (
                            <span className="text-[0.75rem] text-faint">
                              {balance && r.status === "approved"
                                ? `${remainingDays(balance)} left`
                                : "—"}
                            </span>
                          )}
                        </TD>
                      </TR>
                    );
                  })}
              </TBody>
            </TableWrap>
          </Card>

          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader
                title="Balances"
                description="Annual leave, including anything pending."
              />
              <CardBody className="flex flex-col gap-3.5">
                {EMPLOYEES.slice(0, 6).map((e) => {
                  const b = balances.forType(e.id, "Annual");
                  if (!b) return null;
                  const remaining = remainingDays(b);
                  return (
                    <div key={e.id}>
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="truncate text-[0.875rem] text-body">
                          {fullName(e)}
                        </span>
                        <span
                          className={cn(
                            "tabular shrink-0 text-[0.75rem]",
                            remaining <= 3 ? "text-warning-text" : "text-muted",
                          )}
                        >
                          {remaining} left
                          {b.pending > 0 && ` · ${b.pending} pending`}
                        </span>
                      </div>
                      <ProgressMeter
                        value={b.taken}
                        max={b.entitled}
                        size="sm"
                        tone={remaining <= 3 ? "warning" : "accent"}
                      />
                    </div>
                  );
                })}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Public holidays"
                description="Maintained for you."
                action={
                  <CalendarDays aria-hidden="true" className="size-4 text-faint" />
                }
              />
              <CardBody className="flex flex-col gap-2">
                {PUBLIC_HOLIDAYS.map((h) => (
                  <div
                    key={h.name}
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

      <BookLeaveDialog open={booking} onClose={() => setBooking(false)} />
    </>
  );
}
