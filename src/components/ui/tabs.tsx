"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/*
 * Tabs follow the ARIA authoring practice: roving tabindex, arrow key
 * navigation, Home and End, with the panel wired through aria-controls.
 */

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

  function onKeyDown(event: React.KeyboardEvent) {
    const currentIndex = items.findIndex((i) => i.id === value);
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % items.length;
    else if (event.key === "ArrowLeft")
      nextIndex = (currentIndex - 1 + items.length) % items.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = items.length - 1;

    if (nextIndex === null) return;
    event.preventDefault();
    onChange(items[nextIndex].id);
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>(
      "[role='tab']",
    );
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
                <span
                  className={cn(
                    "tabular rounded-full px-1.5 py-0.5 text-meta font-semibold",
                    selected ? "bg-accent-soft text-accent-text" : "bg-sunken text-muted",
                  )}
                >
                  {item.count}
                </span>
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
  return (
    <nav className={cn("scroll-x flex gap-1 border-b border-line", className)}>
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
              <span
                className={cn(
                  "tabular rounded-full px-1.5 py-0.5 text-meta font-semibold",
                  active ? "bg-accent-soft text-accent-text" : "bg-sunken text-muted",
                )}
              >
                {item.count}
              </span>
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
  options: { value: T; label: string }[];
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
        "inline-flex rounded-md border border-line bg-canvas p-0.5",
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
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-sm px-3 py-1.5 text-body-sm font-medium transition-colors duration-150",
              selected
                ? "bg-surface text-ink shadow-xs"
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
                <span className="text-body font-medium text-ink">
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
              className="pb-5 text-body-sm leading-relaxed text-body"
            >
              {item.answer}
            </div>
          </div>
        );
      })}
    </div>
  );
}
