/**
 * Ordering by rank, the way the design does it.
 *
 * Every issue carries a float `rank`. Dropping an issue between two neighbours
 * gives it the midpoint of their ranks; at the top it takes the first rank minus
 * one; at the bottom the last plus one. Nothing else is renumbered, so a drag
 * writes exactly one row.
 *
 * Floats run out of room after a few dozen halvings of the same gap. That is a
 * known edge of the design and is acceptable for a board people reorder by hand;
 * `gapIsTooSmall` lets a caller notice and `rebalance` spreads a list back out.
 */

type Ranked = { id: string; rank: number };

export function byRank<T extends { rank: number; number?: number }>(
  a: T,
  b: T,
): number {
  return a.rank - b.rank || (a.number ?? 0) - (b.number ?? 0);
}

/** The rank between two neighbours. `null` means "no neighbour on that side". */
export function rankBetween(
  before: number | null,
  after: number | null,
): number {
  if (before === null && after === null) return 1;
  if (before === null) return (after as number) - 1;
  if (after === null) return before + 1;
  return (before + after) / 2;
}

/**
 * The rank for `movingId` when it is dropped into `siblings` (already in display
 * order) immediately before `beforeId`, or at the end when `beforeId` is null.
 *
 * The moving issue is ignored if it is among the siblings, so dragging within a
 * column works the same as dragging in from another.
 */
export function rankForInsert(
  siblings: readonly Ranked[],
  beforeId: string | null,
  movingId: string,
): number {
  const rest = siblings.filter((s) => s.id !== movingId);
  if (beforeId === null) {
    const last = rest[rest.length - 1];
    return rankBetween(last ? last.rank : null, null);
  }
  const index = rest.findIndex((s) => s.id === beforeId);
  if (index === -1) {
    const last = rest[rest.length - 1];
    return rankBetween(last ? last.rank : null, null);
  }
  const prev = index > 0 ? rest[index - 1]! : null;
  return rankBetween(prev ? prev.rank : null, rest[index]!.rank);
}

/** The next rank at the bottom of everything. Used for a new issue. */
export function rankAtEnd(ranks: readonly number[]): number {
  return ranks.length ? Math.max(...ranks) + 1 : 1;
}

/** True when two neighbours are too close for another midpoint to be distinct. */
export function gapIsTooSmall(a: number, b: number): boolean {
  const mid = (a + b) / 2;
  return mid <= Math.min(a, b) || mid >= Math.max(a, b);
}

/** Evenly spaced ranks 1..n for a list already in order. */
export function rebalance<T extends Ranked>(ordered: readonly T[]): T[] {
  return ordered.map((item, index) => ({ ...item, rank: index + 1 }));
}
