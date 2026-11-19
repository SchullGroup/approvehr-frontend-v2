"use client";

import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Button, Callout } from "@/components/ui";
import { useToast } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { payrollApi } from "@/lib/api/payroll";
import type { PayrollRunDetail } from "@/lib/api/payroll";
import {
  bankPaymentFilename,
  bankPaymentSheets,
  unpayableCount,
} from "@/lib/payroll/bank-payment-schedule";
import { useCan } from "@/lib/permissions";
import { downloadXlsx, writeXlsx } from "@/lib/xlsx";

/**
 * Every calculated payslip figure on this run, joined with unmasked bank
 * details, as one comprehensive spreadsheet a company can hand directly to
 * their bank — an alternative to paying through the wallet, reachable from
 * the moment a run is prepared rather than only once it is approved.
 *
 * Deliberately its own block rather than folded into `PayPanel`: that panel
 * only ever renders once a run is approved and has a payment batch, and this
 * has to be reachable earlier.
 *
 * ## A secondary row, not a card
 *
 * It used to be a full card with a heading, a sentence and a button, stacked
 * beside the cards that carry the decision. It is the alternative way to pay,
 * not the thing being decided, so it is one quiet row: the same download, the
 * same refusal, the same warning about what the file carries, and a weight that
 * says which is which.
 *
 * Gated on `RUN_PAYROLL`, the same permission the API itself requires, so nobody
 * sees a button that can only 403.
 */
export function BankRegisterCard({ run }: { run: PayrollRunDetail }) {
  const canDownload = useCan("RUN_PAYROLL");
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  if (!canDownload || !run.preparedAt) return null;

  async function download() {
    setBusy(true);
    setRefused(null);
    try {
      const register = await payrollApi.bankRegister(run.id);
      downloadXlsx(
        bankPaymentFilename(register),
        writeXlsx(bankPaymentSheets(register)),
      );
      const missing = unpayableCount(register);
      push({
        tone: "success",
        title: "Bank payment schedule downloaded",
        detail:
          missing > 0
            ? `${String(missing)} ${missing === 1 ? "person has" : "people have"} no account number or bank on file, so the bank cannot pay ${missing === 1 ? "them" : "them"} yet.`
            : "One amount per person, ready to send to your bank.",
      });
    } catch (error) {
      setRefused(
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Nothing was downloaded.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface px-5 py-4">
      {refused && (
        <Callout tone="danger" title="That did not work">
          {refused}
        </Callout>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-72">
          <h3 className="text-body-sm font-semibold text-ink">
            Bank payment schedule
          </h3>
          {/* The one thing worth saying before somebody downloads this: it
              carries what `payslips.csv` deliberately does not. Said here
              rather than only discovered on open, since a spreadsheet with
              account numbers on it is a different thing to keep and to send
              than one without. */}
          <p className="mt-0.5 text-meta leading-relaxed text-muted">
            For when your bank pays directly. One sheet in your bank&apos;s
            upload layout: account number, account name, bank code, bank name,
            the amount to pay each person and a narration. It carries account
            numbers, so keep it as carefully as you would a bank statement.
          </p>
        </div>
        <Button
          variant="secondary"
          loading={busy}
          className="max-sm:min-h-11 max-sm:w-full"
          onClick={() => void download()}
        >
          {!busy && <FileSpreadsheet aria-hidden="true" className="size-4" />}
          Download the bank payment schedule
        </Button>
      </div>
    </div>
  );
}
