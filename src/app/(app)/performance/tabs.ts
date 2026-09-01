/**
 * The tab ids, in one plain module.
 *
 * Not in `performance-screen.tsx`, because that is a client module and
 * `page.tsx` is a server component: calling a function exported from a
 * `"use client"` file inside a server component throws at request time while
 * passing `tsc` and `lint` cleanly. `people/shifts/tabs.ts` exists for the same
 * reason and says so.
 *
 * ## Named tabs, again — deliberately
 *
 * This module went from four nouns (`kpis · appraisals · skills ·
 * appraisers`) to a single job-shaped landing (`now`) after a product owner
 * could not tell which tab their task was filed under. That fix is not
 * undone here: `dashboard` keeps the "what needs you" content `now` carried
 * — relabelled, not discarded — and stays first and default.
 *
 * What changed is everything *else*: Review Cycles, Competency Ratings and
 * Review Tasks are explicit, always-visible tabs again rather than a list
 * behind Overview or a disclosure inside it. The two complaints turned out
 * to be about different things — "which tab is my task under" was a naming
 * problem the job-shaped landing fixed; "where do I even manage a section, a
 * competency, a cycle" is a discoverability problem, and hiding those things
 * one click deeper does not answer it. `dashboard` still says what to do
 * next; these are where to go and do it.
 *
 * A stale link (`?tab=now`, `?tab=periods`, `?tab=kpis`, `?tab=appraisals`)
 * fails `isPerformanceTab` and lands on `dashboard` — no alias table needed,
 * the same graceful-fallback shape the previous rename used.
 */
export const PERFORMANCE_TABS = [
  /**
   * The landing, and the default. What is open, what is waiting on you, what
   * is waiting on somebody else — unchanged from the tab this replaces.
   */
  "dashboard",
  /**
   * The appraisal periods, as a list — "Review Cycles" in the vocabulary this
   * screen uses elsewhere (`ReviewCycle`), and in the one the product owner
   * asked for by name. Only people who can run or read a period across the
   * company see this.
   */
  "review-cycles",
  /**
   * The competency framework: sections, subsections, and where people stand
   * against them. Was a closed disclosure on the landing; promoted to its own
   * tab because "where do I manage this" is a different question from "what
   * needs me right now", and burying the answer to the first inside the
   * second is exactly the discoverability gap this rename exists to close.
   */
  "competency-ratings",
  /**
   * KPIs. Kept as the word this module has always used here, not renamed to
   * "Objectives" — a demo review found people look for "KPI" by name, and
   * that finding did not change just because the tab strip did.
   */
  "kpis",
  /**
   * The weekly task log: what people logged against their objectives, and
   * what still needs a manager's grade.
   */
  "review-tasks",
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
    value !== undefined &&
    (PERFORMANCE_TABS as readonly string[]).includes(value)
  );
}
