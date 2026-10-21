"use client";

import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Button, Callout } from "@/components/ui";
import { useToast } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { payrollApi, periodLabel } from "@/lib/api/payroll";
import type { BankRegister, PayrollRunDetail } from "@/lib/api/payroll";
import { useCan } from "@/lib/permissions";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDateTimeShort } from "@/lib/time";
import { downloadXlsx, writeXlsx } from "@/lib/xlsx";
import type { SheetSpec } from "@/lib/xlsx";

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
  const timeZone = useOrgTimezone();
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
        filenameFor(register),
        writeXlsx(sheetsFor(register, timeZone)),
      );
      push({
        tone: "success",
        title: "Bank register downloaded",
        detail:
          "Every calculated figure, with bank details for everyone on this payroll.",
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
          <h3 className="text-body-sm font-semibold text-ink">Bank register</h3>
          {/* The one thing worth saying before somebody downloads this: it
              carries what `payslips.csv` deliberately does not. Said here
              rather than only discovered on open, since a spreadsheet with
              account numbers on it is a different thing to keep and to send
              than one without. */}
          <p className="mt-0.5 text-meta leading-relaxed text-muted">
            For paying by bank file. Every calculated figure, with bank name,
            account number and account name for each person. Unlike the payslip
            export it includes bank details, so keep it as carefully as you
            would a bank statement.
          </p>
        </div>
        <Button
          variant="secondary"
          loading={busy}
          className="max-sm:min-h-11 max-sm:w-full"
          onClick={() => void download()}
        >
          {!busy && <FileSpreadsheet aria-hidden="true" className="size-4" />}
          Download the bank register
        </Button>
      </div>
    </div>
  );
}

function filenameFor(register: BankRegister): string {
  return `bank-register-${register.run.period}.xlsx`;
}

/** `"2026-08-20T09:00:00.000Z"` → `"20 Aug, 09:00"`, or blank if unset. */
function stamp(iso: string | null, timeZone: string): string {
  if (!iso) return "";
  return formatDateTimeShort(iso, timeZone);
}

function sheetsFor(register: BankRegister, timeZone: string): SheetSpec[] {
  const meta = register.run;

  const infoRows: string[][] = [
    ["Company", meta.organizationName],
    ["Pay period", periodLabel(meta.period)],
    ["Status", meta.status],
    ["Prepared at", stamp(meta.preparedAt, timeZone)],
    ["Prepared by", meta.preparedByName ?? ""],
    ["Approved at", stamp(meta.approvedAt, timeZone)],
    ["Approved by", meta.approvedByName ?? ""],
    ["Paid at", stamp(meta.paidAt, timeZone)],
    ["Generated at", stamp(register.generatedAt, timeZone)],
  ];

  const header = [
    "employee_no",
    "first_name",
    "last_name",
    "bank_name",
    "bank_account_number",
    "bank_account_name",
    "gross",
    "basic",
    "housing",
    "transport",
    "paye",
    "pension_employee",
    "pension_employer",
    "nhf",
    "other_deductions",
    "net",
    "unpaid_days",
  ];
  const dataRows = register.employees.map((e) => [
    e.employeeNo,
    e.firstName,
    e.lastName,
    e.bankName,
    e.bankAccountNumber,
    e.bankAccountName,
    e.gross,
    e.basic,
    e.housing,
    e.transport,
    e.paye,
    e.pensionEmployee,
    e.pensionEmployer,
    e.nhf,
    e.otherDeductions,
    e.net,
    String(e.unpaidDays),
  ]);

  return [
    { name: "Run Info", rows: infoRows },
    {
      name: "Bank Register",
      rows: [header, ...dataRows],
      boldRows: [0],
      freezeFirstRow: true,
    },
  ];
}
