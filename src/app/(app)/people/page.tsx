import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { Directory } from "./directory";

export const metadata: Metadata = {
  title: "Directory",
  description: "Everyone on the payroll, and the state of their record.",
};

export default function PeoplePage() {
  return (
    <>
      <PageHeader
        title="Directory"
        description="Everyone on the payroll, and the state of their record."
        action={
          <ButtonLink href="/people/new" variant="accent" size="sm">
            <Plus aria-hidden="true" className="size-4" />
            Add employee
          </ButtonLink>
        }
      />
      <PageBody>
        <Directory />
      </PageBody>
    </>
  );
}
