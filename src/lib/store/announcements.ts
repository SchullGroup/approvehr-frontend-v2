"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  announcementsApi,
  type AnnouncementListParams,
  type ApiAnnouncement,
  type ApiReader,
  type ApiReadersMeta,
  type CreateAnnouncementBody,
  type ReaderState,
  type UpdateAnnouncementBody,
} from "@/lib/api/announcements";
import { DEMO_ANNOUNCEMENTS } from "@/lib/mock/announcements";
import { useSession } from "./session";
import { useCan } from "@/lib/permissions";
import { useRevalidation } from "@/lib/revalidate";

/**
 * The company noticeboard, in both modes.
 *
 * Structurally this is `lib/store/shifts.ts`: the demo value is a `useMemo` that
 * never touches state, the fetch is an async IIFE inside the effect behind a
 * `cancelled` guard, and staleness is decided by comparing a key **during
 * render** rather than by clearing state in an effect. Any other arrangement is
 * a setState in an effect, which the lint rule catches and which produces a
 * render nobody can see.
 *
 * ## Demo mode reads and refuses to write, and that is the decision
 *
 * `lib/store/knowledge.ts` refuses to publish an article offline because
 * publishing is the company telling its staff what the rules are, and an article
 * written into one browser reaches nobody. A notice is the same act with a
 * shorter shelf life, so it gets the same answer.
 *
 * The rows are still seeded — see the header of `lib/mock/announcements.ts`.
 * This is the one feature the incumbent's dashboard has that we had nothing for,
 * and an empty panel in a room with no database demonstrates the gap rather than
 * closing it. So: a real board to look at, and one plain sentence when somebody
 * tries to change it.
 *
 * `shifts.ts` argues the opposite for the rota and is right, because nothing
 * else reads the rota. A notice's whole point is that other people read it.
 *
 * ## Nothing here polls
 *
 * A noticeboard is not a feed. Load on mount, reload after a write, and nowhere
 * else — an interval would re-fetch two hundred notices to redraw the same three.
 */

/* ------------------------------------------------------------------ refusal */

/** One shape for every demo refusal, so they cannot drift apart. */
function refuse(message: string): never {
  throw new ApiError(0, "offline", message);
}

const WRITE_REFUSAL =
  "Posting a notice is the company speaking to its staff. That needs the API: " +
  "a notice written into this browser would reach nobody.";

/* ------------------------------------------------------------------ reading */

export type AnnouncementSource = "api" | "demo";

export type AnnouncementsState = {
  announcements: ApiAnnouncement[];
  /** Across every page, so the screen can say it is showing a slice. */
  total: number;
  loading: boolean;
  error: ApiError | null;
  source: AnnouncementSource;
  /** False in demo mode: the board is read-only. */
  editable: boolean;
  reload: () => void;
};

const NONE: ApiAnnouncement[] = [];

/**
 * The management list, drafts included.
 *
 * **The `MANAGE_SETTINGS` gate is here, not on the screen.** This comment used
 * to say the opposite — "gate the screen with `useCan`" — and the screen did
 * hold a `canManage` boolean and did use it to hide the write controls, and
 * still called this hook unconditionally. A hook cannot be called
 * conditionally, so a screen-level check never stops the request; the only
 * place that can is the effect itself. `useBankAccounts` in `store/payments.ts`
 * was fixed the same way for the same reason.
 *
 * The refusal it produced was not merely noisy. `GET /announcements` answers
 * `403 You need the following to do that: MANAGE_SETTINGS.` and the screen
 * rendered it through `LoadFailure` as "The noticeboard did not load" — a
 * failure that had not happened — over a raw permission constant, above three
 * `Stat`s reading 0 for a board that had two live notices, above an empty
 * state asserting "Nothing on the noticeboard yet". Four wrong claims, to an
 * Employee, on a company noticeboard.
 *
 * Absent, not zero, and not an error: no permission means no request, no rows
 * and **no `error`**, so nothing downstream can render a refusal as a failure.
 * Staff read notices on `/dashboard` through `GET /announcements/board`, which
 * is deliberately open to everybody — see `modules/announcements/router.ts`.
 */
