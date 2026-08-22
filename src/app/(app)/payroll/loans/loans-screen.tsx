"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CreditCard, Plus, Wallet } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Money,
  Spinner,
  Stat,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  Tabs,
  formatMoney,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import { naira, type ApiLoan, type LoanStatus } from "@/lib/api/loans";
import { monthLabel } from "@/lib/loans/schedule";
import {
  LOAN_STATUS_LABEL,
  finishesLabel,
  useLoanActions,
  useLoans,
  useLoanSummary,
} from "@/lib/store/loans";
import { usePermissions } from "@/lib/permissions";
import { useSession } from "@/lib/store/session";
import { shortDate } from "@/lib/today";
import { ApplyLoanModal } from "./apply-loan";
import { DeclineLoanModal } from "./decisions";

/**
 * Staff loans.
 *
 * ## One route, rendered by role
 *
 * There is no separate approval queue page, and there is no separate "my loans"
 * page. `PARITY.md`'s first rule is one route per concept, and this is one
 * concept: money the company has lent its staff and is recovering from payroll.
 *
 * - Somebody with `VIEW_SALARIES` sees the whole book, filtered by status.
 * - Somebody with `APPROVE_LOANS` gets **Approve and Decline on the row** — the
 *   queue is this table with the status filter set to waiting, because a product
 *   called ApproveHR should not make you navigate to approve something.
 * - Everybody else sees their own loans and can apply. Same URL, so the link a
 *   colleague sends works for them too.
 *
 * ## The four numbers on a row
 *
 * Who, how much, how much is left, and when it finishes. Those are the questions
 * asked about a staff loan, in that order, and the monthly deduction is beside
 * them because it is the figure that shows up on a payslip.
 *
 * Nothing is abbreviated. A figure somebody has to reconcile against a bank
 * statement is written out in full, with kobo — `₦2.9m` is unreconcilable.
 */

const STATUS_TONE: Record<LoanStatus, "warning" | "accent" | "info" | "success" | "neutral"> =
  {
    PENDING: "warning",
    APPROVED: "info",
    ACTIVE: "accent",
    SETTLED: "success",
    DECLINED: "neutral",
  };

type Filter = LoanStatus | "ALL";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "PENDING", label: "Waiting" },
  { id: "ACTIVE", label: "Being repaid" },
  { id: "SETTLED", label: "Fully repaid" },
  { id: "DECLINED", label: "Declined" },
];

const PAGE_SIZE = 25;

