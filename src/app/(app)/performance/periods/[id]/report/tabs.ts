/**
 * The tab ids for the period report, and nothing else, so `page.tsx` can read
 * `?tab=` on the server (see `lib/url-tab.ts`). Labels are in the screen.
 */
export const REPORT_TABS = ["marks", "progress", "parts", "follow-up"] as const;

export type ReportTabId = (typeof REPORT_TABS)[number];
