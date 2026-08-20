"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) =>
      !el.hasAttribute("disabled") &&
      el.getAttribute("aria-hidden") !== "true" &&
      el.offsetParent !== null,
  );
}

/**
 * Traps Tab within a container while open, moves focus in on mount, and
 * restores it to whatever was focused before on close. Also wires Escape.
 *
 * The close handler is held in a ref rather than being an effect dependency.
 * Callers almost always pass an inline arrow function, so depending on its
 * identity would tear the trap down and rebuild it on every render, which
 * repeatedly restores focus to the opener and leaves the dialog unfocused.
 *
 * Returns a ref to attach to the container element.
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onClose?: () => void,
) {
  const ref = useRef<T>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  const closeRef = useRef(onClose);

  // Kept current in an effect rather than assigned during render, so the
  // Escape handler always calls the latest closure without the trap effect
  // having to depend on its identity.
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    restoreTo.current = document.activeElement as HTMLElement | null;

    const node = ref.current;
    if (!node) return;

    // Move focus to the first meaningful control, or the container itself.
    // Done synchronously: the DOM is already committed when an effect runs, and
    // deferring to requestAnimationFrame is unreliable because browsers throttle
    // frames in background or inactive tabs, which would leave the dialog open
    // with focus stranded on the body.
    const initial = focusableWithin(node)[0] ?? node;
    initial.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeRef.current?.();
        return;
      }

      if (event.key !== "Tab") return;

      const current = ref.current;
      if (!current) return;

      const items = focusableWithin(current);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      // Anything outside the container, including focus that escaped to the
      // body, is pulled back to the appropriate end.
      if (!current.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }

      if (event.shiftKey && (active === first || active === current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);

    // Prevent the page behind from scrolling while a layer is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      restoreTo.current?.focus?.();
    };
  }, [open]);

  return ref;
}
