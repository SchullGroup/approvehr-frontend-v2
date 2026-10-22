"use client";

import { useCallback, useEffect, useState } from "react";
import { engagementApi, type ApiWeeklyActive } from "@/lib/api/engagement";
import { useRevalidation } from "@/lib/revalidate";
import { useSession } from "@/lib/store/session";

/**
 * One week of team activity, for HR: `GET /engagement/weekly-active`.
 *
 * Same shape as `useMeToday` and for the same reasons: an async IIFE in the
 * effect with a `cancelled` guard, a failure that wins over stale data, and **no
 * demo half**. A weekly-active figure made up from a seeded directory would be a
 * claim about how a real team uses a real app, which is the one number the pilot
 * is judged on, so when nobody is connected this answers `data: null` and not
 * loading, and the card draws nothing.
 *
 * `week` is part of what is asked, so a new week is a new read. The answer for the
 * old week stays on screen until the new one lands (`LoadState`'s `hasData`), so
 * choosing a week does not collapse the card under the control that chose it.
 */

type Fetched = {
  /** Which week this answers, so a stale answer is never shown for a new choice. */
  week: string | undefined;
  data: ApiWeeklyActive | null;
  error: unknown;
};

export type WeeklyActiveRead = {
  data: ApiWeeklyActive | null;
  loading: boolean;
  /** The failure itself, not its sentence. */
  error: unknown;
  reload: () => void;
};

export function useWeeklyActive(
  /** Any `YYYY-MM-DD` in the week wanted. Absent is the current week. */
  week: string | undefined,
  /** Whether to ask at all: the card's own gates, so a plain employee asks nothing. */
  enabled = true,
): WeeklyActiveRead {
  const { isConnected } = useSession();
  const [tick, setTick] = useState(0);
  const [fetched, setFetched] = useState<Fetched | null>(null);

  const revalidation = useRevalidation();
  useEffect(() => {
    if (!isConnected || !enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await engagementApi.weeklyActive(week);
        if (!cancelled) setFetched({ week, data, error: null });
      } catch (caught) {
        if (!cancelled) setFetched({ week, data: null, error: caught });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, enabled, week, tick, revalidation]);

  const reload = useCallback(() => {
    setFetched(null);
    setTick((t) => t + 1);
  }, []);

  /* Not asked for: absent and **not loading**, so a caller that read `loading` as
     "wait" does not spin on a card nobody is going to see. */
  if (!isConnected || !enabled) {
    return { data: null, loading: false, error: null, reload };
  }
  /* What is on hand answers a different week than the one asked for: still
     loading, with the old figures kept for `hasData`, and its failure (if it was
     one) not blamed on the new week. */
  const stale = fetched !== null && fetched.week !== week;
  return {
    data: fetched?.data ?? null,
    loading: fetched === null || stale,
    error: stale ? null : (fetched?.error ?? null),
    reload,
  };
}
