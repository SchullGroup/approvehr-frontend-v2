"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";
import { IconButton } from "@/components/ui";

/**
 * A small "more actions" menu for a page header.
 *
 * ## Why this is local
 *
 * The shared row-actions menu is being built on another branch, and this screen
 * needed one now: a destructive action must not sit in the stepper row beside
 * navigation. This is deliberately the smallest thing that is correct, so that
 * swapping it for the shared one is a one-line import change. Nothing here
 * knows about payroll.
 *
 * ## What it does, and the parts easy to get wrong
 *
 * - **A real menu**: `aria-haspopup`, `role="menu"` and `role="menuitem"`, focus
 *   moves to the first item on open and returns to the trigger on Escape, and
 *   the arrow keys, Home and End move between items.
 * - **A dismissed menu never holds an action open.** An outside press closes it,
 *   as does Tab, so a keyboard user is never left tabbing behind a floating
 *   list.
 * - **The destructive item says so with its colour and its words.** `danger`
 *   tints the item; the label still has to name what it does, because colour
 *   alone is not a signal.
 * - **44px tap targets on a phone.** The trigger and every item.
 */

export type OverflowItem = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  tone?: "danger";
  disabled?: boolean;
  onSelect: () => void;
};

export function OverflowMenu({
  label,
  items,
}: {
  /** The trigger's accessible name: say what the menu is about. */
  label: string;
  items: readonly OverflowItem[];
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const menuId = useId();

  /* Focus the first item as the menu opens, and close on any press outside it.
     Both are subscriptions to the outside world, which is what an effect is for. */
  useEffect(() => {
    if (!open) return;
    wrap.current
      ?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')
      ?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (items.length === 0) return null;

  const enabledItems = () =>
    Array.from(
      wrap.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([disabled])',
      ) ?? [],
    );

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const entries = enabledItems();
    const at = entries.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => {
      event.preventDefault();
      entries[(to + entries.length) % entries.length]?.focus();
    };

    if (event.key === "ArrowDown") move(at + 1);
    else if (event.key === "ArrowUp") move(at - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(entries.length - 1);
    else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      wrap.current
        ?.querySelector<HTMLElement>("button[aria-haspopup]")
        ?.focus();
    } else if (event.key === "Tab") setOpen(false);
  };

  return (
    <div ref={wrap} className="relative">
      <IconButton
        label={label}
        variant="secondary"
        className="max-sm:size-11"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((was) => !was)}
      >
        <MoreHorizontal aria-hidden="true" className="size-4" />
      </IconButton>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-full z-30 mt-1.5 min-w-56 rounded-lg border border-line bg-surface p-1 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-body-sm font-medium transition-colors max-sm:min-h-11",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-text",
                "disabled:cursor-not-allowed disabled:opacity-50",
                item.tone === "danger"
                  ? "text-danger-text hover:bg-danger-soft"
                  : "text-ink hover:bg-canvas",
              )}
            >
              {item.icon && (
                <span aria-hidden="true" className="shrink-0 [&>svg]:size-4">
                  {item.icon}
                </span>
              )}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
