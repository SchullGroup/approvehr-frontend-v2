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

/**
 * Which open layer owns the keyboard: the one that opened last.
 *
 * ## The bug this replaces, which made a dialog over another layer unusable
 *
 * Every open layer adds its own `keydown` listener to `document`, and nothing
 * said which of them should act. With two open (a dialog over a side panel, or
 * over another dialog, both of which this app does) both acted on every key.
 *
 * - **Tab.** The lower layer saw focus outside itself and pulled it in; the
 *   upper layer then saw focus outside itself and pulled it back. Both call
 *   `preventDefault`, so the browser never moved focus on its own, and Tab
 *   always ended on the upper layer's first control and Shift+Tab on its last.
 *   The reason box and the buttons after it could not be reached without a mouse.
 * - **Escape.** Both called their `onClose`. `stopPropagation()` does not stop
 *   a second listener on the same node, so one press closed the dialog **and**
 *   whatever was under it, along with anything typed into it.
 *
 * Now the first thing every handler does is ask whether its layer is on top, and
 * a layer under another hears nothing. It is a stack because "on top" is a fact
 * about the order layers opened in, which no single layer can know of the others.
 *
 * ## Removal is by identity, never by popping
 *
 * Layers do not close in the order they opened. A parent clearing its state
 * closes both at once, and the lower one can be closed from outside while the
 * upper stays open. Popping would take out the wrong one and leave the layer that
 * is still open believing something else sits above it, with its keyboard dead.
 * Each open mints its own token (a fresh one every time, which also makes the
 * doubled effects of development harmless) and closing removes exactly that one.
 * Same reason the scroll lock above is a count and not a per-layer memory.
 *
 * ## Two layers that open in the same commit
 *
 * React runs a child's effect before its parent's, and siblings in tree order, so
 * which of two layers registers last depends on how they are written. That would
 * matter if registration order could disagree with paint order, so it was
 * measured and not assumed. Both layers are `z-50` portals into `document.body`,
 * so the later one in the document paints on top, and React puts the two
 * containers into the body in the same order it runs the two effects. The one
 * registered last is therefore the one painted last, whether the dialog is
 * written inside the panel or beside it in either order, and the keyboard goes
 * where the eyes are. `tests/focus-trap-stacked-layers.test.tsx` checks all
 * three, so a change to either order fails there. If it ever does, a layer should
 * be placed by its position in the document when it registers, not at the end.
 *
 * Not handled: a layer closed and reopened inside its own 250ms exit animation
 * keeps its old place in the document, so it can register above a layer that is
 * painted over it. That takes the lower of two open layers being closed and
 * reopened within a quarter of a second while the upper one stays open.
 */
const layerStack: symbol[] = [];

function pushLayer(layer: symbol): void {
  layerStack.push(layer);
}

function removeLayer(layer: symbol): void {
  const at = layerStack.indexOf(layer);
  if (at !== -1) layerStack.splice(at, 1);
}

function isTopmost(layer: symbol): boolean {
  return layerStack[layerStack.length - 1] === layer;
}

/**
 * Traps Tab within a container while open, moves focus in on mount, and
 * restores it to whatever was focused before on close. Also wires Escape.
 *
 * Several layers can be open at once and each has its own listener, so only the
 * one on top acts on Tab and Escape: the ones under it ignore every key until it
 * closes, and the one below takes the keyboard back the moment it does. See
 * `layerStack`.
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

    // One per open, so closing takes out this layer and no other.
    const layer = Symbol("focus-trap-layer");

    function onKeyDown(event: KeyboardEvent) {
      /* Only the layer on top acts. A layer under another must not hear the key
         at all, or two of them pull focus back and forth on Tab and both close
         on Escape: see `layerStack`. */
      if (!isTopmost(layer)) return;

      if (event.key === "Escape") {
        /* A control with its own list open takes the first Escape, and the
           dialog stays: it marks itself `data-escape-to-popup` while that is so
           (`SearchPicker`). This listener runs in the capture phase, so without
           the check it closes the dialog before the control ever hears the key,
           and whatever the person had typed goes with it. Opt-in by attribute,
           not by `role="combobox"`: the command palette is one and has no list
           of its own to close. */
        const focused = document.activeElement;
        if (focused?.closest("[data-escape-to-popup]")) return;
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

    // On top of every layer opened before this one.
    pushLayer(layer);

    // Prevent the page behind from scrolling while a layer is open.
    lockScroll();

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      removeLayer(layer);
      unlockScroll();
      restoreTo.current?.focus?.();
    };
  }, [open]);

  return ref;
}
