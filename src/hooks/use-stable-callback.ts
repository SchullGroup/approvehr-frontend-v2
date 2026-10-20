"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * A function whose identity never changes and which always calls the latest one
 * it was given.
 *
 * For handing a handler to a memoised child. A handler written in a component
 * is a new function on every render, so a `memo` that compares props sees every
 * child as changed and re-renders all of them — which, in a list of fifty cards
 * with a dozen fields each, was one and a third seconds per keystroke. Passing
 * `useStableCallback(handler)` instead keeps the child's props equal for as long
 * as nothing about *it* changed.
 *
 * ## It is not a way around a dependency list
 *
 * The wrapper reads the latest handler at the moment it is **called**, never at
 * render, so it is only safe to call from an event handler or an effect. Calling
 * it while rendering would read the previous render's closure.
 *
 * The ref is updated in a layout effect, which runs during the commit — before
 * the browser can deliver the next event — so a second keystroke typed straight
 * after the first calls the handler the first one produced, not the one before
 * it.
 */
export function useStableCallback<Args extends unknown[], Result>(
  handler: (...args: Args) => Result,
): (...args: Args) => Result {
  const latest = useRef(handler);
  useLayoutEffect(() => {
    latest.current = handler;
  });
  return useCallback((...args: Args) => latest.current(...args), []);
}
