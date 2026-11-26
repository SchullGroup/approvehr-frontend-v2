"use client";

import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/portal/shell";

/**
 * The payslip page's heading, with Back going to the month this payslip belongs to rather than to whichever
 * month the list opens on. `run` is the run's id from `?run=`, or none.
 */
export function PayslipHeader({ run }: { run: string | null }) {
  const backToList = run
    ? `/payroll/payslips?run=${encodeURIComponent(run)}`
    : "/payroll/payslips";
  return (
    <PageHeader
      breadcrumb={[
        { href: "/payroll", label: "Monthly payroll" },
        { href: backToList, label: "Payslips" },
      ]}
      title="Payslip"
    />
  );
}

/** Reads `?run=` in the browser. Needs a `Suspense` boundary above it, so the route stays prerenderable. */
export function PayslipHeaderFromUrl() {
  const run = useSearchParams().get("run");
  return <PayslipHeader run={run || null} />;
}
