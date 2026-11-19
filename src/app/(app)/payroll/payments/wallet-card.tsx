"use client";

import { Landmark } from "lucide-react";
import { HeroBackdrop, LoadState, Money } from "@/components/ui";
import { HERO_BLUE } from "@/components/ui/hero-backdrop";
import { naira } from "@/lib/api/payments";
import { CopyButton } from "@/app/(app)/settings/webhooks";

/** One account money can be paid into, as the API describes it. */
export type FundingAccount = {
  provider: string;
  accountNumber: string;
  accountName: string;
  bankName: string;
  /** Absent from some providers. An absent code is not an empty one. */
  bankCode: string | null;
  isDefault: boolean;
};

/**
 * The wallet as one blue card: what it holds, and the account to pay into.
 *
 * The same gradient as the clock card on the home page and the mobile app's home card (`HeroBackdrop`), with the
 * balance large on the left and the account on the right, so the two things somebody comes here for are in one
 * glance. On a phone they stack: balance, then account.
 *
 * ## Two figures from two reads, and neither waits for the other
 *
 * - **`balanceKobo`** comes from the wallet statement, the stored balance with a row lock behind it. Null while it
 *   is loading, failed or offline, and then it is a dash, never `₦0.00`: a confident zero against an unanswered
 *   request is a false claim about a company's money (ADR-0003).
 * - **The account** comes from the wallet read. It sits inside `LoadState`, so loading is a quiet frosted
 *   placeholder and a failure is the shared failure card, said once, here, rather than also above the balance.
 *
 * "Paying from", the company's own bank account, is deliberately not on this card. It is a settings fact, it is on
 * the batch where a payment is checked, and putting it beside the account to pay *into* only invites money going
 * to the wrong one of the two.
 */
export function WalletCard({
  balanceKobo,
  accounts,
  loading,
  error,
  onRetry,
}: {
  balanceKobo: number | null;
  /** Null when the wallet read has not answered. An empty list is an answer: no account opened yet. */
  accounts: FundingAccount[] | null;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <section
      aria-label="Wallet"
      className="relative overflow-hidden rounded-xl text-white shadow-sm"
      style={{ backgroundColor: HERO_BLUE.from }}
    >
      <HeroBackdrop />
      <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-stretch sm:justify-between sm:gap-10 sm:p-8">
        <div className="flex min-w-0 flex-col justify-between gap-4">
          <p className="text-body-sm font-medium text-white/90">
            Wallet balance
          </p>
          <div className="flex flex-col gap-2">
            {balanceKobo === null ? (
              <span
                className="text-h2 text-white/80 sm:text-[2.5rem] sm:leading-none"
                title="Not loaded yet"
              >
                &mdash;
              </span>
            ) : (
              <Money onDark size="hero" decimals amount={naira(balanceKobo)} />
            )}
            <p className="text-body-sm text-white/90">
              what the wallet holds right now
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3 border-t border-white/20 pt-6 sm:w-[22rem] sm:shrink-0 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-10">
          <LoadState
            loading={loading}
            error={error}
            subject="the wallet"
            onRetry={onRetry}
            hasData={accounts !== null}
            skeleton={<AccountSkeleton />}
          >
            {accounts === null ? (
              <p className="text-body-sm text-white/90">
                The account to pay into comes from the live wallet, and there is
                none to read offline. A number invented here would send money to
                the wrong place.
              </p>
            ) : (
              <Accounts accounts={accounts} />
            )}
          </LoadState>
        </div>
      </div>
    </section>
  );
}

function Accounts({ accounts }: { accounts: FundingAccount[] }) {
  if (accounts.length === 0) {
    return (
      <>
        <p className="text-body-sm font-medium text-white">
          No funding account yet
        </p>
        <p className="text-body-sm text-white/90">
          This company has no collection account, so money cannot be paid into
          the wallet. Ask your ApproveHR contact to open one: it takes minutes,
          and transfers into it credit the wallet automatically.
        </p>
      </>
    );
  }

  return (
    <>
      <p className="text-body-sm font-medium text-white/90">
        {accounts.length === 1
          ? "Pay into this account"
          : "Pay into any of these"}
      </p>
      <ul className="flex flex-col gap-4">
        {accounts.map((account) => (
          <li
            key={`${account.provider}-${account.accountNumber}`}
            className="flex flex-col gap-2"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="tabular text-h3 text-white">
                {account.accountNumber}
              </span>
              {/* A transposed digit sends a payroll's worth of money to a
                  stranger, so the number is copied, not retyped. The shared
                  button reports a clipboard failure (plain http has no
                  clipboard) instead of doing nothing. */}
              <CopyButton
                onDark
                value={account.accountNumber}
                label="Copy number"
              />
            </div>
            <p className="flex flex-wrap items-center gap-x-2 text-body-sm text-white/90">
              <Landmark aria-hidden="true" className="size-4 shrink-0" />
              <span>{account.bankName}</span>
              {/* Null rather than blank where the provider gave none. */}
              {account.bankCode && (
                <span className="text-white/80">
                  &middot; code{" "}
                  <span className="tabular">{account.bankCode}</span>
                </span>
              )}
            </p>
            <p className="flex flex-wrap items-center gap-2 text-meta text-white/80">
              {account.accountName}
              {/* Only worth saying where there is a choice to make; on a lone
                  account it would imply the others are lesser, and every
                  account here credits the wallet. */}
              {accounts.length > 1 && account.isDefault && (
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-meta font-medium text-white">
                  Suggested
                </span>
              )}
            </p>
          </li>
        ))}
      </ul>
      <p className="text-meta text-white/80">
        Transfers into{" "}
        {accounts.length === 1 ? "this account" : "any of these accounts"}{" "}
        credit the wallet automatically.
      </p>
    </>
  );
}

/** Frosted bars where the account will be, so the card does not jump when it arrives. */
function AccountSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      <div className="h-4 w-32 rounded bg-white/20" />
      <div className="h-8 w-52 rounded bg-white/20" />
      <div className="h-4 w-40 rounded bg-white/20" />
    </div>
  );
}
