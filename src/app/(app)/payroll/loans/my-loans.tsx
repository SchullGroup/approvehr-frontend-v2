"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Money,
  ProgressMeter,
  Spinner,
  formatMoney,
} from "@/components/ui";
import { naira, type ApiLoan } from "@/lib/api/loans";
import { monthLabel } from "@/lib/loans/schedule";
import { LOAN_STATUS_LABEL, finishesLabel, useLoans } from "@/lib/store/loans";
import { useSession } from "@/lib/store/session";
import { ApplyLoanModal } from "./apply-loan";
import { DeclineLoanModal } from "./decisions";

/**
 * The employee's own loans, for `/profile`.
 *
 * Exported from the loans directory rather than written again inside the profile
 * screen, so there is one component that knows what a loan looks like to the
 * person repaying it. The profile page composes it; it does not reimplement it.
 *
 * ## What somebody wants to know about their own loan
 *
 * Three things, in this order: what is coming out of this month's pay, how much
 * is left, and when it stops. Not the principal — they remember borrowing it.
 * The full schedule is one link away rather than inlined, because a profile page
 * is a summary and twelve instalment rows is not a summary.
 *
 * A pending application shows what it *would* cost, because the answer to "has
 * it been approved yet" is usually the reason somebody opened this page.
 *
 * `GET /loans/me` needs no permission and answers with an empty page for a login
 * with no employee record, so this renders for everybody without a role check.
 */
export function MyLoans({ className }: { className?: string }) {
  const { employeeId } = useSession();
  const { loans, loading } = useLoans({ scope: "mine", pageSize: 20 });
  const [applying, setApplying] = useState(false);
  const [withdrawing, setWithdrawing] = useState<ApiLoan | null>(null);

  const live = loans.find(
    (loan) =>
      loan.status === "ACTIVE" || loan.status === "APPROVED" || loan.status === "PENDING",
  );
  const past = loans.filter((loan) => loan.status === "SETTLED");

  return (
    <>
      <Card className={className}>
        <CardHeader
          title="Staff loan"
          description={
            live
              ? undefined
              : "Money the company lends you, taken back a month at a time from your pay."
          }
          level={3}
          action={
            live ? undefined : (
              <Button variant="accent" size="sm" onClick={() => setApplying(true)}>
                Apply for a loan
              </Button>
            )
          }
        />
        <CardBody className="flex flex-col gap-4">
          {loading ? (
            <div className="flex items-center gap-2 text-body-sm text-muted">
              <Spinner size="sm" />
              Loading
            </div>
          ) : !live ? (
            <p className="text-body-sm leading-relaxed text-body">
              You have no loan running.
              {past.length > 0 && (
                <>
                  {" "}
                  You have repaid {past.length}{" "}
                  {past.length === 1 ? "loan" : "loans"} in full.
                </>
              )}
            </p>
          ) : live.status === "PENDING" ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="warning" size="sm" dot>
                  {LOAN_STATUS_LABEL.PENDING}
                </Badge>
                <span className="text-body-sm text-muted">
                  applied for {formatMoney(naira(live.principalKobo), "NGN", {
                    decimals: true,
                  })}
                </span>
              </div>
              <p className="text-body leading-relaxed text-ink">
                If it is approved,{" "}
                <strong className="font-semibold">
                  {formatMoney(naira(live.monthlyRepaymentKobo), "NGN", {
                    decimals: true,
                  })}
                </strong>{" "}
                comes out of your pay each month for {live.termMonths}{" "}
                {live.termMonths === 1 ? "month" : "months"}. Nothing is deducted
                until then.
              </p>
              <div className="flex flex-wrap gap-2">
                <ButtonLink href={`/payroll/loans/${live.id}`} size="sm">
                  See the details
                </ButtonLink>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setWithdrawing(live)}
                >
                  Withdraw it
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-meta font-medium text-muted">
                    Coming out each month
                  </p>
                  <p className="mt-1">
                    <Money amount={naira(live.monthlyRepaymentKobo)} decimals />
                  </p>
                </div>
                <div>
                  <p className="text-meta font-medium text-muted">
                    Left to repay
                  </p>
                  <p className="mt-1">
                    <Money amount={naira(live.outstandingKobo)} decimals />
                  </p>
                </div>
                <div>
                  <p className="text-meta font-medium text-muted">
                    Last deduction
                  </p>
                  <p className="mt-1 text-body-sm text-ink">
                    {finishesLabel(live) ??
                      (live.startPeriod ? monthLabel(live.startPeriod) : "Not set")}
                  </p>
                </div>
              </div>

              <ProgressMeter
                label={`${formatMoney(
                  naira(live.totalRepayableKobo - live.outstandingKobo),
                  "NGN",
                  { decimals: true },
                )} of ${formatMoney(naira(live.totalRepayableKobo), "NGN", {
                  decimals: true,
                })} repaid`}
                value={
                  live.totalRepayableKobo > 0
                    ? ((live.totalRepayableKobo - live.outstandingKobo) /
                        live.totalRepayableKobo) *
                      100
                    : 0
                }
              />

              <ButtonLink
                href={`/payroll/loans/${live.id}`}
                size="sm"
                className="self-start"
              >
                See the schedule
              </ButtonLink>
            </>
          )}

          {past.length > 0 && live && (
            <p className="text-meta text-muted">
              {past.length} earlier {past.length === 1 ? "loan" : "loans"} repaid
              in full ·{" "}
              <Link
                href="/payroll/loans"
                className="text-accent-text hover:underline"
              >
                see them
              </Link>
            </p>
          )}
        </CardBody>
      </Card>

      {applying && (
        <ApplyLoanModal
          onClose={() => setApplying(false)}
          forEmployeeId={employeeId}
        />
      )}
      {withdrawing && (
        <DeclineLoanModal
          key={withdrawing.id}
          loan={withdrawing}
          own
          onClose={() => setWithdrawing(null)}
        />
      )}
    </>
  );
}
