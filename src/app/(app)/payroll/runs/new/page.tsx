import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { PayrollRunWizard } from "./wizard";

export const metadata: Metadata = {
  title: "New payroll run",
  description: "Five steps from period to approval.",
};

export default function NewPayrollRunPage() {
  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/payroll", label: "Payroll" },
          { href: "/payroll/runs/new", label: "New run" },
        ]}
        title="Run payroll"
        description="Nothing is paid and no file is generated until this has been approved. You can leave and come back at any step."
      />
      <PageBody>
        <PayrollRunWizard />
      </PageBody>
    </>
  );
}
