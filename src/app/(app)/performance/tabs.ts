/**
 * The tab ids, in one plain module.
 *
 * Not in `performance-screen.tsx`, because that is a client module and
 * `page.tsx` is a server component: calling a function exported from a
 * `"use client"` file inside a server component throws at request time while
 * passing `tsc` and `lint` cleanly. `people/shifts/tabs.ts` exists for the same
 * reason and says so.
 */
export const PERFORMANCE_TABS = [
  "kpis",
  "appraisals",
  "skills",
  /**
   * Who appraises whom. Last, and usually absent.
   *
   * Gated on `multiAppraiser`, which is off by default and which the setup
   * wizard never asks about — so a company with one manager per person never
   * sees this tab and never sees a weighting table. `performance-screen.tsx`
   * decides; the id lives here so a link to it survives a reload.
   */
  "appraisers",
] as const;

export type PerformanceTab = (typeof PERFORMANCE_TABS)[number];

export function isPerformanceTab(
  value: string | undefined,
): value is PerformanceTab {
  return (
    value !== undefined && (PERFORMANCE_TABS as readonly string[]).includes(value)
  );
}
