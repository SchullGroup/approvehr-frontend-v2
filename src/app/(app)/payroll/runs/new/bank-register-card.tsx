"use client";

import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Button, Callout, Card, CardBody, CardHeader } from "@/components/ui";
import { useToast } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { payrollApi, periodLabel } from "@/lib/api/payroll";
import type { BankRegister, PayrollRunDetail } from "@/lib/api/payroll";
import { useCan } from "@/lib/permissions";
import { downloadXlsx, writeXlsx } from "@/lib/xlsx";
import type { SheetSpec } from "@/lib/xlsx";

/**
 * Every calculated payslip figure on this run, joined with unmasked bank
 * details, as one comprehensive spreadsheet a company can hand directly to
 * their bank — an alternative to paying through the wallet, reachable from
 * the moment a run is prepared rather than only once it is approved.
 *
 * Deliberately its own card rather than folded into `PayPanel`: that panel
 * only ever renders once a run is approved and has a payment batch, and this
 * has to be reachable earlier. Gated on `RUN_PAYROLL` — the same permission
 * the API itself requires — so nobody sees a button that can only 403.
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
      downloadXlsx(filenameFor(register), writeXlsx(sheetsFor(register)));
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
    <Card>
      <CardHeader
        title="Bank register"
        description="A comprehensive spreadsheet: every calculated figure and every bank account, ready to hand to your bank."
      />
      <CardBody className="flex flex-col gap-3">
        {refused && (
          <Callout tone="danger" title="That did not work">
            {refused}
          </Callout>
        )}
        <div>
          <Button
            variant="secondary"
            loading={busy}
            onClick={() => void download()}
          >
            {!busy && <FileSpreadsheet aria-hidden="true" className="size-4" />}
            Download the bank register
          </Button>
        </div>
        {/* The one thing worth saying before somebody downloads this: it
            carries what `payslips.csv` deliberately does not. Said here
            rather than only discovered on open, since a spreadsheet with
            account numbers on it is a different thing to keep and to send
            than one without. */}
        <p className="text-meta text-muted">
          Includes bank name, account number and account name for every person,
          alongside their full calculated breakdown — unlike the payslip export,
          which leaves bank details out on purpose. Keep it as carefully as you
          would a bank statement.
        </p>
      </CardBody>
    </Card>
  );
}

function filenameFor(register: BankRegister): string {
  return `bank-register-${register.run.period}.xlsx`;
}

/** `"2026-08-20T09:00:00.000Z"` → `"20 Aug 2026, 09:00"`, or blank if unset. */
function stamp(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function sheetsFor(register: BankRegister): SheetSpec[] {
  const meta = register.run;

  const infoRows: string[][] = [
    ["Company", meta.organizationName],
    ["Pay period", periodLabel(meta.period)],
    ["Status", meta.status],
    ["Prepared at", stamp(meta.preparedAt)],
    ["Prepared by", meta.preparedByName ?? ""],
    ["Approved at", stamp(meta.approvedAt)],
    ["Approved by", meta.approvedByName ?? ""],
    ["Paid at", stamp(meta.paidAt)],
    ["Generated at", stamp(register.generatedAt)],
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
