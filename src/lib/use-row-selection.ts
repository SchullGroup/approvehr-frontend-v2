"use client";

import { useCallback, useMemo, useState } from "react";

/**
 * Which rows are ticked.
 *
 * ## Why the selection is by id and lives above the table
 *
 * A selection held as row indices breaks the moment the table sorts, filters or
 * pages — the ticks stay where they were and now mean different people, which
 * on a screen whose next action is "move these 40 into Finance" is somebody
 * else's record being moved. Ids survive all three.
 *
 * ## It is deliberately scoped to the page, not the filter
 *
 * "Select all" ticks the rows **on screen**, never every row the filter
 * matches. A checkbox that silently selects 300 people when 25 are visible is
 * the shape of claim this codebase keeps refusing: the control says one thing
 * and does another. If somebody wants all 300 they can say so with a filter and
 * an export; a bulk *write* over rows nobody has looked at is not a convenience.
 */
export type RowSelection = {
  selected: ReadonlySet<string>;
  count: number;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  /** Ticks or clears every id given — the rows currently on screen. */
  toggleAll: (ids: readonly string[]) => void;
  /** True when every id given is ticked, for the header checkbox. */
  allSelected: (ids: readonly string[]) => boolean;
  /** Some but not all, which is the third state a header checkbox needs. */
  someSelected: (ids: readonly string[]) => boolean;
  clear: () => void;
};

export function useRowSelection(): RowSelection {
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const toggle = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((ids: readonly string[]) => {
    setSelected((current) => {
      const next = new Set(current);
      const everyOne = ids.length > 0 && ids.every((id) => next.has(id));
      for (const id of ids) {
        if (everyOne) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  return useMemo(
    () => ({
      selected,
      count: selected.size,
      isSelected: (id) => selected.has(id),
      toggle,
      toggleAll,
      allSelected: (ids) =>
        ids.length > 0 && ids.every((id) => selected.has(id)),
      someSelected: (ids) =>
        ids.some((id) => selected.has(id)) &&
        !ids.every((id) => selected.has(id)),
      clear,
    }),
    [selected, toggle, toggleAll, clear],
  );
}
