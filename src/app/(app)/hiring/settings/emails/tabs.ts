/**
 * The tab ids for the candidate emails, and nothing else, so `page.tsx` can read
 * `?tab=` on the server (see `lib/url-tab.ts`). Labels and the kind-to-tab
 * grouping are in the screen.
 */
export const EMAIL_TABS = ["candidates", "interviews", "panel"] as const;

export type EmailTabId = (typeof EMAIL_TABS)[number];
