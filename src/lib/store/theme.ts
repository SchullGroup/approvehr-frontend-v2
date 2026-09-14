"use client";

import { useSyncExternalStore } from "react";

import { createPersistedState } from "./persisted";

export type ThemeChoice = "light" | "dark";

/**
 * Light or dark — a personal, per-browser preference, not synced through the
 * API. There is no user-preferences endpoint anywhere in this codebase, and
 * every comparable browser-local preference here already says so explicitly
 * in its own copy (the employee draft, the various "this browser only"
 * badges); this follows the same rule rather than inventing an account-wide
 * one nobody asked for.
 *
 * **Deliberately no "match device" option.** The default is light, always,
 * and the only way to get dark is a manual switch on the Appearance screen —
 * it never reads `prefers-color-scheme`. An earlier version of this store had
 * a third `"system"` choice that did; it was removed on request, because a
 * product that quietly renders dark for some visitors and light for others,
 * based on an OS setting nobody here chose, is a support question waiting to
 * happen. If "match device" is ever wanted back, it is a fourth `ThemeChoice`
 * member plus the `matchMedia` read this file used to carry — not a change to
 * what light means as a default.
 *
 * `version: 2` (was implicitly 1) so a browser holding an old `"system"`
 * value — no longer a legal `ThemeChoice` — gets dropped back to `empty`
 * rather than stranded. `lib/theme-init-script.ts` hardcodes the same `2`;
 * keep them in sync, per that file's own note.
 *
 * This store only ever answers "what is the chosen preference" for the
 * Settings screen to render as selected. It never applies the theme itself —
 * see `lib/theme-init-script.ts` (the blocking, pre-paint half) and
 * `components/portal/theme-effect.tsx` (the live, post-mount half) for that.
 * Routing theme *application* through this hook's normal render path would
 * still flash light-then-dark on every load, which is exactly what those two
 * exist to avoid.
 */
const store = createPersistedState<{ choice: ThemeChoice }>({
  key: "approvehr.theme.store",
  empty: { choice: "light" },
  version: 2,
});

/** Sets or clears the same `data-theme` attribute the init script sets. */
export function applyTheme(choice: ThemeChoice): void {
  if (choice === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

/** The chosen preference and a setter, for the Appearance screen. */
export function useThemeChoice(): {
  choice: ThemeChoice;
  setChoice: (next: ThemeChoice) => void;
} {
  const choice = useSyncExternalStore(
    store.subscribe,
    // read-for-render: getSnapshot must return the field itself.
    () => store.read().choice,
    () => store.getServerSnapshot().choice,
  );
  return {
    choice,
    // current(), not read(): this is a write path. See persisted.ts's header.
    setChoice: (next) => store.commit({ choice: next }),
  };
}

export { store as themeStore };
