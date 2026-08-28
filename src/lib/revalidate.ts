"use client";

import { useSyncExternalStore } from "react";

/**
 * Re-ask the API when somebody comes back to the window.
 *
 * ## The bug this exists for
 *
 * Two accounts, two windows, side by side. A change made in one never appeared
 * in the other. The change had saved perfectly well — **neither window ever
 * asked again**. Every store in `lib/store/` fetches inside a `useEffect` when
 * its screen mounts and then holds that answer until something on the page
 * calls `reload()`. There was no polling, no socket, and no revalidation
 * anywhere in the app, so a screen you were looking at was as old as the moment
 * you opened it.
 *
 * The honest framing is that the data was never wrong — it was **stale, with
 * nothing to say so**, which reads exactly like a save that did not work.
 *
 * ## Why window focus and not `visibilitychange` alone
 *
 * This is the part that decides whether the reported case is fixed at all.
 *
 * `visibilitychange` fires when a tab is switched away from or a window is
 * minimised. It does **not** fire when you click from one visible window into
 * another visible window — which is precisely "two windows side by side", the
 * arrangement this was reported from. Both windows stay `visible` the whole
 * time; only `focus` moves.
 *
 * So the signal is *engagement*: visible **and** focused. `blur` is what fires
 * when somebody clicks into the other window, and `focus` is what fires when
 * they come back. `visibilitychange` is kept beside it because it is the one
 * that fires for tabs and for a minimised window, where `blur` may not.
 *
 * ## Why a bump rather than a refetch
 *
 * This module knows nothing about requests. It publishes a number that goes up,
 * and every store puts that number in its fetch effect's dependency list — so
 * the effect that already knows how to load that store's data runs again.
 *
 * The number deliberately does **not** go into the key those stores compare
 * during render to decide `loading`. That is what makes this invisible: the
 * effect refires, the answer replaces the old one when it lands, and the screen
 * never flashes a skeleton over data it is already showing. A revalidation that
 * blanked the page on every alt-tab would be worse than the staleness.
 *
 * ## The two guards, and the budget they are sized against
 *
 * `RATE_LIMIT_MAX` on the API is **300 requests per 15 minutes, keyed per
 * session** (`src/config/env.ts`). A busy screen mounts several hooks, so an
 * unguarded "refetch on every focus event" is a real way to spend somebody's
 * whole allowance by alt-tabbing — and the failure mode is every panel on the
 * page reading "Too many requests" at once, which is indistinguishable from the
 * API being down.
 *
 * Hence two guards, and neither is arbitrary:
 *
 * - **`AWAY_MS`** — a return only counts if they were actually away that long.
 *   Clicking a notification and coming straight back is not somebody who has
 *   been off changing data elsewhere. Three seconds is enough to exclude a
 *   mis-click and short enough that the side-by-side case — go to the other
 *   window, change a thing, come back — always clears it.
 *
 * - **`MIN_INTERVAL_MS`** — a floor between two bumps however often focus
 *   moves. This is the one that bounds the worst case: at one bump per 20
 *   seconds, somebody flipping between windows without pause for a quarter of
 *   an hour gets at most 45 bumps rather than several hundred.
 *
 * ## What is deliberately not revalidated
 *
 * Stores that compute an answer from what the reader is typing — the payslip
 * quote, the pay preview — are left out. Nobody else can change the answer to
 * "what would this salary take home", so re-asking spends a request from the
 * budget above to receive the same number back. The rule is: **revalidate
 * shared state; do not revalidate a computation of your own input.**
 *
 * `store/session.ts` is also left out. Who is signed in is not data on a
 * screen, and re-running the auth lifecycle on every window focus is a way to
 * turn a token refresh into a sign-out; the client already rotates refresh
 * tokens through one shared promise for exactly that reason.
 */

/** How long somebody must have been away before coming back counts. */
const AWAY_MS = 3_000;

/** The floor between two bumps, however often focus moves. */
const MIN_INTERVAL_MS = 20_000;

let generation = 0;
let lastBumpAt = 0;
/** When engagement was lost. Null while engaged. */
let awaySince: number | null = null;
let wired = false;

const listeners = new Set<() => void>();

function publish(): void {
  generation += 1;
  lastBumpAt = Date.now();
  for (const listener of listeners) listener();
}

/** Visible *and* focused. Either one going away is a departure. */
function engaged(): boolean {
  return document.visibilityState === "visible" && document.hasFocus();
}

function onLeave(): void {
  /* Only the first departure counts — `blur` and `visibilitychange` both fire
     when a window is minimised, and the second must not reset the clock the
     first one started. */
  if (awaySince === null) awaySince = Date.now();
}

function onReturn(): void {
  if (!engaged()) return;
  const departedAt = awaySince;
  awaySince = null;
  if (departedAt === null) return;

  const now = Date.now();
  if (now - departedAt < AWAY_MS) return;
  if (now - lastBumpAt < MIN_INTERVAL_MS) return;
  publish();
}

function onVisibility(): void {
  if (document.visibilityState === "visible") onReturn();
  else onLeave();
}

/**
 * Wired once for the whole application, not once per hook.
 *
 * Forty stores call `useRevalidation`, and a screen can mount a dozen of them.
 * Registering the DOM listeners here rather than in each subscriber keeps that
 * at three listeners rather than three dozen, and means the away-clock is one
 * clock — which it has to be, because "how long was this person gone" is a fact
 * about the window and not about any one store.
 */
function wire(): void {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("focus", onReturn);
  window.addEventListener("blur", onLeave);
  document.addEventListener("visibilitychange", onVisibility);
}

/**
 * Listen for returns without being a React hook.
 *
 * Exported because it is the only honest way to test this: the decision — was
 * that a real absence, has enough time passed — lives between two DOM events,
 * and the environment a check runs in has no focused window to produce them.
 * `scripts/verify-revalidate.ts` drives these two functions with a stubbed
 * `window`/`document` and a stubbed clock, which exercises the same code a
 * browser does rather than a copy of it.
 */
export function subscribeToRevalidation(listener: () => void): () => void {
  wire();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The current generation. Goes up on a return; never resets. */
export function revalidationCount(): number {
  return generation;
}

const subscribe = subscribeToRevalidation;
const getSnapshot = (): number => generation;

/* Zero on the server, and `generation` starts at zero, so the first client
   render matches the markup it is hydrating. Getting this wrong is the
   hydration mismatch `store/persisted.ts` documents at length. */
const getServerSnapshot = (): number => 0;

/**
 * A number that goes up when the reader comes back to the window.
 *
 * Put it in a fetch effect's dependency list — **never** in the key a store
 * compares during render to decide whether it is loading:
 *
 * ```ts
 * const revalidation = useRevalidation();
 * useEffect(() => {
 *   // …the fetch that was already here…
 * }, [isConnected, year, key, revalidation]);
 * ```
 */
export function useRevalidation(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** For tests and for the verify script. Not for screens. */
export const REVALIDATE_TUNING = { AWAY_MS, MIN_INTERVAL_MS } as const;
