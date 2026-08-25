import type { Metadata } from "next";
import { FileUp } from "lucide-react";
import { ButtonLink } from "@/components/ui";
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
        /*
         * The way out, for somebody who arrived here with a list.
         *
         * Adding people one at a time is the exception — onboarding a company
         * means importing the spreadsheet they already keep. Somebody who starts
         * typing the first of thirty names should find that out on this screen
         * rather than on the thirtieth, and the only signposts to the importer
         * were the Directory and a nav item gated on IMPORT_DATA.
         *
         * `secondary`, not `accent`: the primary action on this page is still
         * finishing the form somebody has already begun.
         */
        action={
          <ButtonLink href="/people/import" variant="secondary" size="sm">
            <FileUp aria-hidden="true" className="size-4" />
            Add several from a spreadsheet
          </ButtonLink>
        }
      />
      <PageBody>
        <NewEmployeeForm />
      </PageBody>
    </>
  );
}
