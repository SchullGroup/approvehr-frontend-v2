"use client";

import { useCallback, useMemo, useState } from "react";

/**
 * Who is ticked, and whether "everyone matching" has been chosen.
 *
 * ## Two kinds of "select all", kept apart on purpose
 *
 * A header checkbox ticks the people **on screen**. That is all it ever does: a
 * checkbox that silently selects three hundred people when twenty-five are visible
 * is a control that says one thing and does another. Choosing everyone a filter
 * matches is a second, explicit step with its own words, its own confirmation and
 * the exact number in it.
 *
 * ## "Everyone" belongs to one question
 *
 * "All 312 matching" is only true of the filters it was chosen under. The moment
 * the filters change it is let go, so a stale "everyone" can never be acted on
 * under a different list. Individually ticked people are kept: they are named, so
 * they mean the same people whatever is on screen.
 *
 * In "everyone" mode the row ticks are fixed: leaving somebody out of three
 * hundred is done by narrowing the filters, which also changes the count the
 * person confirms. Selection is by id throughout, because ids survive filtering,
 * paging and a card moving to another column; row positions do not.
 */

export type BulkSelection = {
  /** Ticked people, when not in "everyone matching" mode. */
  picked: ReadonlySet<string>;
  /** "Everyone matching" was chosen, for exactly this many people. */
  everyone: { count: number } | null;
  /** How many people the next action would be for. */
  size: number;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  /** Ticks every id given, or clears them when all are already ticked. */
  toggleMany: (ids: readonly string[]) => void;
  allOf: (ids: readonly string[]) => boolean;
  someOf: (ids: readonly string[]) => boolean;
  /** Choose everyone the filters match, for the count the person confirmed. */
  chooseEveryone: (count: number) => void;
  clear: () => void;
};

type State = {
  scope: string;
  picked: ReadonlySet<string>;
  everyone: { count: number } | null;
};

export function useBulkSelection(
  /** Changes exactly when the question does. A change lets "everyone" go. */
  scope: string,
): BulkSelection {
  const [state, setState] = useState<State>({
    scope,
    picked: new Set(),
    everyone: null,
  });

  /* Under a different question "everyone" is no longer true. Applied inside each
     update as well as when reading, so no write is built on a stale one. */
  const current = useCallback(
    (now: State): State =>
      now.scope === scope ? now : { scope, picked: now.picked, everyone: null },
    [scope],
  );

  const toggle = useCallback(
    (id: string) =>
      setState((now) => {
        const base = current(now);
        if (base.everyone) return base;
        const picked = new Set(base.picked);
        if (picked.has(id)) picked.delete(id);
        else picked.add(id);
        return { ...base, picked };
      }),
    [current],
  );

  const toggleMany = useCallback(
    (ids: readonly string[]) =>
      setState((now) => {
        const base = current(now);
        if (base.everyone) return base;
        const picked = new Set(base.picked);
        const every = ids.length > 0 && ids.every((id) => picked.has(id));
        for (const id of ids) {
          if (every) picked.delete(id);
          else picked.add(id);
        }
        return { ...base, picked };
      }),
    [current],
  );

  const chooseEveryone = useCallback(
    (count: number) =>
      setState({ scope, picked: new Set(), everyone: { count } }),
    [scope],
  );

  const clear = useCallback(
    () => setState({ scope, picked: new Set(), everyone: null }),
    [scope],
  );

  return useMemo<BulkSelection>(() => {
    const { picked, everyone } =
      state.scope === scope ? state : { picked: state.picked, everyone: null };
    const isSelected = (id: string) => (everyone ? true : picked.has(id));
    return {
      picked,
      everyone,
      size: everyone ? everyone.count : picked.size,
      isSelected,
      toggle,
      toggleMany,
      allOf: (ids) => ids.length > 0 && ids.every(isSelected),
      someOf: (ids) => ids.some(isSelected) && !ids.every(isSelected),
      chooseEveryone,
      clear,
    };
  }, [state, scope, toggle, toggleMany, chooseEveryone, clear]);
}
