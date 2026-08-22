"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Banknote, History, Receipt } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Money,
  Picker,
  Select,
  Spinner,
  Stat,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  type PickerOption,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { naira, paymentOutcome } from "@/lib/api/payments";
import { usePermissions } from "@/lib/permissions";
import {
  usePaidPeople,
  usePaymentBatches,
  usePaymentHistory,
  usePaymentsSummary,
} from "@/lib/store/payments";
import { longDate, monthLabel } from "../format";

/**
 * Payment history.
 *
 * ## What this screen is, and what it is not
 *
 * One row per person per month: who was paid, for which month, what they
 * received, and **whether the money actually moved**. It is the answer to "was
 * Adaeze paid for June, and did it land", which is a question nobody could ask
 * before: an instruction lives inside a batch, so the only way to find one
 * person was to open every batch in turn.
 *
 * It is **not** the payslip register. A payslip is paperwork — earnings,
 * deductions, the arithmetic. This is money — what left the account and whether
 * it arrived. `/payroll/payslips` answers the other question, and conflating the
 * two is why somebody looking for a missing salary ends up reading a tax
 * breakdown.
 *
 * ## The status column is the whole point
 *
 * There is no payment provider (`approvehr-api/src/modules/payments/provider.ts`),
 * so the ordinary state of a salary this company has genuinely paid is: the
 * instruction still reads PENDING, and the batch it sits in reads APPROVED — the
 * file was downloaded and uploaded at the bank by hand. `paymentOutcome()` in
 * `lib/api/payments.ts` reads both fields and answers "Downloaded — paid at your
 * bank" for that pair.
 *
 * **Nothing here may render "Paid" over money this product did not move.** That
 * is the rule the payments module's own documentation calls the one thing a
 * payroll product must never do, and it is why the outcome comes from one shared
 * function rather than from a `status` switch written on this screen.
 *
 * ## Two rows for one person in one month is a correction, not a bug
 *
 * Nothing here collapses rows per person-month. A second payment in a month is a
 * correction batch, and folding it into the first would hide both the correction
 * and the fact that two transfers went out.
 */

/** 50 fits a month of payroll for most companies on one page. */
const PAGE_SIZE = 50;

/** Enough batches to cover every month a company has ever paid. */
const MONTH_SCAN_SIZE = 200;

