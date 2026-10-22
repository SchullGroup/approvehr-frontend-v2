/**
 * The tab ids for one exit, and nothing else, so `page.tsx` can read `?tab=` on
 * the server (see `lib/url-tab.ts`). Labels are in the screen.
 */
export const EXIT_TABS = ["checklist", "pay", "details"] as const;

export type ExitTabId = (typeof EXIT_TABS)[number];
