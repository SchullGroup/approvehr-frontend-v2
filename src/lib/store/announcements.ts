"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  announcementsApi,
  type AnnouncementListParams,
  type ApiAnnouncement,
  type CreateAnnouncementBody,
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
  "Posting a notice is the company speaking to its staff. That needs the API — " +
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
  const key = [status, includeExpired, page, pageSize, sort, order, q, tick].join("|");

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
        if (error instanceof DOMException && error.name === "AbortError") return;
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
  }, [isConnected, mayRead, key, status, includeExpired, page, pageSize, sort, order, q, revalidation]);

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

/* ------------------------------------------------------------------ writing */

export type AnnouncementMutations = {
  create: (body: CreateAnnouncementBody) => Promise<ApiAnnouncement>;
  update: (id: string, body: UpdateAnnouncementBody) => Promise<ApiAnnouncement>;
  /** Answers with how many accounts it reached — the point of publishing. */
  publish: (id: string) => Promise<{ announcement: ApiAnnouncement; reaches: number }>;
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
