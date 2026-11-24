"use client";

import { useEffect } from "react";
import { useStableCallback } from "./use-stable-callback";

/**
 * Escape closes a menu written by hand, and focus goes back to its button.
 *
 * `RowActions` does this itself. The few menus built before it (the account
 * menu, the clock menu, a row menu or two) opened with an invisible overlay to
 * catch a press outside, and nothing listened for Escape: the menu stayed open
 * and the overlay went on blocking clicks (UAT 23 Nov, L35: NC-34).
 *
 * The listener is on `window`, in the capture phase, and stops the event, so
 * the first Escape closes only the menu. A dialog behind it listens on
 * `document` and hears the second one, the same order `InfoTooltip` uses.
 */
export function useCloseOnEscape(
  open: boolean,
  close: () => void,
  trigger?: React.RefObject<HTMLElement | null>,
) {
  /* The latest `close`, without re-listening every render for a new arrow. */
  const onClose = useStableCallback(close);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
      trigger?.current?.focus();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose, trigger]);
}
