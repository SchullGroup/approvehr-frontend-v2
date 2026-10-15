"use client";

import { Button } from "@/components/ui";
import { failureMessage } from "@/components/portal/load-failure";
import type { ApiError } from "@/lib/api/client";

/**
 * "Showing 100 of 250 applications" and the button that fetches the next lot.
 *
 * ## Why a button and not infinite scroll
 *
 * Somebody working a queue of applicants is doing something with each one — a CV
 * open in another tab, an Advance dialog — and a list that grows under the
 * scrollbar takes their place with it. A keyboard user cannot reach a footer that
 * keeps moving away, and a screen reader has no moment at which the list has
 * "ended". A button is where the list ends; pressing it is the decision to read on.
 *
 * ## Why it does not move
 *
 * The bar is one fixed-height line whether it is idle, loading, or showing an
 * error, so the rows above it are never pushed by the control that fetched them.
 * Newly loaded rows are appended below and the readout is a polite live region,
 * so the new count is announced without taking focus off the button.
 */
export function LoadMore({
  shown,
  total,
  noun,
  hasMore,
  loading,
  error,
  onLoadMore,
}: {
  /** How many rows are on screen. */
  shown: number;
  /** The server's count under the filter, or `null` while it is not known. */
  total: number | null;
  /** Singular and plural of what the rows are: `["application", "applications"]`. */
  noun: [string, string];
  hasMore: boolean;
  /** The next page is in flight. */
  loading: boolean;
  /** The last attempt at the next page failed. */
  error: ApiError | null;
  onLoadMore: () => void;
}) {
  const readout =
    total === null
      ? `${shown.toLocaleString("en-NG")} ${shown === 1 ? noun[0] : noun[1]} shown`
      : total <= shown
        ? `All ${total.toLocaleString("en-NG")} ${total === 1 ? noun[0] : noun[1]} shown`
        : `Showing ${shown.toLocaleString("en-NG")} of ${total.toLocaleString("en-NG")} ${noun[1]}`;

  /* Nothing to say and nothing to press: a short list needs no footer at all. */
  if (!hasMore && !error && (total === null || total <= shown) && shown <= 1) {
    return null;
  }

  return (
    <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
      <p className="text-meta text-muted" aria-live="polite">
        {readout}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {error && (
          <p role="alert" className="text-meta text-danger-text">
            {failureMessage(error, `the next ${noun[1]}`)}
          </p>
        )}
        {(hasMore || error) && (
          <Button
            variant="secondary"
            size="sm"
            loading={loading}
            disabled={loading}
            onClick={onLoadMore}
          >
            {error ? "Try again" : "Load more"}
          </Button>
        )}
      </div>
    </div>
  );
}
