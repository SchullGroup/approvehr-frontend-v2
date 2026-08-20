"use client";

import { Download, Mail, Printer } from "lucide-react";
import { Button, Callout } from "@/components/ui";
import { PayslipDocument } from "@/components/payroll/payslip-document";
import { calculatePayslip, yearToDate } from "@/lib/payroll/engine";
import type { PayrollEmployee } from "@/lib/payroll/engine";
import { usePayrollSettings } from "@/lib/payroll/use-settings";
import { SCHEDULED_DEDUCTIONS } from "@/lib/mock/payroll";

/**
 * Payslip viewer. The document itself is a server-renderable component; this
 * wrapper adds the actions, which are all client-side, and reads the company
 * settings so the rates printed on the slip match the ones that computed it.
 */
export function PayslipView({
  employee,
  period,
  payDate,
  monthsElapsed,
}: {
  employee: PayrollEmployee;
  period: string;
  payDate: string;
  monthsElapsed: number;
}) {
  const { settings } = usePayrollSettings();
  const scheduled = SCHEDULED_DEDUCTIONS.get(employee.id);

  const slip = calculatePayslip(
    employee.id,
    employee.grossMonthly,
    {
      additions: 0,
      postTaxDeductions: scheduled?.amount ?? 0,
      unpaidDays: 0,
    },
    settings,
  );
  const ytd = yearToDate(slip, monthsElapsed);

  return (
    <div className="flex flex-col gap-5">
      <div className="no-print flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => window.print()}>
          <Printer aria-hidden="true" className="size-3.5" />
          Print
        </Button>
        <Button variant="secondary" size="sm">
          <Download aria-hidden="true" className="size-3.5" />
          Download PDF
        </Button>
        <Button variant="secondary" size="sm">
          <Mail aria-hidden="true" className="size-3.5" />
          Email to employee
        </Button>
      </div>

      <PayslipDocument
        employee={employee}
        slip={slip}
        ytd={ytd}
        period={period}
        payDate={payDate}
        settings={settings}
        extraDeductions={
          scheduled ? [{ label: scheduled.label, amount: scheduled.amount }] : []
        }
      />

      <Callout tone="info" className="no-print">
        Year-to-date figures are projected from this month in the prototype. The
        live product sums posted runs.
      </Callout>
    </div>
  );
}
