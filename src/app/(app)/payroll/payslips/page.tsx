import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { PayslipRoute } from "./index-table";

export const metadata: Metadata = {
  title: "Payslips",
  description: "Every payslip for the period, and whether it reached the person.",
};

export default function PayslipsPage() {
  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/payroll", label: "Monthly payroll" },
          { href: "/payroll/payslips", label: "Payslips" },
        ]}
        title="Payslips"
      />
      <PageBody>
        <PayslipRoute />
      </PageBody>
    </>
  );
}
