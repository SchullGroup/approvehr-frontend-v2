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
  Disclosure,
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
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  availableFigure,
  naira,
  walletBalanceComparison,
  type ApiPaymentBatch,
} from "@/lib/api/payments";
import { usePermissions } from "@/lib/permissions";
import {
  BATCH_STATUS,
  usePaymentActions,
  usePaymentBatches,
  usePaymentsSummary,
  useWallet,
  useWalletAccount,
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
  /* Held here rather than inside `WalletStatement` so the headline figure and
     the statement come from one request. See that component's header. */
  const statement = useWalletAccount();
  const summary = usePaymentsSummary();
  const list = usePaymentBatches({ pageSize: 25 });
  const actions = usePaymentActions();
  const toast = useToast();

  const [downloading, setDownloading] = useState<string | null>(null);

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
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
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
        {/* Its own failure, not folded into the one above. The two reads can
            fail independently — a statement that did not load is not a balance
            that did not load, and telling somebody the balance is unavailable
            while it is on screen above would be false. `WalletStatement`
            renders the detail; this is the headline figure's half. */}
        {statement.error && !wallet.error && (
          <LoadFailure
            subject="the wallet statement"
            error={statement.error}
            onRetry={statement.reload}
          />
        )}

        {/* Four figures, and an em dash where one has not arrived.
            -----------------------------------------------------------------
            Never ₦0.00 for an unanswered request. Both wallet hooks return
            null while loading, on failure, and offline — and a confident zero
            against any of those three is a claim about a company's money that
            happens to be false. The ₦0 incident this codebase has a rule about
            was exactly this shape one module along.

            ## Which balance leads, and why only one of them does

            There are two, they count different events, and they are meant to
            disagree: the wallet is debited when a payroll is **approved**, the
            ledger when the money **settles**. Both are true. Putting both
            under the word "balance" would be two mutually exclusive claims on
            one screen, which is the defect this product is sold against.

            So the wallet's own balance leads — it is the figure somebody can
            name, which is the reason it was built — and the ledger's is stated
            underneath in a sentence that says what the gap is. */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="In the wallet"
            value={
              statement.account ? (
                <Money
                  amount={naira(statement.account.balanceKobo)}
                  decimals
                  size="xl"
                />
              ) : (
                <Unknown />
              )
            }
            hint="what the wallet holds now"
          />
          <Stat
            label="Already promised"
            value={
              held ? (
                <Money amount={naira(held.committedKobo)} decimals size="xl" />
              ) : (
                <Unknown />
              )
            }
            hint="approved or sent, not yet gone"
          />
          {/* Label and hint move with the sign — see `availableFigure`. A
              company that has approved more than it holds is short by an
              amount, not in possession of a negative one. */}
          <Stat
            label={
              held
                ? availableFigure(held.availableKobo).label
                : "Left to draw on"
            }
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
            label="Paying from"
            value={
              primary ? (
                <span className="text-body-sm font-medium text-ink">
                  {primary.bankName}
                </span>
              ) : (
                <span className="text-body-sm font-medium text-muted">
                  Not set
                </span>
              )
            }
            hint={
              primary
                ? /* Digits first: the masked number is what somebody checks a
                     payout account by, and it was the half `truncate` was
                     eating -- "Schull Technologies Limited - ***..." */
                  `${primary.accountNumberMasked} · ${primary.accountName}`
                : undefined
            }
          />
        </div>

        {/* The second balance, in prose rather than as a fifth tile.
            -----------------------------------------------------------------
            A reader who sees two figures and no explanation has to work out
            which one is their money. `walletBalanceComparison` returns null
            when they agree, so this appears only when there is something to
            account for. */}
        {held && statement.account && (
          <WalletVersusBank
            storedKobo={statement.account.balanceKobo}
            derived={held}
          />
        )}

        {/* Does not quote the label beside it. `availableFigure` swings that
            label between "Available to pay with" and "Short by" on the sign,
            so a sentence opening with the word "Available" explains a tile
            that is not on screen whenever a company has over-committed —
            which is exactly when somebody reads this paragraph. */}
        {held && held.committedKobo > 0 && (
          <p className="text-body-sm text-muted">
            The last figure is the balance less what is already promised. Two
            payrolls approved in one morning must not both be told the same
            money is theirs, which is what a single balance figure would do.
          </p>
        )}

        {summary.summary && !primary && (
          <Card>
            <CardBody className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-body-sm text-ink">
                No account for salaries to be paid <em>from</em> yet. A payroll
                cannot build its payment without one.
              </p>
              <ButtonLink
                href="/settings/bank-accounts"
                variant="accent"
                size="sm"
              >
                <Landmark aria-hidden="true" className="size-4" />
                Add a bank account
              </ButtonLink>
            </CardBody>
          </Card>
        )}

        <Card>
          {/*
           * No description, deliberately: `FundingAccounts` opens with this
           * card's sentence already.
           *
           * There were two of them, one line apart -- "Transfers into any of
           * these accounts credit the wallet." here, and "Transfer into any of
           * these accounts and the wallet is credited automatically." from the
           * component -- which read as the page repeating itself. Making the
           * two agree about plurality, which is what happened first, was
           * fixing the wrong half.
           *
           * The component's copy is the one that survives, because it travels
           * with the accounts: the component states its own terms wherever it
           * is placed, and a card description cannot. It also already handles
           * both the singular and the empty case.
           */}
          <CardHeader title="Putting money in" />
          <CardBody>
            {wallet.loading ? (
              <div className="flex items-center gap-2 text-body-sm text-muted">
                <Spinner size="sm" />
                Reading the account
              </div>
            ) : held ? (
              <FundingAccounts accounts={held.fundingAccounts} />
            ) : (
              <Callout tone="info" title="Not available here">
                The wallet is a live balance from the API. There is no ledger to
                read offline, and a figure invented here would be a claim about
                a company&rsquo;s money.
              </Callout>
            )}
          </CardBody>
        </Card>

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
                      <TD
                        align="right"
                        className="tabular font-medium text-ink"
                      >
                        <Money
                          amount={naira(batch.computedTotalKobo)}
                          decimals
                        />
                      </TD>
                      <TD>
                        <span className="text-body-sm">
                          {batch.sourceBankName}
                        </span>
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
                              <ArrowDownToLine
                                aria-hidden="true"
                                className="size-3.5"
                              />
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

        <WalletStatement statement={statement} />

        {/* The ledger, closed, and named for what it is.
            -----------------------------------------------------------------
            It was a full-width panel directly under the statement, and the two
            are different records of overlapping events — the ledger writes a
            debit when money settles, the wallet writes one when a payroll is
            approved. Side by side and both headed with a list of movements,
            they read as the page disagreeing with itself about what has
            happened to a company's money.

            The statement is the one a person came to read. This is the
            underlying double-entry record, which is a real thing somebody
            occasionally needs and nobody needs first, so it is behind a click
            with a title that says which of the two it is.

            `keepMounted` is false, so the ledger's own request is not made
            until somebody opens it. Rule 5's other half applies and is the
            reason this is a disclosure rather than a deletion: what goes
            behind a click is reference material, never a warning or a figure
            costing money — and there is neither in here. Recording funding
            lives inside it, which is a deliberate write behind a reveal rather
            than an urgent one hidden. */}
        <Disclosure
          title="The underlying ledger entries"
          hint="Double-entry records of money in and out. The statement above is the wallet's own account of the same events, and the two differ by design — the ledger moves when money settles, the wallet when a payroll is approved."
        >
          <LedgerPanel canRecordFunding={can("MANAGE_SETTINGS")} />
        </Disclosure>

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
 * The bank's figure, and why it is not the one above.
 *
 * Rendered only when the two disagree — `walletBalanceComparison` returns null
 * otherwise, so a company whose money is sitting still sees one balance and no
 * essay about it.
 *
 * The wording lives in `lib/api/payments.ts` beside `availableFigure`, which is
 * the other sentence on this screen that has to be true of money. Two copies of
 * a rule about a balance is how two screens come to describe it differently.
 */
function WalletVersusBank({
  storedKobo,
  derived,
}: {
  storedKobo: number;
  derived: { balanceKobo: number; committedKobo: number };
}) {
  const gap = walletBalanceComparison(storedKobo, derived);
  if (!gap) return null;
  return (
    <p className="text-body-sm text-muted">
      The bank statement shows{" "}
      <Money amount={naira(derived.balanceKobo)} decimals />, which is{" "}
      <Money amount={naira(gap.differenceKobo)} decimals /> away from the
      wallet. {gap.sentence}
    </p>
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
