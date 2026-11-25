import type { Metadata } from "next";
import { RequirePermission } from "@/components/portal/require-permission";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { IncompleteRecordsScreen } from "./incomplete-records-screen";

export const metadata: Metadata = {
  title: "Incomplete records",
  description:
    "Every employee missing a bank account, pension PIN or TIN, one click from the exact field.",
};

export default function IncompleteRecordsPage() {
  return (
    <>
      <PageHeader
        title="Incomplete records"
        breadcrumb={[
          { href: "/people", label: "Employees" },
          { href: "/people/incomplete", label: "Incomplete records" },
        ]}
      />
      <PageBody>
        <RequirePermission
          permission="EDIT_RECORDS"
          title="You cannot see incomplete records"
          what="Seeing whose records are missing details"
        >
          <IncompleteRecordsScreen />
        </RequirePermission>
      </PageBody>
    </>
  );
}
