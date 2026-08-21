"use client";

import { useEffect, useState } from "react";

/**
 * A value that lags behind the one you passed until it stops changing.
 *
 * For turning "every keystroke" into "one request at the end". The `setState` is
 * inside a timer callback rather than in the effect body, which is what keeps it
 * clear of `react-hooks/set-state-in-effect` — that rule is about a synchronous
 * cascade during the effect, and this is not one.
 *
 * ## The trap this helper does not close on its own
 *
 * Debouncing the *request* does not debounce the *screen*. Between a keystroke
 * and the timer firing, the debounced value is still the old one — so a caller
 * that decides "am I loading?" from the debounced value will happily leave the
 * previous answer on screen next to an input that has already changed. On a
 * salary preview that is a wrong number presented as a right one.
 *
 * The fix belongs to the caller and is two lines: send the debounced value, and
 * decide whether the answer in hand is current by comparing it against the
 * **live** one. `lib/store/payslip-quote.ts` does exactly that and says so.
 */
export function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}
