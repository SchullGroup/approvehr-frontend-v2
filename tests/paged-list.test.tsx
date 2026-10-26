import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import {
  pageLocally,
  usePagedList,
  type PageResult,
} from "@/lib/store/paged-list";

/**
 * The list that grows a page at a time.
 *
 * What these protect is what the first-hundred limit got wrong: a filter that
 * changes must start a new list and must never show the old rows beside the new
 * query's failure; "load more" must append without repeating anybody; and a
 * refresh must hand back the span somebody has already scrolled through, or the
 * screen snaps back to page one under them.
 */

type Row = { id: string };

const rows = (from: number, to: number): Row[] =>
  Array.from({ length: to - from }, (_, i) => ({ id: `r${from + i}` }));

/** A fake server holding `count` rows, newest first, `size` to a page. */
function server(count: number, size: number) {
  const all = rows(0, count);
  const calls: (string | null)[] = [];
  const fetchPage = vi.fn(
    async (cursor: string | null): Promise<PageResult<Row>> => {
      calls.push(cursor);
      return pageLocally(all, cursor, size);
    },
  );
  return { fetchPage, calls };
}

const idOf = (row: Row) => row.id;

describe("the first page", () => {
  it("reports loading, then the rows, the server's total and that there is more", async () => {
    const { fetchPage } = server(250, 100);
    const { result } = renderHook(() =>
      usePagedList({ key: "a", fetchPage, idOf }),
    );

    expect(result.current.loading).toBe(true);
    expect(result.current.rows).toEqual([]);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows).toHaveLength(100);
    /* The total is the server's 250, not the 100 in hand. */
    expect(result.current.total).toBe(250);
    expect(result.current.hasMore).toBe(true);
  });

  it("says there is no more when the list fits one page", async () => {
    const { fetchPage } = server(3, 100);
    const { result } = renderHook(() =>
      usePagedList({ key: "a", fetchPage, idOf }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows).toHaveLength(3);
    expect(result.current.hasMore).toBe(false);
  });

  it("stays idle, with nothing loading, when disabled", () => {
    const { fetchPage } = server(5, 100);
    const { result } = renderHook(() =>
      usePagedList({ key: "a", enabled: false, fetchPage, idOf }),
    );
    expect(result.current.loading).toBe(false);
    expect(fetchPage).not.toHaveBeenCalled();
  });
});

describe("load more", () => {
  it("appends the next page without repeating anybody, until the list ends", async () => {
    const { fetchPage, calls } = server(250, 100);
    const { result } = renderHook(() =>
      usePagedList({ key: "a", fetchPage, idOf }),
    );
    await waitFor(() => expect(result.current.rows).toHaveLength(100));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.rows).toHaveLength(200));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.rows).toHaveLength(250));

    expect(result.current.hasMore).toBe(false);
    expect(new Set(result.current.rows.map(idOf)).size).toBe(250);
    expect(calls).toEqual([null, "100", "200"]);
  });

  it("drops a row the next page repeats, because a newest-first list shifts as it is read", async () => {
    const pages: Record<string, PageResult<Row>> = {
      first: { rows: rows(0, 3), total: 5, next: "c1" },
      c1: { rows: [...rows(2, 3), ...rows(3, 5)], total: 5, next: null },
    };
    const fetchPage = vi.fn(async (cursor: string | null) =>
      cursor === null ? pages["first"]! : pages["c1"]!,
    );
    const { result } = renderHook(() =>
      usePagedList({ key: "a", fetchPage, idOf }),
    );
    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.rows).toHaveLength(5));
    expect(result.current.rows.map(idOf)).toEqual([
      "r0",
      "r1",
      "r2",
      "r3",
      "r4",
    ]);
  });

  it("ignores a second press while one is in flight", async () => {
    let release: (() => void) | undefined;
    const fetchPage = vi.fn(async (cursor: string | null) => {
      if (cursor === null) return { rows: rows(0, 2), total: 4, next: "2" };
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { rows: rows(2, 4), total: 4, next: null };
    });
    const { result } = renderHook(() =>
      usePagedList({ key: "a", fetchPage, idOf }),
    );
    await waitFor(() => expect(result.current.rows).toHaveLength(2));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.loadingMore).toBe(true));
    act(() => result.current.loadMore());
    expect(fetchPage).toHaveBeenCalledTimes(2);

    await act(async () => release?.());
    await waitFor(() => expect(result.current.rows).toHaveLength(4));
    expect(result.current.loadingMore).toBe(false);
  });

  it("keeps the rows already shown when the next page fails, and can try again", async () => {
    let fail = true;
    const all = rows(0, 4);
    const fetchPage = vi.fn(async (cursor: string | null) => {
      if (cursor !== null && fail) {
        throw new ApiError(500, "server_error", "Something went wrong.");
      }
      return pageLocally(all, cursor, 2);
    });
    const { result } = renderHook(() =>
      usePagedList({ key: "a", fetchPage, idOf }),
    );
    await waitFor(() => expect(result.current.rows).toHaveLength(2));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.moreError).not.toBeNull());
    expect(result.current.rows).toHaveLength(2);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.error).toBeNull();

    fail = false;
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.rows).toHaveLength(4));
    expect(result.current.moreError).toBeNull();
  });
});

