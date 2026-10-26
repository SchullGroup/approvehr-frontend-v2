"use client";

import { FolderKanban } from "lucide-react";
import { ButtonLink, EmptyState } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { useCan } from "@/lib/permissions";

/**
 * What a Projects route shows when the company has not switched Projects on.
 *
 * Plain on purpose: the module is off by default, so most people who land here
 * followed a link a colleague sent. It says what is true and where the switch is.
 * The link only appears for somebody who can use it; everybody else is told who to
 * ask rather than sent to a settings page that would refuse them.
 */
export function ProjectsOff() {
  const canSwitch = useCan("MANAGE_SETTINGS");
  return (
    <>
      <PageHeader title="Projects" />
      <PageBody>
        <EmptyState
          icon={<FolderKanban />}
          title="Projects is not switched on"
          description={
            canSwitch
              ? "Your company has not turned Projects on yet, so there is nothing to show. You can switch it on in Settings."
              : "Your company has not turned Projects on yet, so there is nothing to show. An administrator can switch it on in Settings, under Features."
          }
          {...(canSwitch
            ? {
                action: (
                  <ButtonLink variant="primary" href="/settings/features">
                    Open Features in Settings
                  </ButtonLink>
                ),
              }
            : {})}
        />
      </PageBody>
    </>
  );
}
