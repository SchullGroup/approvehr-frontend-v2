/**
 * The three sections of Working hours.
 *
 * A separate module from the screen for the reason `settings/leave/tabs.ts`
 * gives: the page reads `?tab=` on the server, and a function exported from a
 * client module throws if a server component calls it, while `tsc` and lint
 * pass it cleanly.
 */
export const ATTENDANCE_TABS = ["hours", "schedules", "special-days"] as const;

export type AttendanceTab = (typeof ATTENDANCE_TABS)[number];
