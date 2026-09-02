"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * Scroll reveal.
 *
 * The effect drives the DOM node directly rather than React state. That is the
 * job an effect is actually for — synchronising with an external system — and
 * it buys two things: no cascading re-render per element on scroll, and
 * markup that is visible by default. The hiding class is only applied once
 * JavaScript has run, so anyone without it reads a normal page instead of a
 * blank one.
 */
export function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className,
}: {
  children: React.ReactNode;
  /** Milliseconds. Use to stagger siblings; keep under ~240ms. */
  delay?: number;
  as?: "div" | "section" | "li" | "article" | "header" | "figure";
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      node.dataset.reveal = "in";
      return;
    }

    /* Arm only now, so the pre-JS render stays visible. */
    node.classList.add("reveal");
    node.dataset.reveal = "idle";

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        node.dataset.reveal = "in";
        observer.disconnect();
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      // @ts-expect-error — one ref across a small union of intrinsic tags
      ref={ref}
      style={{ "--reveal-delay": `${delay}ms` } as React.CSSProperties}
      className={cn(className)}
    >
      {children}
    </Tag>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Continuous logo rail. The track holds the list twice and translates by
 * exactly -50%, so the wrap point falls on an identical frame.
 * Pauses on hover and on focus within, so a keyboard user can read a name.
 */
export function Marquee({
  children,
  duration = 42,
  className,
}: {
  children: React.ReactNode;
  /** Seconds for one full pass. Longer reads calmer. */
  duration?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden",
        /* Fade the rail into the page rather than cutting it off. */
        "mask-[linear-gradient(to_right,transparent,#000_8%,#000_92%,transparent)]",
        className,
      )}
    >
      <div
        className="marquee-track flex w-max items-center gap-14 group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused]"
        style={{ "--marquee-duration": `${duration}s` } as React.CSSProperties}
      >
        <div className="flex shrink-0 items-center gap-14">{children}</div>
        <div aria-hidden="true" className="flex shrink-0 items-center gap-14">
          {children}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Counts up when scrolled into view.
 *
 * Renders the final figure on the server, so the real number is in the HTML
 * for search engines, no-JS readers and anyone on reduced motion. The client
 * rewinds it to zero and animates only once it is confirmed visible.
 */
export function CountUp({
  to,
  prefix = "",
  suffix = "",
  duration = 1100,
  className,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const render = (v: number) =>
      `${prefix}${v.toLocaleString("en-NG")}${suffix}`;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      node.textContent = render(to);
      return;
    }

    node.textContent = render(0);

    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();

        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          /* easeOutQuart — quick off the mark, long settle. */
          node.textContent = render(Math.round(to * (1 - Math.pow(1 - t, 4))));
          if (t < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.5 },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [to, duration, prefix, suffix]);

  return (
    <span ref={ref} className={className}>
      {`${prefix}${to.toLocaleString("en-NG")}${suffix}`}
    </span>
  );
}
