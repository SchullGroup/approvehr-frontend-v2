"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { useCan, useIsManager } from "@/lib/permissions";
import { useHeadedDepartmentIds } from "@/lib/store/departments";
import { SCOPE_LABEL, type KpiScope } from "@/lib/store/performance";
import { KpisTab } from "../kpis";
import { StartPeriodButton } from "../start-period";

/**
 * KPIs, on its own route.
 *
 * Scope state (mine/team/company) used to live in the shared tab-switching
 * shell one level up; it moved here with the tab it belonged to, since
 * nothing else on this module reads it.
 */
export function KpisScreen() {
  const canSeeCompany = useCan("EDIT_RECORDS");
  /* A department head leads their department whether or not anybody's
     `managerId` points at them — and in a company that sets none, that was
     every head, with no team view to find the KPIs they had just set. */
  const isManager = useIsManager();
  const headed = useHeadedDepartmentIds();
  const leadsATeam = isManager || headed.size > 0;
  const [chosenScope, setChosenScope] = useState<KpiScope | null>(null);

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
  const scope =
    chosenScope && scopes.includes(chosenScope) ? chosenScope : fallback;

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/performance", label: "Performance" }]}
        title="KPIs"
        meta={
          <Badge tone={scope === "mine" ? "neutral" : "accent"} size="sm">
            {SCOPE_LABEL[scope]}
          </Badge>
        }
        action={<StartPeriodButton withIcon />}
      />
      <PageBody>
        <KpisTab scope={scope} scopes={scopes} onScopeChange={setChosenScope} />
      </PageBody>
    </>
  );
}
