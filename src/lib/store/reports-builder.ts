"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  reportsApi,
  type ApiDataset,
  type ApiReportDefinition,
  type ApiReportResult,
  type ApiSavedReport,
} from "@/lib/api/reports";
import { useRevalidation } from "@/lib/revalidate";
import { useSession } from "./session";

/**
 * The report builder, connected only.
 *
 * ## No demo mode, and the reason is not laziness
 *
 * A demo report would be a table of seeded figures under a heading somebody
 * chose — which reads exactly like a report about a real company, and is the
 * one artefact in this product where "these are illustrative" is easiest to
 * miss, because the reader built the thing themselves and believes it.
 *
 * The refusal below says so. `/reports` keeps its fixed charts offline, which
 * are labelled where they are rendered.
 */

const OFFLINE =
  "Building a report needs the API. There is no demo version: a report is a " +
  "table somebody built and then trusts, and one filled from seeded figures " +
  "is the hardest place in this product to notice that the numbers are not real.";

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

/** What can be reported on, narrowed to what this caller can read. */
export function useReportCatalogue(): Read<ApiDataset[]> {
  const { isConnected } = useSession();
  const load = useCallback(
    (signal: AbortSignal) => reportsApi.catalogue(signal),
    [],
  );
  return useRead("catalogue", isConnected, load);
}

/** Reports this caller owns, plus the shared ones. */
export function useSavedReports(): Read<ApiSavedReport[]> {
  const { isConnected } = useSession();
  const load = useCallback(
    (signal: AbortSignal) => reportsApi.saved(signal),
    [],
  );
  return useRead("saved", isConnected, load);
}

/**
 * Running a definition.
 *
 * **Explicit, never on a keystroke.** A report can be a read over every person
 * in the company, and a builder that re-ran on every column tick would fire one
 * per click. `run` is called by a button.
 */
export function useReportRun() {
  const { isConnected } = useSession();
  const [result, setResult] = useState<ApiReportResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const run = useCallback(
    async (definition: ApiReportDefinition) => {
      if (!isConnected) {
        setError(new ApiError(0, "offline", OFFLINE));
        return;
      }
      setRunning(true);
      setError(null);
      try {
        setResult(await reportsApi.run(definition));
      } catch (caught) {
        setResult(null);
        setError(
          caught instanceof ApiError
            ? caught
            : new ApiError(0, "unknown", "Something went wrong. Try again."),
        );
      } finally {
        setRunning(false);
      }
    },
    [isConnected],
  );

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return {
    result,
    running,
    error,
    run,
    clear,
    available: isConnected,
    refusal: OFFLINE,
  };
}

export function useReportMutations() {
  const { isConnected } = useSession();
  const guard = useCallback(() => {
    if (!isConnected) throw new ApiError(0, "offline", OFFLINE);
  }, [isConnected]);

  return {
    available: isConnected,
    refusal: OFFLINE,
    save: useCallback(
      async (body: Parameters<typeof reportsApi.save>[0]) => {
        guard();
        return reportsApi.save(body);
      },
      [guard],
    ),
    update: useCallback(
      async (id: string, body: Parameters<typeof reportsApi.update>[1]) => {
        guard();
        return reportsApi.update(id, body);
      },
      [guard],
    ),
    remove: useCallback(
      async (id: string) => {
        guard();
        return reportsApi.remove(id);
      },
      [guard],
    ),
  };
}
