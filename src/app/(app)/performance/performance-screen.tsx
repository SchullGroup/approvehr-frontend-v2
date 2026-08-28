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
import { StartPeriodButton } from "./start-period";
import {
  PERFORMANCE_TABS,
  isPerformanceTab,
  type PerformanceTab,
} from "./tabs";

/**
 * Performance, on one route.
 *
 * ## Four tabs, and the first one is where the period is
 *
 * There were four nouns to begin with — *KPIs · Appraisals · Skills · Who
 * appraises whom* — and no path, which is exactly what a product owner hit: he
 * read the module and could not work out how to create an appraisal or where the
 * periods were.
 *
 * | Tab | The question it answers |
 * |---|---|
 * | **Overview** | how far the running period has got, and what is waiting on you |
 * | **Appraisal periods** | what periods there are, and which needs something |
 * | **KPIs** | what people are aiming at, and how far along it is |
 * | *Who appraises whom* | only under `multiAppraiser` |
 *
 * Two things about the first one, both of which were complaints:
 *
 * **It was labelled "Approvals" and is not.** `/performance/approvals` is a
 * different screen — the objective agreement queue — so one word named two
 * things in one module, and a notification linking to one could land somebody on
 * the other. The label now matches what the tab has always been documented as.
 *
 * **It opens on the period's state, not on a list of periods.** `periods` used to
 * be the default, so arriving at `/performance` gave you a list and no answer to
 * "where is this up to" — that took two more clicks. `period-status.tsx` puts the
 * four figures on the landing for whoever is running the period, and is absent
 * rather than zeroed for everybody else.
 *
 * Skills left the tab strip entirely and is a closed disclosure on the first
 * tab. It is configuration-shaped — levels against a target the company set —
 * and a five-person business should never meet it. There is no `skills` flag to
 * hang that on, so the reveal is the mechanism, and because `Disclosure`
 * unmounts what it holds, nobody pays for it until they open it.
 *
 * **Appraisal periods** is itself gated: somebody who can neither run a period
 * nor read across the company has no use for a list of them, and the one fact
 * about the open period that *is* theirs is on the first tab.
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
   * What-needs-you and KPIs always. **Appraisal periods** with the `appraisals`
   * flag, and only for somebody who can run one or read across the company.
   * **Who appraises whom only with `multiAppraiser` and `EDIT_RECORDS`** — the
   * mapping is an aggregate over everybody, and a company that has not asked for
   * several appraisers per person must never see a weighting table it did not ask
   * for. That is the whole progressive-disclosure argument, applied one level
   * deeper than a module.
   */
  const available = PERFORMANCE_TABS.filter((id) => {
    if (id === "now" || id === "kpis") return true;
    if (!features.appraisals) return false;
    if (id === "periods") return canManage || canSeeCompany;
    return features.multiAppraiser && canSeeCompany;
  });
  const activeTab = available.includes(tab) ? tab : "now";

  const items: TabItem[] = available.map((id) => ({
    id,
    label:
      id === "now"
        ? "Overview"
        : id === "kpis"
          ? "KPIs"
          : id === "periods"
            ? "Appraisal periods"
            : "Who appraises whom",
  }));

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

  /* A link straight to the periods with the flag off gets a button that turns
     them on, not a silent redirect. KPIs and what-needs-you work without it. */
  if ((tab === "periods" || tab === "appraisers") && !features.appraisals) {
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
          activeTab === "periods" ? undefined : <StartPeriodButton withIcon />
        }
      />

      <PageBody>
        <Tabs items={items} value={activeTab} onChange={changeTab}>
          {activeTab === "now" && (
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
          {activeTab === "periods" && <PeriodsTab />}
          {activeTab === "appraisers" && <AppraiserMapTab />}
        </Tabs>
      </PageBody>
    </>
  );
}
