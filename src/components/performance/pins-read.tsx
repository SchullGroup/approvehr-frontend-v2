"use client";

import Link from "next/link";
import { X } from "lucide-react";
import type { ApiPin } from "@/lib/api/work-pins";
import { pinFacts, pinHref } from "@/lib/performance/work-in-answers";
import { useOrgTimezone } from "@/lib/store/session";

/**
 * Finished work pinned to an answer, as chips.
 *
 * ## What is drawn, and what never is
 *
 * A pin is a chip with the task's **key** and nothing else: no heading, no count, no "pinned by". The
 * day it was finished, whether that was by its due date, who set it when somebody else did and whether it
 * sat under an objective are the chip's hover text, so they are one move away and never in the way. The
 * person's own note, when they wrote one, is in the chip it belongs to, because it is their words to the
 * reader and the key is then said once. There is no task title: the API does not keep one, and nothing here asks for one. The key opens
 * the task as it is now **where the server says this reader may open it** (`canOpen: true`, per pin).
 * Where it says they may not, and where it says nothing, the key is plain text: a link that lands on "We
 * could not find that task" is worse than none, and an absent answer makes no claim that one would not.
 * (The real server always says.) On time and late are the same quiet word, and nothing says what the
 * work was worth.
 *
 * ## Read by whoever may read the answer
 *
 * `PinsRead` is the read-only list, under the person's answer wherever a self-review is read. A pin is the
 * person's selection and never the appraiser's, so a reader does not take a short list for the whole of
 * what somebody did: the finished work is a tab away. `linkless` is for a row that is itself a button (the
 * preview), where a link inside would be invalid; the key is then plain text.
 *
 * This file holds only what reading needs, so the screens that read answers (`review-parts.tsx`) do not
 * pull in the picker and the stores behind it. Adding and removing is `answer-pins.tsx`, which draws the
 * same chips with a remove mark on each.
 */

export function PinChips({
  pins,
  linkless,
  newTab,
  removing,
  onRemove,
  removeRef,
}: {
  pins: readonly ApiPin[];
  linkless?: boolean;
  newTab?: boolean;
  /** The pin being taken off: its mark waits, and so do the others. */
  removing?: string | null;
  /** Gives each chip a mark to take it off. Left out, the chips are read-only. */
  onRemove?: (pin: ApiPin) => void;
  /** So the editor can put focus on a chip's mark after a refusal. */
  removeRef?: (pinId: string, node: HTMLButtonElement | null) => void;
}) {
  const timeZone = useOrgTimezone();
  return (
    <ul className="flex min-w-0 flex-wrap items-start gap-1.5">
      {pins.map((pin) => {
        const facts = pinFacts(pin, timeZone).join(" · ");
        const open = !linkless && pin.canOpen === true;
        const edge = onRemove ? "pl-2.5" : "px-2.5";
        return (
          <li
            key={pin.id}
            className="inline-flex max-w-full items-start rounded-xl bg-sunken text-meta"
          >
            {open ? (
              <Link
                href={pinHref(pin)}
                {...(newTab
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                title={facts}
                className={`tabular shrink-0 ${edge} py-1 font-medium text-accent-text hover:underline`}
              >
                {pin.key}
                {newTab && (
                  <span className="sr-only"> (opens in a new tab)</span>
                )}
              </Link>
            ) : (
              <span
                title={facts}
                className={`tabular shrink-0 ${edge} py-1 font-medium text-ink`}
              >
                {pin.key}
              </span>
            )}
            {/* The person's own words to the reader, inside the chip they belong to. */}
            {pin.note && (
              <span
                className={`min-w-0 whitespace-pre-line break-words py-1 pl-2 text-body-sm text-ink ${onRemove ? "" : "pr-2.5"}`}
              >
                {pin.note}
              </span>
            )}
            {onRemove && (
              <button
                type="button"
                ref={(node) => removeRef?.(pin.id, node)}
                aria-label={`Unpin ${pin.key}`}
                disabled={removing !== null && removing !== undefined}
                onClick={() => onRemove(pin)}
                className="mx-1 mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-ink focus-visible:text-ink disabled:opacity-50 pointer-coarse:size-8"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The pins under one answer, read-only. Nothing is drawn for none: an answer with no pins is the
 * ordinary case and a heading over nothing would read as something missing.
 */
export function PinsRead({
  pins,
  linkless,
}: {
  pins: readonly ApiPin[];
  /**
   * Accepted so the screens that read answers do not have to change, and no longer drawn: the person
   * who pinned is always the author of the answer the chips sit under.
   */
  pinnedBy?: string | null;
  linkless?: boolean;
}) {
  if (pins.length === 0) return null;
  return (
    <div className="mt-2">
      <PinChips pins={pins} {...(linkless ? { linkless } : {})} />
    </div>
  );
}
