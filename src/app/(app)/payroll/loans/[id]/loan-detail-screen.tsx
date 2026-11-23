"use client";

import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { CheckCircle2, CreditCard, Info } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  AttentionMark,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Money,
  ProgressMeter,
  Spinner,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  Tag,
  formatMoney,
  useToast,
  RowActions,
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
import {
  effectiveSchedule,
  type EffectiveRepayment,
} from "@/lib/loans/effective-schedule";
import { monthLabel, priceLoan, shortMonthLabel } from "@/lib/loans/schedule";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/time";
import {
  LOAN_STATUS_LABEL,
  REPAYMENT_STATUS_LABEL,
  useLoan,
  useLoanActions,
  useLoanToday,
} from "@/lib/store/loans";
import { usePermissions } from "@/lib/permissions";
import { useOrgTimezone, useSession } from "@/lib/store/session";
import { ApprovedLoanCard } from "../approved-loan-card";
import {
  CounterOfferModal,
  RescheduleLoanModal,
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
 * ## The top card says four things
 *
 * Who approved it, what was borrowed, what is left, and how far along it is,
 * with the reason on one line under them. The first deduction, the monthly
 * figure and the next due date are all in the table below, so they are not
 * repeated above it. An application nobody has decided yet is the exception:
 * the person deciding needs the monthly figure and the month it would start in
 * before there is a table to read them from.
 *
 * ## A short month is moved forward, not explained
 *
 * A month whose salary could not carry the full deduction leaves the instalment
 * `PARTIAL`, and payroll takes the shortfall in the next run alongside that
 * month's own instalment. The table shows it the way it will happen
 * (`effectiveSchedule`): the short month is settled at what was taken, and the
 * shortfall is added to the instalment it will come out with, with a few words
 * under the figure saying where it came from. A paragraph under the row used to
 * say the same at length; with the figure where the money will move there is
 * nothing left for it to say. This is display only. The stored schedule keeps
 * the row `PARTIAL`, because that is what payroll reads and what tells HR a
 * month was short.
 *
 * ## Approving is one button
 *
 * No confirmation dialog. The counter-offer, the decline and the write-off all
 * need something typed and get a dialog; agreeing to what was asked for does
 * not.
 */

const money = (amountKobo: number) =>
  formatMoney(naira(amountKobo), "NGN", { decimals: true });

const STATUS_TONE: Record<
  LoanStatus,
  "warning" | "accent" | "info" | "success" | "neutral"
> = {
  PENDING: "warning",
  APPROVED: "info",
  ACTIVE: "accent",
  SETTLED: "success",
  DECLINED: "neutral",
};

const ROW_TONE: Record<
  LoanRepaymentStatus,
  "neutral" | "warning" | "success" | "info"
> = {
  SCHEDULED: "neutral",
  PARTIAL: "warning",
  PAID: "success",
  WAIVED: "info",
};

/**
 * The months a shortfall came from, for the few words under a folded amount:
 * `Oct`, `Oct, Nov`, and the year only when the months do not share the year of
 * the instalment they were moved to. Past three it counts them instead.
 */
function monthsFrom(months: readonly string[], movedTo: string): string {
  if (months.length > 3) return `${String(months.length)} earlier months`;
  const sameYear = months.every((m) => m.slice(0, 4) === movedTo.slice(0, 4));
  return months
    .map((m) =>
      sameYear ? shortMonthLabel(m).slice(0, 3) : shortMonthLabel(m),
    )
    .join(", ");
}

/**
 * What a row says beyond its figures, which is as little as it can.
 *
 * `note` sits under the Amount: what a row took on from earlier months
 * (`incl. ₦21,428.57 from Oct`), or what is left on a part-paid row that
 * nothing moved off. `moved` is what the row left behind says about where its
 * remainder went, kept behind an icon because the row that took it already says
 * where it came from. `statusLabel` replaces "Not yet due" on an instalment that
 * was missed and moved on, which is the one case where that label is wrong.
 */
function rowFacts(entry: EffectiveRepayment) {
  const { row } = entry;
  const note =
    entry.carriedInKobo > 0
      ? `incl. ${money(entry.carriedInKobo)} from ${monthsFrom(entry.carriedFrom, row.dueDate)}`
      : row.status === "PARTIAL" && entry.owingKobo > 0
        ? `${money(entry.owingKobo)} left to pay`
        : null;
  const moved = entry.movedTo
    ? [
        row.status === "PARTIAL"
          ? `${money(entry.movedOnKobo)} short.`
          : "Nothing was taken.",
        `Added to the ${monthLabel(entry.movedTo)} instalment, which is when payroll takes it.`,
      ]
    : null;
  const statusLabel =
    entry.movedTo && row.status === "SCHEDULED"
      ? `Moved to ${shortMonthLabel(entry.movedTo).slice(0, 3)}`
      : REPAYMENT_STATUS_LABEL[row.status];
  return { note, moved, statusLabel };
}

/**
 * The Amount cell: the figure, and under it the few words that explain it.
 *
 * A row whose whole amount was moved onto a later instalment prints a dash, not
 * ₦0.00. Nothing is owed against it, and a zero in an Amount column reads as a
 * free month.
 */
function AmountCell({
  entry,
  note,
}: {
  entry: EffectiveRepayment;
  note: string | null;
}) {
  return (
    <span className="inline-flex flex-col items-end">
      {entry.amountKobo === 0 && entry.movedOnKobo > 0 ? (
        <span className="text-muted">—</span>
      ) : (
        <Money amount={naira(entry.amountKobo)} decimals />
      )}
      {note && <span className="text-meta text-muted">{note}</span>}
    </span>
  );
}

/** No layout to measure (a test, a hidden tab) falls back to the length. */
const LONG_REASON = 110;

/**
 * "For: <reason>", on one line, with the rest a press away.
 *
 * The reason is up to 500 characters and usually a few words, so it is clamped
 * to a line and the toggle appears only when that hides something. That is
 * measured where there is layout, because the same sentence fits on a desktop
 * and does not on a phone, and a length alone would either strand the text on a
 * phone or offer a button for nothing on a desktop. The toggle is kept once it
 * has been found, so opening the text does not take the way to close it away.
 */
function ClampedReason({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const measure = () =>
      setOverflows(
        el.clientWidth > 0
          ? el.scrollHeight > el.clientHeight + 1 ||
              el.scrollWidth > el.clientWidth + 1
          : text.length > LONG_REASON,
      );
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [text, open]);

  return (
    <div className="flex items-baseline gap-3 text-body-sm">
      <p
        ref={ref}
        className={cn(
          "min-w-0 flex-1 whitespace-pre-line break-words text-body",
          !open && "line-clamp-1",
        )}
      >
        <span className="font-medium text-muted">For:</span> {text}
      </p>
      {overflows && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((was) => !was)}
          className="inline-flex min-h-11 shrink-0 items-center text-meta font-medium text-accent-text underline underline-offset-2 sm:min-h-0"
        >
          {open ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}

/** One of the three figures along the top of the card. */
function Figure({
  term,
  className,
  children,
}: {
  term: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-meta font-medium text-muted">{term}</dt>
      <dd className="mt-1 break-words text-ink">{children}</dd>
    </div>
  );
}

export function LoanDetailScreen({ id }: { id: string }) {
  const { loan, loading, error } = useLoan(id);
  const { can } = usePermissions();
  const { employeeId } = useSession();
  const { approve } = useLoanActions();
  const toast = useToast();
  const timeZone = useOrgTimezone();
  const today = useLoanToday();

  const [approving, setApproving] = useState(false);
  /* The approval just made on this page, kept at the top of it until the next
     decision or until it is closed. `askedFor` is set when the approver changed
     the terms, so the card can say what was applied for. */
  const [approvedHere, setApprovedHere] = useState<{
    loan: ApiLoanDetail;
    askedFor?: { principalKobo: number; termMonths: number };
    n: number;
  } | null>(null);
  const [countering, setCountering] = useState<ApiLoanDetail | null>(null);
  const [declining, setDeclining] = useState<ApiLoanDetail | null>(null);
  const [rescheduling, setRescheduling] = useState<ApiLoanDetail | null>(null);
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
            { href: "/payroll", label: "Monthly payroll" },
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
            action={
              <ButtonLink href="/payroll/loans">Back to loans</ButtonLink>
            }
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
  /* What approving will fold in from their other live loans. The API prices the new loan the same
     way (`approve()`: borrowed less already repaid, plus what is still owed), so the schedule shown
     here is the one that will be created. */
  const carriedKobo = pending ? (loan.combinesWith?.owedKobo ?? 0) : 0;
  const combinedCount = pending ? (loan.combinesWith?.count ?? 0) : 0;
  const proposed = pending
    ? priceLoan({
        principalKobo:
          loan.principalKobo - (loan.alreadyRepaidKobo ?? 0) + carriedKobo,
        termMonths: loan.termMonths,
        interestRate: loan.interestRate,
        startPeriod: loan.startPeriod ?? today,
      })
    : null;

  async function decide() {
    if (!loan) return;
    setApproving(true);
    try {
      const approved = await approve(loan.id);
      /* No toast: the card at the top of the page says what was approved. */
      setApprovedHere((current) => ({
        loan: approved,
        n: (current?.n ?? 0) + 1,
      }));
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

  const instalments = effectiveSchedule(loan.schedule, today);

  /* A loan that costs nothing extra says nothing: no "Interest: None", no
     total that repeats the amount borrowed. */
  /* With a carry, the total and the monthly figure are the combined loan's, not the application's. */
  const repayableKobo =
    carriedKobo > 0 && proposed ? proposed.totalKobo : loan.totalRepayableKobo;
  const costLines = [
    loan.interestKobo > 0
      ? `${money(loan.interestKobo)} interest (${(loan.interestRate * 100).toFixed(2)}% a year)`
      : null,
    repayableKobo !== loan.principalKobo
      ? `${money(repayableKobo)} to repay in all`
      : null,
  ].filter((line): line is string => line !== null);

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/payroll", label: "Monthly payroll" },
          { href: "/payroll/loans", label: "Loans" },
        ]}
        title={own ? "Your staff loan" : loan.employeeName}
        meta={
          <>
            <Badge tone={STATUS_TONE[loan.status]} size="sm" dot>
              {LOAN_STATUS_LABEL[loan.status]}
            </Badge>
            {loan.status === "DECLINED" && (
              <AttentionMark
                text={[
                  "This was declined.",
                  `${loan.declinedReason ?? "No reason was recorded."}${
                    loan.decidedByName
                      ? ` \u2014 ${loan.decidedByName}${
                          loan.decidedAt
                            ? ` on ${formatDate(loan.decidedAt, timeZone)}`
                            : ""
                        }`
                      : ""
                  }`,
                ]}
              />
            )}
            {loan.status === "SETTLED" && (
              <AttentionMark
                tone="info"
                text={[
                  "Fully repaid.",
                  loan.completedAt
                    ? `Cleared on ${formatDate(loan.completedAt, timeZone)}. Nothing is deducted from now on.`
                    : "Nothing is deducted from now on.",
                ]}
              />
            )}
          </>
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeclining(loan)}
              >
                Decline
              </Button>
            </>
          ) : pending && own ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeclining(loan)}
            >
              Withdraw it
            </Button>
          ) : loan.status === "ACTIVE" &&
            canDecide &&
            loan.schedule.every(
              (row) =>
                row.status === "SCHEDULED" &&
                row.paidAmountKobo === 0 &&
                row.payslipId === null,
            ) ? (
            <Button size="sm" onClick={() => setRescheduling(loan)}>
              Change first deduction
            </Button>
          ) : undefined
        }
      />

      <PageBody className="flex flex-col gap-6">
        {approvedHere && (
          <ApprovedLoanCard
            key={approvedHere.n}
            loan={approvedHere.loan}
            {...(approvedHere.askedFor
              ? { askedFor: approvedHere.askedFor }
              : {})}
            linkToLoan={false}
            onDismiss={() => setApprovedHere(null)}
          />
        )}

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
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              <Figure
                term="Borrowed"
                {...(costLines.length > 0
                  ? { className: "col-span-2 sm:col-span-1" }
                  : {})}
              >
                <Money amount={naira(loan.principalKobo)} decimals size="lg" />
                {costLines.map((line) => (
                  <span
                    key={line}
                    className="mt-0.5 block text-meta text-muted"
                  >
                    {line}
                  </span>
                ))}
              </Figure>
              {pending ? (
                /* An approver needs the monthly figure and the month it would
                   start in: there is no table yet to read them from. */
                <>
                  <Figure term="A month">
                    <Money
                      amount={naira(
                        carriedKobo > 0 && proposed
                          ? proposed.instalmentKobo
                          : loan.monthlyRepaymentKobo,
                      )}
                      decimals
                      size="lg"
                    />
                  </Figure>
                  <Figure term="First deduction">
                    <span className="text-body-md font-medium">
                      {loan.startPeriod
                        ? monthLabel(loan.startPeriod)
                        : proposed
                          ? `${monthLabel(proposed.lines[0]?.dueDate ?? today)} if approved now`
                          : "Not set"}
                    </span>
                  </Figure>
                </>
              ) : (
                <>
                  {loan.schedule.length > 0 && (
                    <Figure term="Left to pay">
                      <Money
                        amount={naira(loan.progress.remainingKobo)}
                        decimals
                        size="lg"
                      />
                    </Figure>
                  )}
                  <Figure
                    term={
                      loan.status === "DECLINED" ? "Declined by" : "Approved by"
                    }
                  >
                    <span className="text-body-md font-medium">
                      {loan.decidedByName ?? "Not recorded"}
                    </span>
                  </Figure>
                </>
              )}
            </dl>

            {!pending && loan.schedule.length > 0 && (
              <div className="flex flex-col gap-2">
                <ProgressMeter
                  label={`${money(loan.progress.paidKobo)} of ${money(loan.progress.scheduledKobo)} recovered`}
                  value={paidPercent}
                  tone={loan.status === "SETTLED" ? "success" : "accent"}
                />
                {loan.progress.waivedKobo > 0 && (
                  <div>
                    <Tag>{money(loan.progress.waivedKobo)} written off</Tag>
                  </div>
                )}
              </div>
            )}
            {loan.reason && <ClampedReason text={loan.reason} />}
          </CardBody>
        </Card>

        {/* ------------------------------------------------------- schedule */}

        {loan.schedule.length > 0 ? (
          <div className="flex flex-col gap-3">
            <h2 className="font-semibold text-ink">The repayment schedule</h2>
            <div className="hidden sm:block">
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
                  {instalments.map((entry) => {
                    const { row } = entry;
                    const facts = rowFacts(entry);
                    const columns =
                      (canRecord || canDecide) && loan.status === "ACTIVE"
                        ? 6
                        : 5;
                    const open =
                      row.status === "SCHEDULED" || row.status === "PARTIAL";
                    return (
                      /* The fragment is the list item, so the key belongs on
                         it — a waived instalment renders two rows. */
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
                            <AmountCell entry={entry} note={facts.note} />
                          </TD>
                          <TD align="right">
                            {row.paidAmountKobo === 0 ? (
                              <span className="text-muted">—</span>
                            ) : (
                              <Money
                                amount={naira(row.paidAmountKobo)}
                                decimals
                              />
                            )}
                          </TD>
                          <TD>
                            <Badge tone={ROW_TONE[row.status]} size="sm" dot>
                              {facts.statusLabel}
                            </Badge>
                            {facts.moved && (
                              <AttentionMark
                                tone="info"
                                text={facts.moved}
                                className="ml-1.5"
                              />
                            )}
                          </TD>
                          {columns === 6 && (
                            <TD align="right">
                              {open && (canRecord || canDecide) && (
                                <RowActions
                                  label={`More actions for instalment ${String(row.sequence)}`}
                                  items={[
                                    ...(canRecord
                                      ? [
                                          {
                                            label: "Record a payment",
                                            onSelect: () => setPaying(row),
                                          },
                                        ]
                                      : []),
                                    ...(canDecide
                                      ? [
                                          {
                                            label: "Write off",
                                            tone: "danger" as const,
                                            onSelect: () => setWaiving(row),
                                          },
                                        ]
                                      : []),
                                  ]}
                                />
                              )}
                            </TD>
                          )}
                        </TR>

                        {row.status === "WAIVED" && (
                          <TR className="bg-canvas">
                            <TD
                              colSpan={columns}
                              className="text-body-sm text-body"
                            >
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

            <ul className="divide-y divide-line sm:hidden">
              {instalments.map((entry) => {
                const { row } = entry;
                const facts = rowFacts(entry);
                const open =
                  row.status === "SCHEDULED" || row.status === "PARTIAL";
                return (
                  <li key={row.id} className="flex flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-body-sm font-medium text-ink">
                          {row.sequence} of {loan.progress.instalmentsTotal}
                        </p>
                        {(row.payslipId ||
                          (row.paidAt && row.status !== "SCHEDULED")) && (
                          <p className="mt-0.5 text-meta text-muted">
                            {row.payslipId
                              ? "taken by payroll"
                              : "paid outside payroll"}
                          </p>
                        )}
                      </div>
                      <span className="flex shrink-0 items-center">
                        <Badge tone={ROW_TONE[row.status]} size="sm" dot>
                          {facts.statusLabel}
                        </Badge>
                        {facts.moved && (
                          <AttentionMark
                            tone="info"
                            text={facts.moved}
                            className="ml-1.5"
                          />
                        )}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-body-sm text-muted">Due</span>
                      <span className="tabular text-body-sm text-body">
                        {shortMonthLabel(row.dueDate)}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-body-sm text-muted">Amount</span>
                      <span className="tabular text-body-sm text-body">
                        <AmountCell entry={entry} note={facts.note} />
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-body-sm text-muted">Paid</span>
                      <span className="tabular text-body-sm font-medium text-ink">
                        {row.paidAmountKobo === 0 ? (
                          "—"
                        ) : (
                          <Money amount={naira(row.paidAmountKobo)} decimals />
                        )}
                      </span>
                    </div>

                    {row.status === "WAIVED" && (
                      <p className="rounded-md bg-canvas p-2.5 text-meta leading-relaxed text-body">
                        Written off, so nothing more is owed on it.
                        {row.note ? ` ${row.note}` : ""}
                      </p>
                    )}

                    {open &&
                      (canRecord || canDecide) &&
                      loan.status === "ACTIVE" && (
                        <div className="flex gap-1.5">
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
                  </li>
                );
              })}
            </ul>
          </div>
        ) : proposed ? (
          <div className="flex flex-col gap-3">
            <h2 className="font-semibold text-ink">
              What the schedule would be
            </h2>
            <p className="text-body-sm leading-relaxed text-body">
              Nothing is deducted until somebody approves this. Approving
              creates these {proposed.lines.length} instalments and payroll
              starts taking them in{" "}
              {monthLabel(proposed.lines[0]?.dueDate ?? today)}.
            </p>
            {carriedKobo > 0 && (
              <div className="rounded-lg border border-line bg-canvas px-4 py-3">
                <p className="text-meta font-medium text-muted">
                  Combined on approval
                </p>
                <p className="mt-1 text-body-sm leading-relaxed text-ink">
                  Approving also combines {combinedCount}{" "}
                  {combinedCount === 1 ? "loan" : "loans"} still owing{" "}
                  {money(carriedKobo)} into this one. Those stop coming off
                  payroll as soon as this is approved. No interest is charged on
                  the amount carried over, only on the new money.
                </p>
              </div>
            )}
            <div className="hidden sm:block">
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

            <ul className="divide-y divide-line sm:hidden">
              {proposed.lines.map((line) => (
                <li key={line.sequence} className="flex flex-col gap-1 p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-body-sm font-medium text-ink">
                      {line.sequence} of {proposed.lines.length}
                    </span>
                    <span className="tabular text-body-sm text-body">
                      <Money amount={naira(line.amountKobo)} decimals />
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-meta text-muted">
                    <span className="tabular">
                      {shortMonthLabel(line.dueDate)}
                    </span>
                    {line.sequence === proposed.lines.length &&
                      proposed.finalInstalmentKobo !==
                        proposed.instalmentKobo && (
                        <span>the balancing figure</span>
                      )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {loan.status === "ACTIVE" && (
          <p className="flex items-start gap-2 text-body-sm text-muted">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              Deductions come off net pay, after tax: a loan repayment is not
              tax-deductible, so it does not change the PAYE on this salary.
            </span>
          </p>
        )}
      </PageBody>

      {countering && (
        <CounterOfferModal
          loan={countering}
          onClose={() => setCountering(null)}
          onDone={(approved) =>
            setApprovedHere((current) => ({
              loan: approved,
              askedFor: {
                principalKobo: countering.principalKobo,
                termMonths: countering.termMonths,
              },
              n: (current?.n ?? 0) + 1,
            }))
          }
        />
      )}
      {rescheduling && (
        <RescheduleLoanModal
          loan={rescheduling}
          onClose={() => setRescheduling(null)}
        />
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
