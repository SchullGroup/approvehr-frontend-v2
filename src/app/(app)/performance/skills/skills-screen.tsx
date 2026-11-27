"use client";

import { ToggleRight } from "lucide-react";
import { Button, ButtonLink, EmptyState, Spinner } from "@/components/ui";
import { useRouter } from "next/navigation";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { useCan, useIsManager } from "@/lib/permissions";
import { useFeatures } from "@/lib/store/features";
import { useRating } from "@/lib/store/performance";
import { useEffect, useState } from "react";
import { SkillsTab } from "../skills";
import { EditCompetenciesButton } from "./edit-competencies-button";
import type { SkillsTabId } from "./tabs";

/**
 * Competency ratings, on its own route.
 *
 * Gated on `appraisals` — a company that has not turned scored reviews on has
 * no levels to rate anybody against. The nav already hides this item for such
 * a company; this is the direct-link case. Somebody who can turn appraisals on
 * is given the one button that does it; everybody else has nothing to do here
 * and is sent back to Performance, so nobody is handed a link to a screen that
 * would refuse them.
 */
export function SkillsScreen({ initialTab }: { initialTab: SkillsTabId }) {
  const features = useFeatures();
  const canSeeCompany = useCan("EDIT_RECORDS");
  const isManager = useIsManager();
  const canTurnOn = useCan("MANAGE_SETTINGS");
  const router = useRouter();
  const rating = useRating();
  const [recording, setRecording] = useState(false);
  const canRecord = (canSeeCompany || isManager) && rating.editable;
  const sendAway = !features.loading && !features.appraisals && !canTurnOn;

  useEffect(() => {
    if (sendAway) router.replace("/performance");
  }, [sendAway, router]);

  if (features.loading) {
    return (
      <PageBody className="flex items-center justify-center py-24">
        <Spinner />
        <span className="sr-only">Loading</span>
      </PageBody>
    );
  }

  if (!features.appraisals) {
    if (!canTurnOn) return null;
    return (
      <>
        <PageHeader
          breadcrumb={[{ href: "/performance", label: "Performance" }]}
          title="Competency ratings"
        />
        <PageBody>
          <EmptyState
            plain
            icon={<ToggleRight aria-hidden="true" />}
            title="Appraisals are switched off"
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
        breadcrumb={[{ href: "/performance", label: "Performance" }]}
        title="Competency ratings"
        action={
          <>
            <EditCompetenciesButton />
            {canRecord && (
              <Button
                variant="accent"
                size="sm"
                onClick={() => setRecording(true)}
              >
                Record a level
              </Button>
            )}
          </>
        }
      />
      <PageBody>
        <SkillsTab
          canSeeCompany={canSeeCompany}
          isManager={isManager}
          initialTab={initialTab}
          recording={recording}
          onRecordingChange={setRecording}
        />
      </PageBody>
    </>
  );
}
