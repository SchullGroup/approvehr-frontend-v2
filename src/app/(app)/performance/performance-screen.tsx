"use client";

import { useState } from "react";
import { ToggleRight } from "lucide-react";
import {
  Badge,
  ButtonLink,
  EmptyState,
  Spinner,
  Tabs,
  type TabItem,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { useCan, useIsManager } from "@/lib/permissions";
import { useFeatures } from "@/lib/store/features";
import { SCOPE_LABEL, type KpiScope } from "@/lib/store/performance";
import { AppraiserMapTab } from "./appraiser-map";
import { KpisTab } from "./kpis";
import { WhatNeedsYouTab } from "./now";
import { PeriodsTab } from "./periods";
import { ReviewTasksTab } from "./review-tasks";
import { SkillsTab } from "./skills";
import { StartPeriodButton } from "./start-period";
import {
  PERFORMANCE_TABS,
  isPerformanceTab,
  type PerformanceTab,
} from "./tabs";

/**
 * Performance, on one route.
 *
 * ## Six tabs, named for what they are
 *
 * `tabs.ts` explains why this went from a single job-shaped landing back to
 * explicit, always-visible tabs — the short version: "which tab is my task
 * under" and "where do I manage a section, a competency, a cycle" turned out
 * to be two different complaints, and only the first one was fixed by
 * hiding everything behind Overview.
 *
 * | Tab | The question it answers |
 * |---|---|
 * | **Dashboard** | how far the running period has got, and what is waiting on you |
 * | **Review Cycles** | what periods there are, and which needs something |
 * | **Competency Ratings** | where people are against the levels the company set |
 * | **KPIs** | what people are aiming at, and how far along it is |
 * | **Review Tasks** | what still needs a manager's grade |
 * | *Appraisers* | only under `multiAppraiser` |
 *
 * ## Who sees what, and where that is decided
 *
 * Here, from two hooks, and nowhere else:
 *
 * | | Reading |
 * |---|---|
 * | Staff | their own KPIs and skills |
 * | Manages people (`useIsManager`) | their team's as well |
 * | Holds `EDIT_RECORDS` | the company's, and the department heatmap |
 *
 * The scope is a control on the page, not a URL. A colleague you send
 * `/performance` to sees their own reading of it, which is the whole argument
 * for one route — the incumbent's five performance routes each 403 for the
 * wrong reader and the person who was sent one cannot tell why.
 *
 * The default reading is the widest one this person is allowed, because somebody
 * who holds the records permission opened this to look at the company. An
 * explicit choice always wins, and it is kept in state rather than derived so
 * that permissions arriving a moment later cannot yank the page out from under
 * somebody mid-read.
 *
 * ## KPIs, not "objectives" or "OKRs"
 *
 * A demo review found people look for that exact word. Every heading, tab and
 * empty state here says KPI, and the measures underneath are "measures", not
 * "key results" — the acronym is jargon and the thing is a number with a
 * target. Kept exactly as-is through this rename: the tab strip changed, that
 * finding did not.
 */
export function PerformanceScreen({
  initialTab,
}: {
  initialTab: PerformanceTab;
}) {
  const features = useFeatures();
  const canSeeCompany = useCan("EDIT_RECORDS");
  const canManage = useCan("MANAGE_SETTINGS");
  const isManager = useIsManager();

  const [tab, setTab] = useState<PerformanceTab>(initialTab);
  const [chosenScope, setChosenScope] = useState<KpiScope | null>(null);

  const scopes: KpiScope[] = [
    "mine",
    ...(isManager ? (["team"] as const) : []),
    ...(canSeeCompany ? (["company"] as const) : []),
  ];

  /* The widest reading this person is allowed, unless they picked one. */
  const fallback: KpiScope = canSeeCompany
    ? "company"
    : isManager
      ? "team"
      : "mine";
  const scope =
    chosenScope && scopes.includes(chosenScope) ? chosenScope : fallback;

  /**
   * Which tabs exist at all.
   *
   * Dashboard, KPIs and Review Tasks always — a task log and a grading queue
   * are about your own objectives and your own reports, not a company
   * setting. **Review Cycles** and **Competency Ratings** need the
   * `appraisals` flag, the former also gated on somebody who can run a
   * period or read across the company. **Appraisers only with
   * `multiAppraiser` and `EDIT_RECORDS`** — the mapping is an aggregate over
   * everybody, and a company that has not asked for several appraisers per
   * person must never see a weighting table it did not ask for.
   */
  const available = PERFORMANCE_TABS.filter((id) => {
    if (id === "dashboard" || id === "kpis" || id === "review-tasks") {
      return true;
    }
    if (!features.appraisals) return false;
    if (id === "review-cycles") return canManage || canSeeCompany;
    if (id === "competency-ratings") return true;
    return features.multiAppraiser && canSeeCompany;
  });
  const activeTab = available.includes(tab) ? tab : "dashboard";

  const LABEL: Record<PerformanceTab, string> = {
    dashboard: "Dashboard",
    "review-cycles": "Review Cycles",
    "competency-ratings": "Competency Ratings",
    kpis: "KPIs",
    "review-tasks": "Review Tasks",
    appraisers: "Appraisers",
  };
  const items: TabItem[] = available.map((id) => ({ id, label: LABEL[id] }));

  /**
   * The tab is in the query string, so a link to the periods opens on them.
   *
   * `replaceState` rather than a router push: switching tab is not a navigation
   * and should not add a back-button step.
   */
  const changeTab = (next: string) => {
    if (!isPerformanceTab(next)) return;
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  };

  if (features.loading) {
    return (
      <PageBody className="flex items-center justify-center py-24">
        <Spinner />
        <span className="sr-only">Loading</span>
      </PageBody>
    );
  }

  /* A link straight to a gated tab with the flag off gets a button that
     turns it on, not a silent redirect. Dashboard, KPIs and Review Tasks
     work without it. */
  if (
    (tab === "review-cycles" ||
      tab === "competency-ratings" ||
      tab === "appraisers") &&
    !features.appraisals
  ) {
    return (
      <>
        <PageHeader title="Performance" />
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
        title="Performance"
        meta={
          activeTab === "kpis" ? (
            <Badge tone={scope === "mine" ? "neutral" : "accent"} size="sm">
              {SCOPE_LABEL[scope]}
            </Badge>
          ) : undefined
        }
        /* The redundant entry point, on the module's own front page. Absent for
           anybody who cannot run a period — see `StartPeriodButton`. */
        action={
          activeTab === "review-cycles" ? undefined : (
            <StartPeriodButton withIcon />
          )
        }
      />

      <PageBody>
        <Tabs items={items} value={activeTab} onChange={changeTab}>
          {activeTab === "dashboard" && (
            <WhatNeedsYouTab
              canSeeCompany={canSeeCompany}
              isManager={isManager}
            />
          )}
          {activeTab === "kpis" && (
            <KpisTab
              scope={scope}
              scopes={scopes}
              onScopeChange={setChosenScope}
            />
          )}
          {activeTab === "review-cycles" && <PeriodsTab />}
          {activeTab === "competency-ratings" && (
            <SkillsTab canSeeCompany={canSeeCompany} isManager={isManager} />
          )}
          {activeTab === "review-tasks" && <ReviewTasksTab />}
          {activeTab === "appraisers" && <AppraiserMapTab />}
        </Tabs>
      </PageBody>
    </>
  );
}
