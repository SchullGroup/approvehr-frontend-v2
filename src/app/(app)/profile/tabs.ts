/**
 * The tab ids for `/profile`, and nothing else.
 *
 * Deliberately its own module with **no `"use client"`**, for the reason
 * `payroll/pay-setup/tabs.ts` records: the tab is validated on the server in
 * `page.tsx` and rendered on the client in `profile-screen.tsx`, and a function
 * exported from a client module cannot be called from a server component. That
 * error only appears in the browser — `tsc` and `lint` pass either way.
 *
 * The order of the tabs comes from this array in both places, so they cannot
 * drift apart.
 *
 * ## Why these six
 *
 * `PARITY.md` Rule 5: a screen answers one question. `/profile` was nine
 * unconditional sections answering nine, so the question is the tab and each
 * one is named as the reader would ask it:
 *
 * | Tab | The question |
 * |---|---|
 * | `details` | what does the company have on me, and who can get into my account |
 * | `pay` | what am I paid, where does it go, what am I repaying |
 * | `time-off` | when am I off, and when am I working |
 * | `conduct` | is there a warning on my record |
 * | `history` | why am I on the grade I'm on, and who decided it |
 * | `equipment` | what have I been given that I have to hand back |
 *
 * `conduct` and `history` are the two things `/people/[id]` — the HR-facing
 * view of somebody *else's* record — could answer about you that nothing
 * here could, until `/people/[id]` was made to redirect your own id straight
 * back to this page. Both mount the identical panel that page already used
 * (`ConductPanel`, `EmploymentHistoryPanel`), which already derive their own
 * "is this the subject" check from the session rather than trusting a caller
 * — nothing here re-implements either.
 *
 * `details` is first because it is the default, and the default has to be the
 * one that carries anything live — an exit already in progress renders there,
 * and a tab nobody selects is a reveal.
 */
export const PROFILE_TABS = [
  "details",
  "pay",
  "time-off",
  "conduct",
  "history",
  "equipment",
] as const;

export type ProfileTab = (typeof PROFILE_TABS)[number];

export function isProfileTab(value: string | undefined): value is ProfileTab {
  return PROFILE_TABS.some((tab) => tab === value);
}
