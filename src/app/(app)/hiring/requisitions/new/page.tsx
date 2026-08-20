import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { RequisitionWizard } from "./wizard";

export const metadata: Metadata = {
  title: "New requisition",
  description: "Open a new role in five steps.",
};

export default function NewRequisitionPage() {
  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/hiring", label: "Hiring" },
          { href: "/hiring/requisitions/new", label: "New requisition" },
        ]}
        title="Open a new role"
        description="Five steps. Everything is saved as you go, and nothing is published until the hiring manager approves it."
      />
      <PageBody>
        <RequisitionWizard />
      </PageBody>
    </>
  );
}
