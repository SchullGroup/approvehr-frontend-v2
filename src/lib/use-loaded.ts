"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { useRevalidation } from "@/lib/revalidate";

/**
 * Ask for something when the key changes or the person comes back to the window,
 * and keep the answer keyed by the attempt it belongs to.
 *
 * Moved out of `store/careers-form.ts` when a second store needed it. The shape is
 * unchanged: no `setState` in an effect body, `loading` falling out of "no answer
 * for this attempt yet", so no window in which one thing's answer is shown under
 * another's name.
 */

export type Loaded<T> = {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  /** Ask again. Resolves nothing; the new answer arrives as `data`. */
  reload: () => void;
  /** The attempt the answer in `data` belongs to, or -1 before the first. */
  settled: number;
  /** The attempt a `reload()` made now would be. */
  nextAttempt: () => number;
};

/**
 * Ask for something when the key changes or the person comes back to the window,
 * and keep the answer keyed by the attempt it belongs to.
 */
export function useLoaded<T>(
  key: string,
  enabled: boolean,
  load: (signal: AbortSignal) => Promise<T>,
): Loaded<T> {
  const [attempt, setAttempt] = useState(0);
  const attemptRef = useRef(0);
  const [result, setResult] = useState<{
    key: string;
    attempt: number;
    data: T | null;
    error: ApiError | null;
  } | null>(null);
  const revalidation = useRevalidation();

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const data = await load(controller.signal);
        if (!controller.signal.aborted)
          setResult({ key, attempt, data, error: null });
      } catch (error) {
        if (!controller.signal.aborted)
          setResult({
            key,
            attempt,
            data: null,
            error: error instanceof ApiError ? error : null,
          });
      }
    })();
    return () => controller.abort();
    // `load` is rebuilt every render by its caller; the key is its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, attempt, revalidation]);

  const matched =
    result !== null && result.key === key && result.attempt === attempt;
  const reload = useCallback(() => {
    attemptRef.current += 1;
    setAttempt(attemptRef.current);
  }, []);
  const nextAttempt = useCallback(() => attemptRef.current + 1, []);
  return {
    data: matched ? result.data : null,
    error: matched ? result.error : null,
    loading: enabled && !matched,
    reload,
    settled: matched ? result.attempt : -1,
    nextAttempt,
  };
}
