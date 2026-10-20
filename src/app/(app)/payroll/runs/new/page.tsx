import { Suspense } from "react";
import type { Metadata } from "next";
import { RequirePermission } from "@/components/portal/require-permission";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { PayrollRunWizard } from "./wizard";

export const metadata: Metadata = {
  title: "Run payroll",
  description:
    "Calculate a month's pay, fix what it flags, then approve it. Nothing is paid until you approve.",
};

export default function NewPayrollRunPage() {
  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/payroll", label: "Monthly payroll" },
          { href: "/payroll/runs/new", label: "Run payroll" },
        ]}
        title="Run payroll"
      />
      <PageBody>
        {/* Anybody with **no** payroll permission used to get every step with a
            Continue button, and the API refused each read and write behind it.
            Any one of the three opens it, because the wizard already speaks to
            each of them: somebody who can only see pay reads the run and is told
            on the Check step that preparing needs another permission; a preparer
            is told somebody else approves; an approver reviews what was
            prepared. Gating on "can run it" alone would have locked a payroll
            viewer out of a read-only look at a run they are allowed to see. */}
        <RequirePermission
          permission={["VIEW_SALARIES", "RUN_PAYROLL", "APPROVE_PAYROLL"]}
          title="You cannot open payroll"
          what="Opening a payroll run"
        >
          {/* The wizard reads `?period=` to reopen a run somebody already
              prepared, and `useSearchParams` needs a boundary for this route to
              stay prerenderable. */}
          <Suspense
            fallback={
              <p className="text-body-sm text-muted">Loading the run…</p>
            }
          >
            <PayrollRunWizard />
          </Suspense>
        </RequirePermission>
      </PageBody>
    </>
  );
}
