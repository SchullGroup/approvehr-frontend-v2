"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the screen is phone-width: below Tailwind's `sm` breakpoint, 640px.
 *
 * The same line the `max-sm:` classes on this screen draw, so a layout switch made
 * here and a class made there never disagree about what a phone is.
 *
 * Answers `false` on the server and wherever there is no `matchMedia` (jsdom), so
 * the desktop board is what renders until a real narrow window says otherwise. It
 * is read through `useSyncExternalStore`, never an effect, which is why switching
 * from the board to the stage list does not flash the wrong one first.
 */

const QUERY = "(max-width: 639.98px)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return () => undefined;
  const list = window.matchMedia(QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

function snapshot(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(QUERY).matches
  );
}

export function usePhone(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
