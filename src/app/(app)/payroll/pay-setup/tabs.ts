/**
 * The tab ids, and nothing else.
 *
 * Deliberately its own module with **no `"use client"`**: the tab is validated
 * on the server in `page.tsx` and rendered on the client in
 * `pay-setup-screen.tsx`, and a function exported from a client module cannot be
 * called from a server component — Next throws "Attempted to call
 * isPaySetupTab() from the server". That error was real here, and it only
 * appeared in the browser: `tsc` and `lint` both pass either way.
 *
 * So the ids and the guard live here, and the labels and icons — which are JSX,
 * and therefore client-only — stay in the screen. The order of the tabs comes
 * from this array in both places, so they cannot drift apart.
 */
export const PAY_SETUP_TABS = ["allowances", "deductions", "grades"] as const;

export type PaySetupTab = (typeof PAY_SETUP_TABS)[number];

export function isPaySetupTab(value: string | undefined): value is PaySetupTab {
  return PAY_SETUP_TABS.some((tab) => tab === value);
}
