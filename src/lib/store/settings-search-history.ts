"use client";

import { useCallback, useSyncExternalStore } from "react";
import { createPersistedState } from "./persisted";

/**
 * What somebody last searched for on the Settings screen, remembered.
 *
 * A personal, per-browser convenience in the family of the sidebar's folded
 * sections: there is no preferences endpoint, and a list of words typed into a
 * filter box is not a fact about the company. It does not follow the person to
 * another device and clearing site data removes it, and the screen says so
 * beside the list.
 *
 * Only the words are kept, never what they found. Most recent first, no repeats
 * (compared without case), at most `MAX_RECENT`. A search is remembered when the
 * person commits to it (Enter, or leaving the box with something on screen), not
 * on every keystroke: "o", "ov", "ove" is one search.
 */

export const MAX_RECENT = 8;

type State = { recent: string[] };

const store = createPersistedState<State>({
  key: "approvehr.settings.search",
  empty: { recent: [] },
});

/** The list after remembering `query`. Pure, so the rule is testable. */
export function remember(recent: readonly string[], query: string): string[] {
  const text = query.trim().replace(/\s+/g, " ");
  if (text.length < 2) return [...recent];
  const key = text.toLowerCase();
  return [text, ...recent.filter((q) => q.toLowerCase() !== key)].slice(
    0,
    MAX_RECENT,
  );
}

export function useSettingsSearchHistory(): {
  recent: string[];
  add: (query: string) => void;
  clear: () => void;
} {
  const state = useSyncExternalStore(
    store.subscribe,
    store.read,
    store.getServerSnapshot,
  );
  const add = useCallback((query: string) => {
    /* A write starts from `current()`: nothing may have subscribed yet. */
    const now = store.current();
    const next = remember(now.recent, query);
    if (next.join("\u0000") !== now.recent.join("\u0000")) {
      store.commit({ recent: next });
    }
  }, []);
  const clear = useCallback(() => store.commit({ recent: [] }), []);
  return { recent: state.recent, add, clear };
}
