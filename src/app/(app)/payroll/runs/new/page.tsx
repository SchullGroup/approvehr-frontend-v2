import { Suspense } from "react";
import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { PayrollRunWizard } from "./wizard";

export const metadata: Metadata = {
  title: "Run payroll",
  description: "Calculate a month's pay, fix what it flags, then approve it. Nothing is paid until you approve.",
};

export default function NewPayrollRunPage() {
  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/payroll", label: "Payroll" },
          { href: "/payroll/runs/new", label: "Run payroll" },
        ]}
        title="Run payroll"
        description="Preparing works out everybody's pay and pays nobody. Approving is the step that cannot be undone."
      />
      <PageBody>
        {/* The wizard reads `?period=` to reopen a run somebody already prepared,
            and `useSearchParams` needs a boundary for this route to stay
            prerenderable. */}
        <Suspense
          fallback={
            <p className="text-body-sm text-muted">Loading the run…</p>
          }
        >
          <PayrollRunWizard />
        </Suspense>
      </PageBody>
    </>
  );
}
