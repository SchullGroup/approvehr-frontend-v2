"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileQuestion } from "lucide-react";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Spinner,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  rowClick,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { SourceBadge } from "@/components/payroll/run-panels";
import { STATUS_LABEL, formatKobo, periodLabel, type OwnPayslip } from "@/lib/api/payroll";
import { deliveryOf, useMyPayslips } from "@/lib/store/payroll";
import { useSession } from "@/lib/store/session";

const DELIVERY_LABEL: Record<ReturnType<typeof deliveryOf>, string> = {
  not_sent: "Not sent",
  sent: "Sent",
  opened: "Opened",
};

/**
 * "Payslips", for whoever does not hold `VIEW_SALARIES`.
 *
 * The company register above shows every payslip in a run because that
 * screen's whole job is HR checking that everybody got theirs. Nobody without
 * that permission has a legitimate reason to see a colleague's gross pay, so
 * this reads a different, self-service endpoint instead of the same one with
 * a client-side filter bolted on — a filter is a UI decision, and the payslip
 * a filtered-out row still describes is somebody else's money.
 */
export function MyPayslipIndex() {
  const router = useRouter();
  const { employeeId } = useSession();
  const { payslips, loading, error, connected } = useMyPayslips(employeeId ?? null);

  return (
    <div className="flex flex-col gap-6">
      <SourceBadge connected={connected} loading={loading} error={error} />

      {error && <LoadFailure subject="your payslips" error={error} />}

      <Card>
        <CardHeader title="Your payslips" />

        {payslips.length === 0 && !loading ? (
          <EmptyState
            compact
            icon={<FileQuestion aria-hidden="true" />}
            title="Nothing here yet"
            description="A payslip appears here once a payroll you are on has been run."
          />
        ) : (
          <TableWrap className="rounded-none border-x-0 border-b-0" caption="Your payslips">
            <THead>
              <TH>Month</TH>
              <TH align="right">Gross</TH>
              <TH align="right">Net pay</TH>
              <TH>Status</TH>
            </THead>
            <TBody>
              {payslips.map((slip: OwnPayslip) => {
                const href = `/payroll/payslips/${slip.id}`;
                return (
                  <TR key={slip.id} interactive onClick={rowClick(() => router.push(href))}>
                    <TDPrimary
                      title={
                        <Link
                          href={href}
                          className="hover:text-accent-text hover:underline underline-offset-4"
                        >
                          {periodLabel(slip.run.period)}
                        </Link>
                      }
                      subtitle={STATUS_LABEL[slip.run.status]}
                    />
                    <TD align="right" className="tabular text-body">
                      {formatKobo(slip.grossKobo)}
                    </TD>
                    <TD align="right" className="tabular font-medium text-ink">
                      {formatKobo(slip.netKobo)}
                    </TD>
                    <TD>
                      <Badge
                        tone={deliveryOf(slip) === "opened" ? "success" : "info"}
                        size="sm"
                        dot
                      >
                        {DELIVERY_LABEL[deliveryOf(slip)]}
                      </Badge>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </TableWrap>
        )}
      </Card>

      {loading && payslips.length === 0 && (
        <div className="flex items-center gap-2 px-1 text-body-sm text-muted">
          <Spinner /> Finding your payslips…
        </div>
      )}
    </div>
  );
}