export function LoansScreen() {
  const { can, loading: permissionsLoading } = usePermissions();
  const { employeeId, isConnected } = useSession();
  const toast = useToast();

  const seeEverybody = can("VIEW_SALARIES");
  const canDecide = can("APPROVE_LOANS");
  const canApplyForOthers = can("EDIT_RECORDS");

  const [filter, setFilter] = useState<Filter>("ALL");
  const [page, setPage] = useState(1);
  const [applying, setApplying] = useState(false);
  const [declining, setDeclining] = useState<ApiLoan | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);

  /**
   * Which endpoint answers.
   *
   * The Waiting tab is the approval queue, so somebody who can decide gets
   * `/loans/pending` — oldest first, because the person who has waited longest
   * should be at the top of a queue. Everybody else gets the plain list with a
   * status filter, newest first, and never asks for an endpoint their
   * permissions would refuse.
   */
  const scope =
    filter === "PENDING" && canDecide ? "pending" : seeEverybody ? "all" : "mine";

  const list = useLoans({
    scope,
    page,
    pageSize: PAGE_SIZE,
    ...(scope === "pending"
      ? {}
      : { sort: "createdAt", order: "desc", ...(filter === "ALL" ? {} : { status: filter }) }),
  });
  const { summary } = useLoanSummary(seeEverybody);
  const { approve } = useLoanActions();

  const tabs = useMemo(
    () =>
      FILTERS.map((item) => ({
        id: item.id,
        label: item.label,
        ...(item.id === "PENDING" && summary && summary.pendingCount > 0
          ? { count: summary.pendingCount }
          : {}),
      })),
    [summary],
  );

  /** One click, from wherever you already are. No dialog in the way. */
  async function decide(loan: ApiLoan) {
    setDeciding(loan.id);
    try {
      const approved = await approve(loan.id);
      toast.push({
        title: `Approved ${loan.employeeName}'s loan`,
        tone: "success",
        detail: approved.startPeriod
          ? `${formatMoney(naira(approved.monthlyRepaymentKobo), "NGN", {
              decimals: true,
            })} a month, first deduction ${monthLabel(approved.startPeriod)}.`
          : undefined,
      });
    } catch (error) {
      toast.push({
        title: "Could not approve it",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setDeciding(null);
    }
  }

  if (permissionsLoading) {
    return (
      <PageBody className="flex items-center justify-center py-24">
        <Spinner />
        <span className="sr-only">Loading</span>
      </PageBody>
    );
  }

  const showing = list.loans.length;
  const from = showing === 0 ? 0 : (list.page - 1) * list.pageSize + 1;
  const to = (list.page - 1) * list.pageSize + showing;

  return (
    <>
      <PageHeader
        title="Staff loans"
        description={
          seeEverybody
            ? "What the company has lent, what is left, and what comes out of this month's payroll."
            : "What you have borrowed and what is left to repay."
        }
        meta={
          <Badge tone={isConnected ? "success" : "warning"} size="sm" dot>
            {isConnected ? "Live from the API" : "Demo data, this browser only"}
          </Badge>
        }
        action={
          <Button variant="accent" size="sm" onClick={() => setApplying(true)}>
            <Plus aria-hidden="true" className="size-4" />
            {canApplyForOthers ? "Add a loan" : "Apply for a loan"}
          </Button>
        }
        tabs={
          seeEverybody ? (
            <Tabs
              items={tabs}
              value={filter}
              onChange={(id) => {
                setFilter(id as Filter);
                setPage(1);
              }}
            />
          ) : undefined
        }
      />

      <PageBody className="flex flex-col gap-6">
        {list.error && (
          <LoadFailure subject="the loans" error={list.error} />
        )}

        {seeEverybody && summary && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Stat
              label="Still owed to the company"
              value={<Money amount={naira(summary.outstandingKobo)} decimals />}
              hint={`across ${summary.activeCount} ${
                summary.activeCount === 1 ? "loan" : "loans"
              } being repaid`}
            />
            <Stat
              label="Coming out of this month's payroll"
              value={<Money amount={naira(summary.thisMonth.deductionKobo)} decimals />}
              hint={
                summary.thisMonth.arrearsKobo > 0
                  ? `${summary.thisMonth.instalmentCount} instalments, including ${formatMoney(
                      naira(summary.thisMonth.arrearsKobo),
                      "NGN",
                      { decimals: true },
                    )} carried from a short month`
                  : `${summary.thisMonth.instalmentCount} ${
                      summary.thisMonth.instalmentCount === 1
                        ? "instalment"
                        : "instalments"
                    }`
              }
            />
            <Stat
              label="Waiting for a decision"
              value={String(summary.pendingCount)}
              hint={
                summary.pendingCount === 0
                  ? "nothing to approve"
                  : "oldest first, in the Waiting tab"
              }
            />
          </div>
        )}

        {list.loading && list.loans.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Spinner />
            <span className="sr-only">Loading loans</span>
          </div>
        ) : list.loans.length === 0 ? (
          <EmptyState
            icon={<CreditCard aria-hidden="true" />}
            title={
              filter !== "ALL"
                ? `No loans ${LOAN_STATUS_LABEL[filter as LoanStatus].toLowerCase()}`
                : seeEverybody
                  ? "Nobody has a staff loan"
                  : "You have no loan"
            }
            description={
              filter !== "ALL"
                ? "Try another tab."
                : seeEverybody
                  ? "When you lend somebody money, put it here and payroll recovers it a month at a time."
                  : "If you need one, ask for it here. You will see what it costs you a month before you send it."
            }
            action={
              filter === "ALL" ? (
                <Button variant="accent" onClick={() => setApplying(true)}>
                  {canApplyForOthers ? "Add a loan" : "Apply for a loan"}
                </Button>
              ) : (
                <Button onClick={() => setFilter("ALL")}>Show all loans</Button>
              )
            }
          />
        ) : (
          <>
            <TableWrap caption="Staff loans, with what is left to repay on each">
              <THead>
                <TH>{seeEverybody ? "Who" : "What for"}</TH>
                <TH align="right">Borrowed</TH>
                <TH align="right">Left to pay</TH>
                <TH align="right">A month</TH>
                <TH>Finishes</TH>
                <TH>Status</TH>
                <TH>
                  <span className="sr-only">Decide</span>
                </TH>
              </THead>
              <TBody>
                {list.loans.map((loan) => {
                  const own = loan.employeeId === employeeId;
                  const finishes = finishesLabel(loan);
                  return (
                    <TR key={loan.id}>
                      <TDPrimary
                        title={
                          <Link
                            href={`/payroll/loans/${loan.id}`}
                            className="text-ink hover:text-accent-text hover:underline"
                          >
                            {seeEverybody
                              ? loan.employeeName
                              : (loan.reason ?? "Staff loan")}
                          </Link>
                        }
                        subtitle={
                          seeEverybody
                            ? `${loan.employeeNo} · ${loan.jobTitle}`
                            : `Applied ${shortDate(loan.createdAt.slice(0, 10))}`
                        }
                      />
                      <TD align="right">
                        <Money amount={naira(loan.principalKobo)} decimals />
                      </TD>
                      <TD align="right">
                        {/* Nothing is owed until somebody approves it, and
                            nothing is owed on a decline. Showing the total
                            repayable here would read as a debt that exists,
                            and on an interest-bearing application it would
                            show more than the row says was borrowed. */}
                        {loan.status === "PENDING" || loan.status === "DECLINED" ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <Money amount={naira(loan.outstandingKobo)} decimals />
                        )}
                      </TD>
                      <TD align="right">
                        <Money amount={naira(loan.monthlyRepaymentKobo)} decimals />
                      </TD>
                      <TD>
                        {finishes ?? (
                          <span className="text-muted">
                            {loan.status === "PENDING"
                              ? "Once approved"
                              : "—"}
                          </span>
                        )}
                      </TD>
                      <TD>
                        <Badge tone={STATUS_TONE[loan.status]} size="sm" dot>
                          {LOAN_STATUS_LABEL[loan.status]}
                        </Badge>
                      </TD>
                      <TD align="right">
                        {loan.status !== "PENDING" ? null : own ? (
                          /* Self-approval is refused by the API whatever your
                             permissions are, so the row does not offer it.
                             Withdrawing your own is allowed, and is what you
                             would want from this row. */
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeclining(loan)}
                          >
                            Withdraw
                          </Button>
                        ) : canDecide ? (
                          <div className="flex justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="approve"
                              loading={deciding === loan.id}
                              onClick={() => void decide(loan)}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeclining(loan)}
                            >
                              Decline
                            </Button>
                          </div>
                        ) : null}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </TableWrap>

            {list.total > list.pageSize && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-body-sm text-muted">
                  Showing {from}–{to} of {list.total}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={list.page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    disabled={list.page >= list.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* One line, said once. The other half of this — what happens when a
            month cannot carry the full instalment — belongs on the instalment
            it happened to, and is spelled out there rather than as a general
            warning on a table where it may not apply to anybody. */}
        {seeEverybody && list.loans.length > 0 && (
          <p className="flex items-start gap-2 text-body-sm text-muted">
            <Wallet aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              Repayments come out of net pay, after tax. A loan is not
              tax-deductible, so it does not change anybody&rsquo;s PAYE.
            </span>
          </p>
        )}
      </PageBody>

      {/* Mounted on open rather than hidden behind a flag, so each one starts
          with empty fields and no leftover error. The `key` covers reopening the
          same dialog for a different loan. */}
      {applying && (
        <ApplyLoanModal
          onClose={() => setApplying(false)}
          canApplyForOthers={canApplyForOthers}
        />
      )}

      {declining && (
        <DeclineLoanModal
          key={declining.id}
          loan={declining}
          own={declining.employeeId === employeeId}
          onClose={() => setDeclining(null)}
        />
      )}
    </>
  );
}
