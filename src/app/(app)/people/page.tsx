import type { Metadata } from "next";
import { DoorOpen, Plus } from "lucide-react";
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
          <div className="flex flex-wrap items-center gap-2">
            {/* People arrive and people leave, and until this link existed only
                one of those had a door. `/people/offboarding` was 1,850 lines of
                working exit flow that nothing in the product pointed at. */}
            <ButtonLink href="/people/offboarding" variant="secondary" size="sm">
              <DoorOpen aria-hidden="true" className="size-4" />
              Exit management
            </ButtonLink>
            <ButtonLink href="/people/new" variant="accent" size="sm">
              <Plus aria-hidden="true" className="size-4" />
              Add employee
            </ButtonLink>
          </div>
        }
      />
      <PageBody>
        <Directory />
      </PageBody>
    </>
  );
}
