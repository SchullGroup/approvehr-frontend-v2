"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { useRevalidation } from "@/lib/revalidate";
import { columnKeyOf } from "./columns";
import { cleanFilters, filterKey } from "./filters";
import type { MoveResult } from "@/lib/hiring/comms/model";
import type {
  MoveInput,
  PipelineGateway,
  RejectInput,
  RejectResult,
} from "./gateway";
import type { BoardCard, BoardColumn, BoardFilters } from "./model";

/**
 * A role's board: one column per stage, each paged on its own.
 *
 * ## Why this is not a list with a filter on it
 *
 * The board used to ask for the first two hundred people in a role and put them
 * in columns, so a column's count was the length of what had been handed over and
 * a role with a campus drive's worth of applicants showed the oldest two hundred.
 * Now the server draws the columns, each with **its own** count under the filters
 * and its own newest page, and "Load more" fetches that column's next page.
 *
 * ## Moving a card is optimistic, and says so when it was wrong
 *
 * The card leaves its column and lands in the new one at once; the write goes out
 * behind it. If the API refuses — a stage rule, a missing scorecard — the card goes
 * back to the place it was taken from and the caller is handed the API's own
 * sentence to show. Nothing is re-fetched on success: the screen already shows
 * what the API now holds, and a refetch would reorder the column under somebody's
 * hand.
 *
 * ## A refresh is quiet
 *
 * Changing a filter starts a new board; the old cards stay on screen, dimmed,
 * until the new first pages land. `reload()` and a return to the window re-ask for
 * as many cards as each column already shows and swap them in one go.
 */

export const BOARD_PAGE_SIZE = 25;

/** Hard stop on how many pages a quiet refresh will walk for one column. */
const MAX_REFRESH_PAGES = 8;

type ColumnData = {
  cards: BoardCard[];
  total: number | null;
  next: string | null;
};

/** The columns, in the order the server drew them, and what each holds. */
type Loaded = {
  key: string;
  order: BoardColumn[];
  columns: Record<string, ColumnData>;
};

type More = { busy: boolean; error: ApiError | null };

export type ColumnView = {
  column: BoardColumn;
  cards: BoardCard[];
  total: number | null;
  hasMore: boolean;
  loadingMore: boolean;
  moreError: ApiError | null;
};

export type Board = {
  /** The columns the server drew. Empty until the first answer. */
  columns: ColumnView[];
  /** The very first read is on its way: there is nothing to draw yet. */
  loading: boolean;
  /** The first read failed and there is nothing to show. */
  error: ApiError | null;
  /** Cards on screen answer an earlier question: dim them. */
  settling: boolean;
  loadMore: (columnKey: string) => void;
  reload: () => void;
  /**
   * Move a card. Rejects with the API's refusal after putting the card back. The
   * answer says what became of the email the move owed, if it owed one.
   */
  move: (
    card: BoardCard,
    stageId: string,
    input: MoveInput,
  ) => Promise<MoveResult>;
  /** Reject a card, with a reason from the company's list. */
  reject: (card: BoardCard, input: RejectInput) => Promise<RejectResult>;
  /** Change a card where it stands: a tag added, the talent pool switched. */
  patch: (cardId: string, change: (card: BoardCard) => BoardCard) => void;
};

const asApiError = (error: unknown): ApiError | null =>
  error instanceof ApiError ? error : null;

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";

const dedupe = (have: BoardCard[], incoming: BoardCard[]): BoardCard[] => {
  const seen = new Set(have.map((card) => card.id));
  const fresh = incoming.filter((card) => !seen.has(card.id));
  return fresh.length === 0 ? have : [...have, ...fresh];
};

/** One card out of one column and onto the top of another, counts kept honest. */
function relocate(
  columns: Record<string, ColumnData>,
  card: BoardCard,
  fromKey: string | null,
  toKey: string,
  placed: BoardCard,
): Record<string, ColumnData> {
  const next = { ...columns };
  if (fromKey && next[fromKey]) {
    const column = next[fromKey];
    next[fromKey] = {
      ...column,
      cards: column.cards.filter((c) => c.id !== card.id),
      total: column.total === null ? null : Math.max(0, column.total - 1),
    };
  }
  const target = next[toKey];
  if (target) {
    next[toKey] = {
      ...target,
      cards: [placed, ...target.cards.filter((c) => c.id !== card.id)],
      total: target.total === null ? null : target.total + 1,
    };
  }
  return next;
}

