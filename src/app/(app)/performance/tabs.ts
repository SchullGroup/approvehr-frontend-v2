/**
 * The tab ids, in one plain module.
 *
 * Not in `performance-screen.tsx`, because that is a client module and
 * `page.tsx` is a server component: calling a function exported from a
 * `"use client"` file inside a server component throws at request time while
 * passing `tsc` and `lint` cleanly. `people/shifts/tabs.ts` exists for the same
 * reason and says so.
 */
export const PERFORMANCE_TABS = ["kpis", "appraisals", "skills"] as const;

export type PerformanceTab = (typeof PERFORMANCE_TABS)[number];

export function isPerformanceTab(
  value: string | undefined,
): value is PerformanceTab {
  return (
    value !== undefined && (PERFORMANCE_TABS as readonly string[]).includes(value)
  );
}
