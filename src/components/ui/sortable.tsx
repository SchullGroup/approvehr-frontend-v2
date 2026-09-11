"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/cn";
/* One implementation of "which ancestor scrolls", shared with `drag-into`.
   It grew an axis when the hiring board needed the horizontal answer; this
   list only ever wants the vertical one. */
import { scrollParent } from "./drag-into";

/**
 * A vertical list somebody arranges by dragging, with a keyboard path that is
 * not an afterthought.
 *
 * ## Why this is hand-written
 *
 * `@dnd-kit` and `react-beautiful-dnd` both do this well and neither is here.
 * The reason is the one recorded five times in HANDOVER: invented dependency
 * ranges have broken this repo's CI, and every primitive it needs so far —
 * the CSV reader, the XLSX writer, the PDF renderer, Web Push, the focus
 * trap — is written rather than installed. A reorderable list is a hundred
 * lines of pointer events and one measured rect per row; a library for it is
 * three hundred kilobytes and a migration guide.
 *
 * ## The physics, and what each part is for
 *
 * Nothing here is decoration — each behaviour answers a question somebody has
 * mid-drag, which is the whole test for whether motion is worth its cost:
 *
 * | Behaviour | The question it answers |
 * |---|---|
 * | the row lifts (scale, shadow, slight tilt) | *have I picked it up* |
 * | it follows the pointer on one axis only | *what am I moving* |
 * | neighbours slide out of the way as you cross them | *where will it land* |
 * | the gap stays open under the pointer | *is this a real slot* |
 * | release settles with `--ease-out-soft` rather than snapping | *did it land, or did I drop it somewhere* |
 * | the list auto-scrolls near its edges | *how do I get it past the fold* |
 *
 * The lift is `scale(1.02)` and `1deg`, which is deliberately almost nothing:
 * this is a settings drawer, not a game, and a card that leaps under the cursor
 * reads as a bug. `translate3d` on one axis keeps every frame on the
 * compositor — no layout, no paint — which is what makes it smooth on the
 * mid-range Android this product is used on rather than only on a laptop.
 *
 * ## Reduced motion is honoured, and it does not mean "no reordering"
 *
 * With `prefers-reduced-motion: reduce` the transforms stay — a dragged thing
 * has to follow the pointer or dragging is broken — and every *transition* goes,
 * so neighbours jump to their new slots instead of sliding. That is the
 * distinction the media query is actually about: the vestibular problem is
 * unrequested movement, not the movement somebody's own hand is causing.
 *
 * ## The keyboard path is the real one, not a fallback
 *
 * Every row's handle is a `button`. Focus it and Space or Enter picks the row
 * up; the arrow keys move it; Space, Enter or Tab puts it down; Escape puts it
 * back where it started. It is announced through `aria-live`, because a list
 * silently reordering under a screen reader is a list nobody can arrange.
 *
 * This is the same argument `assign-people-dialog.tsx` makes in reverse. There,
 * selection beat drag because assigning nine people is a bulk act and nine
 * drags are nine chances to drop somebody in the wrong unit. Here the task
 * **is** spatial — "put this above that" — so dragging is the right verb and
 * the keyboard is what stops it being the only one.
 */

export type SortableRenderArgs = {
  /** Spread onto the drag handle. It must be the `button` a keyboard reaches. */
  handleProps: {
    /** Marks the handle so the list can find it. Must reach the DOM. */
    "data-sortable-handle": string;
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
    "aria-label": string;
    type: "button";
  };
  /** True while this row is the one being moved, by pointer or by keyboard. */
  dragging: boolean;
  /** Its current place, 1-based, for a label somebody can read. */
  position: number;
  total: number;
};

export type SortableProps<T> = {
  items: readonly T[];
  keyOf: (item: T) => string;
  /** A name for the row, used in the handle's label and the announcement. */
  labelOf: (item: T) => string;
  /** Called once per settled move, never per frame. */
  onReorder: (nextKeys: string[]) => void;
  children: (item: T, args: SortableRenderArgs) => React.ReactNode;
  className?: string;
  /** Gap between rows, in px. Needed to compute where a row lands. */
  gap?: number;
};

