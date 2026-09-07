"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  advancesApi,
  type ApiAdvance,
  type ApiAdvancePolicy,
  type ApiAdvanceStatus,
  type ApiEarned,
  type ApiEligibility,
} from "@/lib/api/advances";
import { useRevalidation } from "@/lib/revalidate";
import { useSession } from "./session";

/**
 * Earned wage access, connected only.
 *
 * No demo mode, and this one is not close. A demo would show somebody a figure
 * saying what they have earned and offer to pay it to them. Both halves are
 * invented, and the second is a promise about money — the single worst thing in
 * this product to fabricate.
 */

const OFFLINE =
  "Drawing pay early needs the API. There is no demo version: it would mean " +
  "showing somebody an invented figure for what they have earned and offering " +
  "to pay it to them.";

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

/** What the caller has earned and what they could draw. Their own; no permission. */
export function useMyAdvance(): Read<{
  earned: ApiEarned;
  eligibility: ApiEligibility;
}> {
  const { isConnected } = useSession();
  const load = useCallback((signal: AbortSignal) => advancesApi.me(signal), []);
  return useRead("me", isConnected, load);
}

export function useAdvances(status?: ApiAdvanceStatus): Read<ApiAdvance[]> {
  const { isConnected } = useSession();
  const load = useCallback(
    (signal: AbortSignal) => advancesApi.list(status ? { status } : {}, signal),
    [status],
  );
  return useRead(`advances|${status ?? "all"}`, isConnected, load);
}

export function useAdvancePolicy(): Read<ApiAdvancePolicy> {
  const { isConnected } = useSession();
  const load = useCallback(
    (signal: AbortSignal) => advancesApi.policy(signal),
    [],
  );
  return useRead("policy", isConnected, load);
}

export function useAdvanceMutations() {
  const { isConnected } = useSession();
  const guard = useCallback(() => {
    if (!isConnected) throw new ApiError(0, "offline", OFFLINE);
  }, [isConnected]);

  return {
    available: isConnected,
    refusal: OFFLINE,
    request: useCallback(
      async (amountKobo: number, employeeId?: string) => {
        guard();
        return advancesApi.request(amountKobo, employeeId);
      },
      [guard],
    ),
    approve: useCallback(
      async (id: string) => {
        guard();
        return advancesApi.approve(id);
      },
      [guard],
    ),
    decline: useCallback(
      async (id: string, reason: string) => {
        guard();
        return advancesApi.decline(id, reason);
      },
      [guard],
    ),
    cancel: useCallback(
      async (id: string) => {
        guard();
        return advancesApi.cancel(id);
      },
      [guard],
    ),
    /**
     * Only once a transfer has actually happened.
     *
     * Never called from a screen as a side effect of approving: a green "paid"
     * against money nobody moved is the failure this product is sold against,
     * and an advance is where it would hurt most — the employee is standing
     * there expecting it.
     */
    markPaid: useCallback(
      async (id: string) => {
        guard();
        return advancesApi.markPaid(id);
      },
      [guard],
    ),
    setPolicy: useCallback(
      async (body: Parameters<typeof advancesApi.setPolicy>[0]) => {
        guard();
        return advancesApi.setPolicy(body);
      },
      [guard],
    ),
  };
}
