"use client";

import Link from "next/link";

/**
 * One finished task, as a row: its key, its title when there is one, and one small line of facts.
 *
 * The line is `workFacts` joined, "Finished 3 Sep · On time", and is the same line wherever a finished
 * task is listed: the live list in a review, the record kept with a rating, an objective's linked work
 * and the team's finished tasks. There is no grade here and nothing that looks like one.
 *
 * The caller says what is special about its list: whether the key opens the task (`href`, left out
 * where the reader may not open it), a title (the kept record has none), the objective it is linked to,
 * the person's own note, a checkbox before it, a menu after it, and a line under it (a flag).
 */
export function WorkRow({
  itemKey,
  title,
  href,
  newTab,
  facts,
  link,
  note,
  before,
  action,
  extra,
}: {
  itemKey: string;
  title?: string;
  /** Where the key goes. Left out, the key is plain text. */
  href?: string | null;
  newTab?: boolean;
  facts: readonly string[];
  /** The objective it is linked to, in the server's own words, when anybody linked one. */
  link?: string | null;
  /** The person's own words about it. */
  note?: string | null;
  /** A checkbox, before the row. */
  before?: React.ReactNode;
  /** A menu or a button, after the row. */
  action?: React.ReactNode;
  /** Something the screen has to say about this row beyond the task: today, a flag. */
  extra?: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      {before}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {href ? (
            <Link
              href={href}
              {...(newTab
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
              className="tabular text-body-sm font-medium text-accent-text hover:underline"
            >
              {itemKey}
              {newTab && <span className="sr-only"> (opens in a new tab)</span>}
            </Link>
          ) : (
            <span className="tabular text-body-sm font-medium text-ink">
              {itemKey}
            </span>
          )}
          {title && (
            <span className="min-w-0 break-words text-body-sm text-ink">
              {title}
            </span>
          )}
        </p>
        {facts.length > 0 && (
          <p className="text-meta text-muted">{facts.join(" · ")}</p>
        )}
        {link && <p className="text-meta text-muted">{link}</p>}
        {note && (
          <p className="whitespace-pre-line break-words text-body-sm text-ink">
            {note}
          </p>
        )}
        {extra}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </li>
  );
}