export function useAnnouncements(
  params: AnnouncementListParams = {},
): AnnouncementsState {
  const { isConnected } = useSession();
  /* Read off the router, not guessed: `GET /announcements` is
     `requirePermissions(Permission.MANAGE_SETTINGS)`. A gate narrower than the
     API's locks somebody out of a screen they are entitled to. */
  const mayRead = useCan("MANAGE_SETTINGS");

  const {
    status = "all",
    includeExpired = true,
    pageSize = 50,
    page = 1,
    sort,
    order,
    q,
  } = params;

  const [tick, setTick] = useState(0);
  const [fetched, setFetched] = useState<{
    key: string;
    rows: ApiAnnouncement[];
    total: number;
    error: ApiError | null;
  } | null>(null);

  /* Every input to the request, in one string. Two jobs: the effect's dependency
     and the staleness comparison below, which have to be the same value or a
     render can show one filter's answer under another filter's heading. */
  const key = [
    status,
    includeExpired,
    page,
    pageSize,
    sort,
    order,
    q,
    tick,
  ].join("|");

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!isConnected || !mayRead) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const paged = await announcementsApi.list(
          {
            status,
            includeExpired,
            page,
            pageSize,
            ...(sort ? { sort } : {}),
            ...(order ? { order } : {}),
            ...(q ? { q } : {}),
          },
          controller.signal,
        );
        if (!cancelled) {
          setFetched({
            key,
            rows: paged.data,
            total: paged.meta.total,
            error: null,
          });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        if (!cancelled) {
          setFetched({
            key,
            rows: NONE,
            total: 0,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    isConnected,
    mayRead,
    key,
    status,
    includeExpired,
    page,
    pageSize,
    sort,
    order,
    q,
    revalidation,
  ]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  /* The demo answer, derived and never written to state. Filtered the same way
     the API filters, so a demo screen and a connected one behave alike rather
     than the demo quietly ignoring the tabs. */
  const demo = useMemo<ApiAnnouncement[]>(() => {
    if (isConnected) return NONE;
    const term = q?.trim().toLowerCase();
    return DEMO_ANNOUNCEMENTS.filter((row) => {
      if (status === "published" && !row.published) return false;
      if (status === "draft" && row.published) return false;
      if (!includeExpired && row.expired) return false;
      if (term) {
        const haystack = `${row.title} ${row.body}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    }).sort(byNewest);
  }, [isConnected, status, includeExpired, q]);

  /* Staleness decided by comparing the key during render, not by clearing state
     in an effect — which would be a synchronous setState and a cascaded render. */
  const matched = fetched !== null && fetched.key === key;

  if (!isConnected) {
    return {
      announcements: demo,
      total: demo.length,
      loading: false,
      error: null,
      source: "demo",
      editable: false,
      reload,
    };
  }

  return {
    announcements: matched ? fetched.rows : NONE,
    total: matched ? fetched.total : 0,
    loading: !matched,
    error: matched ? fetched.error : null,
    source: "api",
    editable: true,
    reload,
  };
}

const byNewest = (a: ApiAnnouncement, b: ApiAnnouncement): number =>
  b.createdAt.localeCompare(a.createdAt);

/* ------------------------------------------------------------ the reader list */

/** The reader list is a work list somebody scrolls, so it comes in pages. */
const READERS_PAGE = 25;

export type ReadersResult = {
  /** Every page loaded so far, in the order the API sent them. */
  rows: ApiReader[];
  /**
   * Counts and rate, from the last answer for this notice, whichever list it
   * was for. Null until one has arrived: a count read off nothing is not a zero.
   */
  meta: ApiReadersMeta | null;
  /** Of the list asked for. Null until it has answered. */
  total: number | null;
  hasMore: boolean;
  /** The first page of this list is in flight. */
  loading: boolean;
  /**
   * The first page failed, as the failure itself and not its sentence:
   * `LoadFailure` picks its advice from the class. Null when it did not. Rows
   * already on screen from another list do not mix in.
   */
  error: unknown;
  /** A later page is in flight. */
  loadingMore: boolean;
  /** A later page failed; what was loaded stays. */
  moreError: ApiError | null;
  loadMore: () => void;
  reload: () => void;
};

type ReadersFetched = {
  listKey: string;
  pages: ApiReader[][];
  total: number | null;
  hasMore: boolean;
  /** Wrapped, so "no failure" and "a failure that was thrown as nothing" differ. */
  error: { cause: unknown } | null;
  moreError: ApiError | null;
};

/**
 * Who has opened a notice, or who still has to: `GET /announcements/:id/readers`.
 *
 * Connected only, and only for somebody who may read it. The API answers `403`
 * for anybody without `MANAGE_SETTINGS`, so a caller passes `id: null` instead
 * and nothing is asked: the same rule `useAnnouncements` follows, and for the
 * same reason (a refusal rendered as "did not load" is a claim that something
 * failed). There is no demo half: a reader list is a fact about real people, and
 * a seeded one would be invented evidence of who was told what.
 *
 * ## One list at a time, counts from either
 *
 * `state` picks the list, and the counts for both come back with whichever was
 * asked for, so the tab strip can show "Read 7, Still to read 5" from the first
 * answer. They are held per notice, so opening another notice does not briefly
 * show the last one's.
 *
 * ## Staleness is a key compared during render
 *
 * Switching tab or notice changes `listKey`, and what was fetched under the old
 * one is simply not matched, so the screen shows a skeleton and never the other
 * list's rows under this list's heading. Later pages are appended under the same
 * key; a failure on one keeps what was loaded and offers the retry.
 */
export function useAnnouncementReaders(
  id: string | null,
  state: ReaderState,
): ReadersResult {
  const { isConnected } = useSession();
  const mayRead = useCan("MANAGE_SETTINGS");
  const active = id !== null && isConnected && mayRead;

  const [tick, setTick] = useState(0);
  const [retry, setRetry] = useState(0);
  const listKey = `${id ?? ""}|${state}|${tick}`;

  /* Pages requested, reset when the list changes. Adjusting state during render
     is the documented way to derive this; an effect would be a cascaded render. */
  const [requested, setRequested] = useState({ listKey, pages: 1 });
  if (requested.listKey !== listKey) setRequested({ listKey, pages: 1 });
  const pages = requested.listKey === listKey ? requested.pages : 1;

  const [fetched, setFetched] = useState<ReadersFetched | null>(null);
  const [held, setHeld] = useState<{
    id: string;
    meta: ApiReadersMeta;
  } | null>(null);

  useEffect(() => {
    if (!active || id === null) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const paged = await announcementsApi.readers(
          id,
          { state, page: pages, pageSize: READERS_PAGE },
          controller.signal,
        );
        if (cancelled) return;
        setHeld({ id, meta: paged.meta });
        setFetched((before) => {
          const same = before !== null && before.listKey === listKey;
          const kept = same ? before.pages.slice(0, pages - 1) : [];
          return {
            listKey,
            pages: [...kept, paged.data],
            total: paged.meta.total,
            hasMore: paged.meta.hasMore,
            error: null,
            moreError: null,
          };
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        if (cancelled) return;
        setFetched((before) => {
          const same = before !== null && before.listKey === listKey;
          /* A failure on the first page is the list failing. On a later one it is
             only that page, and what is already here is still true. */
          if (pages > 1 && same) {
            return {
              ...before,
              moreError:
                error instanceof ApiError
                  ? error
                  : new ApiError(
                      500,
                      "internal_error",
                      "Something went wrong.",
                    ),
            };
          }
          return {
            listKey,
            pages: [],
            total: null,
            hasMore: false,
            /* Something thrown as nothing is still a failure. */
            error: { cause: error ?? new Error("Request failed") },
            moreError: null,
          };
        });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [active, id, state, pages, listKey, retry]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const loadMore = useCallback(() => {
    setRequested((now) =>
      fetched?.moreError ? now : { ...now, pages: now.pages + 1 },
    );
    setRetry((n) => n + 1);
  }, [fetched?.moreError]);

  const matched = fetched !== null && fetched.listKey === listKey;
  const meta = held !== null && held.id === id ? held.meta : null;

  if (!active) {
    return {
      rows: NO_READERS,
      meta: null,
      total: null,
      hasMore: false,
      loading: false,
      error: null,
      loadingMore: false,
      moreError: null,
      loadMore,
      reload,
    };
  }

  const loaded = matched ? fetched.pages.length : 0;
  return {
    rows: matched ? fetched.pages.flat() : NO_READERS,
    meta,
    total: matched ? fetched.total : null,
    hasMore: matched ? fetched.hasMore : false,
    loading: !matched || (fetched.pages.length === 0 && fetched.error === null),
    error: matched && fetched.error !== null ? fetched.error.cause : null,
    loadingMore: matched && fetched.error === null && loaded < pages,
    moreError: matched ? fetched.moreError : null,
    loadMore,
    reload,
  };
}

const NO_READERS: ApiReader[] = [];

/* ------------------------------------------------------------------ writing */

export type AnnouncementMutations = {
  create: (body: CreateAnnouncementBody) => Promise<ApiAnnouncement>;
  update: (
    id: string,
    body: UpdateAnnouncementBody,
  ) => Promise<ApiAnnouncement>;
  /** Answers with how many accounts it reached — the point of publishing. */
  publish: (
    id: string,
  ) => Promise<{ announcement: ApiAnnouncement; reaches: number }>;
  /** Off the board, wording kept. */
  unpublish: (id: string) => Promise<{ note: string }>;
  /** Hard, and the dialog says so. */
  remove: (id: string) => Promise<{ title: string; note: string }>;
};

/**
 * Every write, in one hook.
 *
 * All five refuse in demo mode with the same sentence, which is what
 * `useAnnouncements().editable` exists to keep off the screen in the first place.
 * A screen that only behaves correctly against the real thing is a screen nobody
 * tested — so the refusals are real rather than the buttons being missing and
 * the store silently succeeding.
 */
export function useAnnouncementMutations(): AnnouncementMutations {
  const { isConnected } = useSession();

  const create = useCallback(
    (body: CreateAnnouncementBody): Promise<ApiAnnouncement> => {
      if (!isConnected) refuse(WRITE_REFUSAL);
      return announcementsApi.create(body);
    },
    [isConnected],
  );

  const update = useCallback(
    (id: string, body: UpdateAnnouncementBody): Promise<ApiAnnouncement> => {
      if (!isConnected) refuse(WRITE_REFUSAL);
      return announcementsApi.update(id, body);
    },
    [isConnected],
  );

  const publish = useCallback(
    (id: string) => {
      if (!isConnected) refuse(WRITE_REFUSAL);
      return announcementsApi.publish(id);
    },
    [isConnected],
  );

  const unpublish = useCallback(
    (id: string) => {
      if (!isConnected) refuse(WRITE_REFUSAL);
      return announcementsApi.unpublish(id);
    },
    [isConnected],
  );

  const remove = useCallback(
    (id: string) => {
      if (!isConnected) refuse(WRITE_REFUSAL);
      return announcementsApi.remove(id);
    },
    [isConnected],
  );

  return { create, update, publish, unpublish, remove };
}
