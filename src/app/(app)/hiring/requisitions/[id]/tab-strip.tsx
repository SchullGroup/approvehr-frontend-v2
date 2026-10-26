"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui";

/**
 * A strip of tabs that is 44px tall on a phone.
 *
 * ## Why not the shared `Tabs`
 *
 * It is the right component and its buttons are 42px tall (`py-2.5` around a 20px
 * line), which is under the 44px the audit measures a phone target against, and
 * it sits in `components/ui`, which this screen may not edit. This is the same
 * pattern, the same keyboard behaviour (roving tabindex; arrows, Home, End) and
 * the same look, with the height changed and the panel left to the caller. Used
 * twice on this screen: for Pipeline / Applicants / Stages / Access, and, on a
 * phone, for the stages of the board.
 *
 * ## Counts
 *
 * `count` is rendered only when it is a number. A tab whose figure is not known
 * yet carries no badge rather than a 0 (absent is not zero), and the caller
 * decides whether a true zero is worth showing. `tone: "warning"` marks a count of
 * work waiting on somebody, so it can be seen from another tab.
 */

export type TabStripItem = {
  id: string;
  label: string;
  count?: number | undefined;
  tone?: "warning";
};

/** The attributes the panel under a strip needs so the two reference each other. */
export function tabPanelProps(prefix: string, value: string) {
  return {
    role: "tabpanel" as const,
    id: `${prefix}-panel`,
    "aria-labelledby": `${prefix}-tab-${value}`,
    tabIndex: 0,
  };
}

export function TabStrip({
  items,
  value,
  onChange,
  label,
  prefix,
  variant = "underline",
  className,
}: {
  items: readonly TabStripItem[];
  value: string;
  onChange: (id: string) => void;
  /** What the tabs are, for the tablist. */
  label: string;
  /** From `useId()`, shared with `tabPanelProps`. */
  prefix: string;
  /**
   * `pills` for a strip inside a tab's panel: two underlined strips one under the
   * other read as one navigation that has lost its place.
   */
  variant?: "underline" | "pills";
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  /* The selected tab can start scrolled out of view — a `?tab=` link, or a swipe
     that landed past what fits. `block: "nearest"` keeps it to the strip's own
     horizontal scroll rather than moving the page. */
  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [value]);

  const at = items.findIndex((item) => item.id === value);
  const pills = variant === "pills";

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={(event) => {
        const to =
          event.key === "ArrowRight"
            ? (at + 1) % items.length
            : event.key === "ArrowLeft"
              ? (at - 1 + items.length) % items.length
              : event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : null;
        if (to === null) return;
        const next = items[to];
        if (!next) return;
        event.preventDefault();
        onChange(next.id);
        listRef.current
          ?.querySelectorAll<HTMLElement>('[role="tab"]')
          [to]?.focus();
      }}
      className={cn(
        "scroll-x flex",
        pills ? "gap-2 py-1.5" : "gap-1 border-b border-line",
        className,
      )}
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`${prefix}-tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`${prefix}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cn(
              "flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap text-body-sm font-medium",
              "transition-colors duration-150",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
              pills
                ? cn(
                    "rounded-full border px-4",
                    selected
                      ? "border-accent-line bg-accent-soft text-accent-text"
                      : "border-line bg-surface text-muted hover:text-ink",
                  )
                : cn(
                    "-mb-px border-b-2 px-3.5 focus-visible:-outline-offset-2",
                    selected
                      ? "border-accent text-ink"
                      : "border-transparent text-muted hover:border-line-strong hover:text-ink",
                  ),
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <Badge
                tone={
                  item.tone === "warning"
                    ? "warning"
                    : selected && !pills
                      ? "accent"
                      : "neutral"
                }
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
  );
}
