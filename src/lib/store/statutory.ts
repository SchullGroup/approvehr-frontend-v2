"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { payrollApi } from "@/lib/api/payroll";
import { statutory, type ApiStatutorySchedule } from "@/lib/api/statutory";
import { useRevalidation } from "@/lib/revalidate";
import { useSession } from "./session";

/**
 * The remittance schedules for the most recent payroll that produced any.
 *
 * ## Why "most recent approved" rather than a period picker
 *
 * A schedule only exists once a run is approved, and the question somebody
 * opens this screen with is "what do I owe and by when" — which is always about
 * the last payroll that went out. A period selector on a screen with one
 * meaningful answer is a control that mostly reproduces the same page.
 *
 * ## Offline it refuses, and says so
 *
 * There is nothing to compose locally: a schedule is a statement about a real
 * payroll's real figures, and one assembled in a browser would describe a
 * payroll that never happened. `store/departments.ts`'s argument, applied where
 * it genuinely holds — the demo has no approved run whose figures these could
 * be.
 */

export type StatutoryState = {
  schedules: ApiStatutorySchedule[];
  /** The run they belong to, so the screen can name the period. */
  runId: string | null;
  period: string | null;
  loading: boolean;
  error: ApiError | null;
  available: boolean;
  reload: () => void;
};

export function useStatutorySchedules(): StatutoryState {
  const { isConnected, isLoading } = useSession();
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<{
    key: string;
    schedules: ApiStatutorySchedule[];
    runId: string | null;
    period: string | null;
    error: ApiError | null;
  } | null>(null);

  const key = String(tick);

  /* Re-ask when somebody comes back to the window. In the dependency list and
     **not** in the key above: putting it in the key would make a return from
     another tab blank the table and redraw a skeleton for figures that are
     already on screen. `src/lib/revalidate.ts` states the rule and
     `verify-revalidate` enforces it — it caught this store having no
     revalidation at all, which would have made this the one panel on the
     screen that never refreshed. */
  const revalidation = useRevalidation();

  useEffect(() => {
    if (isLoading || !isConnected) return;
    let cancelled = false;
    void (async () => {
      try {
        const { runs } = await payrollApi.runs();
        /* The newest run that has actually been approved. A DRAFT or IN_REVIEW
           run has no schedules by design — the figures are not frozen yet. */
        const run = runs.find(
          (candidate) =>
            candidate.status === "APPROVED" || candidate.status === "PAID",
        );
        if (!run) {
          if (!cancelled) {
            setState({
              key,
              schedules: [],
              runId: null,
              period: null,
              error: null,
            });
          }
          return;
        }
        const schedules = await statutory.forRun(run.id);
        if (!cancelled) {
          setState({
            key,
            schedules,
            runId: run.id,
            period: run.period,
            error: null,
          });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        if (!cancelled) {
          setState({
            key,
            schedules: [],
            runId: null,
            period: null,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, isLoading, key, revalidation]);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  /* Staleness by comparing the key during render, never a setState in an
     effect — the rule `verify-stores` and `lib/store/shifts.ts` both carry. */
  const matched = state !== null && state.key === key;

  return {
    schedules: matched ? state.schedules : [],
    runId: matched ? state.runId : null,
    period: matched ? state.period : null,
    loading: isConnected && !matched,
    error: matched ? state.error : null,
    available: isConnected,
    reload,
  };
}
