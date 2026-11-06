"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * Pills: the friendly version of a tab strip and of a filter.
 *
 * `PillTabs` is a choice among a few things on one screen (a filter, a metric)
 * and is a radio group, because that is what choosing one of several is.
 * `PillNav` is a set of links to other routes (the Wellness tab bar), so the
 * back button and a shared address stay honest.
 *
 * `SegmentedControl` in the shared library is the quiet, boxed version. This is
 * rounder, takes an icon and a count, and the nav version scrolls sideways on a
 * phone rather than wrapping a row of tabs onto two lines.
 */

const PILL =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-body-sm font-medium transition-colors duration-150";
const ON = "bg-well-green text-well-ink";
const OFF = "bg-sunken text-body hover:bg-well-green-soft hover:text-ink";

export function PillTabs<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: {
    value: T;
    label: string;
    icon?: React.ReactNode;
    count?: number;
  }[];
  value: T;
  onChange: (value: T) => void;
  /** What is being chosen, for a screen reader. */
  label: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("flex flex-wrap gap-2", className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(PILL, selected ? ON : OFF)}
          >
            {option.icon && (
              <span aria-hidden="true" className="[&>svg]:size-4">
                {option.icon}
              </span>
            )}
            {option.label}
            {option.count !== undefined && (
              <span
                className={cn(
                  "tabular rounded-full px-1.5 text-meta",
                  selected ? "bg-well-ink/10" : "bg-surface text-muted",
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function PillNav({
  items,
  activeHref,
  label = "Sections",
  className,
}: {
  items: { href: string; label: string; icon?: React.ReactNode }[];
  activeHref: string;
  label?: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn("scroll-x -mx-1 flex gap-2 px-1 py-1", className)}
    >
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(PILL, active ? ON : OFF)}
          >
            {item.icon && (
              <span aria-hidden="true" className="[&>svg]:size-4">
                {item.icon}
              </span>
            )}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
