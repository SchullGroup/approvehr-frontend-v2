import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/cn";
import type { SortOrder } from "@/lib/use-list-query";

/*
 * Tables scroll inside their own box so the page body never scrolls
 * horizontally. Numeric cells inherit tabular figures from globals.css.
 */

export function TableWrap({
  className,
  caption,
  children,
}: {
  className?: string;
  /** Describes the table for screen readers. Visually hidden by default. */
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "scroll-x rounded-lg border border-line bg-surface",
        className,
      )}
    >
      <table className="w-full border-collapse text-body-sm">
        {caption && <caption className="sr-only-focusable">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="border-b border-line bg-canvas">
      <tr>{children}</tr>
    </thead>
  );
}

export function TH({
  className,
  align = "left",
  scope = "col",
  children,
}: {
  className?: string;
  align?: "left" | "right" | "center";
  scope?: "col" | "row";
  children?: React.ReactNode;
}) {
  return (
    <th
      scope={scope}
      className={cn(
        "px-4 py-3 text-meta font-semibold text-muted whitespace-nowrap",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

/**
 * A column header that sorts, server-side.
 *
 * `aria-sort` on the `<th>` and a real button inside it, so a screen reader
 * announces both the column's current direction and that pressing it changes
 * one. The arrow is `aria-hidden`; `aria-sort` carries the meaning.
 *
 * ## What this does not do
 *
 * It does not sort anything itself. `onSort` goes to `useListQuery`, which puts
 * `sort` and `order` in the request, and the API's `orderBy` helper turns them
 * into a Prisma clause that always ends on a unique tiebreaker. Sorting an
 * already-fetched page in the browser is the bug this component exists to
 * replace: it reorders 25 rows out of 2,000 and presents the result as the
 * order of the list.
 *
 * `column` must be a name the endpoint's own allow-list accepts. It is not
 * checked here — the API refuses anything it does not recognise and falls back
 * to its default sort, so a typo is a header that appears to do nothing.
 */
export function SortableTH({
  column,
  active,
  order,
  onSort,
  align = "left",
  startDescending = false,
  className,
  children,
}: {
  /** The `sort` value the API expects for this column. */
  column: string;
  /** The column currently sorted on, from `useListQuery`. */
  active: string | undefined;
  order: SortOrder;
  onSort: (column: string, startDescending?: boolean) => void;
  align?: "left" | "right" | "center";
  /** For a date or an amount, where the interesting end is the top. */
  startDescending?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const sorted = active === column;
  const Arrow = !sorted ? ChevronsUpDown : order === "asc" ? ArrowUp : ArrowDown;

  return (
    <th
      scope="col"
      aria-sort={sorted ? (order === "asc" ? "ascending" : "descending") : "none"}
      className={cn(
        "px-4 py-3 text-meta font-semibold text-muted whitespace-nowrap",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onSort(column, startDescending)}
        className={cn(
          "group inline-flex items-center gap-1.5 rounded-sm transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
          align === "right" && "flex-row-reverse",
          sorted && "text-ink",
        )}
      >
        {children}
        <Arrow
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0 transition-opacity",
            sorted ? "opacity-100" : "opacity-40 group-hover:opacity-100",
          )}
        />
      </button>
    </th>
  );
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}

/**
 * Makes a whole row follow its main link, without breaking the row.
 *
 * `TR interactive` only ever added a hover tint and `cursor-pointer`, so every
 * table in the app has been showing a pointer over rows that do nothing — the
 * name inside was the only target. A cursor that promises a click and does not
 * deliver one is worse than a plain row.
 *
 * The row is deliberately **not** made focusable and given a key handler. The
 * link inside it is already a real anchor: it is in the tab order, it is
 * announced as a link, and it right-clicks and middle-clicks into a new tab.
 * Adding `tabIndex` and `role="link"` to the `<tr>` as well would create a
 * second tab stop onto the same destination, which is a worse experience for a
 * keyboard user than no row click at all. So the anchor serves the keyboard and
 * this serves the mouse.
 *
 * Two things it refuses to swallow:
 *
 * - a click that started on another control — a button, a link, a checkbox — so
 *   the restore button at the end of an archived row still restores rather than
 *   navigating away from it;
 * - a click that ends a text selection, so somebody dragging across an account
 *   number to copy it does not get moved to another page instead.
 */
export function rowClick(navigate: () => void) {
  return (event: React.MouseEvent<HTMLTableRowElement>) => {
    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        "a, button, input, select, textarea, label, [role='button'], [role='link']",
      )
    ) {
      return;
    }
    /* A drag that selected text is a copy, not a navigation. */
    if ((globalThis.getSelection?.()?.toString() ?? "") !== "") return;
    navigate();
  };
}

export function TR({
  className,
  interactive = false,
  children,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }) {
  return (
    <tr
      className={cn(
        "transition-colors duration-100",
        interactive && "hover:bg-canvas cursor-pointer",
        className,
      )}
      {...props}
    >
      {children}
    </tr>
  );
}

export function TD({
  className,
  align = "left",
  children,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & {
  align?: "left" | "right" | "center";
}) {
  return (
    <td
      className={cn(
        "px-4 py-3 align-middle text-body",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
      {...props}
    >
      {children}
    </td>
  );
}

/** Primary identifying cell. Renders as a row header for screen readers. */
export function TDPrimary({
  title,
  subtitle,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="row"
      className={cn("px-4 py-3 text-left align-middle font-normal", className)}
    >
      <span className="block text-body-sm font-medium text-ink">{title}</span>
      {subtitle && (
        <span className="mt-0.5 block text-meta text-muted">
          {subtitle}
        </span>
      )}
    </th>
  );
}
