"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useIsClient } from "@/hooks/use-is-client";

/**
 * A dimmed screen with one real element left lit, and a card beside it.
 *
 * The one piece of UI this design system did not already have. `Modal` and
 * `Drawer` own the screen and sit where they choose; `InfoTooltip` floats a
 * panel next to *its own trigger* using nothing but `group-hover`. Neither can
 * point at an arbitrary element somewhere else on the page, which is the whole
 * mechanic of a tour — so this is the positioner, and it is deliberately the
 * only thing in here that knows about geometry.
 *
 * ## Why the styles are written to the nodes rather than held in state
 *
 * Measuring an element, storing the numbers with `setState` and re-rendering
 * is a cascading render per measurement, and it fires again on every scroll
 * and resize frame. The card's position is not application state — nothing
 * else in the product wants to read it — so the layout effect measures and
 * assigns `style.top`/`style.left` directly. That is what a positioning engine
 * does, and it keeps this clear of `react-hooks/set-state-in-effect` honestly
 * rather than by suppressing it.
 *
 * ## A target that is not there is not an error
 *
 * The sidebar is `hidden lg:block`, so on a phone the element a step wants to
 * point at genuinely does not exist. `find` takes a list and returns the first
 * one actually rendered *and* visible — a `display: none` element measures
 * zero and is treated as absent — and when nothing matches, the card centres
 * itself and the cut-out is hidden. The step still reads; it just stops
 * claiming to point at something.
 */

const PADDING = 12;
const GAP = 12;
/** How far the lit area extends past the element, so it does not look clipped. */
const HALO = 6;

const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(value, high));

/** The first of these selectors that is on the page and actually visible. */
export function findTarget(selectors: readonly string[]): Element | null {
  for (const selector of selectors) {
    for (const node of document.querySelectorAll(selector)) {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return node;
    }
  }
  return null;
}

export function Spotlight({
  /** Tried in order. The first one rendered and visible wins. */
  target,
  onDismiss,
  children,
}: {
  target: readonly string[];
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  const isClient = useIsClient();
  const cardRef = useRef<HTMLDivElement>(null);
  const holeRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  /* Serialised so the layout effect re-runs when the step changes its target
     rather than on every render — an array literal is a new reference each
     time. */
  const key = target.join("|");

  const place = useCallback(() => {
    const card = cardRef.current;
    const hole = holeRef.current;
    const backdrop = backdropRef.current;
    if (!card) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const box = card.getBoundingClientRect();
    const node = findTarget(key.split("|").filter(Boolean));

    /* Exactly one of the two dims the screen. The cut-out does it with a
       spread shadow, which needs something to cut *out* of — so a step with
       nothing to point at falls back to a plain full-screen dim rather than
       floating over an undimmed page. */
    if (!node) {
      if (hole) hole.style.opacity = "0";
      if (backdrop) backdrop.style.opacity = "1";
      card.style.top = `${clamp((vh - box.height) / 2, PADDING, vh - box.height - PADDING)}px`;
      card.style.left = `${clamp((vw - box.width) / 2, PADDING, vw - box.width - PADDING)}px`;
      return;
    }

    const rect = node.getBoundingClientRect();
    if (backdrop) backdrop.style.opacity = "0";
    if (hole) {
      hole.style.opacity = "1";
      hole.style.top = `${rect.top - HALO}px`;
      hole.style.left = `${rect.left - HALO}px`;
      hole.style.width = `${rect.width + HALO * 2}px`;
      hole.style.height = `${rect.height + HALO * 2}px`;
    }

    /* Beside first, then under, then over, then give up and centre. Beside is
       first because the thing being pointed at is most often a sidebar item,
       and a card under one covers the items below it — which are the context
       that makes the one above it legible. */
    let top: number;
    let left: number;
    if (rect.right + GAP + box.width <= vw - PADDING) {
      left = rect.right + GAP;
      top = rect.top;
    } else if (rect.left - GAP - box.width >= PADDING) {
      left = rect.left - GAP - box.width;
      top = rect.top;
    } else if (rect.bottom + GAP + box.height <= vh - PADDING) {
      top = rect.bottom + GAP;
      left = rect.left;
    } else if (rect.top - GAP - box.height >= PADDING) {
      top = rect.top - GAP - box.height;
      left = rect.left;
    } else {
      top = (vh - box.height) / 2;
      left = (vw - box.width) / 2;
    }

    card.style.top = `${clamp(top, PADDING, Math.max(PADDING, vh - box.height - PADDING))}px`;
    card.style.left = `${clamp(left, PADDING, Math.max(PADDING, vw - box.width - PADDING))}px`;
  }, [key]);

  /* Layout, not effect: the card is painted at its final position rather than
     at 0,0 for one frame and then moved. */
  useLayoutEffect(() => {
    const node = findTarget(key.split("|").filter(Boolean));
    /* `nearest` rather than `center` — a nav item already in view should not
       jump, and one below the fold should come up by the least that works. */
    node?.scrollIntoView({ block: "nearest", inline: "nearest" });
    place();
  }, [key, place]);

  useEffect(() => {
    const onMove = () => place();
    window.addEventListener("resize", onMove);
    /* Capture, so a scroll inside the sidebar or a page container is seen and
       not only a scroll of the window itself. */
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [place]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onDismiss();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onDismiss]);

  if (!isClient) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60]" role="presentation">
      {/* Used only by a step with nothing to point at — see `place`. */}
      <div
        ref={backdropRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-scrim/60 opacity-0 transition-opacity duration-150"
      />

      {/* The dim and the cut-out are one element: an enormous spread shadow
          covers the screen and the box itself stays clear, which needs no SVG
          mask and no four-rectangle frame to keep in sync. */}
      <div
        ref={holeRef}
        aria-hidden="true"
        className="pointer-events-none fixed rounded-lg opacity-0 shadow-[0_0_0_9999px_rgb(16_24_32/0.6)] ring-2 ring-accent transition-opacity duration-150"
      />

      {/* Clicking the dim closes it. A tour you cannot get out of by clicking
          away is a modal wearing a friendly hat. */}
      <button
        type="button"
        aria-label="Close the tour"
        className="fixed inset-0 h-full w-full cursor-default"
        onClick={onDismiss}
      />

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-label="Guided tour"
        className="animate-scale-in fixed w-[min(20rem,calc(100vw-1.5rem))] rounded-lg border border-line bg-surface p-4 shadow-xl"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
