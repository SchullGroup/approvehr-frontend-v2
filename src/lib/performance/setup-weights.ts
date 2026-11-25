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
