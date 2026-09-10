"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import {
  Badge,
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Money,
  Pagination,
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
import { naira, type ApiWalletMovement } from "@/lib/api/payments";
import { useWalletStatement } from "@/lib/store/payments";
import { longDate } from "./format";

/**
 * The wallet's own statement — every movement, and the balance either side.
 *
 * ## Why this is not the ledger panel below it
 *
 * `LedgerPanel` reads `LedgerEntry`: what the *bank* did. Its balance column
 * is null unless somebody typed a figure off a statement, and its own doc
 * comment explains why it must never compute the missing ones — a running
 * total derived from the rows we happen to hold looks reconciled without
 * being reconciled.
 *
 * This table is the opposite case and that is the whole reason it exists. A
 * wallet movement's `balanceBefore` and `balanceAfter` are *written by the
 * wallet service*, inside the transaction, under a `SELECT … FOR UPDATE` on
 * the wallet row. They are not derived here and they are not derived by the
 * API either — they are what the balance actually was, recorded at the moment
 * it changed. So this is the one place on the screen where both sides of every
 * movement can be shown without guessing, which is what makes it worth a
 * table of its own rather than more columns on the ledger.
 *
 * ## Both sides, not just the after
 *
 * Showing only `balanceAfter` would leave the reader subtracting to check the
 * arithmetic, and the point of recording both is that nobody has to. Read down
 * the two columns and each row's "before" should equal the row above's
 * "after"; where it does not, something moved the balance outside the service,
 * which is exactly what `reconciled` is reporting on.
 *
 * ## The pager owns the page, this component does not own the data
 *
 * `page` is state here and passed *down* into `useWalletStatement`, because a
 * hook that held the page would reset it on revalidation — and revalidation is
 * precisely what a payroll run triggers. Being thrown back to page one while
 * reading page three, every time somebody approves a run, is the bug that
 * arrangement causes.
 */
export function WalletStatement() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const statement = useWalletStatement({ page, pageSize });

  const held = statement.statement;

  return (
    <Card>
      <CardHeader
        title="Wallet statement"
        description="Every movement in and out, and what the balance was either side of it. Newest first."
      />

      {statement.error && (
        <CardBody>
          <LoadFailure
            subject="the wallet statement"
            error={statement.error}
            onRetry={statement.reload}
          />
        </CardBody>
      )}

      {/* Reported, never hidden. The API sums the movements and compares them
          to the stored balance on every read; when they disagree something
          wrote the balance without going through the wallet service. Rendering
          the rows without saying so would present a figure we have been told
          not to trust as though it were checked. */}
      {held && !held.reconciled && (
        <CardBody>
          <Callout tone="danger" title="This balance does not match its movements">
            {/* `held.balance` is the API's own formatted string, and the
                difference goes through <Money> — `naira()` returns a number,
                so interpolating it into a sentence prints a bare 2000. */}
            The stored balance is {held.balance} and the movements below add up
            to something else
            {held.reconciliation && (
              <>
                {" — a difference of "}
                <Money
                  amount={naira(Math.abs(held.reconciliation.differenceKobo))}
                  decimals
                />
              </>
            )}
            . Nothing here has been corrected, on purpose: adjusting the figure
            would hide whatever caused it. Tell whoever runs the platform.
          </Callout>
        </CardBody>
      )}

      {statement.loading ? (
        <CardBody className="flex justify-center py-10">
          <Spinner />
        </CardBody>
      ) : !held ? (
        /* Not an empty state: absent and empty are different claims about a
           company's money, and `useWalletStatement` returns null for loading,
           failure and offline alike. */
        <CardBody>
          <Callout tone="info" title="Not available here">
            The statement is a live read from the API. There is nothing to show
            offline, and an empty table here would read as a wallet that has
            never moved.
          </Callout>
        </CardBody>
      ) : held.transactions.length === 0 ? (
        <EmptyState
          icon={<Wallet aria-hidden="true" />}
          title="Nothing has moved yet"
          description="Transfer into one of the accounts above and the credit shows up here, with the balance before and after it. Paying a payroll from the wallet appears the same way, as money out."
        />
      ) : (
        <>
          <TableWrap
            className="rounded-none border-0"
            caption="Wallet movements, newest first"
          >
            <THead>
              <TH>Date</TH>
              <TH>What moved it</TH>
              <TH align="right">In</TH>
              <TH align="right">Out</TH>
              <TH align="right">Balance before</TH>
              <TH align="right">Balance after</TH>
            </THead>
            <TBody>
              {held.transactions.map((movement) => (
                <MovementRow key={movement.id} movement={movement} />
              ))}
            </TBody>
          </TableWrap>

          <CardBody className="border-t border-line">
            <Pagination
              page={held.page}
              pageSize={held.pageSize}
              /* The server's count, so the pager knows about movements this
                 page does not hold. */
              total={held.total}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                /* Page three of 25 is past the end of a 100-row page. Going
                   back to the top is the only answer that always exists. */
                setPage(1);
              }}
              noun={["movement", "movements"]}
              loading={statement.loading}
            />
          </CardBody>
        </>
      )}
    </Card>
  );
}

/**
 * What each `source` means in the reader's words.
 *
 * A provider confirmed one of these and a person typed another; the API's own
 * comment is that a wallet which cannot tell them apart cannot be audited. So
 * the source is shown on every row rather than inferred from the direction —
 * money out because payroll ran and money out because somebody recorded a fee
 * are not the same event.
 */
const SOURCE_LABEL: Record<ApiWalletMovement["source"], string> = {
  PROVIDER_INFLOW: "Transfer received",
  MANUAL_FUNDING: "Funding recorded by hand",
  PAYROLL_RUN: "Payroll paid",
  PAYROLL_REVERSAL: "Payroll reversed",
  FEE: "Fee",
  ADJUSTMENT: "Adjustment",
};

function MovementRow({ movement }: { movement: ApiWalletMovement }) {
  const incoming = movement.direction === "CREDIT";

  return (
    <TR>
      <TD>{longDate(movement.createdAt)}</TD>
      <TDPrimary
        title={
          /* Badge with an icon, matching `LedgerPanel` one card down. Two
             statements side by side that mark direction differently would
             read as two unrelated tables. */
          <Badge
            tone={incoming ? "accent" : "neutral"}
            size="sm"
            icon={
              incoming ? (
                <ArrowDownLeft aria-hidden="true" />
              ) : (
                <ArrowUpRight aria-hidden="true" />
              )
            }
          >
            {SOURCE_LABEL[movement.source]}
          </Badge>
        }
        /* The note if somebody left one, the reference otherwise. The
           reference is an idempotency key rather than prose, but it is what
           ties a row to a provider event when somebody is chasing one. */
        subtitle={movement.note ?? movement.reference}
      />
      <TD align="right" className="tabular">
        {incoming ? (
          <Money amount={naira(movement.amountKobo)} decimals />
        ) : (
          <span className="text-muted">—</span>
        )}
      </TD>
      <TD align="right" className="tabular">
        {incoming ? (
          <span className="text-muted">—</span>
        ) : (
          <Money amount={naira(movement.amountKobo)} decimals />
        )}
      </TD>
      {/* Both from the row, never computed here. See this file's header. */}
      <TD align="right" className="tabular text-muted">
        <Money amount={naira(movement.balanceBeforeKobo)} decimals />
      </TD>
      <TD align="right" className="tabular font-medium text-ink">
        <Money amount={naira(movement.balanceAfterKobo)} decimals />
      </TD>
    </TR>
  );
}
