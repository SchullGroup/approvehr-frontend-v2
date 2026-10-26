/**
 * The tab ids for Integrations, and nothing else, so `page.tsx` can read
 * `?tab=` on the server (see `lib/url-tab.ts`). Labels are in the list.
 */
export const INTEGRATION_TABS = ["trackers", "upcoming"] as const;

export type IntegrationTabId = (typeof INTEGRATION_TABS)[number];
