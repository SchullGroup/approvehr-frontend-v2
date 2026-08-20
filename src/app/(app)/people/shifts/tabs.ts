/**
 * The tab ids, in one plain module.
 *
 * Not in `shifts-screen.tsx`, because that is a client module and `page.tsx` is
 * a server component: calling a function exported from a `"use client"` file
 * inside a server component throws at request time while passing `tsc` and
 * `lint` cleanly. `pay-setup/tabs.ts` exists for the same reason and says so.
 */
export const SHIFT_TABS = ["rota", "catalogue"] as const;

export type ShiftTab = (typeof SHIFT_TABS)[number];

export function isShiftTab(value: string | undefined): value is ShiftTab {
  return value !== undefined && (SHIFT_TABS as readonly string[]).includes(value);
}
