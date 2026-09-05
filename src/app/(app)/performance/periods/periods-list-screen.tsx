"use client";

import { ToggleRight } from "lucide-react";
import { ButtonLink, EmptyState, Spinner } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { useCan } from "@/lib/permissions";
import { useFeatures } from "@/lib/store/features";
import { PeriodsTab } from "../periods";
import { StartPeriodButton } from "../start-period";

/**
 * Appraisal periods, as a list, on its own route.
 *
 * Gated on `appraisals` plus either running a period (`MANAGE_SETTINGS`) or
 * reading across the company (`EDIT_RECORDS`) — the exact gate the old
 * `review-cycles` tab used. Staff with neither never had this tab either;
 * this is the direct-link case for both refusals.
 */
export function PeriodsListScreen() {
  const features = useFeatures();
  const canManage = useCan("MANAGE_SETTINGS");
  const canSeeCompany = useCan("EDIT_RECORDS");

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
        <PageHeader title="Appraisal periods" />
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

  if (!canManage && !canSeeCompany) {
    return (
      <>
        <PageHeader title="Appraisal periods" />
        <PageBody>
          <EmptyState
            title="Not yours to run"
            description="Appraisal periods are managed by whoever runs them or reads across the company. Ask them to start or open one."
          />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Appraisal periods" action={<StartPeriodButton withIcon />} />
      <PageBody>
        <PeriodsTab />
      </PageBody>
    </>
  );
}
