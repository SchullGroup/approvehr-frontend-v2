"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Dragging a thing into a place, rather than reordering a list.
 *
 * ## Why this is not `sortable.tsx`
 *
 * `Sortable` moves a row **within one list** — it measures its siblings once,
 * slides the ones it crosses, and reports a new index. Everything it does is
 * about a single ordered container, and none of it applies here: a person
 * dragged out of Engineering and into Finance is not changing position, they
 * are changing parent, and there is no index to report. A candidate dragged
 * from Shortlisted to Interview is the same shape. Bending `Sortable` into
 * doing both would give one component two unrelated jobs and a `mode` prop.
 *
 * What the two share is the **feel**, and that is shared properly: the lift,
 * the tilt and the settle come from `.ahr-sortable-lifted` in `globals.css`,
 * which is where `prefers-reduced-motion` can reach them. `scrollParent` is
 * shared too — `sortable.tsx` imports it from here.
 *
 * ## Where this came from, and what moved
 *
 * It lived in `app/(app)/people/org-chart/use-drag-into.ts`, which is a fine
 * place for a hook one screen uses and the wrong place for the one the hiring
 * board needed. Promoting it fixed three things that were wrong in the copy
 * only the org chart used, each of which `sortable.tsx` had already found and
 * written down:
 *
 * 1. **`onDrop` was called inside a `setState` updater.** React runs updaters
 *    during the render phase, so a caller holding state got "Cannot update a
 *    component while rendering a different component" — and whether it fired
 *    at all depended on React's eager-evaluation path. Release now reads a ref
 *    and calls `onDrop` from the handler, as two statements.
 * 2. **The listeners were re-subscribed on every frame.** `drag` was a
 *    dependency of the effect and changes on every `pointermove`, so the whole
 *    set was torn down and re-added per move. Keyed on whether a drag is live
 *    instead.
 * 3. **There was no edge auto-scroll.** Fine for a tree that fits; fatal for a
 *    horizontally scrolling board, where the column you are aiming at is often
 *    off-screen and there is no way to get to it mid-drag.
 *
 * ## Drop targets are found in the DOM, not registered
 *
 * A target marks itself with `data-drop-id`, and the drag reads the element
 * under the pointer with `elementFromPoint`. The alternative — a context every
 * target registers into — means bookkeeping that goes stale against a tree
 * that collapses and expands under the drag, and it would put a ref access in
 * render, which `react-hooks/refs` refuses for good reason (see the note in
 * `sortable.tsx`).
 *
 * `elementFromPoint` is the browser's own hit test, so it agrees with what the
 * person can actually see — including which of two overlapping targets is on
 * top, which a rect comparison gets wrong the moment anything is nested.
 *
 * ## Nothing here writes
 *
 * `onDrop` is handed the pair and the caller decides. The hook does not know
 * what a department or a pipeline stage is, so the same interaction carries a
 * person into a department, a department under another one, and a candidate
 * into a stage.
 */

export type DragState = {
  /** What is in the hand. */
  id: string;
  kind: string;
  /** Where the pointer is now, in client coordinates, for the ghost. */
  x: number;
  y: number;
  /** The target under the pointer, or null over nothing droppable. */
  over: string | null;
};

/** How close to an edge before the container starts scrolling, in px. */
const EDGE = 56;

/** Pixels per move event. Small enough to be steerable, fast enough to arrive. */
const SCROLL_STEP = 14;

