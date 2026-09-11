"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, ChevronDown, ChevronRight, Wallet } from "lucide-react";
import {
  Badge,
  Button,
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
import {
  usePaymentBatch,
  type WalletStatementState,
} from "@/lib/store/payments";
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
 * ## The screen owns the page, and the fetch
 *
 * Both are passed in. The balance in the header above is read from this same
 * response, so fetching separately here would let the headline and the rows
 * contradict each other — which is the bug that put two wrong and identical
 * figures at the top of this screen to begin with.
 *
 * The page stays state in a component rather than inside the hook, because a
 * hook that held it would reset on revalidation — and revalidation is exactly
 * what approving a payroll triggers. Being thrown back to page one while
 * reading page three is the bug that arrangement causes.
 */
export function WalletStatement({
  statement,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  /* Handed in rather than fetched here. The screen shows the balance from
     this same response, and a second request would let the headline figure
     and these rows disagree with each other -- which is exactly the bug that
     put two contradictory numbers on this screen in the first place. */
  statement: WalletStatementState;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  /* One at a time. Two open payrolls is two tables of names on a screen whose
     job is the balance, and the second is never the one being read. */
  const [openId, setOpenId] = useState<string | null>(null);

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
              <TH align="right">
                <span className="sr-only">Details</span>
              </TH>
            </THead>
            <TBody>
              {held.transactions.map((movement) => (
                <MovementRow
                  key={movement.id}
                  movement={movement}
                  open={openId === movement.id}
                  onToggle={() =>
                    setOpenId((current) => (current === movement.id ? null : movement.id))
                  }
                />
              ))}
            </TBody>
          </TableWrap>

          <CardBody className="border-t border-line">
            <Pagination
              page={page}
              pageSize={pageSize}
              /* The server's count, so the pager knows about movements this
                 page does not hold. */
              total={held.total}
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
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

/**
 * One movement, and — for a payroll — the people it paid.
 *
 * ## Why the row opens rather than links away
 *
 * "Payroll paid, ₦9,382,772.00" is a figure nobody can take apart. The
 * question it raises is who got paid and whether it reached them, and those
 * are two different questions: a batch stays open until every instruction in
 * it resolves, so "the payroll went out" and "everybody was paid" can easily
 * disagree. The per-person status is the only thing that settles it.
 *
 * The batch page at `/payroll/payments/<id>` shows the same instructions with
 * bank details and the file download beside them. This is deliberately the
 * shorter read: name, amount, status, in place, without losing the balance
 * you were looking at.
 *
 * ## Fetched on open, not with the page
 *
 * `usePaymentBatch(null)` fetches nothing, so a statement of twenty-five
 * movements makes no batch requests until somebody asks for one. The button
 * says "View details" rather than relying on the row being quietly clickable
 * — an expandable row that looks like every other row is one nobody expands.
 */
function MovementRow({
  movement,
  open,
  onToggle,
}: {
  movement: ApiWalletMovement;
  open: boolean;
  onToggle: () => void;
}) {
  const incoming = movement.direction === "CREDIT";
  const expandable = movement.paymentBatchId !== null;
  /* Null until opened: that is what keeps this from firing a request per row. */
  const batch = usePaymentBatch(open && movement.paymentBatchId ? movement.paymentBatchId : null);

  return (
    <>
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
        <TD align="right">
          {expandable && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              aria-expanded={open}
            >
              {open ? (
                <ChevronDown aria-hidden="true" className="size-4" />
              ) : (
                <ChevronRight aria-hidden="true" className="size-4" />
              )}
              {open ? "Hide details" : "View details"}
            </Button>
          )}
        </TD>
      </TR>

      {open && expandable && (
        <TR>
          {/* Seven, matching the header. A short colSpan leaves a ragged
              table the moment a column is added. */}
          <TD colSpan={7} className="bg-raised p-0">
            {/* Pinned to the left edge of the scrolling table on a phone.
                ---------------------------------------------------------
                This sits in a cell of a table that is ~1080px wide and
                scrolls sideways inside a 390px screen. Without the pin, the
                breakdown inherits that width and rides the same scroll — so
                the Name and Bank columns, which are the whole point of
                opening the row, end up off-screen to the left while Amount
                and Status are what you see.

                `sticky left-0` holds it against the viewport while the
                statement's own columns scroll past behind it, and the width
                is the screen rather than the table. Released at `sm`, where
                the table fits and the cell is the right width already. */}
            <div className="sticky left-0 w-[calc(100vw-3rem)] max-w-full sm:w-auto">
              <PayrollBreakdown
                reference={movement.paymentBatchReference}
                batch={batch}
              />
            </div>
          </TD>
        </TR>
      )}
    </>
  );
}

/**
 * What each instruction's status means to somebody asking "did they get it?".
 *
 * `PENDING` reads "Pending": nothing has been asked of the provider yet, so
 * any wording that implies an outcome — sent, not sent — claims more than is
 * known about somebody's pay. The batch detail page still says "Not sent" for
 * the same status and the two should be brought together.
 */
const INSTRUCTION_STATUS: Record<
  string,
  { label: string; tone: "neutral" | "warning" | "success" | "danger" }
> = {
  /* "Pending", not "Not sent". Nothing has been checked with the provider
     yet, and "not sent" asserts more than we know — it reads as a decision
     already taken about this person's money. Pending is the honest default
     until an outcome comes back. */
  PENDING: { label: "Pending", tone: "neutral" },
  SUBMITTED: { label: "Sent", tone: "warning" },
  SETTLED: { label: "Paid", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
  REVERSED: { label: "Came back", tone: "danger" },
};

function PayrollBreakdown({
  reference,
  batch,
}: {
  reference: string | null;
  batch: ReturnType<typeof usePaymentBatch>;
}) {
  if (batch.loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-5 text-body-sm text-muted">
        <Spinner size="sm" />
        Reading who this paid
      </div>
    );
  }

  if (batch.error || !batch.batch) {
    return (
      <div className="px-4 py-5">
        <Callout tone="info" title="The breakdown could not be read">
          The movement above is what left the wallet. Who it paid is on the
          batch, and that could not be loaded just now.
        </Callout>
      </div>
    );
  }

  const rows = batch.batch.instructions;

  return (
    <div className="px-4 py-4">
      <p className="mb-3 text-body-sm text-muted">
        {rows.length} {rows.length === 1 ? "person" : "people"} in{" "}
        <span className="font-medium text-ink">{reference ?? batch.batch.reference}</span>.
        The status is per person: a payroll can leave the wallet in full and
        still fail for one of them.
      </p>
      <TableWrap className="rounded-lg" caption={`People paid by ${reference ?? ""}`}>
        <THead>
          <TH>Name</TH>
          <TH>Bank</TH>
          <TH>Account</TH>
          <TH align="right">Amount</TH>
          <TH>Status</TH>
        </THead>
        <TBody>
          {rows.map((row) => {
            const state =
              INSTRUCTION_STATUS[row.status] ?? { label: row.status, tone: "neutral" as const };
            return (
              <TR key={row.id}>
                <TDPrimary
                  title={
                    <Link
                      href={`/people/${row.employeeId}`}
                      className="hover:text-accent-text hover:underline underline-offset-4"
                    >
                      {row.payeeName}
                    </Link>
                  }
                />
                <TD className="text-body-sm">
                  {row.bankName.trim().length > 0 ? row.bankName : "—"}
                </TD>
                {/* Masked, as the API sends it. `accountNumberOk` is the same
                    test the payment gate uses, so a number that cannot be paid
                    says so here rather than looking fine until it fails. */}
                <TD className="tabular text-body-sm">
                  {row.accountNumberOk ? (
                    row.accountNumberMasked
                  ) : (
                    <span className="text-danger-text">
                      {row.accountNumberMasked === ""
                        ? "None on file"
                        : `${row.accountNumberMasked} (not ten digits)`}
                    </span>
                  )}
                </TD>
                <TD align="right" className="tabular font-medium text-ink">
                  <Money amount={naira(row.amountKobo)} decimals />
                </TD>
                <TD>
                  <span className="flex flex-col gap-1">
                    <Badge tone={state.tone} size="sm" dot>
                      {state.label}
                    </Badge>
                    {/* The reason, where the provider gave one. A "Failed"
                        with nothing beside it sends somebody hunting. */}
                    {row.failureReason && (
                      <span className="text-meta text-danger-text">{row.failureReason}</span>
                    )}
                  </span>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </TableWrap>
    </div>
  );
}
