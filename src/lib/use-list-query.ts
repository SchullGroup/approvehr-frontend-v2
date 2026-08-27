"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useDebounced } from "./use-debounced";

/**
 * The state behind a filtered, sorted, paged table — held in one place so no
 * screen has to remember the two things that are easy to get wrong.
 *
 * ## Why this is a hook and not five `useState` calls per screen
 *
 * **Changing a filter must reset the page.** Somebody on page 7 of the
 * directory who then picks a department has, in almost every case, asked for a
 * list with fewer than seven pages in it. Sending `page=7` with the new filter
 * returns an empty page, and the screen then says "no matches" about a filter
 * that matched forty people. Every mutator here except `setPage` returns to page
 * one, because there is no filter change for which keeping the page is right.
 *
 * **The search box is debounced, the rest is not.** Typing sends one request per
 * pause; picking from a select sends one request. Both arrive in the same
 * `params` object, so the caller has a single dependency to hand its fetch.
 *
 * ## What it deliberately does not do
 *
 * It does not fetch, and it holds no rows and no total. Those belong to the
 * store hook, which owns the abort guard — see `lib/store/shifts.ts` for the
 * shape every store in this app follows. This is only the query.
 *
 * It also does not put anything in the URL. That is a real want — a colleague
 * should be able to be sent "the eleven people missing a pension PIN" — and it
 * is deliberately not here yet: `useSearchParams` forces every caller into a
 * Suspense boundary, which is a change to thirty page shells rather than to this
 * file. Recorded rather than done.
 */

export type SortOrder = "asc" | "desc";

/** What a list endpoint is sent. Matches `listQuery` in the API's `lib/http.ts`. */
export type ListParams<Filters> = Filters & {
  page: number;
  pageSize: number;
  q?: string;
  sort?: string;
  order: SortOrder;
};

export type ListQueryState<Filters extends Record<string, unknown>> = {
  /** Send these to the API. Debounced search, filters, sort and page. */
  params: ListParams<Filters>;
  /** What is in the search box right now, undebounced — bind the input to this. */
  search: string;
  setSearch: (value: string) => void;
  /** True while the box holds something the server has not been asked about. */
  searchPending: boolean;
  filters: Filters;
  /** Sets one filter and returns to page one. */
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  /** Clears the search and every filter. Sort and page size are kept. */
  clearFilters: () => void;
  sort: string | undefined;
  order: SortOrder;
  /**
   * Sorts by a column. The same column again flips the direction; a new column
   * starts ascending, unless the caller says otherwise — nobody wants a date
   * column oldest-first.
   */
  toggleSort: (column: string, startDescending?: boolean) => void;
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  /** How many filters — the search counts as one — are narrowing the list. */
  activeCount: number;
};

export function useListQuery<Filters extends Record<string, unknown>>({
  filters: initialFilters,
  sort: initialSort,
  order: initialOrder = "asc",
  pageSize: initialPageSize = 25,
  search: initialSearch = "",
  searchDelay = 250,
}: {
  /** The empty state of every filter this table offers. */
  filters: Filters;
  sort?: string;
  order?: SortOrder;
  pageSize?: number;
  /** Seeds the box — a `?q=` a caller arrived with, most often. */
  search?: string;
  searchDelay?: number;
}): ListQueryState<Filters> {
  /* The empty shape, captured once. Callers pass an inline literal, so it is a
     new object on every render and cannot be a dependency — but the shape never
     changes, only the values, and `clearFilters` needs the shape. */
  const empty = useRef(initialFilters);

  const [search, setSearchRaw] = useState(initialSearch);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [sorting, setSorting] = useState<{
    sort: string | undefined;
    order: SortOrder;
  }>({ sort: initialSort, order: initialOrder });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(initialPageSize);

  const debouncedSearch = useDebounced(search.trim(), searchDelay);

  const setSearch = useCallback((value: string) => {
    setSearchRaw(value);
    setPage(1);
  }, []);

  const setFilter = useCallback(
    <K extends keyof Filters>(key: K, value: Filters[K]) => {
      setFilters((was) => ({ ...was, [key]: value }));
      setPage(1);
    },
    [],
  );

  const clearFilters = useCallback(() => {
    setFilters(empty.current);
    setSearchRaw("");
    setPage(1);
  }, []);

  const toggleSort = useCallback(
    (column: string, startDescending = false) => {
      setSorting((was) => ({
        sort: column,
        order:
          was.sort === column
            ? was.order === "asc"
              ? "desc"
              : "asc"
            : startDescending
              ? "desc"
              : "asc",
      }));
      setPage(1);
    },
    [],
  );

  const setPageSize = useCallback((size: number) => {
    setPageSizeRaw(size);
    setPage(1);
  }, []);

  const params = useMemo(
    () =>
      ({
        ...filters,
        page,
        pageSize,
        ...(debouncedSearch ? { q: debouncedSearch } : {}),
        ...(sorting.sort ? { sort: sorting.sort } : {}),
        order: sorting.order,
      }) as ListParams<Filters>,
    [filters, page, pageSize, debouncedSearch, sorting],
  );

  const activeCount = useMemo(
    () =>
      (debouncedSearch ? 1 : 0) +
      Object.values(filters).filter(
        (value) =>
          value !== undefined &&
          value !== null &&
          value !== "" &&
          value !== false,
      ).length,
    [filters, debouncedSearch],
  );

  return {
    params,
    search,
    setSearch,
    searchPending: search.trim() !== debouncedSearch,
    filters,
    setFilter,
    clearFilters,
    sort: sorting.sort,
    order: sorting.order,
    toggleSort,
    page,
    setPage,
    pageSize,
    setPageSize,
    activeCount,
  };
}
