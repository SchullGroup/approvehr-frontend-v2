"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_SETTINGS, type PayrollSettings } from "./settings";

/*
 * A tiny store for company payroll settings.
 *
 * In the real product these come from the company record over the API. Here
 * they live in localStorage so a change made on the settings screen is picked
 * up by the run wizard — which is the whole point of making them settings.
 *
 * useSyncExternalStore rather than useState + effect, so every mounted
 * consumer re-reads on change and the server render stays deterministic.
 */

const KEY = "approvehr.payroll.settings";

let cache: PayrollSettings = DEFAULT_SETTINGS;
let hydrated = false;
const listeners = new Set<() => void>();

function loadFromStorage(): PayrollSettings {
  try {
    const raw = window.localStorage.getItem(KEY);
    /* Merge over defaults so a settings object saved by an older build does
       not lose fields added since. */
    return raw
      ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as PayrollSettings) }
      : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Returns defaults until the first subscription runs. Reading localStorage
 * during render would make the client's first paint disagree with the server
 * HTML — see the same note in lib/store/employees.
 */
function read(): PayrollSettings {
  return cache;
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  if (!hydrated) {
    hydrated = true;
    queueMicrotask(() => {
      const stored = loadFromStorage();
      if (stored !== DEFAULT_SETTINGS) {
        cache = stored;
        listeners.forEach((l) => l());
      }
    });
  }

  return () => {
    listeners.delete(listener);
  };
}

export function usePayrollSettings() {
  const settings = useSyncExternalStore(
    subscribe,
    read,
    () => DEFAULT_SETTINGS, // server snapshot
  );

  const save = useCallback((next: PayrollSettings) => {
    cache = next;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* Storage can be unavailable in private mode. The in-memory cache still
         holds for this session, which is enough for the change to apply. */
    }
    listeners.forEach((l) => l());
  }, []);

  const reset = useCallback(() => {
    cache = DEFAULT_SETTINGS;
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l());
  }, []);

  return { settings, save, reset };
}
