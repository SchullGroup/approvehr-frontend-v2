"use client";

import { useEffect, useRef } from "react";

/**
 * The hero mockup's headline total and per-row amounts: a looping count-up
 * synced to the same rise/hold/fall timeline as their Y-axis entrance, so
 * the number ticking and the row arriving read as one motion instead of two
 * unrelated ones. Each piece runs its own requestAnimationFrame loop against
 * refs rather than state — this ticks every frame for as long as the card
 * is mounted, and there's no reason to route that through React sixty times
 * a second. Settles at the final values under prefers-reduced-motion instead
 * of looping.
 */

const CYCLE_MS = 9000;
const RISE_END = 0.17;
const FALL_START = 0.86;

/** Ken Perlin's smootherstep — zero velocity at both ends, so a rise never
 * starts or lands with a jolt. */
function smootherStep(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function phaseAt(elapsed: number, delayMs: number) {
  if (elapsed < delayMs) return 1;
  const local = ((elapsed - delayMs) % CYCLE_MS) / CYCLE_MS;
  if (local < RISE_END) return smootherStep(local / RISE_END);
  if (local < FALL_START) return 1;
  return smootherStep(1 - (local - FALL_START) / (1 - FALL_START));
}

function naira(value: number) {
  return `₦${Math.round(value).toLocaleString("en-US")}`;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("");
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The big total at the top of the card. */
export function PayrollTotalFigure({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const numRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const num = numRef.current;

    if (prefersReducedMotion()) {
      if (wrap) wrap.style.opacity = "1";
      if (num) num.textContent = naira(value);
      return;
    }

    const start = performance.now();
    let raf = requestAnimationFrame(tick);

    function tick() {
      const p = phaseAt(performance.now() - start, 0);
      if (wrap) {
        wrap.style.opacity = String(p);
        wrap.style.transform = `translateY(${8 * (1 - p)}px)`;
      }
      if (num) num.textContent = naira(value * p);
      raf = requestAnimationFrame(tick);
    }

    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <div ref={wrapRef} className={className}>
      <p className="text-meta text-white/40">{label}</p>
      <p
        ref={numRef}
        className="mt-1.5 text-[1.75rem] font-medium tabular-nums tracking-tight text-white"
      >
        {naira(value)}
      </p>
    </div>
  );
}

/** The employee rows below it — avatar and name arrive with an amount that counts up alongside them. */
export function PayrollRowFigures({
  rows,
  className,
}: {
  rows: { name: string; amount: number }[];
  className?: string;
}) {
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const amountRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    if (prefersReducedMotion()) {
      rows.forEach((r, i) => {
        const wrap = rowRefs.current[i];
        const num = amountRefs.current[i];
        if (wrap) wrap.style.opacity = "1";
        if (num) num.textContent = naira(r.amount);
      });
      return;
    }

    const start = performance.now();
    let raf = requestAnimationFrame(tick);

    function tick() {
      const elapsed = performance.now() - start;
      rows.forEach((r, i) => {
        const delay = 950 + i * 350;
        const p = phaseAt(elapsed, delay);
        const wrap = rowRefs.current[i];
        const num = amountRefs.current[i];
        if (wrap) {
          wrap.style.opacity = String(p);
          wrap.style.transform = `translateY(${8 * (1 - p)}px)`;
        }
        if (num) num.textContent = naira(r.amount * p);
      });
      raf = requestAnimationFrame(tick);
    }

    return () => cancelAnimationFrame(raf);
  }, [rows]);

  return (
    <div className={className}>
      {rows.map((r, i) => (
        <div
          key={r.name}
          ref={(el) => {
            rowRefs.current[i] = el;
          }}
          className="flex items-center gap-3"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/8 text-meta font-medium text-white/70">
            {initials(r.name)}
          </span>
          <span className="min-w-0 flex-1 truncate text-meta text-white/70">
            {r.name}
          </span>
          <span
            ref={(el) => {
              amountRefs.current[i] = el;
            }}
            className="text-meta font-medium tabular-nums text-white"
          >
            {naira(r.amount)}
          </span>
        </div>
      ))}
    </div>
  );
}
