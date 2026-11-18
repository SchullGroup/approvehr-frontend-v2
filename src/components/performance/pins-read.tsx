"use client";

import Link from "next/link";
import type { ApiPin } from "@/lib/api/work-pins";
import {
  pinFacts,
  pinHref,
  pinnedLine,
} from "@/lib/performance/work-in-answers";
import { useOrgTimezone } from "@/lib/store/session";

/**
 * Finished work pinned to an answer, read.
 *
 * ## What is drawn, and what never is
 *
 * A pin is the task's **key**, the day it was finished, whether that was by its due date, who set it
 * when somebody else did, whether it sat under an objective, and the person's own note. There is no
 * task title: the API does not keep one, and nothing here asks for one. The key opens the task as it
 * is now **where the server says this reader may open it** (`canOpen: true`, per pin). Where it says
 * they may not, and where it says nothing, the key is plain text: a link that lands on "We could not
 * find that task" is worse than none, and an absent answer makes no claim that one would not. (The
 * real server always says.) On time and late are the same quiet word, and nothing says what the work
 * was worth.
 *
 * ## Read by whoever may read the answer
 *
 * `PinsRead` is the read-only list, under the person's answer wherever a self-review is read, with a
 * muted line saying whose choice it was and when. A pin is the person's selection and never the
 * appraiser's, and the line says so, so a reader does not take a short list for the whole of what
 * somebody did. `linkless` is for a row that is itself a button (the preview), where a link inside
 * would be invalid; the key is then plain text.
 *
 * This file holds only what reading needs, so the screens that read answers (`review-parts.tsx`) do
 * not pull in the picker and the stores behind it. Adding and removing is `answer-pins.tsx`.
 */

export function PinRow({
  pin,
  timeZone,
  pinnedBy,
  linkless,
  newTab,
  action,
}: {
  pin: ApiPin;
  timeZone: string;
  /** Who chose it, for the muted line. `undefined` leaves the line out (the person's own page). */
  pinnedBy?: string | null;
  linkless?: boolean;
  newTab?: boolean;
  action?: React.ReactNode;
}) {
  const facts = pinFacts(pin, timeZone);
  return (
    <li className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0">
          {linkless || pin.canOpen !== true ? (
            <span className="tabular text-body-sm font-medium text-ink">
              {pin.key}
            </span>
          ) : (
            <Link
              href={pinHref(pin)}
              {...(newTab
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
              className="tabular text-body-sm font-medium text-accent-text hover:underline"
            >
              {pin.key}
              {newTab && <span className="sr-only"> (opens in a new tab)</span>}
            </Link>
          )}
        </p>
        {action}
      </div>
      {facts.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-meta text-muted">
          {facts.map((fact, index) => (
            <span key={index}>{fact}</span>
          ))}
        </p>
      )}
      {pin.note && (
        <p className="whitespace-pre-line break-words text-body-sm text-ink">
          {pin.note}
        </p>
      )}
      {pinnedBy !== undefined && (
        <p className="text-meta text-muted">
          {pinnedLine(pinnedBy, pin.pinnedAt, timeZone)}
        </p>
      )}
    </li>
  );
}

/**
 * The pins under one answer, read-only. Nothing is drawn for none: an answer with no pins is the
 * ordinary case and a heading over nothing would read as something missing.
 */
export function PinsRead({
  pins,
  pinnedBy,
  linkless,
}: {
  pins: readonly ApiPin[];
  /**
   * "you" or a name, for the muted "Pinned by" line; `null` when the reader does not know whose
   * choice it was (the line then says only when). Left out, there is no line: the person's own
   * preview does not need to be told who pinned it.
   */
  pinnedBy?: string | null;
  linkless?: boolean;
}) {
  const timeZone = useOrgTimezone();
  if (pins.length === 0) return null;
  return (
    <div className="mt-2">
      <p className="text-meta font-medium text-muted">
        {pins.length === 1
          ? "Work pinned to this answer"
          : `${String(pins.length)} pieces of work pinned to this answer`}
      </p>
      <ul className="mt-1 flex flex-col">
        {pins.map((pin) => (
          <PinRow
            key={pin.id}
            pin={pin}
            timeZone={timeZone}
            {...(pinnedBy !== undefined ? { pinnedBy } : {})}
            {...(linkless ? { linkless } : {})}
          />
        ))}
      </ul>
    </div>
  );
}
