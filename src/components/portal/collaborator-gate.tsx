"use client";

import { Lock } from "lucide-react";
import { usePathname } from "next/navigation";
import { ButtonLink, Card, EmptyState } from "@/components/ui";
import {
  COLLABORATOR_HOME,
  collaboratorMayOpen,
  useIsCollaborator,
} from "@/lib/hiring/access/collaborator";
import { PageBody, PageHeader } from "./shell";

/**
 * The one room an invited collaborator has, and a plain door for anywhere else.
 *
 * Every page already refuses somebody who lacks what it needs, in its own words. A few
 * ask for nothing at all (the settings home, the approvals inbox, the profile of a
 * person with no record) and would say what they say to anybody, which for somebody
 * invited to interview for one job is the company's setup checklist and its people. This
 * stands in front of **all** of them: a collaborator is shown their own pages and, for
 * every other address, one calm sentence and the way back. Nothing of the page behind it
 * is rendered, so nothing is asked of the API on its behalf either.
 *
 * It is a courtesy, not a lock. The API decides every request, and it refuses this
 * account everything but its own jobs whatever this does.
 */
export function CollaboratorGate({ children }: { children: React.ReactNode }) {
  const collaborator = useIsCollaborator();
  const pathname = usePathname() ?? "";
  if (!collaborator || collaboratorMayOpen(pathname)) return <>{children}</>;
  return (
    <>
      <PageHeader title="Not part of your access" />
      <PageBody>
        <Card>
          <EmptyState
            icon={<Lock aria-hidden="true" />}
            title="This page is not part of your access"
            description="You were invited to help hire for a job, so My interviews is the page that is yours. Whoever invited you can tell you more."
            action={
              <ButtonLink href={COLLABORATOR_HOME} variant="primary">
                Go to My interviews
              </ButtonLink>
            }
          />
        </Card>
      </PageBody>
    </>
  );
}
