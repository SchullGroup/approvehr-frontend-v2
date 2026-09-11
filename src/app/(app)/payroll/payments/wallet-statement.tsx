"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Money,
  Spinner,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import {
  naira,
  reconciliationLine,
  type ApiWalletMovement,
} from "@/lib/api/payments";
import type { WalletAccountState } from "@/lib/store/payments";
import { longDate } from "./format";

/**
 * The wallet's statement: every movement, and what the balance was after it.
 *
 * ## Why this is the movement list on this screen and the ledger is not
 *
 * `LedgerPanel` beside it renders `LedgerEntry`, which is a different record of
 * overlapping events — the ledger debits when money **settles** and the wallet
 * debits when a payroll is **approved**. Both are true and both belong in the
 * product, and two lists on one screen both headed "movements" is two
 * explanations of one company's money competing for the same reader. So this
 * one is the statement, and the ledger moved behind a closed disclosure that
 * says what it is instead.
 *
 * ## What the source column is for
 *
 * `PROVIDER_INFLOW` was confirmed by a provider and `MANUAL_FUNDING` was typed
 * by a person off a bank statement. Only one of those can be proved afterwards,
 * and the difference is the whole reason the API keeps them apart rather than
 * calling both "money in". A reader chasing a missing deposit needs to know
 * which kind they are looking at before they know who to ask.
 */
const SOURCE: Record<
  ApiWalletMovement["source"],
  { label: string; hint: string }
> = {
  PROVIDER_INFLOW: {
    label: "Paid in",
    hint: "A provider confirmed the money arrived",
  },
  MANUAL_FUNDING: {
    label: "Recorded by hand",
    hint: "Somebody typed this off a bank statement. Not confirmed by a provider",
  },
  PAYROLL_RUN: {
    label: "Payroll approved",
    hint: "Taken out when the run was approved, not when the transfers went",
  },
  /* Unreachable today and handled anyway: nothing on the API writes it, because
     the wallet is debited at approval and an approved run cannot be cancelled.
     An unhandled member of a union is a blank cell the day somebody adds the
     writer, which costs more to find than this costs to keep. */
  PAYROLL_REVERSAL: {
    label: "Payroll reversed",
    hint: "Money returned to the wallet",
  },
};

/*
 * The state arrives as a prop rather than from `useWalletAccount()` here.
 *
 * The screen above needs the stored balance for its headline figure, so it
 * holds the hook and hands the result down. Calling the hook in both places
 * would issue the same request twice on every load, which is the shape
 * `lib/shared-resource.ts` exists to stop — and this endpoint runs a
 * reconciliation over every movement, so it is not a cheap one to double.
 */
