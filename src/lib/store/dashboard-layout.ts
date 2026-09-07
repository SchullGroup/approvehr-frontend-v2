"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ApiError } from "@/lib/api/client";
import { insightsApi } from "@/lib/api/insights";
import { createPersistedState } from "@/lib/store/persisted";
import { useSession } from "@/lib/store/session";
import { useRevalidation } from "@/lib/revalidate";

/**
 * Which widgets one person keeps on their dashboard, and in what order.
 *
 * ## Connected: the server. Offline: this browser, and it says so.
 *
 * A layout somebody spends five minutes building and then loses on their other
 * machine is a feature that does not work, which is why the connected path is a
 * real table (`DashboardLayout`) rather than `localStorage`. Demo mode keeps a
 * local copy for the ordinary reason every other store does — the product is
 * demonstrated on laptops with no database — and the drawer says which of the
 * two is happening.
 *
 * ## `null` is "never chosen" and `[]` is "chose nothing"
 *
 * The whole store is arranged around keeping those apart, because collapsing
 * them breaks the feature in one of two ways: read `[]` as "never chosen" and
 * somebody who cleared their dashboard gets it repopulated on every load; read
 * `null` as "chose nothing" and a new customer gets a blank screen. The API
 * makes the same distinction and for the same reason.
 *
 * ## Re-asked when somebody comes back, and the reason is narrow
 *
 * Nobody else can change this — there is no id on the endpoint and no shared
 * state, so a layout cannot move behind the person who owns it. What *can*
 * happen is a second tab: arrange the dashboard in one, switch to another, and
 * the second is showing an arrangement that no longer exists. One small request
 * on return is worth that, and it is the only reason `useRevalidation` is here.
 *
 * ## Saved on the press, never on a timer
 *
 * `save` is called when the drawer's own footer button is pressed, or
 * immediately on a toggle or a drop. There is no debounce: a debounced
 * preference is one that has not saved yet when somebody closes the tab, and
 * the failure is silent. What there is instead is an optimistic local value, so
 * the screen moves at once and the request catches up.
 */

const KEY = "approvehr.dashboard.layout";

/** The demo branch. `null` inside means never chosen, exactly as on the wire. */
const local = createPersistedState<{ widgets: string[] | null }>({
  key: KEY,
  empty: { widgets: null },
});

export type DashboardLayoutState = {
  /**
   * `null` until the answer is known **or** because nobody has chosen.
   * `loading` is what tells those apart, and a screen must check it before
   * falling back to defaults — rendering the default arrangement for half a
   * second and then replacing it is a dashboard that flickers on every load.
   */
  widgets: string[] | null;
  loading: boolean;
  /** False offline. The drawer says so rather than pretending it saved. */
  connected: boolean;
  error: string | null;
  saving: boolean;
  /** Replaces the whole arrangement. Order is the value. */
  save: (widgets: readonly string[]) => Promise<void>;
  /** Back to "never chosen", so the catalogue's defaults answer again. */
  reset: () => Promise<void>;
};

export function useDashboardLayout(): DashboardLayoutState {
  const { isConnected, isLoading } = useSession();
  /* `local.read` handed over, never called — the render read. `local.current()`
     is for the write paths below. See `verify-stores` and the audit entry in
     HANDOVER for what calling `read()` in a write path did to four stores. */
  const stored = useSyncExternalStore(
    local.subscribe,
    local.read,
    local.getServerSnapshot,
  );

  const [fetched, setFetched] = useState<{
    connected: boolean;
    widgets: string[] | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /* `isLoading` matters for the same reason it does in `usePayrollSettings`:
     firing this before the session resolves sends an unauthenticated request
     that comes back 401 and looks like a permission problem. */
  const active = isConnected && !isLoading;

  /* In the effect's dependency list and nowhere else — the rule in the header
     of `lib/revalidate.ts`, and what `verify-revalidate` checks. */
  const revalidation = useRevalidation();

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const answer = await insightsApi.layout(controller.signal);
        if (cancelled) return;
        setFetched({
          connected: true,
          widgets: answer.layout?.widgets ?? null,
        });
        setError(null);
      } catch (caught) {
        if (cancelled) return;
        if (caught instanceof DOMException && caught.name === "AbortError")
          return;
        /* Falling back to the defaults is right here and would be wrong for a
           figure: an arrangement nobody could read is a dashboard in its
           out-of-the-box order, which is a usable screen. So the error is kept
           for the drawer to mention and the screen carries on. */
        setFetched({ connected: true, widgets: null });
        setError(
          caught instanceof ApiError
            ? caught.message
            : "Your dashboard arrangement did not load, so this is the standard one.",
        );
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [active, revalidation]);

  const save = useCallback(
    async (widgets: readonly string[]) => {
      if (!active) {
        local.commit({ widgets: [...widgets] });
        return;
      }
      /* Optimistic, then confirmed. The drawer is a direct-manipulation
         surface — a card dragged into place has to stay there while the
         request is in flight, or the drop appears to fail. */
      setFetched({ connected: true, widgets: [...widgets] });
      setSaving(true);
      setError(null);
      try {
        const answer = await insightsApi.saveLayout(widgets);
        /* The server's own answer replaces the guess, for the reason
           `useOvertimePolicy` re-reads rather than trusting its patch: the API
           decides what it stored. */
        setFetched({ connected: true, widgets: answer.layout?.widgets ?? [] });
      } catch (caught) {
        setError(
          caught instanceof ApiError
            ? caught.message
            : "That did not save. Try again in a moment.",
        );
        throw caught;
      } finally {
        setSaving(false);
      }
    },
    [active],
  );

  const reset = useCallback(async () => {
    if (!active) {
      local.commit({ widgets: null });
      return;
    }
    /* Optimistic, then the delete. The first version of this set the local
       value and **wrote nothing** — so the screen went back to the defaults,
       the arrangement came straight back on the next reload, and the drawer's
       "Reset it" button was a lie. Found by reading the row out of the
       database after pressing it, which is the only thing that could have
       found it: nothing on screen was wrong until you loaded the page again. */
    setFetched({ connected: true, widgets: null });
    setSaving(true);
    setError(null);
    try {
      await insightsApi.clearLayout();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "That did not reset. Try again in a moment.",
      );
      throw caught;
    } finally {
      setSaving(false);
    }
  }, [active]);

  if (!active) {
    return {
      widgets: stored.widgets,
      loading: false,
      connected: false,
      error: null,
      saving: false,
      save,
      reset,
    };
  }

  return {
    widgets: fetched?.widgets ?? null,
    loading: fetched === null,
    connected: true,
    error,
    saving,
    save,
    reset,
  };
}
