"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * The motion of the board: cards slide out of the way, the card in the hand
 * leans into the direction it is dragged, and a dropped card settles into its
 * place with a small overshoot.
 *
 * Elements opt in with `data-flip="<key>"`. After every render the hook compares
 * where each one now is (relative to the root, so scrolling does not read as
 * movement) with where it was, and plays the difference back as a transform.
 */

/** A spring-like curve: fast, past the mark by a few percent, then home. */
export const SPRING = "cubic-bezier(0.34, 1.45, 0.64, 1)";
const SLIDE = "cubic-bezier(0.2, 0.9, 0.3, 1.08)";

export type Settle = {
  id: string;
  left: number;
  top: number;
  tilt: number;
};

const reduced = () =>
  typeof window === "undefined" ||
  typeof window.matchMedia !== "function" ||
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function useFlip(
  rootRef: React.RefObject<HTMLElement | null>,
  settleRef: React.RefObject<Settle | null>,
) {
  const last = useRef(new Map<string, { x: number; y: number }>());

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const base = el.getBoundingClientRect();
    const now = new Map<string, { x: number; y: number }>();
    const nodes = el.querySelectorAll<HTMLElement>("[data-flip]");
    const motion = !reduced();
    const landing = settleRef.current;
    settleRef.current = null;

    nodes.forEach((node) => {
      const key = node.dataset["flip"]!;
      const box = node.getBoundingClientRect();
      const at = { x: box.left - base.left, y: box.top - base.top };
      now.set(key, at);
      if (!motion || typeof node.animate !== "function") return;

      if (landing && key === `card:${landing.id}`) {
        const dx = landing.left - box.left;
        const dy = landing.top - box.top;
        node.animate(
          [
            {
              transform: `translate(${dx}px, ${dy}px) rotate(${landing.tilt}deg) scale(1.03)`,
              boxShadow: "0 14px 28px -8px rgb(0 0 0 / 0.28)",
              zIndex: 40,
            },
            {
              transform: "none",
              boxShadow: "0 0 0 0 rgb(0 0 0 / 0)",
              zIndex: 40,
            },
          ],
          { duration: 420, easing: SPRING },
        );
        return;
      }

      const before = last.current.get(key);
      if (!before) return;
      const dx = before.x - at.x;
      const dy = before.y - at.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      node.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
        { duration: 260, easing: SLIDE },
      );
    });

    last.current = now;
  });
}

/**
 * The card in the hand: a copy of the real one, lifted, tilted and shadowed,
 * following the pointer exactly. It leans with horizontal speed and eases back
 * level when the hand stops.
 */
export function BoardGhost({
  x,
  y,
  grab,
}: {
  x: number;
  y: number;
  grab: { w: number; dx: number; dy: number; html: string };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef(x);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const speed = x - prev.current;
    prev.current = x;
    const tilt = Math.max(-7, Math.min(7, 3 + speed * 0.5));
    el.style.transform = `rotate(${tilt}deg) scale(1.03)`;
    const settle = window.setTimeout(() => {
      el.style.transform = "rotate(3deg) scale(1.03)";
    }, 90);
    return () => window.clearTimeout(settle);
  }, [x]);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced() || typeof el.animate !== "function") return;
    el.animate(
      [
        { transform: "rotate(0deg) scale(1)" },
        { transform: "rotate(3deg) scale(1.03)" },
      ],
      { duration: 220, easing: SPRING },
    );
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed z-50 origin-center rounded-md"
      style={{
        left: x - grab.dx,
        top: y - grab.dy,
        width: grab.w,
        transform: "rotate(3deg) scale(1.03)",
        transition: "transform 160ms cubic-bezier(0.22, 1, 0.36, 1)",
        boxShadow:
          "0 18px 32px -10px rgb(0 0 0 / 0.3), 0 4px 10px -4px rgb(0 0 0 / 0.18)",
      }}
      // A copy of the card's own markup, taken at pick-up. Nothing here is
      // interactive and none of it comes from outside the page.
      dangerouslySetInnerHTML={{ __html: grab.html }}
    />
  );
}
