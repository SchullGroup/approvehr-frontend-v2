"use client";

import { useId, useRef } from "react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Tabs for a section inside a panel.
 *
 * The same look and keyboard behaviour as the product's `Tabs`, without the one
 * thing that makes it wrong inside a scrolling panel: `Tabs` scrolls its selected
 * tab into view when it mounts, and `scrollIntoView` scrolls every scrollable
 * ancestor to do it — so opening an issue on a phone, where the tabs are below the
 * fold, threw the drawer half way down the page before anyone had touched it.
 */
export function SectionTabs<T extends string>({
  items,
  value,
  onChange,
  label,
  children,
}: {
  items: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  children: React.ReactNode;
}) {
  const base = useId();
  const list = useRef<HTMLDivElement>(null);

  function onKeyDown(event: React.KeyboardEvent) {
    const at = items.findIndex((item) => item.id === value);
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (at + 1) % items.length;
    else if (event.key === "ArrowLeft")
      next = (at - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    if (next === null) return;
    event.preventDefault();
    onChange(items[next]!.id);
    list.current
      ?.querySelectorAll<HTMLButtonElement>("[role='tab']")
      [next]?.focus();
  }

  return (
    <div>
      <div
        ref={list}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex gap-1 border-b border-line"
      >
        {items.map((item) => {
          const selected = item.id === value;
          return (
            <button
              key={item.id}
              role="tab"
              type="button"
              id={`${base}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(item.id)}
              className={cn(
                "-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-body-sm font-medium transition-colors duration-150",
                "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-text",
                selected
                  ? "border-accent text-ink"
                  : "border-transparent text-muted hover:border-line-strong hover:text-ink",
              )}
            >
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
      <div
        role="tabpanel"
        id={`${base}-panel-${value}`}
        aria-labelledby={`${base}-tab-${value}`}
        className="pt-5"
      >
        {children}
      </div>
    </div>
  );
}
