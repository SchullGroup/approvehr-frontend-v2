"use client";

import { ToggleRight } from "lucide-react";
import { ButtonLink, EmptyState, Spinner } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { useCan } from "@/lib/permissions";
import { useFeatures } from "@/lib/store/features";
import { AppraiserMapTab } from "../appraiser-map";

/**
 * Who appraises whom, on its own route.
 *
 * Gated on `appraisals` (an ordinary "not switched on" refusal) and
 * separately on `multiAppraiser` plus `EDIT_RECORDS` — the mapping is an
 * aggregate over everybody, and a company that has never asked for several
 * appraisers per person must never see a weighting table it did not ask for.
 * `multiAppraiser` cannot be true while `appraisals` is false (the setup
 * module refuses that combination), so the two checks never disagree.
 */
export function AppraisersScreen() {
  const features = useFeatures();
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
        <PageHeader title="Who appraises whom" />
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

  if (!features.multiAppraiser || !canSeeCompany) {
    return (
      <>
        <PageHeader title="Who appraises whom" />
        <PageBody>
          <EmptyState
            icon={<ToggleRight aria-hidden="true" />}
            title="One appraiser per person, today"
            description="This company has not turned on more than one appraiser per person, so nobody needs a mapping or a weighting table."
            action={
              canSeeCompany ? (
                <ButtonLink variant="accent" href="/settings/features">
                  Turn on more than one appraiser
                </ButtonLink>
              ) : undefined
            }
          />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Who appraises whom" />
      <PageBody>
        <AppraiserMapTab />
      </PageBody>
    </>
  );
}
