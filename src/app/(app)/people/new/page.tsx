import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { NewEmployeeForm } from "./form";

export const metadata: Metadata = {
  title: "Add employee",
  description: "Create a record for a new starter, in two required steps.",
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
        description="Two steps get somebody onto payroll: their name, and their job and salary. Tax, pension and bank details are optional groups you open if you have them."
      />
      <PageBody>
        <NewEmployeeForm />
      </PageBody>
    </>
  );
}