export function PaymentHistoryScreen() {
  const { can, loading: permissionsLoading } = usePermissions();

  const [person, setPerson] = useState<{ id: string; name: string } | null>(null);
  const [period, setPeriod] = useState("");
  const [page, setPage] = useState(1);

  const summary = usePaymentsSummary();
  const history = usePaymentHistory({
    page,
    pageSize: PAGE_SIZE,
    ...(person ? { employeeId: person.id } : {}),
    ...(period ? { period } : {}),
  });
  const payees = usePaidPeople(period || undefined);
  /* Months come from the batches rather than from the payments, because there is
     roughly one batch a month and there are as many payments as there are staff:
     a 200-row scan of payments covers one month at a company of 200 people, and
     the month dropdown would then offer only the current month. */
  const batches = usePaymentBatches({ pageSize: MONTH_SCAN_SIZE });

  const months = useMemo(() => {
    const seen = new Set<string>();
    for (const batch of batches.batches) {
      if (batch.period) seen.add(batch.period.slice(0, 7));
    }
    return [...seen].sort((a, b) => b.localeCompare(a));
  }, [batches.batches]);

  /* The chosen person stays in the list even when they have no payment in the
     selected month, so the control keeps showing who is being filtered on
     instead of falling back to its placeholder. */
  const personOptions = useMemo<PickerOption[]>(() => {
    const rows = payees.people.map((entry) => ({
      value: entry.id,
      label: entry.name,
    }));
    if (person && !rows.some((row) => row.value === person.id)) {
      rows.push({ value: person.id, label: person.name });
      rows.sort((a, b) => a.label.localeCompare(b.label));
    }
    return [{ value: "", label: "Everyone" }, ...rows];
  }, [payees.people, person]);

  if (permissionsLoading) {
    return (
      <PageBody className="flex items-center justify-center py-24">
        <Spinner />
      </PageBody>
    );
  }

  /* `GET /payments/history` needs RUN_PAYROLL. Rendering an empty table to
     somebody the API would refuse reads as "nobody has ever been paid", which is
     a wrong answer rather than a blank one. */
  if (!can("RUN_PAYROLL")) {
    return (
      <>
        <PageHeader title="Payment history" />
        <PageBody>
          <Card>
            <EmptyState
              icon={<History aria-hidden="true" />}
              title="Payment history is not part of your access"
              description="Only people who run payroll can see what everybody was paid. Your own payslips are on the payslips screen."
              action={<ButtonLink href="/payroll/payslips">Go to payslips</ButtonLink>}
            />
          </Card>
        </PageBody>
      </>
    );
  }

  const filtered = person !== null || period !== "";
  const from = history.total === 0 ? 0 : (history.page - 1) * history.pageSize + 1;
  const to = Math.min(history.page * history.pageSize, history.total);

  /* Absent, not false. `summary` is null while it loads and stays null if the
     call is refused, and "we do not know whether a provider is wired" is not the
     same fact as "no provider is wired". */
  const provider = summary.summary?.provider;

  function choosePerson(id: string) {
    const found = payees.people.find((entry) => entry.id === id);
    setPerson(id === "" ? null : { id, name: found?.name ?? person?.name ?? "" });
    setPage(1);
  }

  function chooseMonth(value: string) {
    setPeriod(value);
    setPage(1);
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/payroll/payments", label: "Payments" }]}
        title="Payment history"
        description="Who was paid, for which month, and whether the money moved."
        meta={
          <Badge tone={history.live ? "success" : "warning"} size="sm" dot>
            {history.live ? "Live from the API" : "Demo data, this browser only"}
          </Badge>
        }
      />

      <PageBody className="flex flex-col gap-6">
        {history.error && (
          <LoadFailure subject="the payment history" error={history.error} />
        )}

        {/* Rendered whenever we know there is no provider, not only when a row
            happens to show it: it is the key to reading the whole column, and
            somebody filtering to an empty month still needs to know what the
            product does and does not do. */}
        {provider && !provider.connected && (
          <Callout tone="info" title="ApproveHR does not move this money">
            Bank transfers are not connected. A batch is approved here, the payment
            file is downloaded, and somebody uploads it to your bank — so a paid
            salary reads &ldquo;Downloaded — paid at your bank&rdquo; rather than
            &ldquo;Paid&rdquo;. Your bank statement is the record that it arrived.
          </Callout>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Stat
            label="Payments"
            value={
              /* An em dash, never a 0. Nothing has arrived yet, and a zero here
                 is a claim that nobody has ever been paid. */
              history.loading ? (
                <span className="text-h4 text-muted">&mdash;</span>
              ) : (
                <span className="text-h4">{history.total}</span>
              )
            }
            hint={filterSentence(person?.name, period)}
          />
          <Stat
            label="Net paid"
            value={
              /* An em dash both while loading and when nothing matches. "₦0.00"
                 against a person and a month reads as "we paid them nothing",
                 which is a different claim from "there is no payment on file" —
                 and only the second one is true. */
              history.loading || history.total === 0 ? (
                <span className="text-h4 text-muted">&mdash;</span>
              ) : (
                <Money amount={naira(history.pageNetKobo)} decimals size="lg" />
              )
            }
            hint={
              history.total === 0 ? "nothing on file under this filter" : netHint(history)
            }
          />
        </div>

        <Card>
          <CardBody className="flex flex-wrap items-end gap-4">
            <div className="min-w-56 flex-1">
              <Field
                label="Person"
                help={
                  payees.truncated
                    ? "The most recently paid people. Older payments are still in the table below."
                    : undefined
                }
              >
                <Picker
                  value={person?.id ?? ""}
                  onChange={choosePerson}
                  options={personOptions}
                  loading={payees.loading}
                  placeholder="Everyone"
                />
              </Field>
            </div>
            <div className="min-w-48 flex-1">
              <Field
                label="Pay month"
                help={
                  period
                    ? "A payment not tied to a pay month is left out while a month is chosen."
                    : undefined
                }
              >
                <Select
                  value={period}
                  onChange={(event) => chooseMonth(event.target.value)}
                >
                  <option value="">All months</option>
                  {months.map((month) => (
                    <option key={month} value={month}>
                      {monthLabel(`${month}-01`)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {filtered && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPerson(null);
                  setPeriod("");
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Payments"
            description="Newest first. One row for each payment to each person."
          />
          {history.loading ? (
            <CardBody className="flex justify-center py-10">
              <Spinner />
            </CardBody>
          ) : history.rows.length === 0 ? (
            <EmptyState
              icon={<Banknote aria-hidden="true" />}
              title={filtered ? "No payments match that" : "No payments yet"}
              description={
                filtered
                  ? "Nothing was paid under this filter. Widen it, or clear it to see everything."
                  : "A payment appears here once a batch has been built from an approved payroll run."
              }
              action={
                filtered ? (
                  <Button
                    onClick={() => {
                      setPerson(null);
                      setPeriod("");
                      setPage(1);
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <ButtonLink href="/payroll/payments">Go to payments</ButtonLink>
                )
              }
            />
          ) : (
            <>
              <TableWrap
                className="rounded-none border-0"
                caption="Payments, newest first"
              >
                <THead>
                  <TH>Person</TH>
                  <TH>Pay month</TH>
                  <TH align="right">Net paid</TH>
                  <TH>Payment</TH>
                  <TH>Batch</TH>
                </THead>
                <TBody>
                  {history.rows.map((row) => {
                    const outcome = paymentOutcome(row);
                    return (
                      <TR key={row.id}>
                        <TDPrimary
                          title={
                            /* A payee with no employee record is a real state —
                               `employeeId` is nullable — and a link to
                               `/people/null` is worse than plain text. */
                            row.employeeId ? (
                              <Link
                                href={`/people/${row.employeeId}`}
                                className="hover:text-accent-text hover:underline underline-offset-4"
                              >
                                {row.payeeName}
                              </Link>
                            ) : (
                              row.payeeName
                            )
                          }
                          subtitle={row.employeeId ? undefined : "Not on the payroll"}
                        />
                        <TD>
                          {row.period ? (
                            monthLabel(`${row.period}-01`)
                          ) : (
                            <span className="text-muted">
                              No pay month
                              <span className="mt-0.5 block text-meta">
                                Raised {longDate(row.raisedAt.slice(0, 10))}
                              </span>
                            </span>
                          )}
                        </TD>
                        <TD align="right" className="tabular font-medium text-ink">
                          <Money amount={naira(row.amountKobo)} decimals />
                        </TD>
                        <TD>
                          <Badge tone={outcome.tone} size="sm" dot>
                            {outcome.label}
                          </Badge>
                          {/* Only where the reason is about this one payment.
                              The general explanation is the callout above; a
                              sentence under fifty badges is noise. */}
                          {row.failureReason && (
                            <span className="mt-1 block text-meta text-danger-text">
                              {row.failureReason}
                            </span>
                          )}
                        </TD>
                        <TD>
                          <Link
                            href={`/payroll/payments/${row.batchId}`}
                            className="text-body-sm text-accent-text hover:underline underline-offset-4"
                          >
                            {row.batchReference}
                          </Link>
                          {row.payDate && (
                            <span className="mt-0.5 block text-meta text-muted">
                              Due {longDate(row.payDate)}
                            </span>
                          )}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </TableWrap>

              {history.total > history.pageSize && (
                <CardBody className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-body-sm text-muted">
                    Showing {from}&ndash;{to} of {history.total}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={history.page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      disabled={history.page >= history.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </CardBody>
              )}
            </>
          )}
        </Card>

        <p className="flex items-start gap-2 text-body-sm text-muted">
          <Receipt aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            This is money. For what somebody earned and what was deducted, open
            their{" "}
            <Link
              href="/payroll/payslips"
              className="text-accent-text hover:underline underline-offset-4"
            >
              payslip
            </Link>
            .
          </span>
        </p>
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/** What the count is counting, in words. */
function filterSentence(name: string | undefined, period: string): string {
  const who = name ? name : "everybody";
  const when = period ? monthLabel(`${period}-01`) : "all months";
  return `${who}, ${when}`;
}

/**
 * What the money figure covers — stated, never implied.
 *
 * The endpoint returns no money aggregate, so a sum over the rows in hand is the
 * only figure available. Two things therefore have to be said out loud: that
 * later pages are not in it, and that payments which did not move are not in it
 * either. A total that quietly includes a failed transfer is a claim that
 * somebody was paid.
 *
 * It leads with the number of payments the figure actually adds up, because a
 * hint that opens "all 28 payments" and then subtracts 19 of them reads as a
 * contradiction rather than a qualification.
 */
function netHint(history: {
  complete: boolean;
  rows: unknown[];
  total: number;
  pageUnpaidCount: number;
}): string {
  const shown = history.rows.length;
  const counted = shown - history.pageUnpaidCount;

  if (history.complete) {
    if (counted === 0) {
      return history.total === 1
        ? "the one payment on file has not been paid"
        : `none of these ${history.total} payments have been paid`;
    }
    if (history.pageUnpaidCount === 0) {
      return history.total === 1 ? "the only payment" : `all ${history.total} payments`;
    }
    return `${counted} of ${history.total} payments — the other ${
      history.pageUnpaidCount
    } ${history.pageUnpaidCount === 1 ? "has" : "have"} not been paid`;
  }

  if (counted === 0) {
    return `none of the ${shown} on this page have been paid, and later pages are not counted`;
  }
  if (history.pageUnpaidCount === 0) {
    return `the ${shown} on this page, of ${history.total} — later pages are not counted`;
  }
  return `${counted} of the ${shown} on this page — ${history.pageUnpaidCount} not paid, and later pages are not counted`;
}
