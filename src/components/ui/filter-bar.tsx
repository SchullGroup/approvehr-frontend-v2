"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useDismiss } from "@/hooks/use-dismiss";
import { TONES } from "./badge";
import { Button, IconButton } from "./button";
import { useHeaderSlot } from "./header-slot";
import { Input } from "./input";

/**
 * The filter bar. One of them, for every table in the product.
 *
 * ## Rule 5, and the one place it must not be obeyed
 *
 * The controls are **closed by default** behind a filter icon that carries a count
 * of what is applied. A directory offering eight selects above the
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
 * ## Where the filter icon sits, so it never floats on its own
 *
 * - **With a search box**, beside the search box, as always.
 * - **With no search box but a count, a sort or actions**, at the right end of
 *   the row, just before the actions, so the row reads as one group.
 * - **When it is the whole bar**, on a page whose header has an action, it moves
 *   up into the header, just left of that action (`header-slot.tsx`). It used to
 *   sit alone at the far left of an otherwise empty row under the header
 *   (Signatures was the screen that showed it). The panel then opens under it,
 *   aligned to its right edge. Applied-filter chips stay here, in the body,
 *   because they belong beside the list they narrow.
 *
 *   It stays put inside a card or a dialog (it filters that card or dialog, not
 *   the page), when the page header has no action, and when two such bars are
 *   on one page (two icons in the header could not say which list each filters).
 *   The keyboard and the labels are the same wherever it is drawn.
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
  const { mounted, closing } = useDismiss(open, 170);
  const panelId = useId();
  const hasPanel = Boolean(children);

  /* The icon is the whole bar: no search, no sort, no actions, no count line.
     `noun` rather than `count`, so a count that is still loading does not move
     the icon once it arrives. */
  const loneIcon =
    hasPanel && !onSearchChange && !sort && !actions && noun === undefined;
  /* Inside a card or a dialog it filters that card or dialog, so it stays.
     Read from the DOM once mounted: `Card` marks itself `data-card`, and every
     dialog here is `role="dialog"`. */
  const root = useRef<HTMLDivElement>(null);
  const [pageLevel, setPageLevel] = useState(false);
  useLayoutEffect(() => {
    const element = root.current;
    setPageLevel(
      element !== null &&
        element.closest('[data-card], [role="dialog"]') === null,
    );
  }, []);
  const slot = useHeaderSlot();
  const claim = slot?.claim;
  const wantsHeader = loneIcon && pageLevel && claim !== undefined;
  useLayoutEffect(
    () => (wantsHeader && claim ? claim() : undefined),
    [wantsHeader, claim],
  );
  const target =
    wantsHeader && slot?.claims === 1 && slot.element ? slot.element : null;
  /* No search box, but other things in the row: the icon joins them on the right. */
  const atEnd = hasPanel && !onSearchChange && !loneIcon;

  /* In the header it matches the header's small buttons (still 44px on touch). */
  const filterIcon = (align: "start" | "end", size: "sm" | "md" = "md") => (
    <div className="relative">
      <IconButton
        label={
          applied.length > 0
            ? `Filters, ${String(applied.length)} applied`
            : "Filters"
        }
        variant="secondary"
        size={size}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((was) => !was)}
        className="relative"
      >
        <SlidersHorizontal aria-hidden="true" className="size-4" />
        {applied.length > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-fill-strong text-meta font-semibold text-surface"
          >
            {applied.length}
          </span>
        )}
      </IconButton>
      {/* A small menu under the button, not a band across the page: the list
          below does not move when it opens, and a click anywhere else or
          Escape puts it away. Each filter is one labelled dropdown, one under
          the other. Opened from the right end of a row or from the header, it
          lines up with the icon's right edge so it stays on the screen. */}
      {mounted && (
        <>
          <div
            className={
              closing
                ? "pointer-events-none fixed inset-0 z-30"
                : "fixed inset-0 z-30"
            }
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div
            id={panelId}
            role="group"
            aria-label="Filters"
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
            }}
            className={cn(
              closing ? "animate-scale-out" : "animate-scale-in",
              align === "end"
                ? "right-0 origin-top-right"
                : "left-0 origin-top-left",
              "absolute top-full z-40 mt-2 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-lg border border-line bg-surface p-3 shadow-lg",
            )}
          >
            {children}
          </div>
        </>
      )}
    </div>
  );

  const showsRow = Boolean(
    onSearchChange ||
    (hasPanel && !target) ||
    sort ||
    actions ||
    (count !== undefined && noun),
  );

  return (
    <div
      ref={root}
      className={cn(
        "flex flex-col gap-3",
        !showsRow && applied.length === 0 && "hidden",
        className,
      )}
    >
      {target && createPortal(filterIcon("end", "sm"), target)}
      {showsRow && (
        <div className="flex flex-wrap items-center gap-3">
          {onSearchChange && (
            /* `min-w-44`, not `min-w-0`: the row wraps, but a search box that may
             shrink to nothing never has to — at 320px beside "Filters" and a
             count it was a 16px sliver under the button. With a floor it takes
             a line of its own instead. */
            <div className="relative min-w-44 max-w-full flex-1 sm:max-w-sm">
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

          {hasPanel && !target && !atEnd && filterIcon("start")}

          {sort}

          {/* `flex-wrap`: `actions` is sometimes a multi-option SegmentedControl
            (the expenses register's status filter is the case that found
            this), and at 375px that alone is close to the full width of the
            bar. `ml-auto` already drops this block onto its own line once the
            search box and the Filters button crowd it there; without its own
            `flex-wrap` too, the count sat beside the control on that line
            regardless, and the two together ran the bar 45px past the
            viewport. */}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
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
            {atEnd && filterIcon("end")}
            {actions}
          </div>
        </div>
      )}

      {/* Applied filters, outside the reveal. See the note at the top of the
          file: this is the part that must not be collapsible. */}
      {applied.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {applied.map((filter) => (
            <button
              key={`${filter.label}:${filter.value}`}
              type="button"
              onClick={filter.onClear}
              /* Can't be a `Badge` — that renders a `<span>`, and this needs
                 real button semantics for keyboard use — so it borrows
                 Badge's accent tone classes directly instead of
                 re-deriving them. */
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-meta transition-colors",
                "hover:bg-accent/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
                TONES.accent,
              )}
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
    </div>
  );
}
