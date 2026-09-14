"use client";

import { ToggleRight } from "lucide-react";
import { ButtonLink, EmptyState, Spinner } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { FeatureOffLine } from "@/components/portal/feature-off-line";
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
  /* Separate from `canSeeCompany`: reading the map needs the records
     permission, and flipping the flag needs the settings one. Offering "turn
     it on" to somebody who cannot is a dead control. */
  const canChangeFeatures = useCan("MANAGE_SETTINGS");

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
        <PageHeader
          breadcrumb={[{ href: "/performance", label: "Performance" }]}
          title="Who appraises whom"
        />
        <PageBody>
          <EmptyState
            icon={<ToggleRight aria-hidden="true" />}
            title="Appraisals are switched off"
            description="Scored reviews inside an appraisal period, and skills against their targets, on top of shared KPIs."
            action={
              canChangeFeatures ? (
                <ButtonLink variant="accent" href="/settings/features">
                  Turn appraisals on
                </ButtonLink>
              ) : undefined
            }
          />
        </PageBody>
      </>
    );
  }

  /**
   * Two causes, two sentences.
   *
   * This was one branch — `!features.multiAppraiser || !canSeeCompany` — and
   * it always told the flag story. So four of the six roles walked in testing
   * were told *"This company has not turned on more than one appraiser per
   * person"* by an organisation that had it switched **on**. The real reason
   * they saw nothing is that reading the map needs `EDIT_RECORDS`.
   *
   * The action underneath was already split on `canSeeCompany`, so the two
   * cases were known to differ. Only the sentence was not, and a tester
   * following it goes to Settings and finds the switch already on.
   */
  if (!canSeeCompany) {
    return (
      <>
        <PageHeader
          breadcrumb={[{ href: "/performance", label: "Performance" }]}
          title="Who appraises whom"
        />
        <PageBody>
          <EmptyState
            title="Not yours to read"
            description="Who appraises whom covers everybody in the company, so it needs the permission to see everybody's record."
          />
        </PageBody>
      </>
    );
  }

  if (!features.multiAppraiser) {
    return (
      <>
        <PageHeader
          breadcrumb={[{ href: "/performance", label: "Performance" }]}
          title="Who appraises whom"
        />
        <PageBody>
          <EmptyState
            icon={<ToggleRight aria-hidden="true" />}
            title="One appraiser per person, today"
            description="This company has not turned on more than one appraiser per person, so nobody needs a mapping or a weighting table."
            action={
              canChangeFeatures ? (
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
      <PageHeader
        breadcrumb={[{ href: "/performance", label: "Performance" }]}
        title="Who appraises whom"
      />
      <PageBody>
        <FeatureOffLine feature="multiAppraiser" />
        <AppraiserMapTab />
      </PageBody>
    </>
  );
}
