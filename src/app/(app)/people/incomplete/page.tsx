import type { Metadata } from "next";
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
          { href: "/people", label: "Directory" },
          { href: "/people/incomplete", label: "Incomplete records" },
        ]}
      />
      <PageBody>
        <IncompleteRecordsScreen />
      </PageBody>
    </>
  );
}
