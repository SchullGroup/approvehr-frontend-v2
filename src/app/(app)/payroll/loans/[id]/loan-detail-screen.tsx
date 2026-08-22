"use client";

import { Fragment, useState } from "react";
import { CheckCircle2, CreditCard, Info } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  EmptyState,
  Money,
  ProgressMeter,
  Spinner,
  Stat,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  formatMoney,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  naira,
  type ApiLoanDetail,
  type ApiRepayment,
  type LoanRepaymentStatus,
  type LoanStatus,
} from "@/lib/api/loans";
import { addMonths, monthLabel, priceLoan, shortMonthLabel } from "@/lib/loans/schedule";
import {
  LOAN_STATUS_LABEL,
  REPAYMENT_STATUS_LABEL,
  useLoan,
  useLoanActions,
} from "@/lib/store/loans";
import { usePermissions } from "@/lib/permissions";
import { useSession } from "@/lib/store/session";
import { TODAY } from "@/lib/today";
import {
  CounterOfferModal,
  DeclineLoanModal,
  PayInstalmentModal,
  WaiveInstalmentModal,
} from "../decisions";

/**
 * One loan, and its schedule.
 *
 * ## The schedule is the document
 *
 * Everything else on this page is derived from the instalment rows — how much is
 * left, when it finishes, what comes out next. That is also true on the server:
 * `Loan.outstanding` is a cache recomputed from the schedule on every write, and
 * the schema says the schedule is the authority. So this page shows the schedule
 * in full rather than a summary of it, and a figure that disagrees with the rows
 * beneath it is a bug worth seeing.
 *
 * ## A part-recovered instalment is spelled out
 *
 * A month whose salary could not carry the full deduction leaves the instalment
 * `PARTIAL`, and the shortfall is taken from the next run **before** that
 * month's own instalment. Read off a status badge alone that is inexplicable —
 * the row says "paid" and "not paid" at the same time — so every partial row
 * carries a sentence saying what happened and what happens next. It is the one
 * piece of copy on this screen that has to be there.
 *
 * ## Approving is one button
 *
 * No confirmation dialog. The counter-offer, the decline and the write-off all
 * need something typed and get a dialog; agreeing to what was asked for does
 * not.
 */

const money = (amountKobo: number) =>
  formatMoney(naira(amountKobo), "NGN", { decimals: true });

const STATUS_TONE: Record<LoanStatus, "warning" | "accent" | "info" | "success" | "neutral"> =
  {
    PENDING: "warning",
    APPROVED: "info",
    ACTIVE: "accent",
    SETTLED: "success",
    DECLINED: "neutral",
  };

const ROW_TONE: Record<LoanRepaymentStatus, "neutral" | "warning" | "success" | "info"> =
  {
    SCHEDULED: "neutral",
    PARTIAL: "warning",
    PAID: "success",
    WAIVED: "info",
  };

