"use client";

import { useCallback } from "react";
import type { ApiError } from "@/lib/api/client";
import {
  companyReportApi,
  printableCompanyHeadline,
  type CompanyReport,
  type DepartmentPeople,
  type ReportHeadline,
} from "@/lib/api/company-report";
import { useSession } from "@/lib/store/session";
import { useFetched } from "@/lib/use-fetched";

/**
 * The company report, and its two smaller reads.
 *
 * Connected only. Everything in it is a count taken over the whole company by
 * the server, and a version assembled in a browser would describe a company
 * nothing else in the demo is running (the performance register refuses offline
 * for the same reason). The screen says so rather than drawing an empty report,
 * and in a production build there is no demo mode at all (ADR 0004).
 *
 * `enabled` is the `EDIT_RECORDS` permission, asked by the screen. The store
 * does not reach for `useCan` itself, so a consumer that does not render this
 * does not pay for the permissions fetch.
 */

export function useCompanyReport(
  cycleId: string | null,
  enabled: boolean,
): {
  report: CompanyReport | null;
  loading: boolean;
  error: ApiError | null;
  /** False offline, and false without permission: the screen explains instead. */
  available: boolean;
  reload: () => void;
} {
  const { isConnected } = useSession();
  const active = enabled && isConnected;

  const load = useCallback(
    (signal: AbortSignal) => companyReportApi.get(cycleId ?? undefined, signal),
    [cycleId],
  );
  const fetched = useFetched<CompanyReport>(
    `company-report|${cycleId ?? "in-play"}`,
    active,
    load,
  );

  return {
    report: active ? fetched.data : null,
    loading: active ? fetched.loading : false,
    error: active ? fetched.error : null,
    available: active,
    reload: fetched.reload,
  };
}

/**
 * Everyone in one department, for the side panel.
 *
 * Asked only while a panel is open (`departmentId` is null otherwise), and keyed
 * by department and period so a slow answer for the one you have just left
 * cannot be shown on the one you opened.
 */
export function useDepartmentPeople(
  departmentId: string | null,
  cycleId: string | null,
): {
  people: DepartmentPeople | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
} {
  const { isConnected } = useSession();
  const active = departmentId !== null && isConnected;

  const load = useCallback(
    (signal: AbortSignal) =>
      companyReportApi.people(departmentId ?? "", cycleId ?? undefined, signal),
    [departmentId, cycleId],
  );
  const fetched = useFetched<DepartmentPeople>(
    `company-report-people|${departmentId ?? "none"}|${cycleId ?? "in-play"}`,
    active,
    load,
  );
  return {
    people: active ? fetched.data : null,
    loading: active ? fetched.loading : false,
    error: active ? fetched.error : null,
    reload: fetched.reload,
  };
}

/**
 * The headline alone, for the dashboard banner.
 *
 * **A failure is a clean absence here, not an error card.** A banner that says
 * "this did not load" on the owner's first screen for a read they did not ask
 * for is worse than no banner, and the report page is where a failure is shown
 * properly. `null` for: no permission, no connection, a failed request, the API
 * having nothing to say, and a rule this build does not print.
 */
export function useCompanyHeadline(enabled: boolean): ReportHeadline | null {
  const { isConnected } = useSession();
  const active = enabled && isConnected;

  const load = useCallback(
    (signal: AbortSignal) => companyReportApi.headline(signal),
    [],
  );
  const fetched = useFetched<{ headline?: ReportHeadline }>(
    "company-headline",
    active,
    load,
  );
  if (!active || fetched.error) return null;
  return printableCompanyHeadline(fetched.data?.headline);
}
