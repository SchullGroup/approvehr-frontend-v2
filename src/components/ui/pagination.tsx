"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { Select } from "./input";

/**
 * The pagination control. One of them, for every table in the product.
 *
 * ## The count is the server's, or there is no count
 *
 * `total` is the number the API returned in its `meta` envelope for **this
 * filter** — not `rows.length`. That distinction is the whole reason this
 * component takes a `total` prop at all rather than measuring its own children:
 * several screens used to fetch one page and count it, so a company of two
 * thousand staff saw "25 employees" above a table of 25 and had no way to tell
 * that was the page rather than the company.
 *
 * And when the total is not known yet — first load, or an endpoint that does not
 * count — pass `undefined`. It renders "Loading…" and no range. Absent is not
 * zero; a confident "0 of 0" while a request is in flight is a lie the reader
 * has no reason to doubt.
 *
 * ## Why numbered pages are not here
 *
 * Previous / next, a page-of-pages readout, and rows-per-page. No 1 · 2 · 3 …
 * 74 strip: with two thousand staff the strip is either truncated into
 * uselessness or wider than the table, and the thing a person actually does with
 * a long list is search it. The jump-to-page box is the escape hatch and it
 * appears only once there is more than one page to jump between.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  noun,
  pageSizes = [25, 50, 100],
  loading = false,
  className,
}: {
  page: number;
  pageSize: number;
  /**
   * The server's count under the current filter. `undefined` while unknown —
   * never a placeholder zero.
   */
  total: number | undefined;
  onPageChange: (page: number) => void;
  /** Omit to hide the rows-per-page control. */
  onPageSizeChange?: (size: number) => void;
  /**
   * What the rows are, singular and plural: `["employee", "employees"]`. In the
   * user's word, not the engine's — "payslip", not "record".
   */
  noun: [string, string];
  pageSizes?: number[];
  /** Disables the controls mid-request so a double-click cannot skip a page. */
  loading?: boolean;
  className?: string;
}) {
  const known = total !== undefined;
  const totalPages = known ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const first = known && total > 0 ? (page - 1) * pageSize + 1 : 0;
  const last = known ? Math.min(page * pageSize, total) : 0;

  const label = known
    ? total === 0
      ? `No ${noun[1]}`
      : total <= pageSize
        ? `${format(total)} ${total === 1 ? noun[0] : noun[1]}`
        : `${format(first)}–${format(last)} of ${format(total)} ${noun[1]}`
    : "Loading…";

  /* One page and nothing to change about it: the readout is still worth
     rendering — it is the only place the reader learns the size of the list —
     but the buttons would be two permanently disabled controls. */
  const paged = known && totalPages > 1;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3",
        className,
      )}
    >
      <p className="text-meta text-muted" aria-live="polite">
        {label}
      </p>

      <div className="flex items-center gap-3">
        {onPageSizeChange && known && total > pageSizes[0]! && (
          <label className="flex items-center gap-2 text-meta text-muted">
            <span className="whitespace-nowrap">Per page</span>
            <Select
              value={String(pageSize)}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="h-8 w-20 py-0 text-meta"
              aria-label={`${noun[1]} per page`}
            >
              {pageSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </Select>
          </label>
        )}

        {paged && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={page <= 1 || loading}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
              Previous
            </Button>
            <span className="text-meta whitespace-nowrap text-muted">
              Page {format(page)} of {format(totalPages)}
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={page >= totalPages || loading}
              onClick={() => onPageChange(page + 1)}
            >
              Next
              <ChevronRight aria-hidden="true" className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Thousands separators. A count of 1847 is harder to read than 1,847. */
const format = (value: number) => value.toLocaleString("en-NG");
