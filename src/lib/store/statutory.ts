"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { payrollApi, type PayrollRun } from "@/lib/api/payroll";
import { statutory, type ApiStatutorySchedule } from "@/lib/api/statutory";
import { useRevalidation } from "@/lib/revalidate";
import { useSession } from "./session";

/**
 * The remittance schedules for one payroll, or for the default view.
 *
 * ## Which payroll
 *
 * With a `selected` run, the schedules are that run's, and nothing else. The
 * picker on the screen chooses it.
 *
 * Without one, the default view: the newest approved payroll's schedules, then
 * every unfiled schedule from the approved payrolls before it (U33). Approving
 * November used to make August's six unfiled schedules vanish from the screen.
 *
 * A DRAFT or IN_REVIEW run has no schedules by design, because its figures are
 * not frozen yet, so only approved and paid runs are ever read here.
 *
 * ## Offline it refuses, and says so
 *
 * There is nothing to compose locally: a schedule is a statement about a real
 * payroll's real figures, and one assembled in a browser would describe a
 * payroll that never happened.
 */

/** A schedule, with the payroll month it is for. */
export type StatutoryRow = ApiStatutorySchedule & { period: string };

/** How many approved payrolls back an unfiled schedule is looked for. */
const LOOK_BACK = 12;

export type StatutorySelection = { runId: string; period: string };

export type StatutoryState = {
  /**
   * The newest approved payroll's schedules, then every unfiled schedule from
   * the approved payrolls before it (U33), or, with a run selected, that run's
   * schedules only.
   */
  schedules: StatutoryRow[];
  /** The run they belong to, so the screen can name the period. */
  runId: string | null;
  period: string | null;
  loading: boolean;
  error: ApiError | null;
  available: boolean;
  reload: () => void;
};

type Settled = {
  key: string;
  schedules: StatutoryRow[];
  runId: string | null;
  period: string | null;
  error: ApiError | null;
};

export function useStatutorySchedules(
  selected: StatutorySelection | null = null,
): StatutoryState {
  const { isConnected, isLoading } = useSession();
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<Settled | null>(null);

  const selectedRunId = selected?.runId ?? null;
  const selectedPeriod = selected?.period ?? null;

  /* The run is part of the key, so switching runs reads as "in flight" until
     the new schedules land, instead of showing the previous run's rows. */
  const key = `${String(tick)}|${selectedRunId ?? "default"}`;

  /* Re-ask when somebody comes back to the window. In the dependency list and
     **not** in the key above: putting it in the key would make a return from
     another tab blank the table and redraw a skeleton for figures that are
     already on screen. `src/lib/revalidate.ts` states the rule and
     `verify-revalidate` enforces it. */
  const revalidation = useRevalidation();

  useEffect(() => {
    if (isLoading || !isConnected) return;
    let cancelled = false;
    const settle = (next: Omit<Settled, "key">) => {
      if (!cancelled) setState({ key, ...next });
    };
    void (async () => {
      try {
        if (selectedRunId && selectedPeriod) {
          const rows = await statutory.forRun(selectedRunId);
          settle({
            schedules: rows.map((row) => ({ ...row, period: selectedPeriod })),
            runId: selectedRunId,
            period: selectedPeriod,
            error: null,
          });
          return;
        }

        const { runs } = await payrollApi.runs();
        const approved = runs
          .filter(
            (candidate) =>
              candidate.status === "APPROVED" || candidate.status === "PAID",
          )
          .slice(0, LOOK_BACK);
        const run = approved[0];
        if (!run) {
          settle({ schedules: [], runId: null, period: null, error: null });
          return;
        }
        const perRun = await Promise.all(
          approved.map(async (each) =>
            (await statutory.forRun(each.id)).map((row): StatutoryRow => ({
              ...row,
              period: each.period,
            })),
          ),
        );
        const schedules = perRun.flatMap((rows, index) =>
          index === 0 ? rows : rows.filter((row) => row.filedAt === null),
        );
        settle({
          schedules,
          runId: run.id,
          period: run.period,
          error: null,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        settle({
          schedules: [],
          runId: null,
          period: null,
          error: error instanceof ApiError ? error : null,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isConnected,
    isLoading,
    key,
    revalidation,
    selectedRunId,
    selectedPeriod,
  ]);

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

export type ApprovedRunsState = {
  /** Approved or paid runs only: the ones that have schedules. Newest first. */
  runs: PayrollRun[];
  loading: boolean;
  error: ApiError | null;
};

/**
 * The approved runs in one calendar year, or one month of it, for the picker.
 * Without a filter, the newest hundred runs, which is the picker's own list of
 * years and months.
 */
export function useApprovedRuns(
  filter: { year?: number; month?: number } = {},
): ApprovedRunsState {
  const { isConnected, isLoading } = useSession();
  const year = filter.year;
  const month = filter.month;
  const key = `${year ?? "all"}|${month ?? "all"}`;
  const [state, setState] = useState<{
    key: string;
    runs: PayrollRun[];
    error: ApiError | null;
  } | null>(null);

  useEffect(() => {
    if (isLoading || !isConnected) return;
    let cancelled = false;
    void (async () => {
      try {
        const { runs } = await payrollApi.runs({
          take: 100,
          ...(year !== undefined ? { year } : {}),
          ...(month !== undefined ? { month } : {}),
        });
        if (!cancelled) {
          setState({
            key,
            runs: runs.filter(
              (run) => run.status === "APPROVED" || run.status === "PAID",
            ),
            error: null,
          });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        if (!cancelled) {
          setState({
            key,
            runs: [],
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, isLoading, key, year, month]);

  const matched = state !== null && state.key === key;
  return {
    runs: matched ? state.runs : [],
    loading: isConnected && !matched,
    error: matched ? state.error : null,
  };
}
