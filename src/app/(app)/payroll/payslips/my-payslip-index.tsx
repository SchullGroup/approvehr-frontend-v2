"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileQuestion } from "lucide-react";
import {
  Badge,
  Card,
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
  rowClick,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { SourceBadge } from "@/components/payroll/run-panels";
import {
  STATUS_LABEL,
  naira,
  periodLabel,
  type OwnPayslip,
} from "@/lib/api/payroll";
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
  const { payslips, loading, error, connected } = useMyPayslips(
    employeeId ?? null,
  );

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
          <>
            <div className="hidden sm:block">
              <TableWrap
                className="rounded-none border-x-0 border-b-0"
                caption="Your payslips"
              >
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
                      <TR
                        key={slip.id}
                        interactive
                        onClick={rowClick(() => router.push(href))}
                      >
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
                        <TD align="right">
                          <Money amount={naira(slip.grossKobo)} decimals />
                        </TD>
                        <TD align="right">
                          <Money amount={naira(slip.netKobo)} decimals />
                        </TD>
                        <TD>
                          <Badge
                            tone={
                              deliveryOf(slip) === "opened" ? "success" : "info"
                            }
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
            </div>

            <ul className="divide-y divide-line sm:hidden">
              {payslips.map((slip: OwnPayslip) => {
                const href = `/payroll/payslips/${slip.id}`;
                return (
                  <li
                    key={slip.id}
                    onClick={rowClick(() => router.push(href))}
                    className="flex flex-col gap-2 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={href}
                          className="text-body-sm font-medium text-ink hover:text-accent-text hover:underline underline-offset-4"
                        >
                          {periodLabel(slip.run.period)}
                        </Link>
                        <p className="mt-0.5 text-meta text-muted">
                          {STATUS_LABEL[slip.run.status]}
                        </p>
                      </div>
                      <Badge
                        tone={
                          deliveryOf(slip) === "opened" ? "success" : "info"
                        }
                        size="sm"
                        dot
                      >
                        {DELIVERY_LABEL[deliveryOf(slip)]}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-body-sm text-muted">Gross</span>
                      <span className="tabular text-body-sm text-body">
                        <Money amount={naira(slip.grossKobo)} decimals />
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-body-sm text-muted">Net pay</span>
                      <span className="tabular text-body-sm font-medium text-ink">
                        <Money amount={naira(slip.netKobo)} decimals />
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
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
