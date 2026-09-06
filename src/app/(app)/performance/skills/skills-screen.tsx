"use client";

import { ToggleRight } from "lucide-react";
import { ButtonLink, EmptyState, Spinner } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { useCan, useIsManager } from "@/lib/permissions";
import { useFeatures } from "@/lib/store/features";
import { SkillsTab } from "../skills";
import { StartPeriodButton } from "../start-period";

/**
 * Competency ratings, on its own route.
 *
 * Gated on `appraisals` — a company that has not turned scored reviews on has
 * no levels to rate anybody against. The nav already hides this item for such
 * a company; this is the direct-link case, answered the same way
 * `/performance/approvals` answers it.
 */
export function SkillsScreen() {
  const features = useFeatures();
  const canSeeCompany = useCan("EDIT_RECORDS");
  const isManager = useIsManager();

  if (features.loading) {
    return (
      <PageBody className="flex items-center justify-center py-24">
        <Spinner />
        <span className="sr-only">Loading</span>
      </PageBody>
    );
  }

  if (!features.appraisals) {
    return (
      <>
        <PageHeader title="Competency ratings" />
        <PageBody>
          <EmptyState
            icon={<ToggleRight aria-hidden="true" />}
            title="Appraisals are switched off"
            description="Scored reviews inside an appraisal period, and skills against their targets, on top of shared KPIs."
            action={
              <ButtonLink variant="accent" href="/settings/features">
                Turn appraisals on
              </ButtonLink>
            }
          />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Competency ratings"
        action={<StartPeriodButton withIcon />}
      />
      <PageBody>
        <SkillsTab canSeeCompany={canSeeCompany} isManager={isManager} />
      </PageBody>
    </>
  );
}
