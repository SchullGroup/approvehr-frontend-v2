/**
 * The tab ids for Roles and permissions, and nothing else, so `page.tsx` can
 * read `?tab=` on the server (see `lib/url-tab.ts`). Labels are in the screen.
 */
export const ROLES_TABS = ["roles", "invitations", "your-access"] as const;

export type RolesTabId = (typeof ROLES_TABS)[number];
