"use client";

import { cn } from "@/lib/cn";

/**
 * One line of text saying what is outstanding, with the way to it in the line.
 *
 * ## Why this exists rather than a `Callout`
 *
 * A count of work sitting somewhere else is not a warning. It had been dressed
 * as one in nine places: a tinted box, an icon, a heading, a paragraph
 * explaining the consequence, and a button. On the appraisal period screen that
 * came out as
 *
 * > ⚠ **Worth sorting before the period closes**
 * > 26 people have no appraiser yet.
 * > [Review and fix]
 *
 * — five lines and a coloured panel for one fact and one link, above the
 * figures somebody actually opened the screen to read. The product owner's
 * words: *"this makes the app feel clunky and unprofessional… it should just
 * read as a text link, 26 people have no appraiser yet."*
 *
 * He is right, and the heading was the worst part of it. "Worth sorting before
 * the period closes" is the product having an opinion about a fact that speaks
 * for itself, and a reader has to get past it to reach the number. So: the
 * sentence, in a colour, clickable. Nothing else.
 *
 * ## Where a `Callout` is still right
 *
 * The distinction is **whether the reader must decide something here**, not
 * whether the news is bad:
 *
 * | | |
 * |---|---|
 * | a refusal the server just sent | `Callout` — it is the answer to what they pressed |
 * | a rating final and awaiting their answer | `Callout` — two buttons, one of them irreversible |
 * | a loan taking more than a third of take-home | `Callout` — the consequence is money and is not obvious |
 * | a payroll that cannot go out | `Callout` — it blocks the thing they came to do |
 * | **N people have no appraiser yet** | **this** — a count, and the work is on another screen |
 * | **4 objectives have not been sent** | **this** |
 *
 * If the answer to "what does the reader do about it in the next five seconds"
 * is "go somewhere else", it is a line.
 *
 * ## No icon, and no explanation of the consequence
 *
 * An icon is weight without words, and the tint already carries the urgency. As
 * for the consequence — "they will finish it with no mark unless somebody is
 * assigned" — that belongs on the screen that fixes it, next to the control
 * that fixes it, where somebody is in a position to act on it. Repeating it
 * here is the product explaining itself twice and trusting the reader once.
 *
 * `tone` is a text colour, never a background. Every value clears 4.5:1 on all
 * eight app backgrounds — see `scripts/verify-contrast.ts`, which checks the
 * whole matrix rather than a hand-written list.
 */
export function NoticeLine({
  tone = "warning",
  className,
  children,
}: {
  /**
   * `danger` where somebody ends the period with nothing; `warning` where it is
   * merely worth doing; `muted` for a plain statement of fact that happens to
   * carry a link.
   */
  tone?: "muted" | "warning" | "danger";
  className?: string;
  /** The sentence. Put the `Link` or the `button` inside it. */
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "flex flex-wrap items-baseline gap-x-2 gap-y-1 text-body-sm",
        tone === "danger"
          ? "text-danger-text"
          : tone === "warning"
            ? "text-warning-text"
            : "text-muted",
        className,
      )}
    >
      {children}
    </p>
  );
}

/**
 * The link inside a `NoticeLine`.
 *
 * Its own component so the nine call sites cannot each pick a different weight,
 * and because a `ButtonLink` here is the thing being removed — a button is a
 * decision, and this is a way through.
 *
 * Deliberately **not** wrapping the whole sentence: the fact is worth reading
 * whether or not somebody is going to act on it, and a fully underlined
 * sentence reads as one long link rather than as a statement with a way out of
 * it. The verb is the link.
 */
export const NOTICE_LINK =
  "font-medium underline underline-offset-2 decoration-current/40 hover:decoration-current";
