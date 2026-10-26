/**
 * The tab ids for Turn on more features, and nothing else, so `page.tsx` can
 * read `?tab=` on the server (see `lib/url-tab.ts`). Labels are in the screen.
 */
export const FEATURE_TABS = ["modules", "record", "advanced"] as const;

export type FeatureTabId = (typeof FEATURE_TABS)[number];
