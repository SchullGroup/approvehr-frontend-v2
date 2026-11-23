"use client";

import { sourceNote } from "@/lib/demo";
import { useState } from "react";
import { Banknote, Landmark } from "lucide-react";
import {
  Badge,
  ButtonLink,
  Card,
  CardBody,
  EmptyState,
  Money,
  Spinner,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { naira } from "@/lib/api/payments";
import { usePermissions } from "@/lib/permissions";
import {
  usePaymentsSummary,
  useWallet,
  useWalletStatement,
} from "@/lib/store/payments";
import { WalletCard } from "./wallet-card";
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
              plain
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
  const noFundingAccount = held !== null && held.fundingAccounts.length === 0;
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
        {/* One card: the balance, and the account to pay into.
            -----------------------------------------------------------------
            Never ₦0.00 for an unanswered request. `useWalletStatement`
            returns null while loading, on failure, and offline — and a
            confident zero against any of those three is a claim about a
            company's money that happens to be false. The ₦0 incident this
            codebase has a rule about was exactly this shape one module
            along. `WalletCard` draws a dash for it.

            The balance is the wallet's own, and not a re-derived ledger sum.
            `GET /payments/wallet/account` returns the stored balance -- the
            figure with a row lock behind it, both sides recorded on every
            movement, and `reconcileWallet` checking it against them -- and it
            is the *same request* the statement below is drawn from, so the
            headline and the rows cannot disagree. That is why
            `useWalletStatement` is called here and passed down rather than
            called twice. (There used to be two tiles, "Available to pay with"
            and "In the account", that showed one number which was neither of
            the things they claimed: they summed `LedgerEntry`, which nothing
            that moves the wallet writes to.)

            The account sits beside it because it answers the question the
            figure raises. Somebody finding the balance short needs the
            account number next. "Paying from" -- the company's own bank
            account -- is deliberately not here: it is a settings fact, it is
            on the batch where a payment is checked, and next to this one it
            only invites money being sent to the wrong one of the two. */}
        {/* No funding account means no wallet to show (U30): the card was a
            large banner saying so, on a company paying by bank file. */}
        {noFundingAccount ? (
          <p className="text-body-sm text-muted">
            Payroll is paid by bank file. Paying from a wallet needs a
            collection account, which your ApproveHR contact can open.
          </p>
        ) : (
          <WalletCard
            balanceKobo={statementHeld ? statementHeld.balanceKobo : null}
            accounts={held ? held.fundingAccounts : null}
            loading={wallet.loading}
            error={wallet.error}
            onRetry={wallet.reload}
          />
        )}
        {/* "Already promised" was here, and it is gone on purpose: it rendered
            `committedKobo`, which counts instructions inside APPROVED or
            SUBMITTED batches, and approving a payroll debits the wallet at
            approval and leaves the batch it builds in DRAFT, so the figure
            read ₦0.00 for the one case it exists to describe. "Paying from"
            is gone for the reason in the comment above. */}

        {/* Not an explanation of a figure this screen shows.
            -----------------------------------------------------------------
            This said what "Available" meant, and arrived with a merge after
            that tile had been removed — so it explained something no longer
            on the page. Deleting it outright would have hidden the fact it
            was carrying, though: when a payroll is approved and its wallet
            debit is refused for want of funds, money is promised out of this
            balance and the single figure above cannot show it.

            So it names the amount instead, and only when there is one. */}
        {held && held.committedKobo > 0 && (
          <p className="text-body-sm text-muted">
            <Money amount={naira(held.committedKobo)} decimals /> of this is
            already promised to an approved payroll the wallet has not paid out.
            Approving another one does not make that money available twice.
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
        {/* Account activity was here — `LedgerEntry`, what the bank did.
         * Removed because it was a second table about the same money that
         * disagreed with the first: the ledger held two provider deposits the
         * wallet never received (₦8,750), while the payroll debit that left
         * the wallet wrote no ledger row, so it reported "Out ₦0.00" after a
         * payroll had gone out. Its balances were null unless somebody typed
         * them off a statement, and its own comment forbade computing them.
         *
         * The wallet statement is the honest record and it is the one that
         * stayed. `GET /payments/ledger` still exists and the entries are
         * still written; nothing displays them. */}
      </PageBody>
    </>
  );
}
