"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Badge } from "./badge";

/*
 * Tabs follow the ARIA authoring practice: roving tabindex, arrow key
 * navigation, Home and End, with the panel wired through aria-controls.
 */

/**
 * A fade at whichever edge of a horizontally scrolling strip has more beyond it.
 *
 * A tab bar wider than a phone scrolls sideways, and nothing said so: the last
 * visible label was simply cut off by the edge of the screen, which reads as a
 * layout that stops there — a tab nobody finds is a tab the product does not
 * have (the Performance overview, Pay setup and the profile all clip this way).
 * Fading the clipped edge is the cue a phone user already knows from their own
 * home screen: *there is more this way*.
 *
 * It is a **mask on the strip itself** rather than a gradient laid over it, so
 * it needs to know nothing about the colour behind — the header, a card and a
 * dark theme each have a different one. It is applied straight to the element's
 * style from the scroll handler instead of being held in state, because it
 * changes on every scroll event and nothing else on the screen cares; and it is
 * decorative — the strip's contents, focus order and roles are untouched.
 */
function useScrollCue(ref: React.RefObject<HTMLElement | null>, size: number) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    /* A share of the strip rather than a fixed length, so there is no `calc()`
       to get wrong in a browser that parses it differently — about 30px on a
       phone-wide strip, which is the size of the label being cut off. */
    const FADE = 8;
    const apply = () => {
      const before = el.scrollLeft > 1;
      const after = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      const mask =
        before && after
          ? `linear-gradient(to right, transparent 0, #000 ${FADE}%, #000 ${100 - FADE}%, transparent 100%)`
          : before
            ? `linear-gradient(to right, transparent 0, #000 ${FADE}%)`
            : after
              ? `linear-gradient(to right, #000 ${100 - FADE}%, transparent 100%)`
              : "";
      el.style.maskImage = mask;
      el.style.setProperty("-webkit-mask-image", mask);
    };
    apply();
    el.addEventListener("scroll", apply, { passive: true });
    /* Not everywhere has one — jsdom does not — and the cue is decoration, so a
       missing observer costs the re-measure on resize and nothing else. */
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(apply);
    observer?.observe(el);
    if (observer) {
      for (const child of Array.from(el.children)) observer.observe(child);
    }
    return () => {
      el.removeEventListener("scroll", apply);
      observer?.disconnect();
    };
    /* `size` is the item count: a strip that gains a tab has to be measured again. */
  }, [ref, size]);
}

export type TabItem = {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
};