/** A ready-made handle, for callers with no reason to draw their own. */
export function SortableHandle({
  handleProps,
  className,
}: {
  handleProps: SortableRenderArgs["handleProps"];
  className?: string;
}) {
  return (
    <button
      {...handleProps}
      className={cn(
        "flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-faint",
        "hover:bg-canvas hover:text-muted active:cursor-grabbing",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
        className,
      )}
    >
      <GripVertical aria-hidden="true" className="size-4" />
    </button>
  );
}

export function Sortable<T>({
  items,
  keyOf,
  labelOf,
  onReorder,
  children,
  className,
  gap = 8,
}: SortableProps<T>) {
  /**
   * This component holds **no refs**, and that is the interesting thing about it.
   *
   * It began with two ref maps — one per row, one per handle — populated from
   * `ref={registerRow(key)}` inside the map. `react-hooks/refs` refuses that,
   * and refuses every retreat from it: hoisting the factory does not help,
   * because the *call* is still in render, and neither does moving the access
   * into a `useCallback`, because the rule follows the handler passed into JSX.
   *
   * The rule was right three times over and the bookkeeping was unnecessary.
   * The DOM already holds what the maps held, in the order somebody is looking
   * at: the list carries `data-sortable-list`, rows carry `data-sortable-key`,
   * handles carry `data-sortable-handle`, and anything that needs to measure or
   * focus queries for them. `document` is not a ref, so there is nothing left
   * for the rule to object to and nothing left to go stale against the list.
   *
   * `id` is what makes the query specific — two `Sortable`s on one screen must
   * not find each other's rows — and it is the same id the live region uses.
   */
  const id = useId();

  /**
   * The row being moved, where it started, and how tall every row was then.
   *
   * `heights` lives **in the state** rather than in a ref, and that is not a
   * style choice: the render below reads it to place the neighbours, and a ref
   * read during render is both a React rule violation and a real staleness bug
   * — the offsets would be computed from whatever the last event wrote rather
   * than from the state this render is for. Putting it here makes the whole
   * render a pure function of the drag.
   *
   * Measured **once**, at pick-up, in an event handler. Re-measuring mid-drag
   * would read a layout this component is itself transforming: a forced
   * synchronous reflow every frame, and a feedback loop — the offsets move the
   * rows, the rows change the measurements, the measurements move the offsets.
   * Measure the still list, then animate.
   */
  const [drag, setDrag] = useState<{
    key: string;
    from: number;
    /** Where it would land if released now. */
    to: number;
    /** Pixels the pointer has travelled. Zero for a keyboard move. */
    offset: number;
    pointer: boolean;
    /** One per row, in list order, as they were when the drag began. */
    heights: number[];
    /**
     * Where the pointer was at pick-up, in client coordinates.
     *
     * In the state rather than a ref for the reason everything else here is:
     * a ref would put a ref access inside the pointer handler, which is what
     * `react-hooks/refs` follows into. It changes once per drag, so keeping it
     * in state costs no extra render.
     */
    originY: number;
  } | null>(null);

  const [announcement, setAnnouncement] = useState("");

  const keys = items.map(keyOf);

  /** This list's rows, in the order they are on screen. */
  const rowsOf = useCallback((): HTMLLIElement[] => {
    const list = document.querySelector(
      `[data-sortable-list="${CSS.escape(id)}"]`,
    );
    return [
      ...(list?.querySelectorAll<HTMLLIElement>("[data-sortable-key]") ?? []),
    ];
  }, [id]);

  /** Every row's height, in list order, read from the DOM at pick-up. */
  const measure = useCallback(
    (): number[] => rowsOf().map((node) => node.getBoundingClientRect().height),
    [rowsOf],
  );

  /** One row's drag handle, for moving the keyboard focus with the row. */
  const handleOf = useCallback(
    (key: string): HTMLElement | null =>
      /* `CSS.escape` because a caller's key is arbitrary — an id with a quote
         or a bracket in it would otherwise build a selector that throws, and
         the keyboard path would break on exactly the data nobody tested with. */
      document.querySelector<HTMLElement>(
        `[data-sortable-list="${CSS.escape(id)}"] [data-sortable-key="${CSS.escape(key)}"] [data-sortable-handle]`,
      ),
    [id],
  );

  /** Where index `to` sits relative to index `from`, in px. */
  const distance = useCallback(
    (heights: readonly number[], from: number, to: number): number => {
      if (from === to) return 0;
      const step = from < to ? 1 : -1;
      let total = 0;
      for (let at = from; at !== to; at += step) {
        const next = at + step;
        total += (heights[next] ?? 0) + gap;
      }
      return from < to ? total : -total;
    },
    [gap],
  );

  const commit = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      const next = [...keys];
      const [moved] = next.splice(from, 1);
      if (moved === undefined) return;
      next.splice(to, 0, moved);
      onReorder(next);
    },
    [keys, onReorder],
  );

  /* ------------------------------------------------------------- pointer */

  /**
   * Which row a handle belongs to, from the DOM rather than from a closure.
   *
   * The obvious shape is a factory — `onPointerDown={onPointerDown(key, index)}`
   * — and `react-hooks/refs` refuses it: the factory's closure touches a ref,
   * so *calling* it during render is a ref access during render, and the rule
   * follows the call. It is right to. The handlers below are therefore plain,
   * stable functions that ask the event where they came from.
   *
   * The index comes from the row's position among its siblings, not from
   * `keys.indexOf`. Same answer, and it cannot be wrong: the DOM order **is**
   * the list order somebody is looking at, whereas a stale `keys` array closed
   * over by a handler would move the wrong row.
   */
  const rowOf = useCallback(
    (
      handle: HTMLElement,
    ): { key: string; index: number; label: string } | null => {
      const li = handle.closest<HTMLLIElement>("[data-sortable-key]");
      const key = li?.dataset["sortableKey"];
      if (!li || key === undefined) return null;
      const index = rowsOf().indexOf(li);
      if (index < 0) return null;
      const item = items.find((candidate) => keyOf(candidate) === key);
      return { key, index, label: item ? labelOf(item) : key };
    },
    [items, keyOf, labelOf, rowsOf],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      /* Primary button only. A right-click on a handle is a context menu, and
         a middle-click is a paste on Linux — neither is a drag. */
      if (event.button !== 0) return;
      const row = rowOf(event.currentTarget);
      if (!row) return;
      event.preventDefault();
      setDrag({
        key: row.key,
        from: row.index,
        to: row.index,
        offset: 0,
        pointer: true,
        heights: measure(),
        originY: event.clientY,
      });
      /* Capture, so the drag survives the pointer leaving the handle — which it
         does immediately, because the handle moves with the row. */
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [measure, rowOf],
  );

  /**
   * The latest drag, for `up` to read at release.
   *
   * `drag` cannot be a dependency of the effect below — it changes on every
   * `pointermove`, so the window listeners would be torn down and re-added
   * every frame — and the closure's copy would be a frame stale, landing the
   * row a slot off. A ref is the value that is both current and stable.
   *
   * `useLayoutEffect`, not `useEffect`: `move` sets state from a native
   * listener, React flushes that render in a microtask, and layout effects run
   * inside that flush — so the ref is current before the next macrotask, which
   * is the `pointerup` that reads it. A passive effect runs after paint and
   * could lose the race on a quick release.
   */
  const dragRef = useRef(drag);
  useLayoutEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  useEffect(() => {
    if (!drag?.pointer) return;

    const move = (event: PointerEvent) => {
      /* Which slot the row is over now.
         ---------------------------------------------------------------
         Walking outwards from the start rather than dividing by an average
         height, because rows here are not the same height — a widget with a
         two-line blurb is taller than one with a one-liner, and an average
         makes the drop land a slot off precisely when the list is mixed.
         The threshold is **half** the neighbour's height, which is what makes
         the swap happen when the row visually covers the neighbour's middle. */
      setDrag((current) => {
        if (!current) return current;
        const heights = current.heights;
        const offset = event.clientY - current.originY;
        let to = current.from;
        if (offset > 0) {
          let travelled = 0;
          for (let at = current.from + 1; at < heights.length; at += 1) {
            const next = (heights[at] ?? 0) + gap;
            if (offset > travelled + next / 2) {
              to = at;
              travelled += next;
            } else break;
          }
        } else if (offset < 0) {
          let travelled = 0;
          for (let at = current.from - 1; at >= 0; at -= 1) {
            const prev = (heights[at] ?? 0) + gap;
            if (-offset > travelled + prev / 2) {
              to = at;
              travelled += prev;
            } else break;
          }
        }
        return { ...current, offset, to };
      });

      /* Auto-scroll near the edges of whatever is actually scrolling — the
         drawer's own body, usually, not the window. Without it a list longer
         than the panel cannot be reordered past the fold at all. */
      const scroller = scrollParent(rowsOf()[0] ?? null, "y");
      if (scroller) {
        const box =
          scroller === document.scrollingElement
            ? { top: 0, bottom: window.innerHeight }
            : scroller.getBoundingClientRect();
        const edge = 48;
        if (event.clientY < box.top + edge) scroller.scrollTop -= 12;
        else if (event.clientY > box.bottom - edge) scroller.scrollTop += 12;
      }
    };

    const up = () => {
      /* Read the release position from the ref, not from a `setDrag` updater.
         ------------------------------------------------------------------
         This used to be `setDrag((current) => { commit(...); return null; })`,
         which is wrong for a reason nothing here could see: React runs an
         updater **during the render phase**, and `commit` calls `onReorder`,
         which is a parent's `setState`. So a caller that holds the new
         arrangement in its own state got "Cannot update a component while
         rendering a different component", and whether it fired at all depended
         on whether React took its eager-evaluation path — which is why seven
         callers shipped on top of this.

         The keyboard path never had the bug: it calls `commit` then `setDrag`
         as two statements in the handler. This now does the same thing. */
      const current = dragRef.current;
      setDrag(null);
      if (current) commit(current.from, current.to);
    };

    /* On `window`, not the handle: a pointer released outside the drawer still
       ends the drag, and a cancelled one (a phone call, a system gesture) is
       treated as a release rather than leaving the list stuck mid-move. */
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [drag?.pointer, commit, gap, rowsOf]);

  /* ------------------------------------------------------------ keyboard */

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const row = rowOf(event.currentTarget);
      if (!row) return;
      const { key, index, label } = row;
      const picked = drag !== null && drag.key === key && !drag.pointer;

      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        if (picked) {
          commit(drag.from, drag.to);
          setAnnouncement(
            `${label} dropped at position ${String(drag.to + 1)} of ${String(items.length)}.`,
          );
          setDrag(null);
        } else {
          setDrag({
            key,
            from: index,
            to: index,
            offset: 0,
            pointer: false,
            heights: measure(),
            /* A keyboard move has no pointer, so no origin. Zero, and never
               read: `offset` stays 0 on this path and the render uses
               `distance()` for a keyboard drag rather than the offset. */
            originY: 0,
          });
          setAnnouncement(
            `${label} picked up, position ${String(index + 1)} of ${String(items.length)}. Use the arrow keys to move it.`,
          );
        }
        return;
      }

      if (event.key === "Escape" && picked) {
        event.preventDefault();
        setDrag(null);
        setAnnouncement(
          `${label} put back at position ${String(drag.from + 1)}.`,
        );
        return;
      }

      /* Tab out of a picked-up row commits rather than abandoning: somebody who
         has moved it and reached for the next control means the move. */
      if (event.key === "Tab" && picked) {
        commit(drag.from, drag.to);
        setDrag(null);
        return;
      }

      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      const step = event.key === "ArrowUp" ? -1 : 1;

      if (!picked) {
        /* Not picked up: move focus, which is what an arrow key does in a list.
           Reordering on a bare arrow press would rearrange somebody's dashboard
           while they were only looking through it. */
        const neighbour = keys[index + step];
        if (neighbour !== undefined) handleOf(neighbour)?.focus();
        return;
      }

      const to = Math.min(items.length - 1, Math.max(0, drag.to + step));
      if (to === drag.to) return;
      setDrag({ ...drag, to });
      setAnnouncement(
        `${label}, position ${String(to + 1)} of ${String(items.length)}.`,
      );
    },
    [commit, drag, handleOf, items.length, keys, measure, rowOf],
  );

  /* Keep the moving row's handle focused across a re-render, so a run of arrow
     presses does not lose the keyboard mid-move. */
  useLayoutEffect(() => {
    if (!drag || drag.pointer) return;
    const node = handleOf(drag.key);
    if (node && document.activeElement !== node) node.focus();
  }, [drag, handleOf]);

  /* --------------------------------------------------------------- render */

  return (
    <>
      <ul
        data-sortable-list={id}
        className={cn("flex flex-col", className)}
        style={{ gap }}
      >
        {items.map((item, index) => {
          const key = keyOf(item);
          const label = labelOf(item);
          const isDragging = drag?.key === key;

          /**
           * Where this row sits right now.
           *
           * The dragged row follows the pointer (or, on the keyboard, jumps to
           * the slot it has been moved to). Every row *between* its old and new
           * index slides one place the other way — which is the animation that
           * tells somebody where the thing will land, and it is computed from
           * the measured heights rather than assumed uniform.
           */
          let shift = 0;
          if (drag) {
            if (isDragging) {
              shift = drag.pointer
                ? drag.offset
                : distance(drag.heights, drag.from, drag.to);
            } else if (
              drag.from < drag.to &&
              index > drag.from &&
              index <= drag.to
            ) {
              shift = -((drag.heights[drag.from] ?? 0) + gap);
            } else if (
              drag.from > drag.to &&
              index >= drag.to &&
              index < drag.from
            ) {
              shift = (drag.heights[drag.from] ?? 0) + gap;
            }
          }

          return (
            <li
              key={key}
              data-sortable-key={key}
              style={{
                transform:
                  shift === 0 ? undefined : `translate3d(0, ${shift}px, 0)`,
                /* No transition on the row under the pointer — it has to track
                   the finger exactly, and easing it would feel like lag. Every
                   other row eases, which is the part that reads as physics. */
                transition:
                  isDragging && drag?.pointer
                    ? "none"
                    : "transform 0.22s var(--ease-out-soft)",
              }}
              className={cn(
                "ahr-sortable-row",
                isDragging && "ahr-sortable-lifted",
                /* Above its neighbours while moving, so the lift's shadow falls
                   on them rather than under them. */
                isDragging ? "relative z-10" : "z-0",
              )}
            >
              {children(item, {
                handleProps: {
                  "data-sortable-handle": "",
                  onPointerDown,
                  onKeyDown,
                  "aria-label": `Move ${label}. Position ${String(index + 1)} of ${String(items.length)}.`,
                  type: "button",
                },
                dragging: Boolean(isDragging),
                position: index + 1,
                total: items.length,
              })}
            </li>
          );
        })}
      </ul>

      {/* Polite, not assertive: a reorder is not an alert, and interrupting a
          screen reader mid-sentence for every arrow press is unusable. */}
      <p aria-live="polite" id={id} className="sr-only">
        {announcement}
      </p>
    </>
  );
}
