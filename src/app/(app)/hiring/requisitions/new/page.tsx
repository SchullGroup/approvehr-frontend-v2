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
        description="Five steps. The last one saves the job as a draft advert, and nothing is public until you publish it."
      />
      <PageBody>
        <RequisitionWizard />
      </PageBody>
    </>
  );
}
