import { Suspense } from "react";
import type { Metadata } from "next";
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
      <PayrollRunWizard />
    </Suspense>
  );
}
