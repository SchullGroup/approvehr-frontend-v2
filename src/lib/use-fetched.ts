"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { useRevalidation } from "@/lib/revalidate";

/**
 * A keyed fetch. The shape every read hook in `lib/store/performance.ts` and
 * `lib/store/work-trackers.ts` uses.
 *
 * State is keyed by the request it belongs to, and `loading` is **derived** from
 * whether the stored key still matches. Three things fall out of that: a slow
 * response for a scope you have already switched away from cannot be shown,
 * there is nothing to clear when the key changes, and no `setState` ever runs in
 * an effect body — which is a lint error in this repo and a cascading render
 * everywhere else.
 *
 * `load` **must be stable** — wrap it in `useCallback` at the call site. It is
 * in the effect's dependencies deliberately: a loader that closes over a
 * changing value has to re-run, and hiding it behind a ref is how a stale
 * closure survives a filter change.
 */
export function useFetched<T>(
  key: string,
  active: boolean,
  load: (signal: AbortSignal) => Promise<T>,
): {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
} {
  const [tick, setTick] = useState(0);
  const [fetched, setFetched] = useState<{
    key: string;
    data: T | null;
    error: ApiError | null;
  } | null>(null);
  const latest = useRef(0);
  const full = `${key}|${tick}`;

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!active) return;
    const ticket = latest.current + 1;
    latest.current = ticket;
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const data = await load(controller.signal);
        if (!cancelled && ticket === latest.current) {
          setFetched({ key: full, data, error: null });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        if (!cancelled && ticket === latest.current) {
          setFetched({
            key: full,
            data: null,
            error:
              error instanceof ApiError
                ? error
                : new ApiError(
                    0,
                    "unknown",
                    "Something went wrong. Try again.",
                  ),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [active, full, load, revalidation]);

  const matched = fetched !== null && fetched.key === full;
  return {
    data: matched ? fetched.data : null,
    loading: active && !matched,
    error: matched ? fetched.error : null,
    reload: useCallback(() => setTick((n) => n + 1), []),
  };
}
