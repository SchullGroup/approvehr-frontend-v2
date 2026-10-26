/**
 * The tab ids for the company reports screen, and nothing else, so `page.tsx`
 * can read `?tab=` on the server (see `lib/url-tab.ts`). Labels are in the screen.
 */
export const COMPANY_TABS = ["overview", "departments"] as const;

export type CompanyTabId = (typeof COMPANY_TABS)[number];
