"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  meApi,
  todayEndpointMissing,
  type ApiToday,
  type TodaySectionName,
} from "@/lib/api/me";
import { useRevalidation } from "@/lib/revalidate";
import { useSession } from "@/lib/store/session";

/**
 * The Today panel's data: `GET /me/today`, and the one-section refresh.
 *
 * Shaped like `useDashboard` (`lib/store/insights.ts`): the fetch runs in an async
 * IIFE inside the effect, so its `setState` is provably after an await, and a
 * stale answer cannot overwrite a newer one (see the guard below for how, and why
 * it is not quite that store's `cancelled` flag).
 *
 * ## There is no demo half, and that is the point
 *
 * Every figure on this panel is the caller's own and comes from the server: a pay
 * date, a leave balance, whether yesterday's clock-in was ever closed. A demo
 * version would be invented facts about a person on a screen labelled "today", so
 * when nobody is connected this answers `data: null` and **not loading**, and the
 * widget draws nothing. A caller that read `loading` as "wait" would otherwise
 * spin for ever in a build with no API.
 *
 * ## Refreshing one section
 *
 * After the person acts on a card (reads a notice) the panel asks for that
 * section alone, `?sections=announcements`, and merges it over what it holds. The
 * spec's polling budget is a whole-panel read no more than once a minute, which is
 * what `useRevalidation` already enforces, and a single section after an action.
 * A failed section refresh leaves what is on screen alone and says so through its
 * return value: the full read is the one that corrects it.
 *
 * ## A failure wins over stale data
 *
 * Same rule as every store here (see `loadPhase`): a panel that kept its numbers
 * after a failed re-read would be asserting something nobody can vouch for.
 */

type Fetched = { data: ApiToday | null; error: unknown };

/** The spec's polling budget for the whole panel: once a minute, at most. */
const MIN_REREAD_MS = 60_000;

export type MeToday = {
  /** Null until the first answer, when there is nobody connected, and after a failure. */
  data: ApiToday | null;
  loading: boolean;
  /** The failure itself, not its sentence: `LoadFailure` picks its advice from the class. */
  error: unknown;
  /** Read the whole panel again, behind a skeleton. */
  reload: () => void;
  /**
   * Ask for some sections and merge them over what is held.
   *
   * Resolves `true` when the answer landed and `false` when it did not, so the
   * caller can say "still could not load" instead of a button that did nothing.
   */
  refresh: (names: readonly TodaySectionName[]) => Promise<boolean>;
  /**
   * The person has opened this notice and the server has recorded it.
   *
   * Moves it to read and takes one off the unread count at once, so the row does
   * not sit there for the length of a second request. The section refresh that
   * follows is what makes the count exact, since a sixth unread notice may now
   * belong in the five.
   */
  markNoticeRead: (id: string, readAt: string) => void;
};

export function useMeToday(): MeToday {
  const { isConnected } = useSession();
  const [tick, setTick] = useState(0);
  const [fetched, setFetched] = useState<Fetched | null>(null);

  /* Re-ask when somebody comes back to the window, but no more than once a
     minute: the API's polling guidance for this endpoint, which holds pay figures
     and is the heaviest read on the screen (about twenty queries). Not in any key,
     so the answer replaces the old one without a skeleton flashing over it. */
  const revalidation = useRevalidation();
  const alive = useRef(true);
  const newest = useRef(0);
  const lastRead = useRef<{ tick: number; at: number } | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isConnected) return;
    /* A monotonic clock: elapsed time here is not a date and must not move with
       one. */
    const now = performance.now();
    const held = lastRead.current;
    /* The first read and an explicit reload (a new `tick`) always go; a return to
       the window inside the minute does not. */
    if (held !== null && held.tick === tick && now - held.at < MIN_REREAD_MS) {
      return;
    }
    lastRead.current = { tick, at: now };
    const mine = ++newest.current;
    /* Not a `cancelled` flag closed over by the cleanup, as `useDashboard` has:
       a run that is skipped above would leave the cleanup of the run before it
       having thrown away an answer nobody replaced, and in strict mode every
       effect runs twice. An answer is dropped only if a newer read began or the
       screen is gone. */
    void (async () => {
      try {
        const data = await meApi.today();
        if (alive.current && newest.current === mine) {
          setFetched({ data, error: null });
        }
      } catch (caught) {
        /* An API that does not have the route is not a failure to announce: the
           panel has nothing to say and draws nothing. See `todayEndpointMissing`. */
        if (alive.current && newest.current === mine) {
          setFetched({
            data: null,
            error: todayEndpointMissing(caught) ? null : caught,
          });
        }
      }
    })();
  }, [isConnected, tick, revalidation]);

  const reload = useCallback(() => {
    setFetched(null);
    setTick((t) => t + 1);
  }, []);

  const refresh = useCallback(
    async (names: readonly TodaySectionName[]): Promise<boolean> => {
      try {
        const next = await meApi.today(names);
        setFetched((held) =>
          held?.data
            ? {
                data: {
                  asOf: next.asOf,
                  sections: { ...held.data.sections, ...next.sections },
                },
                error: null,
              }
            : held,
        );
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const markNoticeRead = useCallback((id: string, readAt: string) => {
    setFetched((held) => {
      const section = held?.data?.sections.announcements;
      if (!held?.data || section?.status !== "ok") return held;
      const target = section.data.notices.find((notice) => notice.id === id);
      if (!target || target.read) return held;
      return {
        ...held,
        data: {
          ...held.data,
          sections: {
            ...held.data.sections,
            announcements: {
              status: "ok",
              data: {
                ...section.data,
                notices: section.data.notices.map((notice) =>
                  notice.id === id ? { ...notice, read: true, readAt } : notice,
                ),
                unread: Math.max(section.data.unread - 1, 0),
              },
            },
          },
        },
      };
    });
  }, []);

  if (!isConnected) {
    return {
      data: null,
      loading: false,
      error: null,
      reload,
      refresh,
      markNoticeRead,
    };
  }
  return {
    data: fetched?.data ?? null,
    loading: fetched === null,
    error: fetched?.error ?? null,
    reload,
    refresh,
    markNoticeRead,
  };
}
