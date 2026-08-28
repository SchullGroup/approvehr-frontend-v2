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
/**
 * Body scroll lock, counted rather than remembered per layer.
 *
 * ## The bug this replaces, which left the whole app unscrollable
 *
 * Each layer used to snapshot `document.body.style.overflow` when it opened and
 * write that snapshot back when it closed. With one layer that is correct. With
 * two it is not, and this app stacks them — the appraiser flow opens a list of
 * people and then a dialog for one of them on top.
 *
 * Outer opens: snapshot `""`, set `hidden`.
 * Inner opens: snapshot `"hidden"`, set `hidden`.
 *
 * Now the order of teardown decides the outcome. Unmount inner then outer and
 * it happens to work. Close the outer first — which is what a "save and close
 * everything" action does, and what React does when the parent's state clears
 * and both unmount together — and the outer restores `""` while the inner then
 * restores its snapshot of `"hidden"`. **The page never scrolls again**, on
 * every route, until a reload. No error, nothing in the console, and the
 * element responsible is long gone.
 *
 * A count has no ordering problem: the first layer locks, the last unlocks, and
 * whichever order they arrive in the arithmetic is the same.
 *
 * The original value is captured **once**, when the count goes from zero to
 * one, so a page that deliberately sets its own `overflow` still gets it back.
 * Module scope rather than a ref, because the layers do not know about each
 * other — which is the whole reason the per-layer snapshot failed.
 */
let openLayers = 0;
let overflowBeforeFirstLayer = "";

function lockScroll(): void {
  if (typeof document === "undefined") return;
  if (openLayers === 0) {
    overflowBeforeFirstLayer = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  openLayers += 1;
}

function unlockScroll(): void {
  if (typeof document === "undefined") return;
  /* Never below zero. A double cleanup — React 18's development remount does
     exactly that — would otherwise leave the count negative, and the next real
     layer would fail to lock. */
  openLayers = Math.max(0, openLayers - 1);
  if (openLayers === 0) {
    document.body.style.overflow = overflowBeforeFirstLayer;
  }
}

/** For the check that proves the count returns to zero. Not for components. */
export const __scrollLockDepth = () => openLayers;

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
    lockScroll();

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      unlockScroll();
      restoreTo.current?.focus?.();
    };
  }, [open]);

  return ref;
}
