"use client";

import { useCallback, useState } from "react";
import type { ApiError, Paged } from "@/lib/api/client";
import {
  smsApi,
  type ApiSmsMe,
  type ApiSmsStatus,
  type ApiSmsSubscription,
  type SmsSubscriptionState,
} from "@/lib/api/sms";
import { useSession } from "@/lib/store/session";
import { useFetched } from "@/lib/use-fetched";

/**
 * Read hooks for the weekly text message digest.
 *
 * Shaped on `lib/store/work-trackers.ts`: a keyed fetch through `useFetched`, so
 * a slow answer for a filter somebody has moved off cannot be shown, and the
 * window-focus revalidation is inherited rather than re-wired here.
 *
 * ## Connected mode only
 *
 * There is no local copy of a text message subscription, and there must not be:
 * an "Opted in" badge that this browser invented is a claim that somebody agreed
 * to be texted, which is the one thing this feature must never say without a
 * record behind it. Offline every read is idle, `data` is `null`, and each screen
 * says it needs a signed-in company rather than showing an empty list.
 *
 * ## `null` is not empty
 *
 * `data` is `null` until the read has answered and stays `null` if it failed.
 * That is what lets a screen tell "nobody has opted in" from "this did not load"
 * and from "still asking" (see `LoadState`). Do not default it to `[]` or `0`.
 *
 * ## A refresh keeps what is on screen
 *
 * After somebody opts in, or HR records a change, the screen asks again. `useFetched`
 * drops `data` while the new request is in flight, which would collapse a card to
 * a skeleton under the person's cursor. So `data` here is the last answer until the
 * next one lands, `loading` is true only for the very first read, and `refreshing`
 * says a newer one is on its way. A failure still replaces it: a count from before
 * a failed refresh is a claim nobody can vouch for.
 *
 * Writes are not here. They go through `smsApi` with `useAction` at the call
 * site, and then the hook's `reload()`, which is how the work-tracker screens do
 * it.
 */

type Read<T> = {
  /** The latest answer, kept across a refresh. `null` before the first, and after a failure. */
  data: T | null;
  /** The first read has not answered. */
  loading: boolean;
  /** A newer answer is on its way and `data` is the one before it. */
  refreshing: boolean;
  error: ApiError | null;
  reload: () => void;
  /** False offline: there is nothing to ask, and no answer is coming. */
  connected: boolean;
};

/**
 * Keeps the last answer through the gap `useFetched` leaves between two.
 *
 * Derived during render, with the guard that makes it a one-off: the state is set
 * only when a new answer differs from the kept one, so it cannot loop. An effect
 * would be a synchronous `setState` and a second render.
 */
function useKept<T>(
  read: {
    data: T | null;
    loading: boolean;
    error: ApiError | null;
    reload: () => void;
  },
  connected: boolean,
): Read<T> {
  const [kept, setKept] = useState<T | null>(null);
  if (read.data !== null && read.data !== kept) setKept(read.data);
  /* A failure is not covered by the answer before it. */
  const data = read.error ? null : (read.data ?? kept);
  return {
    data,
    loading: read.loading && kept === null,
    refreshing: read.loading && kept !== null && read.error === null,
    error: read.error,
    reload: read.reload,
    connected,
  };
}

/** Whether the API says this deployment has no text message routes at all. */
export function isMissingModule(error: ApiError | null): boolean {
  return error !== null && error.status === 404;
}

/** The signed-in person's own state: `GET /sms/me`. */
export function useMySms(): Read<ApiSmsMe> {
  const { isConnected } = useSession();
  const load = useCallback((signal: AbortSignal) => smsApi.me(signal), []);
  return useKept(
    useFetched<ApiSmsMe>("sms-me", isConnected, load),
    isConnected,
  );
}

/** The company's status, for whoever holds `MANAGE_SETTINGS`: `GET /sms/status`. */
export function useSmsStatus(): Read<ApiSmsStatus> {
  const { isConnected } = useSession();
  const load = useCallback((signal: AbortSignal) => smsApi.status(signal), []);
  return useKept(
    useFetched<ApiSmsStatus>("sms-status", isConnected, load),
    isConnected,
  );
}

export type SubscriptionsQuery = {
  page: number;
  pageSize: number;
  state?: SmsSubscriptionState | undefined;
};

/**
 * The subscriptions table, one page: `GET /sms/subscriptions`.
 *
 * `data` is the envelope, so a screen has the server's `meta.total` for the
 * count beside the filter and for the pager. It is never `rows.length`, which is
 * the page. While a new filter settles, `data` is the previous page and
 * `refreshing` is true, so the table can dim rather than blank.
 */
export function useSmsSubscriptions(
  query: SubscriptionsQuery,
): Read<Paged<ApiSmsSubscription>> {
  const { isConnected } = useSession();
  const { page, pageSize, state } = query;
  const load = useCallback(
    (signal: AbortSignal) =>
      smsApi.subscriptions(
        { page, pageSize, ...(state ? { state } : {}) },
        signal,
      ),
    [page, pageSize, state],
  );
  return useKept(
    useFetched<Paged<ApiSmsSubscription>>(
      `sms-subscriptions|${String(page)}|${String(pageSize)}|${state ?? ""}`,
      isConnected,
      load,
    ),
    isConnected,
  );
}
