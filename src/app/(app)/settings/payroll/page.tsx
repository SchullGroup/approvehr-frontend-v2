import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { PayrollSettingsForm } from "./form";

export const metadata: Metadata = {
  title: "Payroll settings",
  description:
    "Working month, salary structure, statutory rates and the checks that stop payroll.",
};

export default function PayrollSettingsPage() {
  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/settings", label: "Settings" },
          { href: "/settings/payroll", label: "Payroll" },
        ]}
        title="Payroll settings"
        description="These drive every calculation. Changing them affects the next run, not runs already approved."
      />
      <PageBody>
        <PayrollSettingsForm />
      </PageBody>
    </>
  );
}
