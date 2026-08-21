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
import { AppraisalsTab } from "./appraisals";
import { AppraiserMapTab } from "./appraiser-map";
import { KpisTab } from "./kpis";
import { SkillsTab } from "./skills";
import {
  PERFORMANCE_TABS,
  isPerformanceTab,
  type PerformanceTab,
} from "./tabs";

/**
 * Performance: KPIs, appraisals and skills, on one route.
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
 * target.
 */
export function PerformanceScreen({ initialTab }: { initialTab: PerformanceTab }) {
  const features = useFeatures();
  const canSeeCompany = useCan("EDIT_RECORDS");
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
   * KPIs always. Appraisals and Skills with the `appraisals` flag. **Who
   * appraises whom only with `multiAppraiser` and `EDIT_RECORDS`** — the mapping
   * is an aggregate over everybody, and a company that has not asked for several
   * appraisers per person must never see a weighting table it did not ask for.
   * That is the whole progressive-disclosure argument, applied one level deeper
   * than a module.
   */
  const available = PERFORMANCE_TABS.filter((id) => {
    if (id === "kpis") return true;
    if (!features.appraisals) return false;
    if (id === "appraisers") return features.multiAppraiser && canSeeCompany;
    return true;
  });
  const activeTab = available.includes(tab) ? tab : "kpis";

  const items: TabItem[] = available.map((id) => ({
    id,
    label:
      id === "kpis"
        ? "KPIs"
        : id === "appraisals"
          ? "Appraisals"
          : id === "skills"
            ? "Skills"
            : "Who appraises whom",
  }));

  /**
   * The tab is in the query string, so a link to Skills opens on it.
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

  /* A link straight to Appraisals or Skills with the flag off gets a button
     that turns them on, not a silent redirect to the KPI tab. */
  if (tab !== "kpis" && !features.appraisals) {
    return (
      <>
        <PageHeader title="Performance" />
        <PageBody>
          <EmptyState
            icon={<ToggleRight aria-hidden="true" />}
            title="Appraisals are switched off"
            description="Scored reviews on a cycle, and skills against their targets, on top of shared KPIs."
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
        description={
          activeTab === "kpis"
            ? "What people are aiming at, and how far along it is."
            : activeTab === "appraisals"
              ? "Reviews on a cycle: what you owe, and what was said about you."
              : activeTab === "skills"
                ? "Levels against the targets the company set."
                : "Who marks whom in a cycle, and how much each opinion counts."
        }
        meta={
          <Badge tone={scope === "mine" ? "neutral" : "accent"} size="sm">
            {SCOPE_LABEL[scope]}
          </Badge>
        }
      />

      <PageBody>
        <Tabs items={items} value={activeTab} onChange={changeTab}>
          {activeTab === "kpis" && (
            <KpisTab
              scope={scope}
              scopes={scopes}
              onScopeChange={setChosenScope}
            />
          )}
          {activeTab === "appraisals" && <AppraisalsTab />}
          {activeTab === "skills" && (
            <SkillsTab canSeeCompany={canSeeCompany} isManager={isManager} />
          )}
          {activeTab === "appraisers" && <AppraiserMapTab />}
        </Tabs>
      </PageBody>
    </>
  );
}
