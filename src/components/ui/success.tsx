"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The moment a flow is finished.
 *
 * ## Why one component
 *
 * The same green circle had been copied four times by hand — at three sizes and
 * with three different icons — and the moments that matter most (a review sent,
 * a payroll run approved, a payment recorded) had either a one-line toast or
 * nothing at all. Anything that closes a flow somebody cared about should look
 * and read like the others, so it lives here once.
 *
 * ## What it is, and what it is not
 *
 * Calm. A check that draws itself, a soft ring that settles, a few lines that
 * rise in one after another — and then nothing moves. There is no confetti and
 * no exclamation mark: this product says an action is *approved* in green and
 * means it, and a celebration louder than the thing that happened would cheapen
 * both.
 *
 * What makes it feel good is the writing, so the shape of the writing is the
 * contract:
 *
 * - `title` says **what happened**, in the past tense, about the thing —
 *   "May 2026 payroll is approved", not "Success".
 * - `lead` carries **the number** or the name that proves it. A success message
 *   without the figure it is about is a decoration.
 * - `details` are what is now true or what happens next, one short line each.
 *   They are ticked because they are facts, not tasks.
 * - `actions` is where to go from here. The first is the obvious next step.
 *
 * ## Reduced motion
 *
 * The draw, the ring and the rise all collapse to their finished state
 * (`globals.css`, under the reduced-motion block). Somebody who asked for no
 * motion sees the completed check at once, which is the whole message anyway.
 */

type MarkSize = "sm" | "md" | "lg";

const MARK_BOX: Record<MarkSize, string> = {
  sm: "size-10",
  md: "size-14",
  lg: "size-[4.5rem]",
};

/**
 * The check on its own, for a place that already has a heading — a modal title,
 * a card header — and only needs the proof.
 */
export function SuccessMark({
  size = "md",
  className,
}: {
  size?: MarkSize;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "ahr-success-mark relative inline-flex shrink-0 items-center justify-center rounded-full bg-success-soft text-success-text ring-1 ring-success-line",
        MARK_BOX[size],
        className,
      )}
    >
      {/* One ring that opens out and fades. It is the only thing that moves
          after the check has drawn, and it moves once. */}
      <span className="ahr-success-ring absolute inset-0 rounded-full border border-success-line" />
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-1/2"
      >
        {/* `pathLength` makes the dash arithmetic independent of the path's
            real length, so the draw is the same at every size. */}
        <path
          className="ahr-success-check"
          pathLength={1}
          d="M5 12.5l4.5 4.5L19 7.5"
        />
      </svg>
    </span>
  );
}

export function SuccessMoment({
  title,
  lead,
  details,
  actions,
  headingLevel = 2,
  align = "start",
  markSize = "md",
  focusHeading = false,
  className,
}: {
  /** What happened, past tense, about the thing. */
  title: string;
  /** The figure or name that proves it. One sentence. */
  lead?: ReactNode;
  /** What is now true, or what happens next. One short line each. */
  details?: ReactNode[];
  /** Where to go from here. The first is the obvious next step. */
  actions?: ReactNode;
  headingLevel?: 1 | 2 | 3;
  align?: "start" | "center";
  markSize?: MarkSize;
  /**
   * Move focus to the heading when this appears.
   *
   * For a moment that *replaces* a page or a form: keyboard and screen-reader
   * users were on a control that is now gone, and without this they are left on
   * nothing. Off by default because inside a dialog the dialog already owns
   * focus.
   */
  focusHeading?: boolean;
  className?: string;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusHeading) heading.current?.focus();
  }, [focusHeading]);

  const Heading = `h${String(headingLevel)}` as "h1" | "h2" | "h3";
  const centred = align === "center";

  return (
    <div
      role="status"
      className={cn(
        "flex flex-col",
        centred ? "items-center text-center" : "items-start",
        className,
      )}
    >
      <SuccessMark size={markSize} />

      <Heading
        ref={heading}
        tabIndex={-1}
        className="ahr-success-line mt-5 text-h3 text-ink outline-none sm:text-h2"
        style={{ animationDelay: "240ms" }}
      >
        {title}
      </Heading>

      {lead && (
        <p
          className="ahr-success-line mt-3 max-w-prose text-lead text-body"
          style={{ animationDelay: "320ms" }}
        >
          {lead}
        </p>
      )}

      {details && details.length > 0 && (
        <ul
          className={cn(
            "ahr-success-line mt-6 flex flex-col gap-3",
            centred && "items-start text-left",
          )}
          style={{ animationDelay: "400ms" }}
        >
          {details.map((line, index) => (
            <li key={index} className="flex gap-3">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mt-0.5 size-4 shrink-0 text-success-text"
              >
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
              <span className="min-w-0 text-body-sm text-body">{line}</span>
            </li>
          ))}
        </ul>
      )}

      {actions && (
        <div
          className={cn(
            "ahr-success-line mt-8 flex flex-wrap items-center gap-x-5 gap-y-3",
            centred && "justify-center",
          )}
          style={{ animationDelay: "480ms" }}
        >
          {actions}
        </div>
      )}
    </div>
  );
}
