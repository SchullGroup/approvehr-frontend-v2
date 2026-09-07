"use client";

import { PageBody, PageHeader } from "@/components/portal/shell";
import { useCan, useIsManager } from "@/lib/permissions";
import { WhatNeedsYouTab } from "./now";
import { StartPeriodButton } from "./start-period";

/**
 * Overview: what is open, what is waiting on you, what is waiting on
 * somebody else.
 *
 * This used to be one of six tabs on this same route, switched with a
 * `?tab=` query string. It is the only one left here — the other five
 * (`kpis`, `review-tasks`, `skills`, `periods`, `appraisers`) and the
 * previously tab-less `approvals` queue all have their own route now, listed
 * in `nav.tsx`'s `performance` group. Splitting the doors did not change what
 * is behind any of them: `WhatNeedsYouTab` is the exact component the
 * `dashboard` tab rendered.
 *
 * `canSeeCompany`/`isManager` are computed here and nowhere else on this
 * page, because nothing else on it needs them — the KPI scope switcher that
 * used to share this state moved to `/performance/kpis` with the tab it
 * belonged to.
 */
export function PerformanceScreen() {
  const canSeeCompany = useCan("EDIT_RECORDS");
  const isManager = useIsManager();

  return (
    <>
      <PageHeader title="Performance" action={<StartPeriodButton withIcon />} />
      <PageBody>
        <WhatNeedsYouTab canSeeCompany={canSeeCompany} isManager={isManager} />
      </PageBody>
    </>
  );
}
