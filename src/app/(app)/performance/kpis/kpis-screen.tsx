"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { SegmentedControl } from "@/components/ui";
import { RowActions } from "@/components/ui/row-actions";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { newObjectiveHref } from "@/lib/performance/objective-wizard";
import { useCan, useIsManager } from "@/lib/permissions";
import { useHeadedDepartmentIds } from "@/lib/store/departments";
import { useFeatures } from "@/lib/store/features";
import {
  useKpiMutations,
  useObjectiveApprovals,
  type KpiScope,
} from "@/lib/store/performance";
import { KpisTab } from "../kpis";
import { useCanUploadObjectives } from "./import/access";
import { ObjectivesToAgree } from "./to-agree";

/** The To agree tab's value in the strip and in the address (`?tab=agree`). */
export const AGREE_TAB = "agree";

type Tab = "objectives" | typeof AGREE_TAB;

/** "To agree", with how many wait on this reader when any do. */
export function agreeLabel(count: number): string {
  return count > 0 ? `To agree (${String(count)})` : "To agree";
}

/**
 * Objectives, on its own route (owner redesign, 24 Nov 2026).
 *
 * The page is just "Objectives". What it shows follows the reader and is not
 * chosen from tabs: somebody who can see the company opens on one large card
 * per department (a card opens that department's list, `?department=<id>`);
 * a manager sees their team's objectives and their own as a plain list; anybody
 * else sees their own. The only strip is **Objectives | To agree (n)**, offered
 * to the people who agree objectives, and `?tab=agree` opens the queue.
 *
 * One button at the right, "New objective", with a menu of two: a new objective
 * (the full-page wizard, which can add several) and Upload objectives.
 */
export function KpisScreen({
  department = null,
  tab: askedTab = null,
}: {
  /** Kept so old links still resolve; the reader decides what they see. */
  scope?: string | null;
  department?: string | null;
  tab?: string | null;
}) {
  const router = useRouter();
  const canSeeCompany = useCan("EDIT_RECORDS");
  /* A department head leads their department whether or not anybody's
     `managerId` points at them. */
  const isManager = useIsManager();
  const headed = useHeadedDepartmentIds();
  const leadsATeam = isManager || headed.size > 0;
  const features = useFeatures();
  const approvals = useObjectiveApprovals();
  const mutations = useKpiMutations();
  const canUpload = useCanUploadObjectives();
  const agrees =
    features.appraisals === true && approvals.couldHaveQueue === true;

  const scope: KpiScope = canSeeCompany
    ? "company"
    : leadsATeam
      ? "team"
      : "mine";
  const tab: Tab = agrees && askedTab === AGREE_TAB ? AGREE_TAB : "objectives";

  const changeTab = (next: Tab) =>
    router.replace(
      next === AGREE_TAB
        ? `/performance/kpis?tab=${AGREE_TAB}`
        : "/performance/kpis",
      { scroll: false },
    );
  const departmentHref = (key: string | null) =>
    key === null
      ? "/performance/kpis"
      : `/performance/kpis?department=${encodeURIComponent(key)}`;

  const strip = agrees ? (
    <SegmentedControl<Tab>
      label="Objectives or objectives to agree"
      value={tab}
      onChange={changeTab}
      options={[
        { value: "objectives", label: "Objectives" },
        { value: AGREE_TAB, label: agreeLabel(approvals.queue.length) },
      ]}
    />
  ) : undefined;

  const back = department
    ? `/performance/kpis?department=${encodeURIComponent(department)}`
    : "/performance/kpis";
  const menu = [
    { label: "New objective", href: newObjectiveHref({ back }) },
    ...(canUpload
      ? [{ label: "Upload objectives", href: "/performance/kpis/import" }]
      : []),
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/performance", label: "Performance" }]}
        title="Objectives"
        {...(mutations.editable
          ? {
              action: (
                <RowActions
                  label="New objective, or upload objectives"
                  triggerText="New objective"
                  triggerIcon={<Plus aria-hidden="true" className="size-4" />}
                  items={menu}
                />
              ),
            }
          : {})}
      />
      <PageBody>
        {tab === AGREE_TAB ? (
          <ObjectivesToAgree approvals={approvals} strip={strip} />
        ) : (
          <KpisTab
            scope={scope}
            strip={strip}
            department={scope === "company" ? department : null}
            departmentHref={departmentHref}
          />
        )}
      </PageBody>
    </>
  );
}
