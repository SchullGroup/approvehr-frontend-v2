"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, Inbox, Wallet } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { formatKobo } from "@/lib/api/payroll";
import type { MyOverview as MyOverviewData } from "@/lib/api/insights";

/**
 * What the signed-in person's own dashboard says about them.
 *
 * ## The gap this closes
 *
 * A plain employee's dashboard was a clock card, the assistant and the
 * noticeboard — every one of them about the company or about the day rather
 * than about them. The three things somebody opens an HR app on a phone to
 * find out are **what I took home, how much leave I have left, and what is
 * waiting on me**, and the API could answer all three while the screen asked
 * none of them.
 *
 * It renders on **both** dashboards, an administrator's included. A payroll
 * officer is also somebody with leave and a payslip, and the company's
 * headcount is not an answer to "have I been paid".
 *
 * ## Absent is absent, in three places
 *
 * - **No payslip** — the block says nobody has run a payroll that included
 *   them. It never renders ₦0.00, which would say the company paid them
 *   nothing.
 * - **No leave types** — the block is not drawn. No entitlement is a company
 *   that has not configured leave, not a person with no days left.
 * - **Nothing waiting** — this one *is* drawn as zero, deliberately, because
 *   "nothing needs you" is a useful answer and a true one.
 *
 * ## Paid, not approved
 *
 * `paid` follows the run reaching `PAID`, never `APPROVED`. Approving is a
 * decision somebody made; paying is money that left. A dashboard telling an
 * employee they have been paid when the batch has not settled is the green
 * Paid button this product is sold against, aimed at the person it would hurt.
 */
export function MyOverview({ me }: { me: MyOverviewData }) {
  const nothingAtAll = !me.pay && me.leave.length === 0 && me.waitingOnMe === 0;
  /* A card with three absences in it is worse than no card: it spends the top
     of the first screen saying that nothing has happened yet. */
  if (nothingAtAll) return null;

  return (
    <Card>
      <CardHeader title="You" level={2} />
      <CardBody className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {/* Pay ------------------------------------------------------------ */}
        {me.pay && (
          <Link
            href="/payroll/payslips"
            className="flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-surface p-4 hover:border-control-line hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
          >
            <span className="flex items-center gap-2 text-meta text-muted">
              <Wallet aria-hidden="true" className="size-3.5" />
              Last payslip
            </span>
            <span className="text-h4 text-ink tabular">
              {formatKobo(me.pay.netKobo)}
            </span>
            <span className="text-meta text-faint">
              {monthName(me.pay.period)} ·{" "}
              {me.pay.paid ? "paid" : "approved, not yet paid"}
            </span>
          </Link>
        )}

        {/* Leave ---------------------------------------------------------- */}
        {me.leave.length > 0 && (
          <Link
            href="/people/leave"
            className="flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-surface p-4 hover:border-control-line hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
          >
            <span className="flex items-center gap-2 text-meta text-muted">
              <CalendarDays aria-hidden="true" className="size-3.5" />
              Leave left
            </span>
            {/* Every type, named. Picking one would be a guess about which is
                "your leave" — see `MyOverview`'s own comment for what that
                guess produced. */}
            <ul className="flex flex-col gap-0.5">
              {me.leave.map((row) => (
                <li
                  key={row.leaveType}
                  className="flex items-baseline justify-between gap-3 text-body-sm"
                >
                  <span className="min-w-0 truncate text-body">
                    {row.leaveType}
                  </span>
                  <span className="shrink-0 text-ink tabular">
                    {row.remaining}
                    <span className="text-faint"> of {row.entitled}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Link>
        )}

        {/* Waiting on me -------------------------------------------------- */}
        <Link
          href="/approvals"
          className="flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-surface p-4 hover:border-control-line hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
        >
          <span className="flex items-center gap-2 text-meta text-muted">
            <Inbox aria-hidden="true" className="size-3.5" />
            Waiting on you
          </span>
          <span className="text-h4 text-ink tabular">{me.waitingOnMe}</span>
          <span className="flex items-center gap-1 text-meta text-faint">
            {me.waitingOnMe === 0
              ? "Nothing needs you"
              : me.waitingOnMe === 1
                ? "1 thing to decide"
                : `${String(me.waitingOnMe)} things to decide`}
            {me.waitingOnMe > 0 && (
              <ArrowRight aria-hidden="true" className="size-3" />
            )}
          </span>
        </Link>
      </CardBody>
    </Card>
  );
}

/** `2026-08` as `August 2026`. The period is a month, so it is named as one. */
function monthName(period: string): string {
  const [year, month] = period.split("-");
  if (!year || !month) return period;
  return new Date(
    Date.UTC(Number(year), Number(month) - 1, 1),
  ).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
