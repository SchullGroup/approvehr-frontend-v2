"use client";

import { sourceNote } from "@/lib/demo";
import { useState } from "react";
import Link from "next/link";
import { ArrowDownToLine, Banknote, Landmark, ScrollText } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Money,
  Spinner,
  Stat,
  Tabs,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  availableFigure,
  naira,
  type ApiPaymentBatch,
} from "@/lib/api/payments";
import { usePermissions } from "@/lib/permissions";
import {
  BATCH_STATUS,
  usePaymentActions,
  usePaymentBatches,
  usePaymentsSummary,
  useWallet,
} from "@/lib/store/payments";
import { downloadCsv } from "@/lib/csv";
import { FundingAccounts } from "../runs/new/pay-panel";
import { longDate } from "./format";
import { LedgerPanel } from "./ledger-panel";
import { WalletStatement } from "./wallet-statement";

/**
 * The wallet.
 *
 * ## What this screen used to be, and why it is not that any more
 *
 * It was a batch console: build a payment batch, check it, approve it,
 * download a file. Four acts of bookkeeping on a screen somebody had to know
 * existed, sitting between an approved payroll and the people it was meant to
 * pay. The product owner's assessment was that the page was not needed, and he
 * was right about the console — a batch is derived entirely from a run, so
 * assembling one by hand was a second way to do a thing the run already knows.
 *
 * **Approving a payroll now builds its payment, and the run offers both ways
 * out** — pay from the wallet, or download the bank file. See
 * `payroll/runs/new/pay-panel.tsx`. The "Build a payment batch" button that
 * used to live here is gone, and deliberately: two ways to build a batch for
 * one run is how a company pays somebody twice.
 *
 * ## What is here instead, and why this page still exists
 *
 * The wallet is a real thing and it needed a home. Money is transferred into a
 * collection account, credits the wallet, and salaries are paid out of it. So
 * this screen answers exactly three questions:
 *
 * 1. **What is in it** — and specifically, what is *available* after
 *    everything already promised.
 * 2. **How do I put money in** — the collection account, which was previously
 *    knowable by nobody inside the company.
 * 3. **What has gone in and out** — the ledger.
 *
 * The payments prepared so far stay at the bottom, as a record rather than a
 * workbench: every row opens, and every approved row still hands over its bank
 * file, because somebody who downloaded one and lost it needs it again.
 */
