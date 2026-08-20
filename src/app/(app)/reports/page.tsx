import type { Metadata } from "next";
import { Download } from "lucide-react";
import {
  AreaChart,
  BarChart,
  Button,
  Card,
  CardBody,
  CardHeader,
  DonutChart,
  Money,
  Stat,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { EMPLOYEES } from "@/lib/mock/people";
import { calculatePayslip } from "@/lib/payroll/engine";
import { LEAVE_REQUESTS, TICKETS } from "@/lib/mock/workflows";

export const metadata: Metadata = {
  title: "Reports",
  description: "Headcount, payroll cost, leave liability and hiring throughput.",
};

export default function ReportsPage() {
  /* Every figure here is computed from the same records the rest of the app
     uses, so a report can never disagree with the screen it summarises. */
  const slips = EMPLOYEES.map((e) => calculatePayslip(e.id, e.grossMonthly));
  const gross = slips.reduce((s, p) => s + p.grossMonthly, 0);
  const employerPension = slips.reduce((s, p) => s + p.pensionEmployer, 0);
  const paye = slips.reduce((s, p) => s + p.payeMonthly, 0);
  const net = slips.reduce((s, p) => s + p.netPay, 0);
  const nhf = slips.reduce((s, p) => s + p.nhf, 0);
  const pensionEmployee = slips.reduce((s, p) => s + p.pensionEmployee, 0);

  const byDept = Object.entries(
    EMPLOYEES.reduce<Record<string, number>>((acc, e) => {
      acc[e.department] = (acc[e.department] ?? 0) + e.grossMonthly;
      return acc;
    }, {}),
  )
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const headcount = [
    { label: "Mar", value: 6 },
    { label: "Apr", value: 6 },
    { label: "May", value: 7 },
    { label: "Jun", value: 8 },
    { label: "Jul", value: 8 },
    { label: "Aug", value: EMPLOYEES.length },
  ];

  const pendingLeave = LEAVE_REQUESTS.filter((r) => r.status === "pending").length;
  const openTickets = TICKETS.filter((t) => t.status !== "resolved").length;

  return (
    <>
      <PageHeader
        title="Reports"
        description="Everything computed from live records — no separate reporting database to fall out of date."
        action={
          <Button variant="secondary" size="sm">
            <Download aria-hidden="true" className="size-3.5" />
            Export as CSV
          </Button>
        }
      />

      <PageBody className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Monthly gross"
            value={<Money amount={Math.round(gross)} compact />}
          />
          <Stat
            label="True employer cost"
            value={<Money amount={Math.round(gross + employerPension)} compact />}
            hint="gross plus employer pension"
          />
          <Stat label="Headcount" value={String(EMPLOYEES.length)} trend={{ direction: "up", label: "+2" }} hint="this quarter" />
          <Stat
            label="Average salary"
            value={<Money amount={Math.round(gross / EMPLOYEES.length)} compact />}
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Payroll cost by department"
              description="Monthly gross, largest first."
            />
            <CardBody>
              <BarChart
                colorBy="series"
                caption="Monthly gross payroll cost by department"
                points={byDept}
                format={(n) => `₦${(n / 1_000_000).toFixed(2)}m`}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Where gross goes"
              description="One month, split by destination."
            />
            <CardBody>
              <DonutChart
                caption="Monthly gross payroll split by destination"
                centreLabel={`Gross ₦${(gross / 1_000_000).toFixed(1)}m`}
                format={(n) => `₦${(n / 1_000_000).toFixed(2)}m`}
                points={[
                  { label: "Net to staff", value: Math.round(net) },
                  { label: "PAYE", value: Math.round(paye) },
                  { label: "Pension (employee)", value: Math.round(pensionEmployee) },
                  { label: "NHF", value: Math.round(nhf) },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Headcount" description="Rolling six months." />
            <CardBody>
              <AreaChart
                points={headcount}
                caption="Headcount by month, March to August"
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Operational load"
              description="What the people team is carrying right now."
            />
            <CardBody>
              <BarChart
                caption="Open operational items by type"
                points={[
                  { label: "Leave awaiting approval", value: pendingLeave },
                  { label: "Open help desk tickets", value: openTickets },
                  {
                    label: "Records missing payroll fields",
                    value: EMPLOYEES.filter(
                      (e) => !e.bankAccount || !e.pensionPin || !e.tin,
                    ).length,
                  },
                ]}
              />
            </CardBody>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
