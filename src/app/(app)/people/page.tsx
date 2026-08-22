import type { Metadata } from "next";
import { DoorOpen, FileUp, Plus } from "lucide-react";
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
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* People arrive and people leave, and until this link existed only
                one of those had a door. `/people/offboarding` was 1,850 lines of
                working exit flow that nothing in the product pointed at. */}
            <ButtonLink href="/people/offboarding" variant="secondary" size="sm">
              <DoorOpen aria-hidden="true" className="size-4" />
              Exit management
            </ButtonLink>
            {/* Adding people one at a time is the exception, not the rule:
                onboarding a company means importing the spreadsheet they
                already keep. `/people/import` is a complete four-step flow —
                template in CSV and Excel, column matching, corrections made in
                place, then a confirmation in numbers — and the Directory, which
                is where anybody looks for it, pointed at none of it. The nav's
                own Import item is gated on IMPORT_DATA, so for anybody without
                that permission the feature did not appear to exist at all. */}
            <ButtonLink href="/people/import" variant="secondary" size="sm">
              <FileUp aria-hidden="true" className="size-4" />
              Import from spreadsheet
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
