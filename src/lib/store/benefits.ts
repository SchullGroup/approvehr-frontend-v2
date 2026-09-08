"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  benefitsApi,
  type ApiBenefitCost,
  type ApiBenefitEnrolment,
  type ApiBenefitNotices,
  type ApiBenefitPlan,
  type PlanBody,
} from "@/lib/api/benefits";
import { useRevalidation } from "@/lib/revalidate";
import { useSession } from "./session";

/**
 * Benefits, connected only.
 *
 * No demo mode. A benefit plan is a price the company pays an HMO every month
 * and a deduction that comes off somebody's payslip — a seeded one would put
 * an invented premium and an invented deduction on screen together, which is
 * the shape of a figure somebody budgets against.
 *
 * `/settings/payroll` refuses its own writes offline for the same reason: a
 * switch that looks saved and moves no payslip is the failure this codebase
 * keeps naming.
 */

const OFFLINE =
  "Benefits need the API. There is no demo version: a plan is a premium the " +
  "company pays every month and a deduction that comes off a payslip, and " +
  "invented figures for either are ones somebody would budget against.";

export type Read<T> = {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
  available: boolean;
  refusal: string;
  reload: () => void;
};

function useRead<T>(
  key: string,
  active: boolean,
  load: (signal: AbortSignal) => Promise<T>,
): Read<T> {
  const [tick, setTick] = useState(0);
  const [fetched, setFetched] = useState<{
    key: string;
    data: T | null;
    error: ApiError | null;
  } | null>(null);
  const full = `${key}|${String(tick)}`;

  const revalidation = useRevalidation();
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const data = await load(controller.signal);
        if (!cancelled) setFetched({ key: full, data, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        if (!cancelled) {
          setFetched({
            key: full,
            data: null,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [active, full, load, revalidation]);

  const fresh = fetched?.key === full;
  return {
    data: fresh ? fetched.data : null,
    loading: active && !fresh,
    error: fresh ? fetched.error : null,
    available: active,
    refusal: OFFLINE,
    reload: useCallback(() => {
      setTick((value) => value + 1);
    }, []),
  };
}

export function useBenefitPlans(
  includeArchived = false,
): Read<ApiBenefitPlan[]> {
  const { isConnected } = useSession();
  const load = useCallback(
    (signal: AbortSignal) => benefitsApi.plans(includeArchived, signal),
    [includeArchived],
  );
  return useRead(`plans|${String(includeArchived)}`, isConnected, load);
}

export function useBenefitEnrolments(
  query: { planId?: string; employeeId?: string; includeEnded?: boolean } = {},
): Read<ApiBenefitEnrolment[]> {
  const { isConnected } = useSession();
  /* Serialised so the effect re-runs on a value change rather than on every
     render — an object literal passed inline is a new reference each time. */
  const key = JSON.stringify(query);
  const load = useCallback(
    (signal: AbortSignal) =>
      benefitsApi.enrolments(JSON.parse(key) as typeof query, signal),
    [key],
  );
  return useRead(`enrolments|${key}`, isConnected, load);
}

/** The notices that have to reach a screen. Not decoration — see the API. */
export function useBenefitNotices(): Read<ApiBenefitNotices> {
  const { isConnected } = useSession();
  const load = useCallback(
    (signal: AbortSignal) => benefitsApi.notices(signal),
    [],
  );
  return useRead("notices", isConnected, load);
}

/** `VIEW_SALARIES`, asked by the screen. */
export function useBenefitCost(
  period: string,
  enabled: boolean,
): Read<ApiBenefitCost> {
  const { isConnected } = useSession();
  const load = useCallback(
    (signal: AbortSignal) => benefitsApi.cost(period, signal),
    [period],
  );
  return useRead(`cost|${period}`, isConnected && enabled, load);
}

export function useBenefitMutations() {
  const { isConnected } = useSession();
  const guard = useCallback(() => {
    if (!isConnected) throw new ApiError(0, "offline", OFFLINE);
  }, [isConnected]);

  return {
    available: isConnected,
    refusal: OFFLINE,
    createPlan: useCallback(
      async (body: PlanBody) => {
        guard();
        return benefitsApi.createPlan(body);
      },
      [guard],
    ),
    updatePlan: useCallback(
      async (id: string, body: Partial<PlanBody> & { archived?: boolean }) => {
        guard();
        return benefitsApi.updatePlan(id, body);
      },
      [guard],
    ),
    enrol: useCallback(
      async (planId: string, body: Parameters<typeof benefitsApi.enrol>[1]) => {
        guard();
        return benefitsApi.enrol(planId, body);
      },
      [guard],
    ),
    endEnrolment: useCallback(
      async (id: string, endedOn: string) => {
        guard();
        return benefitsApi.endEnrolment(id, endedOn);
      },
      [guard],
    ),
  };
}
