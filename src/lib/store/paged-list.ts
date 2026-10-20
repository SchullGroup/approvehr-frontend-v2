"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { useRevalidation } from "@/lib/revalidate";

/**
 * A list that grows one page at a time, newest first, under a server-side filter.
 *
 * ## Why this exists
 *
 * The applications queue asked for one page of 100 and the requisition board for
 * one page of 200, then filtered and counted what it had been handed. A company
 * with a campus drive saw the newest hundred and no way to reach the rest, and a
 * search box that only searched those hundred — a name from page two was
 * "not found" by a screen that had never looked.
 *
 * So: the server filters, the server counts, and this hook keeps the rows it has
 * been given and asks for more when somebody says so.
 *
 * ## One hook, three rules
 *
 * 1. **A change of filter is a new list.** Pass `key` (a string that changes
 *    exactly when the query does) and the hook starts over. The rows from the
 *    previous query stay in `rows` while the new first page is in flight, with
 *    `settling` true, so a screen can dim them rather than collapse to a skeleton
 *    and jump. Only the very first load has no rows to show.
 *
 * 2. **Loading more appends; it never replaces.** The cursor the API hands back
 *    is opaque. Rows are de-duplicated by id because a newest-first list gains
 *    rows at the top while somebody reads it, and an offset would repeat one.
 *
 * 3. **A refresh is quiet.** `reload()` and the window-focus revalidation re-ask
 *    for as many rows as are already on screen — walking the cursors — and swap
 *    the whole set in one go. No skeleton, no scroll jump, no row vanishing and
 *    reappearing. A refresh that fails keeps what is on screen: stale rows with no
 *    error are better than an empty card with one, and the next focus asks again.
 *
 * ## No `setState` in an effect body
 *
 * Same shape as `useCareersAnalytics`: the effect only starts an async function
 * whose `setState` comes after an `await`, and `loading` falls out of "no result
 * for this key yet" rather than being tracked as a flag that has to be reset.
 */

/** What one request for a page answers. */
export type PageResult<T> = {
  rows: T[];
  /** The server's count under this filter. `null` when it did not say. */
  total: number | null;
  /** Opaque. `null` when there is nothing more. */
  next: string | null;
};

export type PagedListOptions<T> = {
  /** Changes exactly when the query does. A change starts a new list. */
  key: string;
  /** False holds the hook idle — a signed-out session, a missing id. */
  enabled?: boolean;
  /** One page. `cursor` is `null` for the first. */
  fetchPage: (
    cursor: string | null,
    signal: AbortSignal,
  ) => Promise<PageResult<T>>;
  idOf: (row: T) => string;
  /** Hard stop on how many pages a refresh will walk. Default 20. */
  maxRefreshPages?: number;
};

type Loaded<T> = {
  key: string;
  rows: T[];
  total: number | null;
  next: string | null;
};

type Failed = { key: string; attempt: number; error: ApiError | null };

export type PagedList<T> = {
  /** The rows for the current query, or — while it settles — the previous one's. */
  rows: T[];
  /** The server's count under the current filter, or `null` while unknown. */
  total: number | null;
  /** First load only: there is nothing to show yet. */
  loading: boolean;
  /** A new query is in flight and `rows` still belong to the old one. */
  settling: boolean;
  /** The first page failed and there is nothing to show. */
  error: ApiError | null;
  hasMore: boolean;
  loadingMore: boolean;
  /** The last "load more" failed. The rows already shown are untouched. */
  moreError: ApiError | null;
  loadMore: () => void;
  /** A quiet refresh: same rows, newest data, no skeleton. */
  reload: () => void;
  /** Drop a row now (an applicant just screened out of this filter). */
  remove: (id: string) => void;
  /** Swap a row in place. */
  replace: (id: string, next: unknown) => void;
};

const asApiError = (error: unknown): ApiError | null =>
  error instanceof ApiError ? error : null;

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";

