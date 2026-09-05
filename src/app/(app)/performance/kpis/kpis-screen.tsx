"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { useCan, useIsManager } from "@/lib/permissions";
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
  const isManager = useIsManager();
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

  return (
    <>
      <PageHeader
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
