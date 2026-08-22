"use client";

import { useId, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { Input } from "./input";

/**
 * The filter bar. One of them, for every table in the product.
 *
 * ## Rule 5, and the one place it must not be obeyed
 *
 * The controls are **closed by default** and the trigger says what is inside and
 * how much: "Filters · 2 applied". A directory offering eight selects above the
 * table is eight things to read before the list, and seven of them are not the
 * question the reader came with.
 *
 * But the *applied* filters render **outside** the closed panel, always. This is
 * the failure mode Rule 5 names by hand: a filter that is hiding rows while the
 * reader cannot see it is hiding money. Somebody who opens this screen, narrows
 * it to one department, walks away and comes back reads "1,204 employees ·
 * ₦148m" as the company — and the header stats above are computed under that
 * filter, so they agree with it. Chips out, controls in.
 *
 * ## The search box is never behind the reveal either
 *
 * Search is what a person reaches for first on a long list, and a search box
 * behind a click is a search box nobody finds. It sits in the bar.
 *
 * ## `count` is the server's count
 *
 * Pass the total the API returned under this filter, from the `meta` envelope.
 * Not `rows.length` — that is the page. Pass `undefined` while it is unknown and
 * it renders nothing rather than a zero.
 */

export type AppliedFilter = {
  /** What is filtered, in the user's word: "Department", "Period", "Actor". */
  label: string;
  /** What it is filtered to: "Sales", "March 2026", "Ada Obi". */
  value: string;
  /** Removes just this one. */
  onClear: () => void;
};

export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder,
  searchLabel,
  applied = [],
  onClearAll,
  count,
  noun,
  sort,
  actions,
  children,
  className,
}: {
  /** Omit both to render no search box — some tables have nothing to search. */
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** The accessible name for the search box. Say what it searches. */
  searchLabel?: string;
  /** Every filter currently narrowing the list. Rendered as removable chips. */
  applied?: AppliedFilter[];
  onClearAll?: () => void;
  /**
   * How many rows match, from the server's `meta.total`. `undefined` while
   * unknown — it renders nothing rather than a confident zero.
   */
  count?: number | undefined;
  /** Singular and plural of what is being counted: `["claim", "claims"]`. */
  noun?: [string, string];
  /** A sort control, if this table sorts from a select rather than its headers. */
  sort?: React.ReactNode;
  /** Buttons that belong beside the filters — export, add, bulk upload. */
  actions?: React.ReactNode;
  /** The filter controls. Everything in here is behind the reveal. */
  children?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const hasPanel = Boolean(children);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-3">
        {onSearchChange && (
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-faint"
            />
            <Input
              value={search ?? ""}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder ?? "Search"}
              aria-label={searchLabel ?? searchPlaceholder ?? "Search"}
              className="pl-9"
            />
          </div>
        )}

        {hasPanel && (
          <Button
            variant="secondary"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((was) => !was)}
          >
            <SlidersHorizontal aria-hidden="true" className="size-4" />
            Filters
            {applied.length > 0 && (
              <span className="rounded-full bg-accent-soft px-1.5 text-meta font-semibold text-accent-text">
                {applied.length}
              </span>
            )}
          </Button>
        )}

        {sort}

        <div className="ml-auto flex items-center gap-2">
          {/* The count sits with the filters rather than in a stat card so the
              number and the thing narrowing it are read together. */}
          {count !== undefined && noun && (
            <p className="text-meta text-muted">
              <span className="font-medium text-ink">
                {count.toLocaleString("en-NG")}
              </span>{" "}
              {count === 1 ? noun[0] : noun[1]}
              {applied.length > 0 && " match"}
            </p>
          )}
          {actions}
        </div>
      </div>

      {/* Applied filters, outside the reveal. See the note at the top of the
          file: this is the part that must not be collapsible. */}
      {applied.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {applied.map((filter) => (
            <button
              key={`${filter.label}:${filter.value}`}
              type="button"
              onClick={filter.onClear}
              className="inline-flex items-center gap-1.5 rounded-full border border-accent-line bg-accent-soft px-2.5 py-1 text-meta text-accent-text transition-colors hover:bg-accent/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
            >
              <span className="text-muted">{filter.label}:</span>
              <span className="font-medium">{filter.value}</span>
              <X aria-hidden="true" className="size-3.5" />
              <span className="sr-only">Remove this filter</span>
            </button>
          ))}
          {onClearAll && applied.length > 1 && (
            <Button size="sm" variant="ghost" onClick={onClearAll}>
              Clear all
            </Button>
          )}
        </div>
      )}

      {hasPanel && (
        <div
          id={panelId}
          hidden={!open}
          className="grid gap-4 rounded-lg border border-line bg-canvas p-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {open && children}
        </div>
      )}
    </div>
  );
}
