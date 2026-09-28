"use client";

import { useEffect, useState } from "react";

export type Dismiss = {
  /** Render the surface at all. False only once the exit animation has run. */
  mounted: boolean;
  /** True for exactly the duration of the exit animation. Swap the enter
   *  animation class for its exit counterpart while this is true. */
  closing: boolean;
};

/**
 * Keeps a dismissible surface mounted for one more animation cycle after
 * `open` goes false, so it can play an exit animation instead of vanishing.
 *
 * ## The bug this replaces
 *
 * `Modal`, `Drawer`, `Toast` and the guided tour's `Spotlight` all animated
 * *in* with a keyframe and then, on close, did `if (!open) return null` —
 * removed on the same render that flipped the flag. There was no exit path:
 * not a fast one, not a disabled one, none at all. A drawer that slides in
 * from the right then simply disappears reads as a glitch, not a dismissal,
 * because half the sentence is missing — see §7 of the fluid-interface
 * material this fixes against: "if something disappears one way, we expect
 * it to emerge from where it came."
 *
 * ## Why a hook and not a per-component `useState`
 *
 * Four call sites had the identical bug, which means it was never really
 * four bugs — it was one shape, missed once and then copied. Fixing it once,
 * shared, is what stops a fifth dismissible surface reintroducing it.
 *
 * ## Why the durations are a parameter, not read from CSS
 *
 * Reading a running animation's duration back out of the stylesheet needs a
 * live element to measure (`getComputedStyle`) and a render that has
 * already committed one — ordering this needs to be right before the very
 * first frame, not after. The duration this hook is given must match the
 * exit keyframe the caller applies while `closing` is true (see the
 * `animate-*-out` utilities in `globals.css`); a mismatch either cuts the
 * animation short or holds the surface mounted, invisible, past its own end.
 *
 * ## Detecting the `open` transition happens during render, not in an effect
 *
 * The first draft compared `open` against a ref inside a `useEffect` and
 * called `setMounted`/`setClosing` from there. That is the
 * `react-hooks/set-state-in-effect` anti-pattern the lint rule exists to
 * catch: deriving state from a prop that just changed is a render-time
 * question, and answering it inside an effect costs an extra commit-and-paint
 * round trip for no reason. `previousOpen` is state rather than a ref for the
 * same reason the React docs' own "adjust state while rendering" example
 * uses state — mutating a ref during the render body is impure, and this
 * value is read back to decide what to render.
 *
 * The `useEffect` that remains is only for the part that is genuinely an
 * effect: scheduling the timer that ends `closing`. It is keyed on `closing`
 * itself, not on `open`, which is what makes the interruption case below a
 * matter of the effect's own cleanup rather than a branch this hook has to
 * write by hand.
 *
 * ## Interruption: closing again just cancels
 *
 * If `open` flips back to `true` while still `closing`, the pending unmount
 * is cancelled and the surface is simply open again — no flicker, no
 * forcing the exit to finish first. This is not the interruptible-mid-flight
 * grab the fluid-interface material means by that word (there is no gesture
 * here to redirect, and no spring to re-target); it is the ordinary case of
 * two clicks landing close together. Reopening sets `closing` back to
 * `false` during render, which changes the timer effect's dependency and
 * lets its own cleanup clear the previous timer — nothing here has to notice
 * the interruption explicitly.
 */
export function useDismiss(open: boolean, durationMs: number): Dismiss {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const [previousOpen, setPreviousOpen] = useState(open);

  if (previousOpen !== open) {
    setPreviousOpen(open);
    if (open) {
      setMounted(true);
      setClosing(false);
    } else {
      setClosing(true);
    }
  }

  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, durationMs);
    return () => clearTimeout(timer);
  }, [closing, durationMs]);

  return { mounted, closing };
}
