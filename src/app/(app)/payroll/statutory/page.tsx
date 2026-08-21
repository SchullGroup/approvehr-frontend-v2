import type { Metadata } from "next";
import { Download } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
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

export const metadata: Metadata = {
  title: "Statutory filings",
  description: "What August owes, to whom, and by when.",
};

const FILINGS = [
  { body: "Lagos State IRS", kind: "PAYE", amount: 14_203_880, due: "10 Sep 2026", staff: 198, status: "filed" as const },
  { body: "Ogun State IRS", kind: "PAYE", amount: 1_940_220, due: "10 Sep 2026", staff: 31, status: "filed" as const },
  { body: "Stanbic IBTC Pensions", kind: "Pension", amount: 3_412_600, due: "07 Sep 2026", staff: 94, status: "filed" as const },
  { body: "ARM Pensions", kind: "Pension", amount: 2_610_400, due: "07 Sep 2026", staff: 71, status: "filed" as const },
  { body: "Leadway Pensure", kind: "Pension", amount: 2_117_200, due: "07 Sep 2026", staff: 58, status: "filed" as const },
  { body: "FMBN", kind: "NHF", amount: 2_325_110, due: "10 Sep 2026", staff: 264, status: "due" as const },
  { body: "NSITF", kind: "ECS", amount: 930_045, due: "15 Sep 2026", staff: 264, status: "scheduled" as const },
];

const STATUS = {
  filed: { tone: "success" as const, label: "Filed" },
  due: { tone: "warning" as const, label: "Due" },
  scheduled: { tone: "info" as const, label: "Scheduled" },
};

export default function StatutoryPage() {
  const total = FILINGS.reduce((s, f) => s + f.amount, 0);
  const outstanding = FILINGS.filter((f) => f.status !== "filed").reduce(
    (s, f) => s + f.amount,
    0,
  );

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/payroll", label: "Payroll" },
          { href: "/payroll/statutory", label: "Statutory" },
        ]}
        title="Statutory filings"
        description="August 2026. Every schedule is generated from the payroll itself, split by body."
        action={
          <Button variant="secondary" size="sm">
            <Download aria-hidden="true" className="size-3.5" />
            Download all schedules
          </Button>
        }
      />

      <PageBody className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Total remittance" value={<Money amount={total} compact />} />
          <Stat
            label="Outstanding"
            value={<Money amount={outstanding} compact />}
            trend={{ direction: "down", label: "2 filings" }}
          />
          <Stat label="Bodies" value={String(FILINGS.length)} hint="across 2 states, 3 PFAs" />
        </div>

        <TableWrap caption="Statutory filings for August 2026 by body, amount and due date">
          <THead>
            <TH>Body</TH>
            <TH>Type</TH>
            <TH align="right">Employees</TH>
            <TH align="right">Amount</TH>
            <TH>Due</TH>
            <TH>Status</TH>
          </THead>
          <TBody>
            {FILINGS.map((f) => (
              <TR key={`${f.body}-${f.kind}`} interactive>
                <TDPrimary title={f.body} />
                <TD>
                  <Badge tone="neutral" size="sm">
                    {f.kind}
                  </Badge>
                </TD>
                <TD align="right" className="tabular">
                  {f.staff}
                </TD>
                <TD align="right" className="tabular font-medium text-ink">
                  <Money amount={f.amount} />
                </TD>
                <TD className="tabular">{f.due}</TD>
                <TD>
                  <Badge tone={STATUS[f.status].tone} size="sm" dot>
                    {STATUS[f.status].label}
                  </Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </TableWrap>

        <Card>
          <CardHeader title="How this is produced" />
          <CardBody>
            <p className="text-[0.875rem] leading-relaxed text-body">
              Each row is computed from the approved payroll run rather than
              re-entered. PAYE splits by the employee&apos;s tax state, pension
              by their PFA, and NHF and NSITF across everyone on the run. If a
              run is corrected, the schedules regenerate with it.
            </p>
          </CardBody>
        </Card>
      </PageBody>
    </>
  );
}
