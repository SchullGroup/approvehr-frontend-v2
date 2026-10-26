"use client";

import { PageBody, PageHeader } from "@/components/portal/shell";
import { WorkRecordPanel } from "@/components/performance/work-record";

/** The signed-in person's own Work record. */
export function MyWorkRecordScreen() {
  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/performance", label: "Performance" }]}
        title="My work record"
      />
      <PageBody>
        <WorkRecordPanel />
      </PageBody>
    </>
  );
}
