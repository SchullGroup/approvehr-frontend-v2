"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { useCan, useIsManager } from "@/lib/permissions";
import { useHeadedDepartmentIds } from "@/lib/store/departments";
import { SCOPE_LABEL, type KpiScope } from "@/lib/store/performance";
import { KpisTab } from "../kpis";

/**
 * Objectives, on its own route.
 *
 * Whose objectives (mine/team/company) and, for the whole company, which
 * department are in the address, read by the page and handed down. Moving
 * between them is a navigation, so a department's list can be linked, survives
 * a refresh, and Back returns to the cards.
 */
export function KpisScreen({
  scope: asked = null,
  department = null,
}: {
  scope?: string | null;
  department?: string | null;
}) {
  const router = useRouter();
  const canSeeCompany = useCan("EDIT_RECORDS");
  /* A department head leads their department whether or not anybody's
     `managerId` points at them — and in a company that sets none, that was
     every head, with no team view to find the KPIs they had just set. */
  const isManager = useIsManager();
  const headed = useHeadedDepartmentIds();
  const leadsATeam = isManager || headed.size > 0;

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
  const changeScope = (next: KpiScope) =>
    router.replace(`/performance/kpis?scope=${next}`, { scroll: false });
  const departmentHref = (key: string | null) =>
    key === null
      ? "/performance/kpis?scope=company"
      : `/performance/kpis?scope=company&department=${encodeURIComponent(key)}`;

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/performance", label: "Performance" }]}
        title="Objectives"
        meta={
          <Badge tone={scope === "mine" ? "neutral" : "accent"} size="sm">
            {SCOPE_LABEL[scope]}
          </Badge>
        }
      />
      <PageBody>
        <KpisTab
          scope={scope}
          scopes={scopes}
          onScopeChange={changeScope}
          department={scope === "company" ? department : null}
          departmentHref={departmentHref}
        />
      </PageBody>
    </>
  );
}