describe("changing the filter", () => {
  it("starts a new list, showing the old rows as settling until the new first page lands", async () => {
    const answers = new Map<string, Row[]>([
      ["all", rows(0, 3)],
      ["waiting", rows(10, 12)],
    ]);
    let release: (() => void) | undefined;
    const makeFetch = (which: string) =>
      vi.fn(async (): Promise<PageResult<Row>> => {
        if (which === "waiting") {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        const found = answers.get(which)!;
        return { rows: found, total: found.length, next: null };
      });

    const { result, rerender } = renderHook(
      ({ which }) =>
        usePagedList({ key: which, fetchPage: makeFetch(which), idOf }),
      { initialProps: { which: "all" } },
    );
    await waitFor(() => expect(result.current.rows).toHaveLength(3));

    rerender({ which: "waiting" });
    /* No skeleton, no collapse: the old rows stay while the new answer is
       asked for, and the screen is told they are not the answer. */
    expect(result.current.loading).toBe(false);
    expect(result.current.settling).toBe(true);
    expect(result.current.rows).toHaveLength(3);
    expect(result.current.total).toBeNull();

    await act(async () => release?.());
    await waitFor(() => expect(result.current.settling).toBe(false));
    expect(result.current.rows.map(idOf)).toEqual(["r10", "r11"]);
    expect(result.current.total).toBe(2);
  });

  it("throws away a slow answer to a query that has since been replaced", async () => {
    const releases: Record<string, () => void> = {};
    const fetchFor = (which: string) =>
      vi.fn(async (): Promise<PageResult<Row>> => {
        await new Promise<void>((resolve) => {
          releases[which] = resolve;
        });
        return { rows: [{ id: which }], total: 1, next: null };
      });
    const fetches = { old: fetchFor("old"), fresh: fetchFor("fresh") };

    const { result, rerender } = renderHook(
      ({ which }: { which: "old" | "fresh" }) =>
        usePagedList({ key: which, fetchPage: fetches[which], idOf }),
      { initialProps: { which: "old" as "old" | "fresh" } },
    );
    rerender({ which: "fresh" });

    await act(async () => releases["fresh"]?.());
    await waitFor(() => expect(result.current.rows).toEqual([{ id: "fresh" }]));

    /* The abandoned request answers late and must not overwrite the new list. */
    await act(async () => releases["old"]?.());
    expect(result.current.rows).toEqual([{ id: "fresh" }]);
  });

  it("never shows the previous query's rows beside the new query's failure", async () => {
    const fetchPage = vi.fn(async (): Promise<PageResult<Row>> => {
      throw new ApiError(500, "server_error", "Something went wrong.");
    });
    const ok = vi.fn(async () => ({ rows: rows(0, 2), total: 2, next: null }));

    const { result, rerender } = renderHook(
      ({ good }: { good: boolean }) =>
        usePagedList({
          key: good ? "good" : "bad",
          fetchPage: good ? ok : fetchPage,
          idOf,
        }),
      { initialProps: { good: true } },
    );
    await waitFor(() => expect(result.current.rows).toHaveLength(2));

    rerender({ good: false });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.rows).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});

describe("a failed first page", () => {
  it("reports the error with no rows, and Try again clears it into a loading state", async () => {
    let broken = true;
    const fetchPage = vi.fn(async (): Promise<PageResult<Row>> => {
      if (broken) throw new ApiError(0, "network_error", "Offline.");
      return { rows: rows(0, 2), total: 2, next: null };
    });
    const { result } = renderHook(() =>
      usePagedList({ key: "a", fetchPage, idOf }),
    );
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.loading).toBe(false);
    expect(result.current.rows).toEqual([]);

    broken = false;
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.error).toBeNull();
  });
});

describe("a quiet refresh", () => {
  it("asks again for as many rows as are on screen, not just the first page", async () => {
    const { fetchPage, calls } = server(250, 100);
    const { result } = renderHook(() =>
      usePagedList({ key: "a", fetchPage, idOf }),
    );
    await waitFor(() => expect(result.current.rows).toHaveLength(100));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.rows).toHaveLength(200));

    calls.length = 0;
    act(() => result.current.reload());
    await waitFor(() => expect(calls).toEqual([null, "100"]));

    /* Never collapsed back to one page, and never blanked while it asked. */
    expect(result.current.rows.length).toBeGreaterThanOrEqual(200);
    expect(result.current.loading).toBe(false);
    expect(result.current.hasMore).toBe(true);
  });

  it("keeps what is on screen when the refresh itself fails", async () => {
    let broken = false;
    const fetchPage = vi.fn(async (): Promise<PageResult<Row>> => {
      if (broken) throw new ApiError(500, "server_error", "Boom.");
      return { rows: rows(0, 2), total: 2, next: null };
    });
    const { result } = renderHook(() =>
      usePagedList({ key: "a", fetchPage, idOf }),
    );
    await waitFor(() => expect(result.current.rows).toHaveLength(2));

    broken = true;
    act(() => result.current.reload());
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2));
    expect(result.current.rows).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });
});

describe("a row that left the list", () => {
  it("removing one takes it out and the server's total down with it", async () => {
    const { fetchPage } = server(5, 100);
    const { result } = renderHook(() =>
      usePagedList({ key: "a", fetchPage, idOf }),
    );
    await waitFor(() => expect(result.current.rows).toHaveLength(5));

    act(() => result.current.remove("r1"));
    expect(result.current.rows.map(idOf)).toEqual(["r0", "r2", "r3", "r4"]);
    expect(result.current.total).toBe(4);
  });
});

describe("paging a list that is already in memory", () => {
  it("answers in the shape the API does, so demo mode has one code path", () => {
    const all = rows(0, 5);
    expect(pageLocally(all, null, 2)).toEqual({
      rows: rows(0, 2),
      total: 5,
      next: "2",
    });
    expect(pageLocally(all, "4", 2)).toEqual({
      rows: rows(4, 5),
      total: 5,
      next: null,
    });
    expect(pageLocally([], null, 2)).toEqual({
      rows: [],
      total: 0,
      next: null,
    });
  });
});