export function useBoard({
  gateway,
  requisitionId,
  filters,
  pageSize = BOARD_PAGE_SIZE,
  enabled = true,
}: {
  gateway: PipelineGateway;
  requisitionId: string;
  filters: BoardFilters;
  pageSize?: number;
  enabled?: boolean;
}): Board {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<{
    key: string;
    attempt: number;
    error: ApiError | null;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [more, setMore] = useState<Record<string, More>>({});
  const revalidation = useRevalidation();

  const key = JSON.stringify([
    gateway.mode,
    requisitionId,
    filterKey(filters),
    pageSize,
  ]);

  /* The latest of these, without making them dependencies of the fetch effect.
     Written in an effect, never during render. */
  const latest = useRef({ gateway, filters, pageSize, key });
  const loadedRef = useRef<Loaded | null>(null);
  useEffect(() => {
    latest.current = { gateway, filters, pageSize, key };
  });
  useEffect(() => {
    loadedRef.current = loaded;
  }, [loaded]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let cancelled = false;
    const { gateway: api, filters: asked, pageSize: size } = latest.current;

    void (async () => {
      try {
        const board = await api.board(
          { requisitionId, filters: cleanFilters(asked), limit: size },
          controller.signal,
        );
        const previous =
          loadedRef.current?.key === key ? loadedRef.current : null;

        const entries = await Promise.all(
          board.columns.map(async (column): Promise<[string, ColumnData]> => {
            let cards = column.cards;
            let next = column.next;
            let total: number | null = column.total;
            /* A refresh of a board somebody has already paged down must hand
               back the same span, or the column would snap back to page one. */
            const had = previous?.columns[column.key]?.cards.length ?? 0;
            let walked = 1;
            try {
              while (next && cards.length < had && walked < MAX_REFRESH_PAGES) {
                const page = await api.listCards(
                  {
                    requisitionId,
                    column: column.key,
                    filters: cleanFilters(asked),
                    cursor: next,
                    pageSize: size,
                  },
                  controller.signal,
                );
                cards = dedupe(cards, page.cards);
                next = page.next;
                total = page.total;
                walked += 1;
              }
            } catch (error) {
              if (isAbort(error)) throw error;
              /* A page of the refresh failed: keep the span already on screen. */
              const kept = previous?.columns[column.key];
              if (kept) return [column.key, kept];
            }
            return [column.key, { cards, total, next }];
          }),
        );

        if (cancelled) return;
        setLoaded({
          key,
          order: board.columns.map((column) => ({
            key: column.key,
            label: column.label,
            stageId: column.stageId,
            type: column.type,
            ends: column.ends,
            order: column.order,
          })),
          columns: Object.fromEntries(entries),
        });
        setFailed(null);
        setMore({});
      } catch (error) {
        if (isAbort(error) || cancelled) return;
        setFailed({ key, attempt, error: asApiError(error) });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // `latest` carries the callbacks; the key is the identity of the question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, attempt, revalidation]);

  const loadMore = useCallback(
    (columnKey: string) => {
      const current = loadedRef.current?.columns[columnKey];
      if (!current?.next) return;
      const { gateway: api, filters: asked, pageSize: size } = latest.current;
      const askedKey = latest.current.key;
      const cursor = current.next;

      setMore((prev) =>
        prev[columnKey]?.busy
          ? prev
          : { ...prev, [columnKey]: { busy: true, error: null } },
      );
      void (async () => {
        try {
          const page = await api.listCards(
            {
              requisitionId,
              column: columnKey,
              filters: cleanFilters(asked),
              cursor,
              pageSize: size,
            },
            new AbortController().signal,
          );
          setLoaded((now) =>
            now && now.key === askedKey
              ? {
                  ...now,
                  columns: {
                    ...now.columns,
                    [columnKey]: {
                      cards: dedupe(
                        now.columns[columnKey]?.cards ?? [],
                        page.cards,
                      ),
                      total: page.total,
                      next: page.next,
                    },
                  },
                }
              : now,
          );
          setMore((prev) => ({
            ...prev,
            [columnKey]: { busy: false, error: null },
          }));
        } catch (error) {
          if (isAbort(error)) return;
          setMore((prev) => ({
            ...prev,
            [columnKey]: { busy: false, error: asApiError(error) },
          }));
        }
      })();
    },
    [requisitionId],
  );

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const patch = useCallback(
    (cardId: string, change: (card: BoardCard) => BoardCard) => {
      setLoaded((now) => {
        if (!now) return now;
        const columns: Record<string, ColumnData> = {};
        for (const [id, column] of Object.entries(now.columns)) {
          columns[id] = {
            ...column,
            cards: column.cards.map((card) =>
              card.id === cardId ? change(card) : card,
            ),
          };
        }
        return { ...now, columns };
      });
    },
    [],
  );

  const move = useCallback(
    async (
      card: BoardCard,
      stageId: string,
      input: MoveInput,
    ): Promise<MoveResult> => {
      const { gateway: api } = latest.current;
      const now = loadedRef.current;
      if (!now) return { email: null };
      const to = now.order.find((column) => column.stageId === stageId);
      const fromKey = columnKeyOf(card, now.order);
      if (!to || fromKey === to.key) return { email: null };

      const index =
        (fromKey ? now.columns[fromKey] : undefined)?.cards.findIndex(
          (c) => c.id === card.id,
        ) ?? -1;

      const placed: BoardCard = { ...card, stageId, stageName: to.label };
      setLoaded((current) =>
        current
          ? {
              ...current,
              columns: relocate(current.columns, card, fromKey, to.key, placed),
            }
          : current,
      );

      try {
        return await api.move(card, stageId, input);
      } catch (error) {
        /* Put it back where it was taken from, and take it out of the new place. */
        setLoaded((current) => {
          if (!current) return current;
          const columns = relocate(
            current.columns,
            placed,
            to.key,
            fromKey ?? to.key,
            card,
          );
          if (fromKey && columns[fromKey]) {
            /* `relocate` put it on top; return it to where it stood. */
            const column = columns[fromKey];
            const cards = column.cards.filter((c) => c.id !== card.id);
            cards.splice(
              index === -1 ? 0 : Math.min(index, cards.length),
              0,
              card,
            );
            columns[fromKey] = { ...column, cards };
          }
          return { ...current, columns };
        });
        throw error;
      }
    },
    [],
  );

  const reject = useCallback(
    async (card: BoardCard, input: RejectInput): Promise<RejectResult> => {
      const { gateway: api } = latest.current;
      const result = await api.reject(card, input);
      const now = loadedRef.current;
      const fromKey = now ? columnKeyOf(card, now.order) : null;
      const toKey = now?.order.find(
        (column) => column.ends === "REJECTED",
      )?.key;
      if (toKey) {
        const placed: BoardCard = { ...card, outcome: "REJECTED" };
        setLoaded((current) =>
          current
            ? {
                ...current,
                columns: relocate(
                  current.columns,
                  card,
                  fromKey,
                  toKey,
                  placed,
                ),
              }
            : current,
        );
      }
      return result;
    },
    [],
  );

  const failedHere =
    failed !== null && failed.key === key && failed.attempt === attempt;
  const matched = loaded !== null && loaded.key === key;
  const settling = loaded !== null && loaded.key !== key && !failedHere;

  const columns: ColumnView[] = (loaded?.order ?? []).map((column) => {
    const data = loaded?.columns[column.key];
    const extra = more[column.key];
    return {
      column,
      cards: data?.cards ?? [],
      total: data?.total ?? null,
      hasMore: Boolean(data?.next),
      loadingMore: extra?.busy ?? false,
      moreError: extra?.error ?? null,
    };
  });

  return {
    columns,
    loading: enabled && loaded === null && !failedHere,
    error: failedHere && !matched ? failed.error : null,
    settling,
    loadMore,
    reload,
    move,
    reject,
    patch,
  };
}