export function PaymentsScreen() {
  const { can, loading: permissionsLoading } = usePermissions();
  const wallet = useWallet();
  const summary = usePaymentsSummary();
  const list = usePaymentBatches({ pageSize: 25 });
  const actions = usePaymentActions();
  const toast = useToast();

  const [downloading, setDownloading] = useState<string | null>(null);
  const [accountsTab, setAccountsTab] = useState("in");

  if (permissionsLoading) {
    return (
      <PageBody className="flex items-center justify-center py-24">
        <Spinner />
      </PageBody>
    );
  }

  /* RUN_PAYROLL **or** APPROVE_PAYROLL, matching the reads in
     `modules/payments/router.ts`. The Finance approver holds only the second
     and must never hold the first — separation of duties is the whole point
     of the split — so checking the first alone shut the one role whose job is
     releasing money out of the screen where money is released. */
  if (!can("RUN_PAYROLL") && !can("APPROVE_PAYROLL")) {
    return (
      <>
        <PageHeader title="Wallet" />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Banknote aria-hidden="true" />}
              title="The wallet is not part of your access"
              description="Seeing what the company holds needs either the “Run payroll” or the “Approve payroll” permission. Ask somebody who manages roles."
              action={<ButtonLink href="/dashboard">Back to home</ButtonLink>}
            />
          </Card>
        </PageBody>
      </>
    );
  }

  async function download(batch: ApiPaymentBatch) {
    setDownloading(batch.id);
    try {
      const file = await actions.downloadFile(batch.id);
      downloadCsv(file.filename, file.csv);
      toast.push({
        title: `${file.filename} saved`,
        tone: "success",
        detail: "Upload it to your bank to pay these people.",
      });
    } catch (error) {
      toast.push({
        title: "No file was produced",
        tone: "danger",
        detail:
          error instanceof ApiError ? error.message : "Something went wrong. Try again.",
      });
    } finally {
      setDownloading(null);
    }
  }

  const held = wallet.wallet;
  const primary = summary.summary?.primaryAccount;

  return (
    <>
      <PageHeader
        title="Wallet"
        meta={
          sourceNote(list.live) && (
            <Badge tone="warning" size="sm" dot>
              {sourceNote(list.live)}
            </Badge>
          )
        }
      />

      <PageBody className="flex flex-col gap-6">
        {list.error && (
          <LoadFailure
            subject="the payments"
            error={list.error}
            onRetry={list.reload}
          />
        )}
        {wallet.error && (
          <LoadFailure
            subject="the wallet balance"
            error={wallet.error}
            onRetry={wallet.reload}
          />
        )}

        {/* Three figures, and an em dash where one has not arrived.
            -----------------------------------------------------------------
            Never ₦0.00 for an unanswered request. `useWallet` returns null
            while loading, on failure, and offline — and a confident zero
            against any of those three is a claim about a company's money that
            happens to be false. The ₦0 incident this codebase has a rule about
            was exactly this shape one module along. */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Label and hint move with the sign — see `availableFigure`. A
              company that has approved more than it holds is short by an
              amount, not in possession of a negative one. */}
          <Stat
            label={held ? availableFigure(held.availableKobo).label : "Available to pay with"}
            value={
              held ? (
                <Money
                  amount={naira(availableFigure(held.availableKobo).kobo)}
                  decimals
                  size="xl"
                />
              ) : (
                <Unknown />
              )
            }
            hint={
              held
                ? availableFigure(held.availableKobo).hint
                : "after everything already promised"
            }
          />
          <Stat
            label="In the account"
            value={
              held ? (
                <Money amount={naira(held.balanceKobo)} decimals size="xl" />
              ) : (
                <Unknown />
              )
            }
            hint="on the bank statement"
          />
          {/* "Already promised" was here, and it is gone on purpose.
              -----------------------------------------------------------------
              It rendered `committedKobo`, which counts instructions inside
              APPROVED or SUBMITTED batches. Approving a payroll debits the
              wallet at approval and leaves the batch it builds in DRAFT, so
              the figure read ₦0.00 for the one case it exists to describe.
              A tile that is always zero teaches a reader to stop looking at
              it, and this one sits beside figures about the same money.

              The underlying disagreement between the ledger-derived position
              and the stored wallet is a separate, open piece of work. This
              only stops the screen asserting something it cannot support. */}
          {/* "Paying from" was here. The account salaries leave from is a
              settings fact, not a figure about the money, and it sat in a row
              of amounts reading as though it were one. It is still on the
              batch, which is where somebody checking a payment looks. */}
        </div>

        {held && held.committedKobo > 0 && (
          <p className="text-body-sm text-muted">
            &ldquo;Available&rdquo; is the balance less what is already
            promised. Two payrolls approved in one morning must not both be told
            the same money is theirs, which is what a single balance figure
            would do.
          </p>
        )}

        {summary.summary && !primary && (
          <Card>
            <CardBody className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-body-sm text-ink">
                No account for salaries to be paid <em>from</em> yet. A payroll
                cannot build its payment without one.
              </p>
              <ButtonLink href="/settings/bank-accounts" variant="accent" size="sm">
                <Landmark aria-hidden="true" className="size-4" />
                Add a bank account
              </ButtonLink>
            </CardBody>
          </Card>
        )}

        {/*
          * One card, two accounts, and they are not the same account.
          * ---------------------------------------------------------------
          * Money goes *in* to a collection account at the provider, and
          * salaries go *out* from the company's own bank account. Two
          * separate cards invited the reading that either would do, and
          * money sent to the wrong one of those is money nobody in the
          * company can find. Tabs put them side by side and make you pick.
          *
          * "Money in" leads because it is the one somebody comes to this
          * screen needing — the account to fund. "Paying from" is a
          * settings fact that used to sit in the row of figures above,
          * reading as though it were an amount.
          */}
        <Card>
          <CardHeader title="Accounts" />
          <CardBody className="pb-0">
            <Tabs
              items={[
                { id: "in", label: "Money in" },
                { id: "from", label: "Paying from" },
              ]}
              value={accountsTab}
              onChange={setAccountsTab}
            />
          </CardBody>
          <CardBody>
            {accountsTab === "in" ? (
              wallet.loading ? (
                <div className="flex items-center gap-2 text-body-sm text-muted">
                  <Spinner size="sm" />
                  Reading the account
                </div>
              ) : held ? (
                <FundingAccounts accounts={held.fundingAccounts} />
              ) : (
                <Callout tone="info" title="Not available here">
                  The wallet is a live balance from the API. There is no ledger
                  to read offline, and a figure invented here would be a claim
                  about a company&rsquo;s money.
                </Callout>
              )
            ) : primary ? (
              <div className="space-y-1">
                <p className="text-body font-medium text-ink">
                  {primary.bankName}
                </p>
                <p className="tabular text-body-sm text-muted">
                  {primary.accountNumberMasked} · {primary.accountName}
                </p>
                <p className="pt-2 text-body-sm text-muted">
                  Salaries leave from here. Paying money <em>in</em> to it does
                  not credit the wallet — that is the account on the other tab.
                </p>
              </div>
            ) : (
              <Callout tone="warning" title="No account to pay from">
                A payroll cannot build its payment without one.
              </Callout>
            )}
          </CardBody>
        </Card>

        <WalletStatement />

        <Card>
          <CardHeader
            title="Payments"
            description="Prepared when a payroll is approved. Each one opens."
          />
          {list.loading ? (
            <CardBody className="flex justify-center py-10">
              <Spinner />
            </CardBody>
          ) : list.batches.length === 0 ? (
            <EmptyState
              icon={<Banknote aria-hidden="true" />}
              title="Nothing has been paid yet"
              description="A payment is prepared the moment a payroll is approved, and the run itself offers to send it or hand you the bank file. Approve this month's payroll and it shows up here."
              action={<ButtonLink href="/payroll">Go to payroll</ButtonLink>}
            />
          ) : (
            <TableWrap
              className="rounded-none border-0"
              caption="Payments, newest first"
            >
              <THead>
                <TH>Reference</TH>
                <TH>Pays</TH>
                <TH align="right">People</TH>
                <TH align="right">Total</TH>
                <TH>From</TH>
                <TH>Status</TH>
                <TH align="right">
                  <span className="sr-only">Actions</span>
                </TH>
              </THead>
              <TBody>
                {list.batches.map((batch) => {
                  const status = BATCH_STATUS[batch.status];
                  return (
                    <TR key={batch.id}>
                      <TDPrimary
                        title={
                          <Link
                            href={`/payroll/payments/${batch.id}`}
                            className="hover:text-accent-text hover:underline underline-offset-4"
                          >
                            {batch.reference}
                          </Link>
                        }
                        subtitle={batch.narration ?? undefined}
                      />
                      <TD>{batch.payDate ? longDate(batch.payDate) : "—"}</TD>
                      <TD align="right" className="tabular">
                        {batch.itemCount}
                      </TD>
                      <TD align="right" className="tabular font-medium text-ink">
                        <Money amount={naira(batch.computedTotalKobo)} decimals />
                      </TD>
                      <TD>
                        <span className="text-body-sm">{batch.sourceBankName}</span>
                        <span className="tabular mt-0.5 block text-meta text-muted">
                          {batch.sourceAccountMasked}
                        </span>
                      </TD>
                      <TD>
                        <Badge tone={status.tone} size="sm" dot>
                          {status.label}
                        </Badge>
                      </TD>
                      <TD align="right">
                        <div className="flex justify-end gap-2">
                          {/* Still here, and it is not a leftover of the old
                              console: somebody who downloaded a file and lost
                              it needs it again, and the run it came from is
                              months back by then. `can.downloadFile` is the
                              server's own view of the state machine, so this
                              cannot offer what the endpoint would refuse. */}
                          {batch.can.downloadFile && (
                            <Button
                              variant="secondary"
                              size="sm"
                              loading={downloading === batch.id}
                              onClick={() => void download(batch)}
                            >
                              <ArrowDownToLine aria-hidden="true" className="size-3.5" />
                              Bank file
                            </Button>
                          )}
                          <ButtonLink
                            href={`/payroll/payments/${batch.id}`}
                            variant="ghost"
                            size="sm"
                          >
                            Open
                          </ButtonLink>
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </TableWrap>
          )}
        </Card>

        <LedgerPanel canRecordFunding={can("MANAGE_SETTINGS")} />

        <p className="flex items-center gap-2 text-body-sm text-muted">
          <ScrollText aria-hidden="true" className="size-4 shrink-0" />
          Every bank file download is recorded in the{" "}
          <Link
            href="/settings/audit"
            className="text-accent-text hover:underline underline-offset-4"
          >
            audit trail
          </Link>
          .
        </p>
      </PageBody>
    </>
  );
}

/**
 * The figure that has not arrived.
 *
 * An em dash rather than a spinner: these tiles sit side by side, and four
 * spinners read as a broken screen where four dashes read as "not yet". Same
 * treatment `history-screen` uses, and for the same reason — a `₦0.00` here is
 * a claim, and the claim is false.
 */
function Unknown() {
  return (
    <span className="text-muted" title="Not loaded yet">
      &mdash;
    </span>
  );
}