export function LoanDetailScreen({ id }: { id: string }) {
  const { loan, loading, error } = useLoan(id);
  const { can } = usePermissions();
  const { employeeId } = useSession();
  const { approve } = useLoanActions();
  const toast = useToast();

  const [approving, setApproving] = useState(false);
  const [countering, setCountering] = useState<ApiLoanDetail | null>(null);
  const [declining, setDeclining] = useState<ApiLoanDetail | null>(null);
  const [paying, setPaying] = useState<ApiRepayment | null>(null);
  const [waiving, setWaiving] = useState<ApiRepayment | null>(null);

  const canDecide = can("APPROVE_LOANS");
  const canRecord = can("EDIT_RECORDS");

  if (loading) {
    return (
      <PageBody className="flex items-center justify-center py-24">
        <Spinner />
        <span className="sr-only">Loading the loan</span>
      </PageBody>
    );
  }

  if (!loan) {
    return (
      <>
        <PageHeader
          title="Loan"
          breadcrumb={[
            { href: "/payroll", label: "Payroll" },
            { href: "/payroll/loans", label: "Loans" },
          ]}
        />
        <PageBody>
          <EmptyState
            icon={<CreditCard aria-hidden="true" />}
            title="That loan is not here"
            description={
              error
                ? error.message
                : "It may have been created in another browser, or the link is wrong."
            }
            action={<ButtonLink href="/payroll/loans">Back to loans</ButtonLink>}
          />
        </PageBody>
      </>
    );
  }

  const own = loan.employeeId === employeeId;
  const pending = loan.status === "PENDING";

  /* A pending loan has no schedule — it is generated at approval. Pricing it
     here shows the approver the schedule they are about to create, which is the
     thing they are actually agreeing to. */
  const proposed = pending
    ? priceLoan({
        principalKobo: loan.principalKobo,
        termMonths: loan.termMonths,
        interestRate: loan.interestRate,
        startPeriod: loan.startPeriod ?? addMonths(TODAY, 1),
      })
    : null;

  async function decide() {
    if (!loan) return;
    setApproving(true);
    try {
      const approved = await approve(loan.id);
      toast.push({
        title: "Approved",
        tone: "success",
        detail: approved.startPeriod
          ? `${money(approved.monthlyRepaymentKobo)} a month, first deduction ${monthLabel(
              approved.startPeriod,
            )}.`
          : undefined,
      });
    } catch (failure) {
      toast.push({
        title: "Could not approve it",
        tone: "danger",
        detail:
          failure instanceof ApiError
            ? failure.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setApproving(false);
    }
  }

  const paidPercent =
    loan.progress.scheduledKobo > 0
      ? ((loan.progress.paidKobo + loan.progress.waivedKobo) /
          loan.progress.scheduledKobo) *
        100
      : 0;

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/payroll", label: "Payroll" },
          { href: "/payroll/loans", label: "Loans" },
        ]}
        title={own ? "Your staff loan" : loan.employeeName}
        description={`${money(loan.principalKobo)} over ${loan.termMonths} ${
          loan.termMonths === 1 ? "month" : "months"
        } · ${money(loan.monthlyRepaymentKobo)} a month`}
        meta={
          <Badge tone={STATUS_TONE[loan.status]} size="sm" dot>
            {LOAN_STATUS_LABEL[loan.status]}
          </Badge>
        }
        action={
          pending && canDecide && !own ? (
            <>
              <Button
                variant="approve"
                size="sm"
                loading={approving}
                onClick={() => void decide()}
              >
                <CheckCircle2 aria-hidden="true" className="size-4" />
                Approve
              </Button>
              <Button size="sm" onClick={() => setCountering(loan)}>
                Different terms
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDeclining(loan)}>
                Decline
              </Button>
            </>
          ) : pending && own ? (
            <Button variant="ghost" size="sm" onClick={() => setDeclining(loan)}>
              Withdraw it
            </Button>
          ) : undefined
        }
      />

      <PageBody className="flex flex-col gap-6">
        {/* What was asked for, and by whom. The reason is the whole case. */}
        <Card>
          <CardHeader
            title={pending ? "The application" : "The loan"}
            description={
              own ? undefined : `${loan.employeeNo} · ${loan.jobTitle}`
            }
            level={2}
          />
          <CardBody className="flex flex-col gap-4">
            <DescriptionList
              columns={3}
              items={[
                { term: "Borrowed", value: money(loan.principalKobo) },
                {
                  term: "Interest",
                  value:
                    loan.interestKobo === 0
                      ? "None"
                      : `${money(loan.interestKobo)} · ${(
                          loan.interestRate * 100
                        ).toFixed(2)}% a year`,
                },
                { term: "Total to repay", value: money(loan.totalRepayableKobo) },
                { term: "A month", value: money(loan.monthlyRepaymentKobo) },
                {
                  term: "First deduction",
                  value: loan.startPeriod
                    ? monthLabel(loan.startPeriod)
                    : proposed
                      ? `${monthLabel(proposed.lines[0]?.dueDate ?? TODAY)} if approved now`
                      : "Not set",
                },
                {
                  /* "Approved by — nobody yet" on an application nobody has
                     looked at reads as a missing value. Pending has a different
                     question: whose desk is it on. */
                  term: pending
                    ? "Decision"
                    : loan.status === "DECLINED"
                      ? "Declined by"
                      : "Approved by",
                  value: pending
                    ? "Waiting for somebody with loan approval"
                    : (loan.decidedByName ?? "Not recorded"),
                },
              ]}
            />
            {loan.reason && (
              <div className="rounded-lg border border-line bg-canvas px-4 py-3">
                <p className="text-meta font-medium text-muted">
                  What it is for
                </p>
                <p className="mt-1 text-body-sm leading-relaxed text-ink">
                  {loan.reason}
                </p>
              </div>
            )}
          </CardBody>
        </Card>

        {loan.status === "DECLINED" && (
          <Callout tone="neutral" title="This was declined">
            <p className="text-body-sm leading-relaxed">
              {loan.declinedReason ?? "No reason was recorded."}
              {loan.decidedByName && (
                <>
                  {" "}
                  — {loan.decidedByName}
                  {loan.decidedAt
                    ? ` on ${new Date(loan.decidedAt).toLocaleDateString("en-NG", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        timeZone: "UTC",
                      })}`
                    : ""}
                </>
              )}
            </p>
            <ButtonLink href="/payroll/loans" size="sm" className="mt-2">
              Back to loans
            </ButtonLink>
          </Callout>
        )}

        {/* ------------------------------------------------------- progress */}

        {loan.schedule.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Repaid so far"
              value={<Money amount={naira(loan.progress.paidKobo)} decimals size="xl" />}
              hint={`${loan.progress.instalmentsSettled} of ${loan.progress.instalmentsTotal} instalments done`}
            />
            <Stat
              label="Left to pay"
              value={<Money amount={naira(loan.progress.remainingKobo)} decimals size="xl" />}
              hint={
                loan.status === "SETTLED" ? "nothing outstanding" : "across the rest of the schedule"
              }
            />
            <Stat
              label="Next deduction"
              value={
                loan.progress.nextDueDate ? (
                  <Money amount={naira(loan.progress.nextDueKobo)} decimals />
                ) : (
                  "None"
                )
              }
              hint={
                loan.progress.nextDueDate
                  ? monthLabel(loan.progress.nextDueDate)
                  : "the schedule is finished"
              }
            />
            <Stat
              label="Written off"
              value={<Money amount={naira(loan.progress.waivedKobo)} decimals size="xl" />}
              hint={
                loan.progress.waivedKobo > 0
                  ? "given up, not recovered"
                  : "nothing written off"
              }
            />
          </div>
        )}

        {loan.schedule.length > 0 && (
          <ProgressMeter
            label={`${money(loan.progress.paidKobo)} of ${money(loan.progress.scheduledKobo)} recovered`}
            value={paidPercent}
            tone={loan.status === "SETTLED" ? "success" : "accent"}
          />
        )}

        {/* ------------------------------------------------------- schedule */}

        {loan.schedule.length > 0 ? (
          <div className="flex flex-col gap-3">
            <h2 className="text-body font-semibold text-ink">
              The repayment schedule
            </h2>
            <TableWrap caption="Every instalment, what was taken and what is still owed">
              <THead>
                <TH>Instalment</TH>
                <TH>Due</TH>
                <TH align="right">Amount</TH>
                <TH align="right">Paid</TH>
                <TH>Status</TH>
                {(canRecord || canDecide) && loan.status === "ACTIVE" && (
                  <TH>
                    <span className="sr-only">Record</span>
                  </TH>
                )}
              </THead>
              <TBody>
                {loan.schedule.map((row) => {
                  const columns =
                    (canRecord || canDecide) && loan.status === "ACTIVE" ? 6 : 5;
                  const open = row.status === "SCHEDULED" || row.status === "PARTIAL";
                  return (
                    /* The fragment is the list item, so the key belongs on it —
                       a partial or waived instalment renders two rows. */
                    <Fragment key={row.id}>
                      <TR>
                        <TDPrimary
                          title={`${row.sequence} of ${loan.progress.instalmentsTotal}`}
                          {...(row.payslipId
                            ? { subtitle: "taken by payroll" }
                            : row.paidAt && row.status !== "SCHEDULED"
                              ? { subtitle: "paid outside payroll" }
                              : {})}
                        />
                        <TD>{shortMonthLabel(row.dueDate)}</TD>
                        <TD align="right">
                          <Money amount={naira(row.amountKobo)} decimals />
                        </TD>
                        <TD align="right">
                          {row.paidAmountKobo === 0 ? (
                            <span className="text-muted">—</span>
                          ) : (
                            <Money amount={naira(row.paidAmountKobo)} decimals />
                          )}
                        </TD>
                        <TD>
                          <Badge tone={ROW_TONE[row.status]} size="sm" dot>
                            {REPAYMENT_STATUS_LABEL[row.status]}
                          </Badge>
                        </TD>
                        {columns === 6 && (
                          <TD align="right">
                            {open && (
                              <div className="flex justify-end gap-1.5">
                                {canRecord && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setPaying(row)}
                                  >
                                    Record a payment
                                  </Button>
                                )}
                                {canDecide && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setWaiving(row)}
                                  >
                                    Write off
                                  </Button>
                                )}
                              </div>
                            )}
                          </TD>
                        )}
                      </TR>

                      {/* The one sentence this screen exists for. A row that
                          says "part paid" and nothing else is a row somebody
                          has to ring payroll about. */}
                      {row.status === "PARTIAL" && (
                        <TR className="bg-canvas">
                          <TD colSpan={columns} className="text-body-sm text-body">
                            {money(row.paidAmountKobo)} of{" "}
                            {money(row.amountKobo)} came out in{" "}
                            {monthLabel(row.dueDate)} — that month&rsquo;s pay
                            could not carry the rest. The remaining{" "}
                            <strong className="font-semibold text-ink">
                              {money(row.remainingKobo)}
                            </strong>{" "}
                            carries to the next payroll and is taken before that
                            month&rsquo;s own instalment.
                          </TD>
                        </TR>
                      )}

                      {row.status === "WAIVED" && (
                        <TR className="bg-canvas">
                          <TD colSpan={columns} className="text-body-sm text-body">
                            Written off, so nothing more is owed on it.
                            {row.note ? ` ${row.note}` : ""}
                          </TD>
                        </TR>
                      )}
                    </Fragment>
                  );
                })}
              </TBody>
            </TableWrap>
          </div>
        ) : proposed ? (
          <div className="flex flex-col gap-3">
            <h2 className="text-body font-semibold text-ink">
              What the schedule would be
            </h2>
            <p className="text-body-sm leading-relaxed text-body">
              Nothing is deducted until somebody approves this. Approving creates
              these {proposed.lines.length} instalments and payroll starts taking
              them in {monthLabel(proposed.lines[0]?.dueDate ?? TODAY)}.
            </p>
            <TableWrap caption="The schedule this loan would create if it were approved">
              <THead>
                <TH>Instalment</TH>
                <TH>Due</TH>
                <TH align="right">Amount</TH>
              </THead>
              <TBody>
                {proposed.lines.map((line) => (
                  <TR key={line.sequence}>
                    <TDPrimary
                      title={`${line.sequence} of ${proposed.lines.length}`}
                      {...(line.sequence === proposed.lines.length &&
                      proposed.finalInstalmentKobo !== proposed.instalmentKobo
                        ? { subtitle: "the balancing figure" }
                        : {})}
                    />
                    <TD>{shortMonthLabel(line.dueDate)}</TD>
                    <TD align="right">
                      <Money amount={naira(line.amountKobo)} decimals />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          </div>
        ) : null}

        {loan.status === "SETTLED" && (
          <Callout
            tone="success"
            icon={<CheckCircle2 aria-hidden="true" />}
            title="Fully repaid"
          >
            {loan.completedAt
              ? `Cleared on ${new Date(loan.completedAt).toLocaleDateString("en-NG", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                })}. Nothing is deducted from now on.`
              : "Nothing is deducted from now on."}
          </Callout>
        )}

        {loan.status === "ACTIVE" && (
          <p className="flex items-start gap-2 text-body-sm text-muted">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              Deductions come off net pay, after tax — a loan repayment is not
              tax-deductible, so it does not change the PAYE on this salary.
            </span>
          </p>
        )}
      </PageBody>

      {countering && (
        <CounterOfferModal loan={countering} onClose={() => setCountering(null)} />
      )}
      {declining && (
        <DeclineLoanModal
          loan={declining}
          own={own}
          onClose={() => setDeclining(null)}
        />
      )}
      {paying && (
        <PayInstalmentModal
          key={paying.id}
          loan={loan}
          repayment={paying}
          onClose={() => setPaying(null)}
        />
      )}
      {waiving && (
        <WaiveInstalmentModal
          key={waiving.id}
          loan={loan}
          repayment={waiving}
          onClose={() => setWaiving(null)}
        />
      )}
    </>
  );
}
