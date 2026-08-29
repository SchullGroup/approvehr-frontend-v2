"use client";

import Link from "next/link";
import { ArrowRight, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { ButtonLink, Field, IconButton, Input } from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { useKbSearch } from "@/lib/store/knowledge";

/**
 * The knowledge base search box, wherever it is needed.
 *
 * Self-contained on purpose: it holds its own query, does its own debouncing and
 * renders its own results, so a screen can drop it in with no props and no
 * state. It is used by the reader at `/help/kb` and by the help desk.
 *
 * ## Two behaviours worth keeping
 *
 * **Results appear while you type.** The API prefix-matches, so "pens" finds the
 * pension article. Debounced at 250ms in the store, because a search that finds
 * nothing is written down and a keystroke is not a question.
 *
 * **Nothing found is an offer, not an apology.** A search with no answer is the
 * moment somebody needs a person, so the button beside it opens the help desk.
 * The term is also on its way to the editor's backlog, which is what eventually
 * makes the article exist — but the reader does not need telling that; they need
 * the button.
 */
export function KbSearch({
  className,
  label = "Search help articles",
  placeholder = "Search help articles — try “payslip”",
  limit = 6,
}: {
  className?: string;
  /** Visible label. Keep it a question the reader would ask. */
  label?: string;
  placeholder?: string;
  /** How many hits to show. The API is paged; this is the first page. */
  limit?: number;
} = {}) {
  const search = useKbSearch({ pageSize: limit });

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Field label={label}>
        <div className="relative">
          <Input
            type="search"
            value={search.query}
            onChange={(event) => search.setQuery(event.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            icon={<Search aria-hidden="true" />}
            className={search.query ? "pr-11" : undefined}
          />
          {search.query.length > 0 && (
            <span className="absolute right-1 top-1/2 -translate-y-1/2">
              <IconButton
                label="Clear the search"
                size="sm"
                onClick={search.clear}
              >
                <X aria-hidden="true" className="size-4" />
              </IconButton>
            </span>
          )}
        </div>
      </Field>

      {/* One live region for every outcome, so a screen reader hears each
          answer once rather than the list rebuilt per keystroke. The spinner is
          a bare icon rather than `Spinner`, which carries its own `role=status`
          — a live region inside a live region announces twice. */}
      <div aria-live="polite" className="flex flex-col gap-2">
        {search.searching && (
          <p className="flex items-center gap-2 text-body-sm text-muted">
            <Loader2
              aria-hidden="true"
              className="size-4 animate-spin text-accent-text motion-reduce:animate-none"
            />
            Searching…
          </p>
        )}

        <LoadFailure subject="the search results" error={search.error}/>

        {search.answered && search.hits.length > 0 && (
          <>
            <p className="text-meta text-muted">
              {search.total === 1 ? "1 article" : `${search.total} articles`}
              {search.total > search.hits.length &&
                ` — showing the top ${search.hits.length}`}
            </p>
            <ul className="flex flex-col gap-1.5">
              {search.hits.map((hit) => (
                <li key={hit.id}>
                  <Link
                    href={`/help/kb/${hit.slug}`}
                    className={cn(
                      "group flex items-start gap-3 rounded-md border border-line p-3",
                      "transition-colors duration-100 hover:bg-canvas",
                      "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/25",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-body-sm font-medium text-ink">
                        {hit.title}
                      </span>
                      <span className="mt-0.5 block text-body-sm leading-relaxed text-muted">
                        {hit.snippet}
                      </span>
                    </span>
                    <ArrowRight
                      aria-hidden="true"
                      className="mt-1 size-4 shrink-0 text-faint transition-colors group-hover:text-accent-text"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}

        {search.answered && search.hits.length === 0 && !search.error && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-canvas p-3.5">
            <p className="min-w-0 flex-1 text-body-sm text-body">
              No article answers{" "}
              <span className="font-medium text-ink">
                &ldquo;{search.term}&rdquo;
              </span>{" "}
              yet.
            </p>
            <ButtonLink href="/help" variant="accent" size="sm">
              Ask the help desk
            </ButtonLink>
          </div>
        )}
      </div>
    </div>
  );
}
