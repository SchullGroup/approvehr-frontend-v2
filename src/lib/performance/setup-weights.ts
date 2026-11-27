import type { ScoreComponent } from "@/lib/api/performance";

/**
 * 100 shared as evenly as whole numbers allow, the remainder going to the first
 * parts, so the total is always exactly 100.
 */
export function splitEvenly(
  sources: readonly ScoreComponent[],
): Partial<Record<ScoreComponent, number>> {
  if (sources.length === 0) return {};
  const base = Math.floor(100 / sources.length);
  const extra = 100 - base * sources.length;
  return Object.fromEntries(
    sources.map((source, index) => [source, base + (index < extra ? 1 : 0)]),
  );
}

/**
 * The weights as they are shared out when the last one is worked out from the
 * rest, so the total is always exactly 100 and nobody is ever stopped by it.
 *
 * Every part but the last takes what was typed for it, as a whole number, held
 * to what is left (a part cannot take more than the others have not used), and
 * the last takes the remainder. A blank or unreadable box counts as 0. So the
 * parts never add up to more than 100, never to less, and the screen has no
 * state in which Continue is refused.
 */
export function balanceWeights(
  sources: readonly ScoreComponent[],
  typed: Partial<Record<ScoreComponent, string>>,
): Partial<Record<ScoreComponent, number>> {
  const shares: Partial<Record<ScoreComponent, number>> = {};
  let used = 0;
  sources.forEach((source, index) => {
    if (index === sources.length - 1) {
      shares[source] = 100 - used;
      return;
    }
    const wanted = Math.max(0, Math.round(Number(typed[source]) || 0));
    const share = Math.min(wanted, 100 - used);
    shares[source] = share;
    used += share;
  });
  return shares;
}
