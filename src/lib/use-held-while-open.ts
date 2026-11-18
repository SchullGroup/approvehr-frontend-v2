"use client";

import { useState } from "react";

/**
 * A list that is open is never rearranged under somebody's pointer.
 *
 * ## The problem it exists for
 *
 * A list that is ordered by something that arrives late (here, who shared a project with somebody) is
 * drawn plain and then reordered when the answer lands. For a list somebody has already opened that is
 * not a refinement but a hazard: a native `<select>` that is open and has its options inserted at the
 * top reflows under the pointer, and the click that was meant for one person lands on another. For an
 * appraiser, which moves a mark, that is the expensive wrong click.
 *
 * ## The rule
 *
 * Take a snapshot of what the list shows at the moment the person reaches for it and keep showing
 * exactly that until they are done with it (`release`: blur, or a choice made). What arrives in between
 * is applied the next time the list is opened. **The list the person sees is the list they open and the
 * list they click.**
 *
 * Two ways in, because a list is reached in two ways. `hold` is for focus and keys: it takes a snapshot
 * only if none is held, so arrowing through a list does not keep re-taking it. `press` is for the press
 * that opens the list: it always takes a new snapshot, so a list that was opened, dismissed with Escape
 * (which leaves the focus where it was) and opened again shows what has arrived since, and not what it
 * showed the first time.
 *
 * `active` lets a caller that has its own notion of "done" (a dialog closing) release the snapshot from
 * outside: while it is false nothing is held.
 *
 * ## How it works without an effect
 *
 * The snapshot is state, taken in an event handler and released in one, or while rendering when `active`
 * turns false, which is the pattern React documents for state derived from what a component was given.
 */
export function useHeldWhileOpen<T>(
  live: T,
  active = true,
): {
  /** What to draw: the snapshot while one is held, otherwise the live value. */
  shown: T;
  holding: boolean;
  hold: () => void;
  press: () => void;
  release: () => void;
} {
  /* In a box, so a snapshot that is itself `null` is held and not mistaken for "none held". */
  const [held, setHeld] = useState<{ value: T } | null>(null);
  if (!active && held !== null) setHeld(null);
  return {
    shown: held !== null ? held.value : live,
    holding: held !== null,
    hold: () => {
      if (held === null) setHeld({ value: live });
    },
    press: () => setHeld({ value: live }),
    release: () => {
      if (held !== null) setHeld(null);
    },
  };
}
