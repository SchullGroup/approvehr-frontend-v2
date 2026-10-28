"use client";

import { useState } from "react";

/**
 * The last answer that was complete, held while the next one is on its way.
 *
 * ## The problem it exists for
 *
 * `useFetched` blanks its data the moment it is asked again. `reload()` changes
 * the key, the answer for the new key has not landed, and until it does `data`
 * is `null`. That is right for a screen that wants a skeleton while it waits
 * and wrong for one that keeps a form *inside* the list: blanking the list
 * unmounts the form, and somebody typing the tenth subsection in a row loses
 * their cursor, and what they chose in the picker beside it, after the ninth.
 *
 * Holding the last complete answer until the next one lands keeps the list, and
 * so the form, exactly where it was. What is held is a claim about the company
 * as it stood a moment ago, which is true enough to show for as long as a read
 * takes; it is never shown in place of a failed one, and it is replaced the
 * instant a fresh one arrives.
 *
 * ## How it works without an effect
 *
 * The held value is state, brought up to date **during render** whenever the
 * live one is ready and differs, which is the pattern React documents for
 * state derived from what a component was last given. No `setState` runs in an
 * effect, so there is no frame in which the screen shows something older than
 * what it was handed.
 *
 * ## `same` has to be able to say yes
 *
 * `live` is usually an object made fresh on every render, so identity can never
 * match and the render-time update would never settle. Pass a comparison that
 * looks at what is inside it. A comparison that always says no is an infinite
 * render, and React will tell you so.
 *
 * ## What it is not
 *
 * Not a cache and not a store: it holds one value, for one component, for as
 * long as that component is mounted. Nothing it holds survives a navigation.
 *
 * @param live  What the read gave this render. Meaningful only when `ready`.
 * @param ready True once the read behind `live` has answered. While false,
 *              `live` is whatever the read shows before it knows (an empty
 *              list), and is ignored.
 * @param same  Whether two values are the same answer. Defaults to identity.
 */
export function useHeld<T>(
  live: T,
  ready: boolean,
  same: (a: T, b: T) => boolean = Object.is,
): T {
  /* In a box, so a value that is itself a function is held and not called. */
  const [held, setHeld] = useState({ value: live });
  if (ready && !same(held.value, live)) setHeld({ value: live });
  return ready ? live : held.value;
}
