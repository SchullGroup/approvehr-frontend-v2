"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  insightsApi,
  type DashboardData,
  type ReportsData,
} from "@/lib/api/insights";
import { useSession } from "@/lib/store/session";
import { useEmployeeStore } from "@/lib/store/employees";

/**
 * The dashboard and reports: the API when there is one, local figures when
 * there is not.
 *
 * Structured after `lib/store/shifts.ts`, which is the shape in this repo that
 * handles both halves without fighting the lint rules:
 *
 * - the **demo** value is a `useMemo`, so it never touches state at all;
 * - the **fetch** runs in an async IIFE inside the effect with a `cancelled`
 *   guard, so its `setState` is provably after an await and a stale response
 *   cannot overwrite a newer one.
 *
 * Three earlier attempts here put the demo path through `setState` and each
 * tripped `no-setState-in-effect`. The rule was right: a `load` whose deps
 * include a `useCallback` over `directory` re-runs whenever the directory
 * changes, and setting state from it is a genuine cascade.
 *
 * ## Why the demo half reads only the employee directory
 *
 * The first version derived leave, approvals and attendance figures from their
 * own local stores. Two reasons that was wrong, the second mattering more:
 *
 * 1. It coupled the dashboard to three other screens' internals — the thing a
 *    dashboard should least do, and the reason the server composes this into one
 *    endpoint rather than the client calling ten.
 * 2. Those stores were being rewritten at the time. A dashboard wired into them
 *    breaks the moment they change shape.
 *
 * So demo mode derives what the directory supports and reports **nothing** for
 * the rest: zero counts, and null for the blocks needing a real payroll run. A
 * figure this cannot honestly produce is one it does not show.
 *
 * ## Reading the result
 *
 * The server *omits* a block the caller may not see. Check for presence, never
 * for a falsy value: `data.money && …`, not
 * `data.money.loansOutstandingKobo > 0`. Rendering ₦0.00 where nothing belongs
 * tells somebody their company has no outstanding loans — a different, wrong
 * claim.
 */

type DashboardState = {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
};

type ReportsState = {
  data: ReportsData | null;
  loading: boolean;
  error: string | null;
};

const iso = (d: Date): string => d.toISOString().slice(0, 10);
const monthKey = (d: Date): string => iso(d).slice(0, 7);

const message = (caught: unknown, fallback: string): string =>
  caught instanceof Error ? caught.message : fallback;

export function useDashboard(): DashboardState & { reload: () => void } {
  const { isConnected } = useSession();
  const { directory } = useEmployeeStore();

  const demo = useCallback((): DashboardData => {
    const now = new Date();
    const month = monthKey(now);

    return {
      asOf: iso(now),
      headcount: {
        /* `directory` already excludes archived records. */
        active: directory.length,
        startingThisMonth: directory.filter((e) => e.startDate.startsWith(month))
          .length,
        leavingThisMonth: 0,
        /* The same test payroll blocks on, so the demo figure means what the
           connected one means. */
        incomplete: directory.filter((e) => !e.bankAccount || !e.pensionPin).length,
      },
      /* Zero rather than a guess. The approvals queue belongs to another screen
         and the dashboard does not reach into it. */
      approvals: { waiting: 0, overdue: 0, oldestWaitingDays: null },
      today: {
        expected: directory.length,
        clockedIn: 0,
        late: 0,
        onLeave: 0,
        unaccountedFor: 0,
      },
      /* Null, not a figure. Producing a payroll total here would mean running
         the frontend engine over local data and presenting it as though a run
         had happened. */
      payroll: null,
    };
  }, [directory]);

  const demoData = useMemo(() => (isConnected ? null : demo()), [isConnected, demo]);

  const [tick, setTick] = useState(0);
  const [fetched, setFetched] = useState<DashboardState | null>(null);

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await insightsApi.dashboard();
        if (!cancelled) setFetched({ data, loading: false, error: null });
      } catch (caught) {
        if (!cancelled) {
          setFetched({
            data: null,
            loading: false,
            error: message(caught, "Could not load the dashboard."),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  if (!isConnected) {
    return { data: demoData, loading: false, error: null, reload };
  }
  return fetched
    ? { ...fetched, reload }
    : { data: null, loading: true, error: null, reload };
}

export function useReports(period?: string): ReportsState & { reload: () => void } {
  const { isConnected } = useSession();
  const { directory } = useEmployeeStore();

  const demo = useCallback((): ReportsData => {
    const byDepartment = new Map<string, number>();
    const byType = new Map<string, number>();
    for (const e of directory) {
      const dept = e.department || "No department";
      byDepartment.set(dept, (byDepartment.get(dept) ?? 0) + 1);
      /* The real field, not a hardcoded FULL_TIME. A chart labelled with a
         value nobody has is worse than no chart. */
      byType.set(e.employmentType, (byType.get(e.employmentType) ?? 0) + 1);
    }

    return {
      period: period ?? monthKey(new Date()),
      /* Money needs payslips from a real run. A chart of invented department
         costs is worse than an empty state saying to run payroll first. */
      payrollByDepartment: null,
      grossBreakdown: null,
      headcount: {
        byDepartment: [...byDepartment.entries()]
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count),
        byEmploymentType: [...byType.entries()].map(([type, count]) => ({
          type,
          count,
        })),
      },
      operationalLoad: {
        leaveRequests: 0,
        ticketsOpen: 0,
        approvalsPending: 0,
        attendanceCorrections: 0,
      },
    };
  }, [directory, period]);

  const demoData = useMemo(() => (isConnected ? null : demo()), [isConnected, demo]);

  const [tick, setTick] = useState(0);
  const [fetched, setFetched] = useState<ReportsState | null>(null);

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await insightsApi.reports(period);
        if (!cancelled) setFetched({ data, loading: false, error: null });
      } catch (caught) {
        if (!cancelled) {
          setFetched({
            data: null,
            loading: false,
            error: message(caught, "Could not load the reports."),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, period, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  if (!isConnected) {
    return { data: demoData, loading: false, error: null, reload };
  }
  return fetched
    ? { ...fetched, reload }
    : { data: null, loading: true, error: null, reload };
}
