"use client";

import { useSearchParams } from "next/navigation";
import { FileQuestion, Printer } from "lucide-react";
import {
  Button,
  ButtonLink,
  Callout,
  EmptyState,
} from "@/components/ui";
import {
  PayslipDocument,
  type PayslipIdentity,
  type YearToDateKobo,
} from "@/components/payroll/payslip-document";
import { RunStatusBadge, SourceBadge } from "@/components/payroll/run-panels";
import { longDate, periodLabel } from "@/lib/api/payroll";
import { usePayrollSettings } from "@/lib/payroll/use-settings";
import { useCompanySettings } from "@/lib/store/company";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { usePayslipRecord } from "@/lib/store/payroll";

/**
 * One payslip.
 *
 * ## Why the actions are only Print
 *
 * There were three buttons: Print, Download PDF, Email to employee. Print
 * works. The other two did nothing at all — there is no PDF renderer and no
 * mail transport — and a control that looks like it sends a payslip and does
 * not is worse than no control. The browser's print dialogue writes a PDF on
 * every platform this runs on, which is the honest route to the same result.
 *
 * ## Where the identity block comes from
 *
 * The payslip carries a name and an employee number; job title, tax state,
 * pension PIN and account number live on the employee record. Those are read
 * from whichever directory is live, so the block fills in the same way in both
 * modes — and anything genuinely unknown prints as a dash rather than being
 * guessed at.
 */
export function PayslipView({ id }: { id: string }) {
  const params = useSearchParams();
  const runHint = params.get("run");

  const record = usePayslipRecord(id, runHint);
  const { employees } = useEmployeeDirectory({ pageSize: 200 });
  /* The rates that computed a demo payslip are the ones in this browser's
     settings, so quoting them cannot drift. Against the API they are unknown
     for a stored payslip and are left off rather than derived. */
  const { settings } = usePayrollSettings();
  const { settings: company } = useCompanySettings();

  if (record.loading) {
    return (
      <p className="text-[0.875rem] text-muted">Finding this payslip…</p>
    );
  }

  if (!record.payslip || !record.run) {
    return (
      <EmptyState
        icon={<FileQuestion aria-hidden="true" />}
        title="No payslip here"
        description={
          record.connected
            ? "Nothing with this reference turned up in the last six runs. It may belong to an older period."
            : "This payslip is not in the run this browser has. Records created in another browser do not travel with the link."
        }
        action={
          <ButtonLink href="/payroll/payslips" variant="secondary">
            Back to payslips
          </ButtonLink>
        }
      />
    );
  }

  const slip = record.payslip;
  const run = record.run;
  const person = employees.find((employee) => employee.id === slip.employeeId);

  const identity: PayslipIdentity = {
    name: slip.name,
    employeeNo: slip.employeeNo,
    jobTitle: person?.jobTitle ?? null,
    department: person?.department ?? null,
    taxState: person?.taxState ?? null,
    pensionPin: person?.pensionPin ?? null,
    bankAccount: person?.bankAccount ?? null,
  };

  /* Projected, and labelled as projected, only where nothing better exists.
     Summing the real runs needs every approved run for the year, which is a
     dozen requests for one page — so connected mode shows no year-to-date at
     all rather than a figure somebody might file a return against. */
  const months = Number(run.period.slice(5, 7));
  const ytd: YearToDateKobo | undefined = record.projectYearToDate
    ? {
        monthsElapsed: months,
        grossKobo: slip.grossKobo * months,
        payeKobo: slip.payeKobo * months,
        pensionEmployeeKobo: slip.pensionEmployeeKobo * months,
        nhfKobo: slip.nhfKobo * months,
        netKobo: slip.netKobo * months,
        projected: true,
      }
    : undefined;

  return (
    <div className="flex flex-col gap-5">
      <div className="no-print flex flex-wrap items-center gap-3">
        <SourceBadge connected={record.connected} />
        <RunStatusBadge status={run.status} />
        <Button variant="secondary" size="sm" onClick={() => window.print()}>
          <Printer aria-hidden="true" className="size-3.5" />
          Print or save as PDF
        </Button>
      </div>

      <PayslipDocument
        employee={identity}
        slip={slip}
        period={periodLabel(run.period)}
        payDate={longDate(run.payDate)}
        company={{
          name: company.profile.legalName,
          rc: company.profile.rcNumber,
          address: `${company.profile.address}, ${company.profile.city}`,
        }}
        {...(record.connected
          ? {}
          : {
              rates: {
                pensionEmployee: settings.pension.employeeRate,
                pensionEmployer: settings.pension.employerRate,
                nhf: settings.nhf.rate,
                nhfBasis: settings.nhf.basis,
              },
            })}
        {...(ytd ? { ytd } : {})}
      />

      {run.status !== "APPROVED" && run.status !== "PAID" && (
        <Callout tone="warning" title="This run has not been approved" className="no-print">
          The figures can still change. Do not hand this to an employee until the
          run is approved.
        </Callout>
      )}
    </div>
  );
}
