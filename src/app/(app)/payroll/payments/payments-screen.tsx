"use client";

import { sourceNote } from "@/lib/demo";
import { useState } from "react";
import { Banknote, Landmark } from "lucide-react";
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
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import {
  naira,
} from "@/lib/api/payments";
import { usePermissions } from "@/lib/permissions";
import {
  usePaymentsSummary,
  useWallet,
  useWalletStatement,
} from "@/lib/store/payments";
import { FundingAccounts } from "../runs/new/pay-panel";
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
  /* Owned here, not inside `WalletStatement`, so the headline figure and the
     rows come from one request and cannot contradict each other. */
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const statement = useWalletStatement({ page, pageSize });
  const summary = usePaymentsSummary();


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

  const held = wallet.wallet;
  const statementHeld = statement.statement;
  const primary = summary.summary?.primaryAccount;

  return (
    <>
      <PageHeader
        title="Wallet"
        meta={
          /* The wallet's own `live`, now that the batch list this used to
             read is gone. Same question — is this real data — asked of the
             thing the screen is actually about. */
          sourceNote(wallet.live) && (
            <Badge tone="warning" size="sm" dot>
              {sourceNote(wallet.live)}
            </Badge>
          )
        }
      />

      <PageBody className="flex flex-col gap-6">
        {wallet.error && (
          <LoadFailure
            subject="the wallet balance"
            error={wallet.error}
            onRetry={wallet.reload}
          />
        )}

        {/* One figure, and an em dash where it has not arrived.
            -----------------------------------------------------------------
            Never ₦0.00 for an unanswered request. `useWalletStatement`
            returns null while loading, on failure, and offline — and a
            confident zero against any of those three is a claim about a
            company's money that happens to be false. The ₦0 incident this
            codebase has a rule about was exactly this shape one module
            along. */}
        <div className="grid items-start gap-4 sm:grid-cols-2">
          {/* One balance, and it is the wallet's own.
              -----------------------------------------------------------------
              There were two tiles here -- "Available to pay with" and "In the
              account" -- and they showed the same number, which was neither
              of the things they claimed and not the wallet balance either.
              Both came from `GET /payments/wallet`, which re-derives a
              position by summing `LedgerEntry`. Nothing that moves the wallet
              writes a ledger row, so after a payroll the tiles read
              ₦15,012,300.55 while the wallet held ₦5,620,778.55 and said so
              in the statement directly below them.

              This reads the wallet. `GET /payments/wallet/account` returns the
              stored balance -- the figure with a row lock behind it, both
              sides recorded on every movement, and `reconcileWallet` checking
              it against them -- and it is the *same request* the statement
              below is drawn from, so the headline and the rows cannot
              disagree. That is why `useWalletStatement` is called here and
              passed down rather than called twice. */}
          <Stat
            label="Wallet balance"
            value={
              statementHeld ? (
                <Money amount={naira(statementHeld.balanceKobo)} decimals size="xl" />
              ) : (
                <Unknown />
              )
            }
            hint="what the wallet holds right now"
          />

          {/* The account to pay into, beside the figures rather than in a card
              of its own further down.
              -----------------------------------------------------------------
              It answers the question the two figures raise. Somebody reading
              "available ₦15,012,300.55" and finding it short needs the account
              number next, and it used to be a scroll away under a heading that
              did not say "account number".

              "Paying from" — the company's own bank account — is deliberately
              not here and not anywhere on this screen. It is a settings fact,
              it is on the batch where a payment is actually checked, and
              sitting it next to this one only ever invited money being sent to
              the wrong one of the two. */}
          <Card>
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
                  The wallet is a live balance from the API. There is no ledger
                  to read offline, and a figure invented here would be a claim
                  about a company&rsquo;s money.
                </Callout>
              )}
            </CardBody>
          </Card>
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

        <WalletStatement
          statement={statement}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            /* Page three of 25 is past the end of a 100-row page. */
            setPage(1);
          }}
        />

        {/* The payments list was here, and is gone at the product owner's
          * request. It listed each batch a payroll built, with the batch page
          * behind an "Open" and the bank file behind a download.
          *
          * Two things went with it and are worth knowing: this was the only
          * route on this screen to `/payroll/payments/<id>`, and the only
          * place a company could fetch an approved batch's bank file again
          * after losing the first download. Both still exist; nothing here
          * points at them any more. */}
        <LedgerPanel canRecordFunding={can("MANAGE_SETTINGS")} />
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
