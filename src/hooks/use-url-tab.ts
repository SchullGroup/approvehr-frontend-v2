"use client";

import { useCallback, useState } from "react";

/**
 * The tab on screen, kept in the address so a link can open on it.
 *
 * `history.replaceState` rather than a router push: switching tab is not a
 * navigation, so it adds no back-button step and fetches nothing, and a reload
 * lands on the same tab. The first value comes from the server page
 * (`tabFromQuery` in `lib/url-tab.ts`) rather than `useSearchParams`, which
 * would pull the whole page behind a Suspense boundary to read one string.
 *
 * `ids` should be a module-level array so the handler keeps its identity.
 */
export function useUrlTab<T extends string>(initial: T, ids: readonly T[]) {
  const [tab, setTab] = useState<T>(initial);
  const change = useCallback(
    (next: string) => {
      const id = ids.find((candidate) => candidate === next);
      if (id === undefined) return;
      setTab(id);
      const url = new URL(window.location.href);
      url.searchParams.set("tab", id);
      window.history.replaceState(window.history.state, "", url);
    },
    [ids],
  );
  return [tab, change] as const;
}
