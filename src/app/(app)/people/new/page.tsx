import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { NewEmployeeForm } from "./form";

export const metadata: Metadata = {
  title: "Add employee",
  description: "Create a record for a new starter.",
};

export default function NewEmployeePage() {
  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/people", label: "Directory" },
          { href: "/people/new", label: "Add employee" },
        ]}
        title="Add an employee"
        description="Only name, role, start date and salary are required. Bank and statutory details can follow once they hand them over."
      />
      <PageBody>
        <NewEmployeeForm />
      </PageBody>
    </>
  );
}
