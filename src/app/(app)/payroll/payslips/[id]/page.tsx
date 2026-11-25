import { Suspense } from "react";
import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { RUN_PEOPLE } from "@/lib/mock/payroll";
import { PayslipView } from "./view";

export const metadata: Metadata = {
  title: "Payslip",
  description: "One month, itemised, with what was taken and what it was for.",
};

/**
 * The demo's payslip ids, prerendered.
 *
 * Connected, an id is a uuid nobody can enumerate at build time, so those render
 * on demand — which is why this page **no longer calls `notFound()`**. It used to
 * 404 anything not in the seed, which meant every real payslip from the API was
 * a 404. Whether the record exists is now the client's answer, because only the
 * client knows which source it is reading.
 */
export function generateStaticParams() {
  return RUN_PEOPLE.map((person) => ({ id: person.id }));
}

export default async function PayslipPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ run?: string | string[] }>;
}) {
  const { id } = await params;
  /* Back goes to the month this payslip belongs to, not to whichever month the list opens on. */
  const { run } = await searchParams;
  const runParam = typeof run === "string" && run ? run : null;
  const backToList = runParam
    ? `/payroll/payslips?run=${encodeURIComponent(runParam)}`
    : "/payroll/payslips";

  return (
    <>
      <div className="no-print">
        <PageHeader
          breadcrumb={[
            { href: "/payroll", label: "Monthly payroll" },
            { href: backToList, label: "Payslips" },
          ]}
          title="Payslip"
        />
      </div>
      <PageBody>
        {/* `?run=` names the run this payslip belongs to, which saves the view
            hunting for it. `useSearchParams` needs a boundary to keep this route
            prerenderable. */}
        <Suspense
          fallback={
            <p className="text-body-sm text-muted">Finding this payslip…</p>
          }
        >
          <PayslipView id={id} />
        </Suspense>
      </PageBody>
    </>
  );
}
