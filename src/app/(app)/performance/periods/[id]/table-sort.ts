/**
 * Sorting for the two tables on this screen.
 *
 * ## Why this sorts in the browser when `SortableTH` says it should not
 *
 * `SortableTH`'s own header argues that sorting an already-fetched *page*
 * reorders 25 rows out of 2,000 and presents the result as the order of the
 * list. That is exactly right for a paged list and exactly wrong to apply
 * here: `GET /cycles/:id/scores` and `GET /cycles/:id/participants` are not
 * paged. They return the whole period in one payload, so every row there is
 * is already on the screen and sorting it is sorting the list, not a slice
 * of it. The header component is used as-is; only the thing behind `onSort`
 * differs.
 *
 * ## An absence sorts last in both directions
 *
 * A person with no mark is not a mark of nought. Sorting "lowest first" must
 * not put the people nothing was recorded for at the top of the list as if
 * they had scored worst, and sorting "highest first" must not hide them at the
 * bottom of a list somebody reads from the top. They stay at the end either
 * way, which is the sort-order version of rendering "No mark" instead of 0%.
 */

export type SortOrder = "asc" | "desc";
export type SortState = { column: string; order: SortOrder };

/** What a column sorts on. `null` is an absence and always goes last. */
export type SortKey = string | number | null;

/**
 * The same toggle `useListQuery` uses: a new column starts ascending (or
 * descending, for a figure whose interesting end is the top), the same column
 * again flips.
 */
export function nextSort(
  was: SortState | null,
  column: string,
  startDescending = false,
): SortState {
  if (was?.column === column) {
    return { column, order: was.order === "asc" ? "desc" : "asc" };
  }
  return { column, order: startDescending ? "desc" : "asc" };
}

export function sortRows<T>(
  rows: readonly T[],
  state: SortState | null,
  keys: Record<string, (row: T) => SortKey>,
): T[] {
  if (!state) return [...rows];
  const read = keys[state.column];
  if (!read) return [...rows];
  const direction = state.order === "asc" ? 1 : -1;

  return rows
    .map((row, index) => ({ row, index, key: read(row) }))
    .sort((a, b) => {
      if (a.key === null && b.key === null) return a.index - b.index;
      if (a.key === null) return 1;
      if (b.key === null) return -1;
      const order =
        typeof a.key === "number" && typeof b.key === "number"
          ? a.key - b.key
          : String(a.key).localeCompare(String(b.key), "en", {
              sensitivity: "base",
              numeric: true,
            });
      /* Ties keep the order the API sent, whichever way this is sorted. */
      return order === 0 ? a.index - b.index : order * direction;
    })
    .map((one) => one.row);
}
