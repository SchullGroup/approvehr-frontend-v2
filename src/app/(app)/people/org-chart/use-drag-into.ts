"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Dragging a thing into a place, rather than reordering a list.
 *
 * ## Why this is not `components/ui/sortable.tsx`
 *
 * `Sortable` moves a row **within one list** — it measures its siblings once,
 * slides the ones it crosses, and reports a new index. Everything it does is
 * about a single ordered container, and none of it applies here: a person
 * dragged out of Engineering and into Finance is not changing position, they
 * are changing parent, and there is no index to report. Bending `Sortable` into
 * doing both would give one component two unrelated jobs and a `mode` prop.
 *
 * What the two do share is the **feel**, and that is shared properly: the lift,
 * the tilt and the settle come from `.ahr-sortable-lifted` in `globals.css`,
 * which is where `prefers-reduced-motion` can reach them.
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
 * what a department is, so the same interaction carries a person into a
 * department and a department under another one — which is exactly the two
 * things this screen needs.
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

export function useDragInto({
  onDrop,
  /** Refuses a target before it lights up — its own subtree, itself, and so on. */
  canDrop,
}: {
  onDrop: (moved: { id: string; kind: string }, targetId: string) => void;
  canDrop: (moved: { id: string; kind: string }, targetId: string) => boolean;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);

  const start = useCallback(
    (id: string, kind: string) => (event: React.PointerEvent<HTMLElement>) => {
      /* Primary button only: a right-click is a context menu and a middle-click
         is a paste on Linux. Neither is a drag. */
      if (event.button !== 0) return;
      event.preventDefault();
      setDrag({ id, kind, x: event.clientX, y: event.clientY, over: null });
    },
    [],
  );

  useEffect(() => {
    if (!drag) return;

    const move = (event: PointerEvent) => {
      /* The browser's own hit test, so it agrees with what is visibly on top.
         `closest` walks up from whatever is under the pointer, which means the
         whole card is a target rather than only the pixels of its heading. */
      const under = document.elementFromPoint(event.clientX, event.clientY);
      const target = under?.closest<HTMLElement>("[data-drop-id]") ?? null;
      const id = target?.dataset["dropId"] ?? null;
      setDrag((current) => {
        if (!current) return current;
        const allowed =
          id !== null && canDrop({ id: current.id, kind: current.kind }, id)
            ? id
            : null;
        return {
          ...current,
          x: event.clientX,
          y: event.clientY,
          over: allowed,
        };
      });
    };

    const up = () => {
      setDrag((current) => {
        if (current?.over)
          onDrop({ id: current.id, kind: current.kind }, current.over);
        return null;
      });
    };

    /* Escape abandons. A drag with no way out is a drag people are afraid to
       start, and on a screen that writes to everybody's record that matters. */
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrag(null);
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
  }, [drag, canDrop, onDrop]);

  return { drag, start };
}
