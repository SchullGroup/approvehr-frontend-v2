"use client";

import { useSyncExternalStore } from "react";
import { createPersistedState } from "./persisted";

/**
 * Whether the guided walk through setting the company up has been offered yet.
 *
 * Christianah asked for *"pop-ups to guide users through initial system
 * setup"*. `/settings` already lists what is outstanding and the dashboard
 * already names the next thing — both of which somebody has to go and read.
 * What was missing is the product coming to them once, on the screen they land
 * on, and walking them through it.
 *
 * ## This store holds no facts about the company. Deliberately.
 *
 * It holds two booleans about *this browser*: whether the guide has opened by
 * itself yet, and whether the person shut it. **What is actually set up is read
 * from `GET /setup/checklist` every time**, through the same `checklistRows`
 * the settings hub and the dashboard prompt use.
 *
 * That separation is the whole design. A tour that ticked a step because
 * somebody pressed Next would tell a company its payroll was configured when it
 * was not — a green mark against work nobody did, which is the class of wrong
 * claim this codebase refuses everywhere else. Pressing Next moves the reader;
 * it cannot move the checklist.
 *
 * The consequence is worth stating because it is a feature rather than a
 * shortfall: reopen the guide after fixing something in another tab and the
 * step is ticked, because the answer came from the server and not from here.
 *
 * ## Per browser, and it says so on screen
 *
 * `localStorage`, so a colleague on another machine gets the guide once too.
 * Right for a prompt: two administrators setting a company up should each be
 * offered the walk. Wrong for anything that decides what is done, which is the
 * other reason none of that is here.
 */
type GuideState = {
  /**
   * Somebody was shown the guide **and responded to it** — pressed anything at
   * all, including Next. Only then does it stop offering itself.
   *
   * Written on the first press rather than when it opens, and that distinction
   * is a bug this had: signing in with an unfinished company redirects to the
   * setup wizard, so the dashboard mounts for a frame on the way past. The
   * guide's effect fired, spent the one offer, and the reader never saw it.
   * A once-only offer has to be spent by a person, not by a render.
   */
  offered: boolean;
  /** Shut deliberately. Suppresses the offer even if `offered` is somehow lost. */
  dismissed: boolean;
};

const EMPTY: GuideState = { offered: false, dismissed: false };

const store = createPersistedState<GuideState>({
  key: "approvehr.setup.guide",
  empty: EMPTY,
});

/**
 * Subscribe to the store, so a commit re-renders whoever is watching.
 *
 * **Do not decide anything from this.** `read` returns the seed until
 * hydration lands a microtask later — that is the whole hydration rule at the
 * top of `persisted.ts` — so on the first render after a reload it says
 * "never offered" about a browser that was offered the guide last week. Which
 * is precisely how the first version of this reopened itself on every load.
 * Ask `guideStateNow()` instead.
 */
export function useSetupGuideState(): GuideState {
  return useSyncExternalStore(
    store.subscribe,
    store.read,
    store.getServerSnapshot,
  );
}

/**
 * What this browser actually holds, hydrating if nothing has yet.
 *
 * The write-path read — `current()`, not `read()` — and legal only outside
 * render. It is called from an effect, which is not render, and never from a
 * component body: putting stored state into the first paint is the hydration
 * mismatch this store's factory exists to avoid.
 */
export function guideStateNow(): GuideState {
  return store.current();
}

/**
 * The reader touched the guide, so it has been offered for real.
 *
 * Called from every control in the modal, not from the effect that opens it —
 * see `offered` above for the frame-of-the-dashboard bug that distinction
 * fixes.
 *
 * `current()`, never `read()` — this writes, and a write computed from the seed
 * would discard whatever the browser already holds. `verify-stores` enforces
 * it; the incident that produced the rule is at the top of `persisted.ts`.
 */
export function markGuideOffered(): void {
  const held = store.current();
  if (held.offered) return;
  store.commit({ ...held, offered: true });
}

export function dismissGuide(): void {
  store.commit({ ...store.current(), offered: true, dismissed: true });
}

/** Somebody asked for it again. Clears the dismissal; the offer stays spent. */
export function reopenGuide(): void {
  store.commit({ ...store.current(), dismissed: false });
}
