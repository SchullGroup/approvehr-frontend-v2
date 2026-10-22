"use client";

import { useCallback, useSyncExternalStore } from "react";
import { createPersistedState } from "./persisted";

/**
 * Which headed sections of the sidebar somebody has folded away, remembered.
 *
 * A personal, per-browser preference and nothing else, in the same family as
 * the theme and the "add several" layout: there is no user-preferences endpoint,
 * and what is folded is a way of reading the menu rather than a fact about the
 * company, so it is not worth a request.
 *
 * ## It stores what is folded, not what is open
 *
 * Every section starts open, which is what the sidebar has always been. A
 * section that ships tomorrow is therefore open for everybody, and a person who
 * never touches a heading has nothing stored at all. The other way round, a new
 * section would arrive closed for the people who had closed every one before it.
 *
 * ## The key is the level and the heading, not the heading
 *
 * "People" is a heading in more than one level one day, and folding it in one
 * must not fold the other. `sectionKey` is the one place the pair is written.
 *
 * ## Nothing is hidden for good
 *
 * A folded section still counts: its heading carries a dot when anything inside
 * has something waiting, and a mark when the page you are on is inside it. Find
 * searches folded sections too, so no door is lost to a fold, and one press on
 * the heading puts it back.
 */

type State = { folded: string[] };

const store = createPersistedState<State>({
  key: "approvehr.sidebar.sections",
  empty: { folded: [] },
});

/** `<level id>/<heading>`. */
export const sectionKey = (levelId: string, heading: string) =>
  `${levelId}/${heading}`;

export function useFoldedSections(): {
  isFolded: (key: string) => boolean;
  toggle: (key: string) => void;
} {
  const state = useSyncExternalStore(
    store.subscribe,
    store.read,
    store.getServerSnapshot,
  );
  const isFolded = useCallback(
    (key: string) => state.folded.includes(key),
    [state],
  );
  const toggle = useCallback((key: string) => {
    /* A write is computed from `current()`, not from what was last rendered:
       nothing may have subscribed yet in a tab that has only just woken. */
    const { folded } = store.current();
    store.commit({
      folded: folded.includes(key)
        ? folded.filter((entry) => entry !== key)
        : [...folded, key],
    });
  }, []);
  return { isFolded, toggle };
}
