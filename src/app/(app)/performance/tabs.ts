/**
 * The tab ids, in one plain module.
 *
 * Not in `performance-screen.tsx`, because that is a client module and
 * `page.tsx` is a server component: calling a function exported from a
 * `"use client"` file inside a server component throws at request time while
 * passing `tsc` and `lint` cleanly. `people/shifts/tabs.ts` exists for the same
 * reason and says so.
 *
 * ## The ids are jobs now, not nouns
 *
 * They were `kpis · appraisals · skills · appraisers` — four nouns, so a person
 * arriving with something to do had to guess which noun their job was filed
 * under. `now` answers "what do I do", and the two after it are the only nouns
 * anybody needs to reach directly.
 *
 * A stale link (`?tab=appraisals`, `?tab=skills`) fails `isPerformanceTab` and
 * lands on `now`, which is where both of those things now live. That is the
 * whole migration and it needs no alias table.
 */
export const PERFORMANCE_TABS = [
  /**
   * The overview, and the landing. Labelled "Overview"; the id stays `now` so
   * that every `?tab=now` link written before the rename still resolves.
   *
   * It was labelled **"Approvals"**, which collided with `/performance/approvals`
   * — a different screen, the objective agreement queue — and contradicted this
   * module's own documentation, which had always called it *what is open, what
   * is waiting on you, what is waiting on somebody else*. One word for two
   * things in one module is how somebody ends up on the wrong screen from a
   * notification.
   *
   * It is first and it is the default because it now carries the running
   * period's state — how many self-reviews are in, how many manager reviews,
   * how many marks are final, who has nobody appraising them. That is strictly
   * more use on arrival than a list of periods, which is what this module used
   * to open on.
   */
  "now",
  /**
   * The appraisal periods, as a list.
   *
   * "Period" is the user's word; `ReviewCycle` is the model's. Only people who
   * can run or read a period across the company see this — staff learn which
   * period is open from `now`, which is the only fact about it that is theirs.
   */
  "periods",
  "kpis",
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
