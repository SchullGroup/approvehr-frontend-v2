import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { PayslipIndex } from "./index-table";

export const metadata: Metadata = {
  title: "Payslips",
  description: "Every payslip for the period, and whether it reached the person.",
};

export default function PayslipsPage() {
  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/payroll", label: "Payroll" },
          { href: "/payroll/payslips", label: "Payslips" },
        ]}
        title="Payslips"
        description="Every payslip for the period, and whether it actually reached the person."
      />
      <PageBody>
        <PayslipIndex />
      </PageBody>
    </>
  );
}
