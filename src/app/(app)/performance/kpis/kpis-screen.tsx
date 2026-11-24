"use client";

import { useRouter } from "next/navigation";
import { Badge, SegmentedControl } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { useCan, useIsManager } from "@/lib/permissions";
import { useHeadedDepartmentIds } from "@/lib/store/departments";
import { useFeatures } from "@/lib/store/features";
import {
  SCOPE_LABEL,
  useObjectiveApprovals,
  type KpiScope,
} from "@/lib/store/performance";
import { KpisTab } from "../kpis";
import { ObjectivesToAgree } from "./to-agree";

/** The To agree tab's value in the strip and in the address (`?tab=agree`). */
export const AGREE_TAB = "agree";

type Tab = KpiScope | typeof AGREE_TAB;

/** "To agree", with how many wait on this reader when any do. */
export function agreeLabel(count: number): string {
  return count > 0 ? `To agree (${String(count)})` : "To agree";
}

/**
 * Objectives, on its own route, with one flat strip of tabs (owner, 24 Nov
 * 2026: "merge the objectives and objectives to agree subs into multiple tabs
 * in one page"): My objectives, My team, Whole company, To agree.
 *
 * Whose objectives (mine/team/company) and, for the whole company, which
 * department are in the address, read by the page and handed down; To agree is
 * `?tab=agree`. Moving between them is a navigation, so each can be linked,
 * survives a refresh, and Back returns to where somebody was.
 *
 * To agree is offered to the people who agree objectives (who lead somebody,
 * or hold `EDIT_RECORDS`) while appraisals are on, as its sidebar row was. Its
 * count is the queue's own length, read once here and handed to the tab.
 */
export function KpisScreen({
  scope: asked = null,
  department = null,
  tab: askedTab = null,
}: {
  scope?: string | null;
  department?: string | null;
  tab?: string | null;
}) {
  const router = useRouter();
  const canSeeCompany = useCan("EDIT_RECORDS");
  /* A department head leads their department whether or not anybody's
     `managerId` points at them — and in a company that sets none, that was
     every head, with no team view to find the KPIs they had just set. */
  const isManager = useIsManager();
  const headed = useHeadedDepartmentIds();
  const leadsATeam = isManager || headed.size > 0;
  const features = useFeatures();
  const approvals = useObjectiveApprovals();
  const agrees =
    features.appraisals === true && approvals.couldHaveQueue === true;

  const scopes: KpiScope[] = [
    "mine",
    ...(leadsATeam ? (["team"] as const) : []),
    ...(canSeeCompany ? (["company"] as const) : []),
  ];

  /* The widest reading this person is allowed, unless they picked one. */
  const fallback: KpiScope = canSeeCompany
    ? "company"
    : leadsATeam
      ? "team"
      : "mine";
  const scope = scopes.find((one) => one === asked) ?? fallback;
  const tab: Tab = agrees && askedTab === AGREE_TAB ? AGREE_TAB : scope;

  const changeTab = (next: Tab) =>
    router.replace(
      next === AGREE_TAB
        ? `/performance/kpis?tab=${AGREE_TAB}`
        : `/performance/kpis?scope=${next}`,
      { scroll: false },
    );
  const departmentHref = (key: string | null) =>
    key === null
      ? "/performance/kpis?scope=company"
      : `/performance/kpis?scope=company&department=${encodeURIComponent(key)}`;

  const tabs: { value: Tab; label: string }[] = [
    ...scopes.map((id) => ({ value: id as Tab, label: SCOPE_LABEL[id] })),
    ...(agrees
      ? [{ value: AGREE_TAB as Tab, label: agreeLabel(approvals.queue.length) }]
      : []),
  ];
  const strip =
    tabs.length > 1 ? (
      <SegmentedControl<Tab>
        label="Which objectives to show"
        value={tab}
        onChange={changeTab}
        options={tabs}
      />
    ) : (
      <span className="text-body-sm text-muted">{SCOPE_LABEL[scope]}</span>
    );

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/performance", label: "Performance" }]}
        title="Objectives"
        meta={
          <Badge tone={tab === "mine" ? "neutral" : "accent"} size="sm">
            {tab === AGREE_TAB ? "To agree" : SCOPE_LABEL[scope]}
          </Badge>
        }
      />
      <PageBody>
        {tab === AGREE_TAB ? (
          <ObjectivesToAgree approvals={approvals} strip={strip} />
        ) : (
          <KpisTab
            scope={scope}
            scopes={scopes}
            onScopeChange={changeTab}
            strip={strip}
            department={scope === "company" ? department : null}
            departmentHref={departmentHref}
          />
        )}
      </PageBody>
    </>
  );
}