export function usePagedList<T>(options: PagedListOptions<T>): PagedList<T> {
  const { key, enabled = true, idOf, maxRefreshPages = 20 } = options;

  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);
  const [failed, setFailed] = useState<Failed | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [more, setMore] = useState<{
    key: string;
    busy: boolean;
    error: ApiError | null;
  } | null>(null);

  /* The latest of these, without making them dependencies of the fetch effect.
     A parent that builds `fetchPage` inline would otherwise restart the request
     on every render. Written in an effect, not during render. */
  const fetchRef = useRef(options.fetchPage);
  const idRef = useRef(idOf);
  const countRef = useRef({ key: "", rows: 0 });
  const busyMoreRef = useRef(false);
  useEffect(() => {
    fetchRef.current = options.fetchPage;
    idRef.current = idOf;
  });
  useEffect(() => {
    countRef.current = {
      key: loaded?.key ?? "",
      rows: loaded?.rows.length ?? 0,
    };
  }, [loaded]);

  const revalidation = useRevalidation();

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const first = await fetchRef.current(null, controller.signal);
        let rows = first.rows;
        let next = first.next;
        let total = first.total;

        /* A refresh of a list somebody has already paged down must hand back
           the same span, or the screen would snap back to page one under them. */
        const had = countRef.current.key === key ? countRef.current.rows : 0;
        let walked = 1;
        while (next && rows.length < had && walked < maxRefreshPages) {
          const page = await fetchRef.current(next, controller.signal);
          rows = dedupe(rows, page.rows, idRef.current);
          next = page.next;
          total = page.total ?? total;
          walked += 1;
        }

        if (cancelled) return;
        setLoaded({ key, rows, total, next });
        setFailed(null);
        setMore((current) => (current && current.key === key ? null : current));
      } catch (error) {
        if (isAbort(error) || cancelled) return;
        setFailed({ key, attempt, error: asApiError(error) });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, key, attempt, revalidation, maxRefreshPages]);

  const loadMore = useCallback(() => {
    const current = loaded;
    if (!current || current.key !== key || !current.next) return;
    if (busyMoreRef.current) return;
    busyMoreRef.current = true;
    const cursor = current.next;
    setMore({ key, busy: true, error: null });

    void (async () => {
      try {
        const page = await fetchRef.current(
          cursor,
          new AbortController().signal,
        );
        setLoaded((now) =>
          now && now.key === key
            ? {
                key,
                rows: dedupe(now.rows, page.rows, idRef.current),
                total: page.total ?? now.total,
                next: page.next,
              }
            : now,
        );
        setMore({ key, busy: false, error: null });
      } catch (error) {
        if (isAbort(error)) return;
        setMore({ key, busy: false, error: asApiError(error) });
      } finally {
        busyMoreRef.current = false;
      }
    })();
  }, [loaded, key]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const remove = useCallback((id: string) => {
    setLoaded((now) => {
      if (!now) return now;
      const rows = now.rows.filter((row) => idRef.current(row) !== id);
      if (rows.length === now.rows.length) return now;
      return {
        ...now,
        rows,
        total: now.total === null ? null : Math.max(0, now.total - 1),
      };
    });
  }, []);

  const replace = useCallback((id: string, next: unknown) => {
    setLoaded((now) =>
      now
        ? {
            ...now,
            rows: now.rows.map((row) =>
              idRef.current(row) === id ? (next as T) : row,
            ),
          }
        : now,
    );
  }, []);

  if (!enabled) {
    return {
      rows: [],
      total: null,
      loading: false,
      settling: false,
      error: null,
      hasMore: false,
      loadingMore: false,
      moreError: null,
      loadMore,
      reload,
      remove,
      replace,
    };
  }

  const matched = loaded !== null && loaded.key === key;
  /* Tied to the attempt as well, so pressing "Try again" clears the failure at
     once and the screen shows that it is trying. */
  const failedHere =
    failed !== null && failed.key === key && failed.attempt === attempt;
  const moreHere = more !== null && more.key === key ? more : null;

  return {
    /* Rows of a *different* query are shown while the new one settles, but never
       beside that query's own failure: they would read as its answer. */
    rows: loaded && (matched || !failedHere) ? loaded.rows : [],
    total: matched ? loaded.total : null,
    loading: !matched && !failedHere && loaded === null,
    settling: !matched && !failedHere && loaded !== null,
    /* A refresh that failed while rows are already on screen is not an error
       the reader can act on; the first load failing is. */
    error: failedHere && !matched ? failed.error : null,
    hasMore: matched && loaded.next !== null,
    loadingMore: moreHere?.busy ?? false,
    moreError: moreHere?.error ?? null,
    loadMore,
    reload,
    remove,
    replace,
  };
}

function dedupe<T>(have: T[], incoming: T[], idOf: (row: T) => string): T[] {
  const seen = new Set(have.map(idOf));
  const fresh = incoming.filter((row) => !seen.has(idOf(row)));
  return fresh.length === 0 ? have : [...have, ...fresh];
}

/* ------------------------------------------------------------ local paging */

/**
 * Page a list that is already in memory the way the API pages one.
 *
 * Demo mode has no server, so the demo answers the same question with the same
 * shape: an opaque cursor (here an offset written as a string), a total, and
 * `null` when it runs out. A screen therefore has one code path — it cannot
 * quietly behave differently offline, which is how the first-hundred limit
 * stayed invisible in every demo.
 */
export function pageLocally<T>(
  all: T[],
  cursor: string | null,
  size: number,
): PageResult<T> {
  const start =
    cursor === null ? 0 : Math.max(0, Number.parseInt(cursor, 10) || 0);
  const end = start + size;
  return {
    rows: all.slice(start, end),
    total: all.length,
    next: end < all.length ? String(end) : null,
  };
}
