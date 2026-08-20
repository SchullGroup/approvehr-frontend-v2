import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import {
  Badge,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  DonutChart,
  Money,
  Stat,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { EMPLOYEES } from "@/lib/mock/people";

export const metadata: Metadata = {
  title: "Payroll",
  description: "Runs, approvals and what each one owes in statutory filings.",
};

const RUNS = [
  { id: "aug-26", period: "August 2026", staff: 264, gross: 93_004_500, status: "pending_approval" as const, pays: "28 Aug" },
  { id: "jul-26", period: "July 2026", staff: 259, gross: 89_340_200, status: "paid" as const, pays: "28 Jul" },
  { id: "jun-26", period: "June 2026", staff: 251, gross: 86_112_700, status: "paid" as const, pays: "27 Jun" },
  { id: "may-26", period: "May 2026", staff: 244, gross: 83_905_400, status: "paid" as const, pays: "28 May" },
];

const STATUS = {
  draft: { tone: "neutral" as const, label: "Draft" },
  pending_approval: { tone: "warning" as const, label: "Awaiting approval" },
  paid: { tone: "success" as const, label: "Paid" },
};

export default function PayrollPage() {
  const current = RUNS[0];
  const split = [
    { label: "Net pay", value: 68_400_000 },
    { label: "PAYE", value: 14_203_880 },
    { label: "Pension", value: 8_140_200 },
    { label: "NHF", value: 2_325_110 },
  ];

  return (
    <>
      <PageHeader
        title="Payroll"
        description="Runs, approvals, and what each one owes in statutory filings."
        action={
          <ButtonLink href="/payroll/runs/new" variant="accent" size="sm">
            <Play aria-hidden="true" className="size-3.5" />
            Start a run
          </ButtonLink>
        }
      />

      <PageBody className="flex flex-col gap-6">
        <Callout tone="warning" title="August payroll is waiting on approval">
          Prepared by Amara Nwachukwu, reviewed by Fatima Bello. It pays on 28
          August — approve by the 26th to clear the bank cut-off.
        </Callout>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="This run"
            value={<Money amount={current.gross} compact />}
            trend={{ direction: "up", label: "+4.1%" }}
            hint="vs July"
          />
          <Stat label="Employees paid" value={String(current.staff)} />
          <Stat
            label="Statutory owed"
            value={<Money amount={24_669_190} compact />}
            hint="PAYE, pension, NHF"
          />
          <Stat label="Filings outstanding" value="1" hint="NHF — due 10 Sep" />
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <Card>
            <CardHeader
              title="Recent runs"
              description="Most recent first."
            />
            <TableWrap className="rounded-none border-0">
              <THead>
                <TH>Period</TH>
                <TH align="right">Employees</TH>
                <TH align="right">Gross</TH>
                <TH>Status</TH>
                <TH>Pays</TH>
              </THead>
              <TBody>
                {RUNS.map((r) => (
                  <TR key={r.id} interactive>
                    <TDPrimary title={r.period} />
                    <TD align="right" className="tabular">
                      {r.staff}
                    </TD>
                    <TD align="right" className="tabular font-medium text-ink">
                      <Money amount={r.gross} />
                    </TD>
                    <TD>
                      <Badge tone={STATUS[r.status].tone} size="sm" dot>
                        {STATUS[r.status].label}
                      </Badge>
                    </TD>
                    <TD>{r.pays}</TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          </Card>

          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader title="Where August goes" />
              <CardBody>
                <DonutChart
                  points={split}
                  caption="August payroll split by component"
                  centreLabel="Gross ₦93.0m"
                  format={(n) => `₦${(n / 1_000_000).toFixed(1)}m`}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Next" />
              <CardBody className="flex flex-col gap-2.5">
                {[
                  ["/payroll/payslips", "Payslips", "2 undelivered"],
                  ["/payroll/statutory", "Statutory filings", "1 due"],
                ].map(([href, label, meta]) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-2 rounded-md border border-line p-3 text-[0.875rem] text-ink transition-colors hover:bg-canvas"
                  >
                    <span className="flex-1">{label}</span>
                    <span className="text-[0.75rem] text-muted">{meta}</span>
                    <ArrowRight aria-hidden="true" className="size-3.5 text-faint" />
                  </Link>
                ))}
                <p className="text-[0.75rem] leading-relaxed text-muted">
                  Salary structures, loans, reimbursements and the run wizard
                  are the next screens here. Employee data comes from the{" "}
                  <Link
                    href="/people"
                    className="text-accent-text hover:underline underline-offset-4"
                  >
                    directory
                  </Link>{" "}
                  — {EMPLOYEES.length} records today.
                </p>
              </CardBody>
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  );
}
