import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { RUN_PEOPLE } from "@/lib/mock/payroll";
import { PayslipView } from "./view";

const PERIOD = "August 2026";
const PAY_DATE = "28 August 2026";
/* August is the eighth month, so year-to-date covers eight runs. */
const MONTHS_ELAPSED = 8;

export function generateStaticParams() {
  return RUN_PEOPLE.map((p) => ({ id: p.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const person = RUN_PEOPLE.find((p) => p.id === id);
  return {
    title: person ? `Payslip · ${person.name}` : "Payslip",
  };
}

export default async function PayslipPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const employee = RUN_PEOPLE.find((p) => p.id === id);
  if (!employee) notFound();

  return (
    <>
      <div className="no-print">
        <PageHeader
          breadcrumb={[
            { href: "/payroll", label: "Payroll" },
            { href: "/payroll/payslips", label: "Payslips" },
            { href: `/payroll/payslips/${employee.id}`, label: employee.name },
          ]}
          title={`Payslip · ${PERIOD}`}
          description={`${employee.name} · ${employee.jobTitle}`}
        />
      </div>
      <PageBody>
        <PayslipView
          employee={employee}
          period={PERIOD}
          payDate={PAY_DATE}
          monthsElapsed={MONTHS_ELAPSED}
        />
      </PageBody>
    </>
  );
}