export function useDragInto({
  onDrop,
  /** Refuses a target before it lights up — its own subtree, itself, and so on. */
  canDrop,
}: {
  onDrop: (moved: { id: string; kind: string }, targetId: string) => void;
  canDrop: (moved: { id: string; kind: string }, targetId: string) => boolean;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);

  /**
   * The drag, held in a ref as well as in state.
   *
   * ## Why both, and why the ref is written by hand
   *
   * `pointerup` has to read where the pointer ended up, and it cannot read
   * `drag`: that value changes on every `pointermove`, so making it a
   * dependency of the effect below would tear the window listeners down and
   * re-add them every frame, and the closure's copy would be a frame stale —
   * dropping onto whatever the *previous* move was over.
   *
   * `sortable.tsx` solves this with a `useLayoutEffect` that copies state into
   * a ref, and reasons carefully about React flushing the state update in a
   * microtask so the ref is current before the next macrotask. That reasoning
   * is correct in a browser and it is still an assumption about scheduling.
   * A test that dispatches `pointermove` and `pointerup` in one synchronous
   * block found it: the effect had not run, the ref held the pick-up value,
   * and the drop went nowhere.
   *
   * So `commit` writes both, in that order, at every point the drag changes.
   * The ref is then current by construction rather than by timing, and there
   * is nothing left to race. Writing a ref inside an event handler is exactly
   * what `react-hooks/refs` permits — the rule is about reads and writes
   * during *render*, which this is not.
   */
  const dragRef = useRef<DragState | null>(null);

  const commit = useCallback((next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const start = useCallback(
    (id: string, kind: string) => (event: React.PointerEvent<HTMLElement>) => {
      /* Primary button only: a right-click is a context menu and a middle-click
         is a paste on Linux. Neither is a drag. */
      if (event.button !== 0) return;
      event.preventDefault();
      commit({ id, kind, x: event.clientX, y: event.clientY, over: null });
      /* Capture, so the drag survives the pointer leaving the handle — which it
         does immediately, because the handle moves with the card. Without it a
         touch drag ends the moment the finger crosses the card's edge. */
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [commit],
  );

  /* Keyed on whether a drag is live, not on the drag itself, so a live drag
     subscribes once instead of once per frame. */
  const live = drag !== null;

  useEffect(() => {
    if (!live) return;

    const move = (event: PointerEvent) => {
      /* The browser's own hit test, so it agrees with what is visibly on top.
         `closest` walks up from whatever is under the pointer, which means the
         whole column is a target rather than only the pixels of its heading. */
      const under = document.elementFromPoint(event.clientX, event.clientY);
      const target = under?.closest<HTMLElement>("[data-drop-id]") ?? null;
      const id = target?.dataset["dropId"] ?? null;
      const current = dragRef.current;
      if (!current) return;
      const allowed =
        id !== null && canDrop({ id: current.id, kind: current.kind }, id)
          ? id
          : null;
      commit({
        ...current,
        x: event.clientX,
        y: event.clientY,
        over: allowed,
      });

      /* Auto-scroll near the edges of whatever is actually scrolling. Both
         axes, because the two callers scroll in different directions: the org
         chart is a tall tree in the page, the hiring board is a wide row of
         columns in its own overflow. A drag that cannot reach an off-screen
         target is a drag that only works on a big monitor. */
      const at = (under as HTMLElement | null) ?? null;
      const scroller = scrollParent(at, "x");
      if (scroller) {
        const box = viewportBox(scroller);
        if (event.clientX < box.left + EDGE) scroller.scrollLeft -= SCROLL_STEP;
        else if (event.clientX > box.right - EDGE)
          scroller.scrollLeft += SCROLL_STEP;
      }
      const vertical = scrollParent(at, "y");
      if (vertical) {
        const box = viewportBox(vertical);
        if (event.clientY < box.top + EDGE) vertical.scrollTop -= SCROLL_STEP;
        else if (event.clientY > box.bottom - EDGE)
          vertical.scrollTop += SCROLL_STEP;
      }
    };

    const up = () => {
      /* Read the release from the ref and call `onDrop` here, not inside a
         `setDrag` updater. React runs updaters during the render phase, so a
         caller that holds the board in its own state got "Cannot update a
         component while rendering a different component" — see the note at the
         top, and the longer version in `sortable.tsx`. */
      const current = dragRef.current;
      commit(null);
      if (current?.over)
        onDrop({ id: current.id, kind: current.kind }, current.over);
    };

    /* Escape abandons. A drag with no way out is a drag people are afraid to
       start, and on a screen that writes to somebody's record that matters. */
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") commit(null);
    };

    /* On `window`, so a pointer released outside the tree still ends the drag,
       and a cancelled one — a phone call, a system gesture — is treated as a
       release rather than leaving the screen stuck mid-move. */
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", key);
    };
  }, [live, canDrop, onDrop, commit]);

  return { drag, start };
}

/**
 * What is in the hand, following the pointer.
 *
 * Shared because the one thing that must not be got wrong is
 * `pointer-events: none`: without it the ghost becomes the element under the
 * cursor, `elementFromPoint` returns it instead of the column, and every drop
 * silently misses. That is a bug worth having in one place.
 *
 * Offset from the pointer rather than centred on it, so the cursor and the
 * label do not fight for the same pixels and the target underneath stays
 * visible.
 */
export function DragGhost({
  x,
  y,
  children,
  className,
}: {
  x: number;
  y: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed z-50 rounded-md border border-accent-line bg-surface px-3 py-1.5 text-body-sm text-ink shadow-lg",
        className,
      )}
      style={{ left: x + 12, top: y + 12 }}
    >
      {children}
    </div>
  );
}

/** Where a scroller's visible edges are, in client coordinates. */
function viewportBox(scroller: HTMLElement): {
  top: number;
  bottom: number;
  left: number;
  right: number;
} {
  if (scroller === document.scrollingElement) {
    return {
      top: 0,
      bottom: window.innerHeight,
      left: 0,
      right: window.innerWidth,
    };
  }
  const box = scroller.getBoundingClientRect();
  return { top: box.top, bottom: box.bottom, left: box.left, right: box.right };
}

/**
 * The nearest ancestor that actually scrolls, on one axis.
 *
 * Needed because the thing being dragged is usually inside a container with
 * its own `overflow: auto` — a drawer, or the hiring board's own horizontal
 * scroller — and scrolling the window instead would move nothing.
 *
 * The axis matters: the hiring board's scroller has `overflow-x: auto` and
 * `overflow-y: visible`, so a search that only looked at `overflowY` walks
 * straight past it and finds the document, which does not scroll sideways.
 * That is why this takes an axis rather than assuming vertical, and why
 * `sortable.tsx` — which only ever wants vertical — asks for `"y"`.
 *
 * Returns null rather than the document for the horizontal case: a page that
 * does not scroll sideways should not be nudged sideways.
 */
export function scrollParent(
  node: HTMLElement | null,
  axis: "x" | "y",
): HTMLElement | null {
  let current = node?.parentElement ?? null;
  while (current) {
    const style = window.getComputedStyle(current);
    const overflow = axis === "x" ? style.overflowX : style.overflowY;
    const scrollable =
      axis === "x"
        ? current.scrollWidth > current.clientWidth
        : current.scrollHeight > current.clientHeight;
    if (/auto|scroll|overlay/.test(overflow) && scrollable) return current;
    current = current.parentElement;
  }
  if (axis === "y") return document.scrollingElement as HTMLElement | null;
  return null;
}