export function Tabs({
  items,
  value,
  onChange,
  className,
  children,
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  children?: React.ReactNode;
}) {
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  useScrollCue(listRef, items.length);

  /* The selected tab can start scrolled out of view — a direct `?tab=`
     link past whatever fits the strip, most often on a phone with more
     than three or four tabs. Nothing else brings it into view: the strip
     scrolls independently of the page (`scroll-x`), and arriving here sets
     `value` with no scroll of its own, unlike a click. Without this, the
     panel shown and the tab visibly marked active can be two different
     ones until somebody happens to scroll the strip themselves.
     `block: "nearest"` keeps this scoped to the strip's own horizontal
     scroll rather than moving the page vertically. */
  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [value]);

  function onKeyDown(event: React.KeyboardEvent) {
    const currentIndex = items.findIndex((i) => i.id === value);
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight")
      nextIndex = (currentIndex + 1) % items.length;
    else if (event.key === "ArrowLeft")
      nextIndex = (currentIndex - 1 + items.length) % items.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = items.length - 1;

    if (nextIndex === null) return;
    event.preventDefault();
    onChange(items[nextIndex].id);
    const buttons =
      listRef.current?.querySelectorAll<HTMLButtonElement>("[role='tab']");
    buttons?.[nextIndex]?.focus();
  }

  return (
    <div className={className}>
      <div
        ref={listRef}
        role="tablist"
        onKeyDown={onKeyDown}
        className="scroll-x flex gap-1 border-b border-line"
      >
        {items.map((item) => {
          const selected = item.id === value;
          return (
            <button
              key={item.id}
              role="tab"
              type="button"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(item.id)}
              className={cn(
                "relative flex items-center gap-2 whitespace-nowrap px-3.5 py-2.5 text-body-sm font-medium",
                "transition-colors duration-150 -mb-px border-b-2",
                selected
                  ? "border-accent text-ink"
                  : "border-transparent text-muted hover:text-ink hover:border-line-strong",
              )}
            >
              {item.icon && (
                <span aria-hidden="true" className="[&>svg]:size-4">
                  {item.icon}
                </span>
              )}
              {item.label}
              {item.count !== undefined && (
                <Badge
                  tone={selected ? "accent" : "neutral"}
                  size="sm"
                  className="tabular font-semibold"
                >
                  {item.count}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {children && (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${value}`}
          aria-labelledby={`${baseId}-tab-${value}`}
          tabIndex={0}
          className="pt-5 focus-visible:outline-none"
        >
          {children}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** Route driven tabs. Each item is a real link, so it is shareable. */
export function LinkTabs({
  items,
  activeHref,
  className,
}: {
  items: { href: string; label: string; count?: number }[];
  activeHref: string;
  className?: string;
}) {
  const navRef = useRef<HTMLElement>(null);
  useScrollCue(navRef, items.length);
  return (
    <nav
      ref={navRef}
      className={cn("scroll-x flex gap-1 border-b border-line", className)}
    >
      {items.map((item) => {
        const active = activeHref === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 whitespace-nowrap px-3.5 py-2.5 text-body-sm font-medium",
              "transition-colors duration-150 -mb-px border-b-2",
              active
                ? "border-accent text-ink"
                : "border-transparent text-muted hover:text-ink hover:border-line-strong",
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <Badge
                tone={active ? "accent" : "neutral"}
                size="sm"
                className="tabular font-semibold"
              >
                {item.count}
              </Badge>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/* -------------------------------------------------------------------------- */

/** Segmented control. Used for view switches and short filters. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  /** `disabled` is for a choice that is real but not available right now; say why beside the control. */
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        /* `flex-wrap`, not a plain `inline-flex` row: a control with four or
           five longer labels (the equipment register's "Nobody has it" /
           "With somebody" / "Being fixed" / "Lost" is the case that found
           this) is wider than a 375px card on its own, and nothing upstream
           of this component can make its own pills wrap for it. A no-op
           wherever the options already fit on one line. */
        "inline-flex flex-wrap rounded-md border border-line bg-canvas p-0.5",
        className,
      )}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-sm px-3 py-1.5 text-body-sm font-medium transition-colors duration-150",
              selected
                ? "bg-surface text-ink shadow-xs"
                : opt.disabled
                  ? "cursor-not-allowed text-faint"
                  : "text-muted hover:text-ink",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * A single-open question-and-answer list. The marketing FAQ shape.
 *
 * **Not the general disclosure.** One section of a signed-in screen collapsed
 * behind a summary with a count is `Disclosure` in `./disclosure.tsx` — this one
 * closes its siblings when you open it, which is wrong the moment two of them
 * can matter at once. Do not add a third.
 */
export function Accordion({
  items,
  className,
}: {
  items: { id: string; question: string; answer: React.ReactNode }[];
  className?: string;
}) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className={cn("divide-y divide-line border-y border-line", className)}>
      {items.map((item) => {
        const expanded = open === item.id;
        return (
          <div key={item.id}>
            <h3>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={`panel-${item.id}`}
                onClick={() => setOpen(expanded ? null : item.id)}
                className="flex w-full items-center justify-between gap-4 py-4 text-left"
              >
                <span className="text-body-md font-medium text-ink">
                  {item.question}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "relative size-4 shrink-0 transition-transform duration-200",
                    expanded && "rotate-45",
                  )}
                >
                  <span className="absolute left-0 top-1/2 h-px w-4 -translate-y-1/2 bg-accent-text" />
                  <span className="absolute left-1/2 top-0 h-4 w-px -translate-x-1/2 bg-accent-text" />
                </span>
              </button>
            </h3>
            <div
              id={`panel-${item.id}`}
              hidden={!expanded}
              className={cn(
                "pb-5 text-body-sm leading-relaxed text-body",
                expanded && "animate-open",
              )}
            >
              {item.answer}
            </div>
          </div>
        );
      })}
    </div>
  );
}
