/**
 * The tab ids for Appraisal scoring, and nothing else, so `page.tsx` can read
 * `?tab=` on the server (see `lib/url-tab.ts`). Labels are in the form.
 */
export const SCORING_TABS = ["weights", "marks"] as const;

export type ScoringTabId = (typeof SCORING_TABS)[number];