export function WalletStatement({
  statement,
}: {
  statement: WalletAccountState;
}) {
  const account = statement.account;

  if (!statement.live) {
    return (
      <Card>
        <CardHeader title="The statement" />
        <CardBody>
          <Callout tone="info" title="Not available here">
            The statement is the wallet&rsquo;s own record of every movement,
            read live from the API. There is nothing to read offline, and rows
            invented here would be a claim about a company&rsquo;s money.
          </Callout>
        </CardBody>
      </Card>
    );
  }

  if (statement.error) {
    return (
      <LoadFailure
        subject="the wallet statement"
        error={statement.error}
        onRetry={statement.reload}
      />
    );
  }

  const check = account ? reconciliationLine(account) : null;

  return (
    <Card>
      <CardHeader
        title="The statement"
        description="Every credit and debit behind the balance, newest first."
        action={
          check && (
            <Badge
              tone={check.tone === "danger" ? "danger" : "neutral"}
              size="sm"
              icon={
                check.tone === "danger" ? (
                  <ShieldAlert aria-hidden="true" />
                ) : (
                  <ShieldCheck aria-hidden="true" />
                )
              }
            >
              {check.label}
            </Badge>
          )
        }
      />

      {/* The reconciliation sentence, in full, under the badge rather than in
          it. `reconciliationLine` owns the wording and the reason it is worded
          that carefully: this check proves the number was not written around
          the service, and it cannot prove a movement that should exist does. */}
      {check && (
        <CardBody className="pb-0">
          <p className="text-body-sm text-muted">{check.detail}</p>
          {account?.reconciliation && (
            <Callout
              tone="danger"
              title="Stored balance and movements disagree"
              className="mt-3"
            >
              <p>
                Stored{" "}
                <Money
                  amount={naira(account.reconciliation.storedKobo)}
                  decimals
                />
                , movements add to{" "}
                <Money
                  amount={naira(account.reconciliation.computedKobo)}
                  decimals
                />{" "}
                — a difference of{" "}
                <Money
                  amount={naira(
                    Math.abs(account.reconciliation.differenceKobo),
                  )}
                  decimals
                />
                . {check.detail}
              </p>
            </Callout>
          )}
        </CardBody>
      )}

      {statement.loading ? (
        <CardBody className="flex justify-center py-10">
          <Spinner />
        </CardBody>
      ) : !account || account.transactions.length === 0 ? (
        <EmptyState
          icon={<ArrowDownLeft aria-hidden="true" />}
          title="Nothing has moved yet"
          description="The first movement is money arriving in a collection account, or somebody recording a transfer that reached the company another way."
        />
      ) : (
        <>
          <TableWrap
            className="rounded-none border-0"
            caption="Wallet movements, newest first"
          >
            {/* `THead` renders its own `<tr>` — see `components/ui/table.tsx`.
                Wrapping these in a `TR` produced `<thead><tr><tr>…` which the
                browser repaired into a phantom empty header row above the real
                one. Typecheck, lint and the build were all green with it. */}
            <THead>
              <TH>What</TH>
              <TH>When</TH>
              <TH align="right">Amount</TH>
              <TH align="right">Balance after</TH>
              <TH>Reference</TH>
            </THead>
            <TBody>
              {account.transactions.map((row) => {
                const spec = SOURCE[row.source];
                const out = row.direction === "DEBIT";
                return (
                  <TR key={row.id}>
                    <TD>
                      <TDPrimary title={spec.label} />
                      <span className="text-meta text-muted">{spec.hint}</span>
                      {row.note && (
                        <span className="mt-0.5 block text-meta text-muted">
                          {row.note}
                        </span>
                      )}
                    </TD>
                    <TD>{longDate(row.createdAt)}</TD>
                    <TD align="right">
                      {/* The sign is carried by the direction, not by a minus
                          on a figure the API sends positive. An arrow and a
                          word, because a lone minus sign in a column of naira
                          is the easiest thing on a statement to misread. */}
                      <span className="inline-flex items-center gap-1.5">
                        {out ? (
                          <ArrowUpRight
                            aria-hidden="true"
                            className="size-3.5 text-muted"
                          />
                        ) : (
                          <ArrowDownLeft
                            aria-hidden="true"
                            className="size-3.5 text-muted"
                          />
                        )}
                        <span className="sr-only">
                          {out ? "Out of the wallet" : "Into the wallet"}
                        </span>
                        <Money amount={naira(row.amountKobo)} decimals />
                      </span>
                    </TD>
                    <TD align="right">
                      <Money amount={naira(row.balanceAfterKobo)} decimals />
                      {/* Rendered only when the server sends it. Subtracting
                          the amount from the balance after would usually be
                          right, and "usually" is not good enough for the one
                          figure whose job is to show nothing was tampered
                          with. Absent until `feat/wallet-movements-paginated`
                          lands. */}
                      {row.balanceBeforeKobo !== undefined && (
                        <span className="mt-0.5 block whitespace-nowrap text-meta text-muted">
                          from{" "}
                          <Money
                            amount={naira(row.balanceBeforeKobo)}
                            decimals
                          />
                        </span>
                      )}
                    </TD>
                    <TD>
                      {/* `break-words`, never `break-all`. This is the string
                          somebody quotes to a provider when a deposit is
                          missing, and `break-all` split it mid-token —
                          "9jp-evt-8821" on one line and "3" on the next, which
                          is a reference nobody can read back over a phone. */}
                      <span className="text-meta text-muted [overflow-wrap:break-word]">
                        {row.reference}
                      </span>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </TableWrap>

          <CardBody className="flex flex-wrap items-center justify-between gap-3 border-t border-line">
            <Pager
              shown={account.transactions.length}
              total={account.total}
              page={statement.page}
              pageSize={account.pageSize}
              onPage={statement.setPage}
            />
          </CardBody>
        </>
      )}
    </Card>
  );
}

/**
 * The pager, and the honest sentence where there is no pager to render.
 *
 * `total` is **absent** until the API can serve a page other than the most
 * recent hundred. A pager cannot draw itself without knowing how many rows
 * there are, and deriving one from `transactions.length` would tell a wallet of
 * three hundred movements that it has a hundred — the same class of wrong claim
 * as a zero standing in for an absent figure.
 *
 * So with no total this says what the reader is looking at and stops. With one,
 * it pages.
 */
function Pager({
  shown,
  total,
  page,
  pageSize,
  onPage,
}: {
  shown: number;
  total: number | undefined;
  page: number;
  pageSize: number | undefined;
  onPage: (page: number) => void;
}) {
  if (total === undefined) {
    return (
      <p className="text-body-sm text-muted">
        Showing the {shown} most recent movements. Older ones are kept and are
        not reachable from here yet.
      </p>
    );
  }

  const size = pageSize ?? shown ?? 1;
  const pages = Math.max(1, Math.ceil(total / Math.max(size, 1)));
  const first = total === 0 ? 0 : (page - 1) * size + 1;

  return (
    <>
      <p className="text-body-sm text-muted">
        {first}&ndash;{first + shown - 1} of {total}
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            Newer
          </Button>
          <span className="text-meta text-muted">
            Page {page} of {pages}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={page >= pages}
            onClick={() => onPage(page + 1)}
          >
            Older
          </Button>
        </div>
      )}
    </>
  );
}
