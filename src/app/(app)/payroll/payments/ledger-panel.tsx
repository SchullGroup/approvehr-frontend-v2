"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Plus, ScrollText } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  Money,
  Select,
  Spinner,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  Textarea,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { kobo, naira } from "@/lib/api/payments";
import {
  LEDGER_KIND_LABEL,
  useBankAccounts,
  useLedger,
  usePaymentActions,
} from "@/lib/store/payments";
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
export function LedgerPanel({ canRecordFunding }: { canRecordFunding: boolean }) {
  const ledger = useLedger({ pageSize: 25 });
  const [recording, setRecording] = useState(false);

  return (
    <>
      <Card>
        <CardHeader
          title="Account activity"
          description="What came in and what went out, newest first."
          action={
            canRecordFunding ? (
              <Button variant="secondary" size="sm" onClick={() => setRecording(true)}>
                <Plus aria-hidden="true" className="size-4" />
                Record money in
              </Button>
            ) : undefined
          }
        />

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

      {recording && (
        <RecordFundingModal
          onClose={() => setRecording(false)}
          onDone={() => {
            setRecording(false);
            ledger.reload();
          }}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Money arriving, off a bank statement.
 *
 * The balance is optional and stays empty when it is not to hand. That is the
 * point of asking for it separately: it is a fact from the statement, not
 * something this form can work out.
 */
function RecordFundingModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const accounts = useBankAccounts();
  const actions = usePaymentActions();
  const toast = useToast();

  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [balanceAfter, setBalanceAfter] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usable = accounts.accounts.filter((account) => !account.archived);
  const chosen = accountId || usable.find((account) => account.isPrimary)?.id || "";
  const amountValue = Number(amount.replace(/,/g, ""));
  const valid = chosen !== "" && Number.isFinite(amountValue) && amountValue > 0;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await actions.recordFunding({
        bankAccountId: chosen,
        amountKobo: kobo(amountValue),
        ...(occurredAt ? { occurredAt } : {}),
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(balanceAfter.trim()
          ? { balanceAfterKobo: kobo(Number(balanceAfter.replace(/,/g, ""))) }
          : {}),
      });
      toast.push({ title: "Recorded", tone: "success" });
      onDone();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "That did not save. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Record money in"
      description="A transfer into the account salaries come from, as it appears on your statement."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={!valid || busy}
            loading={busy}
            onClick={() => void save()}
          >
            Record it
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <p className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-body-sm text-danger-text">
            {error}
          </p>
        )}

        <Field label="Which account" required>
          <Select
            value={chosen}
            onChange={(e) => {
              const value = e.target.value;
              setAccountId(value);
            }}
          >
            {usable.map((account) => (
              <option key={account.id} value={account.id}>
                {account.bankName} {account.accountNumberMasked}
                {account.isPrimary ? " — salaries come from here" : ""}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Amount in naira" required help="For example 95000000.00">
          <Input
            value={amount}
            autoFocus
            inputMode="decimal"
            placeholder="0.00"
            onChange={(e) => {
              const value = e.target.value;
              setAmount(value);
            }}
          />
        </Field>

        <Field label="Date on the statement" help="Leave empty for today.">
          <Input
            type="date"
            value={occurredAt}
            onChange={(e) => {
              const value = e.target.value;
              setOccurredAt(value);
            }}
          />
        </Field>

        <Field
          label="Balance after, from the statement"
          help="Leave it empty if you do not have it. It stays blank rather than being worked out."
        >
          <Input
            value={balanceAfter}
            inputMode="decimal"
            placeholder="0.00"
            onChange={(e) => {
              const value = e.target.value;
              setBalanceAfter(value);
            }}
          />
        </Field>

        <Field label="Bank reference">
          <Input
            value={reference}
            placeholder="FT26081800194"
            onChange={(e) => {
              const value = e.target.value;
              setReference(value);
            }}
          />
        </Field>

        <Field label="Note">
          <Textarea
            rows={2}
            value={note}
            placeholder="Transfer from the operations account"
            onChange={(e) => {
              const value = e.target.value;
              setNote(value);
            }}
          />
        </Field>
      </div>
    </Modal>
  );
}
