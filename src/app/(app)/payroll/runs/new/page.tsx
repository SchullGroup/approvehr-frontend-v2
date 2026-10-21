import { Suspense } from "react";
import type { Metadata } from "next";
import { RequirePermission } from "@/components/portal/require-permission";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { RUN_BREADCRUMB } from "./breadcrumb";
import { PayrollRunWizard } from "./wizard";

export const metadata: Metadata = {
  title: "Run payroll",
  description:
    "Calculate a month's pay, fix what it flags, then approve it. Nothing is paid until you approve.",
};

export default function NewPayrollRunPage() {
  return (
    /* The header is inside the boundary now, because what it carries (a menu for
       cancelling this payroll) depends on the run, which the wizard reads from
       the URL. The fallback renders the same header with nothing in that slot, so
       the prerendered page and the loaded page have the same title and crumbs and
       nothing moves when the menu appears.

       The wizard reads `?period=` to reopen a run somebody already prepared, and
       `useSearchParams` needs a boundary for this route to stay prerenderable. */
    <Suspense
      fallback={
        <>
          <PageHeader breadcrumb={RUN_BREADCRUMB} title="Run payroll" />
          <PageBody>
            <p className="text-body-sm text-muted">Loading the run…</p>
          </PageBody>
        </>
      }
    >
      {/* Anybody with **no** payroll permission used to get every step with a
          Continue button and a refusal behind each one. Any one of the three
          opens it: the wizard already tells a viewer, a preparer and an approver
          what they may do on each step. */}
      <RequirePermission
        permission={["VIEW_SALARIES", "RUN_PAYROLL", "APPROVE_PAYROLL"]}
        title="You cannot open payroll"
        what="Opening a payroll run"
      >
        <PayrollRunWizard />
      </RequirePermission>
    </Suspense>
  );
}
