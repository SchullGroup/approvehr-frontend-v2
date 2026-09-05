"use client";

import { useSyncExternalStore } from "react";

import { createPersistedState } from "./persisted";

export type ThemeChoice = "light" | "dark" | "system";

/**
 * Light, dark, or match-device — a personal, per-browser preference, not
 * synced through the API. There is no user-preferences endpoint anywhere in
 * this codebase, and every comparable browser-local preference here already
 * says so explicitly in its own copy (the employee draft, the various "this
 * browser only" badges); this follows the same rule rather than inventing an
 * account-wide one nobody asked for.
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
  empty: { choice: "system" },
});

/** Resolves "system" against the OS preference at call time. Never persisted. */
export function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice !== "system") return choice;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Sets or clears the same `data-theme` attribute the init script sets. */
export function applyTheme(choice: ThemeChoice): void {
  if (resolveTheme(choice) === "dark") {
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
