/**
 * The three sections of Leave policies.
 *
 * A separate module from the screen for the reason `payroll/pay-setup/tabs.ts`
 * gives: the page reads `?tab=` on the server, and a function exported from a
 * client module throws if a server component calls it, while `tsc` and lint
 * pass it cleanly.
 */
export const LEAVE_TABS = ["types", "approval", "holidays"] as const;

export type LeaveTab = (typeof LEAVE_TABS)[number];

export function isLeaveTab(value: string | undefined): value is LeaveTab {
  return LEAVE_TABS.some((tab) => tab === value);
}
