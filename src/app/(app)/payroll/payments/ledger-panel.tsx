"use client";

import { ArrowDownLeft, ArrowUpRight, ScrollText } from "lucide-react";
import {
  Badge,
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
import { naira } from "@/lib/api/payments";
import { LEDGER_KIND_LABEL, useLedger } from "@/lib/store/payments";
import { longDate } from "./format";

/**
 * The ledger — a statement, not a dashboard.
 *
 * Four columns and a date, in the order a bank statement puts them: what it was,
 * in, out, balance. Nothing is aggregated into a headline that hides a row.
 *
 * ## The balance column is the important decision on this screen
 *
 * `balanceAfterKobo` is null unless somebody typed it in off a statement, and a
 * null renders as an em dash. **Never compute the missing ones.** A running total
 * worked out from the rows we happen to hold looks reconciled without being
 * reconciled — it would silently assume this ledger has every transaction the
 * bank does, which it does not — and a figure that looks checked and is not is
 * worse than an admitted gap. The schema comment on `LedgerEntry.balanceAfter`
 * makes the same call for the same reason.
 *
 * ## Entries are never edited
 *
 * A correction is a new entry in the opposite direction. There is no edit control
 * here because there is no edit endpoint, and that is what makes this a ledger
 * rather than a balance column somebody can tidy.
 */
/**
 * Recording money in was removed from this panel at the product owner's
 * request, along with the form behind it. `POST /payments/ledger/funding`
 * still exists; nothing in the product calls it any more.
 *
 * Worth knowing what went with it: this was the only way, inside the app, to
 * tell the system that money had arrived by a route the provider does not
 * see. A company funded by ordinary bank transfer now has no way to say so,
 * and the wallet is credited only by the provider webhooks.
 */
export function LedgerPanel() {
  const ledger = useLedger({ pageSize: 25 });

  return (
    <>
      <Card>
        <CardHeader title="Account activity" />

        {ledger.loading ? (
          <CardBody className="flex justify-center py-10">
            <Spinner />
          </CardBody>
        ) : ledger.rows.length === 0 ? (
          <EmptyState
            icon={<ScrollText aria-hidden="true" />}
            title="Nothing recorded yet"
            description="Money arriving is typed in from your bank statement. Salaries appear here once a payment settles."
            compact
          />
        ) : (
          <>
            <TableWrap
              className="rounded-none border-0"
              caption="Account activity, newest first"
            >
              <THead>
                <TH>Date</TH>
                <TH>What it was</TH>
                <TH align="right">In</TH>
                <TH align="right">Out</TH>
                <TH align="right">Balance after</TH>
              </THead>
              <TBody>
                {ledger.rows.map((row) => (
                  <TR key={row.id}>
                    <TDPrimary
                      title={longDate(row.occurredAt)}
                      subtitle={row.bankAccount ?? undefined}
                    />
                    <TD>
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge
                          tone={row.direction === "CREDIT" ? "accent" : "neutral"}
                          size="sm"
                          icon={
                            row.direction === "CREDIT" ? (
                              <ArrowDownLeft aria-hidden="true" />
                            ) : (
                              <ArrowUpRight aria-hidden="true" />
                            )
                          }
                        >
                          {LEDGER_KIND_LABEL[row.kind] ?? row.kind}
                        </Badge>
                        {row.batchReference && (
                          <span className="tabular text-meta text-muted">
                            {row.batchReference}
                          </span>
                        )}
                      </span>
                      {(row.note ?? row.reference) && (
                        <span className="mt-1 block text-meta text-muted">
                          {row.note ?? row.reference}
                        </span>
                      )}
                    </TD>
                    <TD align="right" className="tabular">
                      {row.direction === "CREDIT" ? (
                        <Money amount={naira(row.amountKobo)} decimals />
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </TD>
                    <TD align="right" className="tabular">
                      {row.direction === "DEBIT" ? (
                        <Money amount={naira(row.amountKobo)} decimals />
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </TD>
                    <TD align="right" className="tabular">
                      {row.balanceAfterKobo === null ? (
                        /* Not on the statement we were given. Never a guess. */
                        <span className="text-faint" title="Not recorded from a statement">
                          —
                        </span>
                      ) : (
                        <Money amount={naira(row.balanceAfterKobo)} decimals />
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>

            <CardBody className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-t border-line">
              <p className="text-body-sm text-muted">
                {ledger.total} {ledger.total === 1 ? "entry" : "entries"}
              </p>
              <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
                <span className="text-body-sm text-muted">
                  In{" "}
                  <span className="tabular font-medium text-ink">
                    <Money amount={naira(ledger.totals.inKobo)} decimals />
                  </span>
                </span>
                <span className="text-body-sm text-muted">
                  Out{" "}
                  <span className="tabular font-medium text-ink">
                    <Money amount={naira(ledger.totals.outKobo)} decimals />
                  </span>
                </span>
              </div>
            </CardBody>
          </>
        )}
      </Card>

    </>
  );
}
