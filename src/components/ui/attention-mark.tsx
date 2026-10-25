"use client";

import { InfoTooltip } from "./field";
import { cn } from "@/lib/cn";

/**
 * A small ochre icon that says "look here", with the reason one hover away.
 *
 * ## Why this exists rather than a banner
 *
 * A fact about one person, one row or one section used to be a tinted box above
 * the page: an icon, a heading, a paragraph and sometimes a button, over the very
 * table it was about. The owner's words: *"the big banner like '1 probation has
 * already ended' should not be used. We need a better way for enclosing
 * necessary information, but not showing it bold and covering so much space.
 * Maybe a tooltip, maybe an icon that draws users' attention. Then they hover
 * and they find out. And this can just be on the table where we have user
 * information."*
 *
 * So the fact goes where the thing it is about already is — next to a name, a
 * status or a section title — and the sentence goes behind it.
 *
 * ## It is not hover-only
 *
 * It is a real button. A keyboard reaches it with Tab and the reason opens on
 * focus; a finger opens it with a tap and it stays until dismissed; Escape and a
 * press elsewhere close it. And the **icon's accessible name is the message**,
 * not "More information", so a screen reader announces the reason as it lands on
 * the mark instead of making somebody open it to find out what it is.
 *
 * It reuses `InfoTooltip`'s panel (portalled, so a table cannot clip it, and
 * placed from a measurement of where it is) rather than growing a second
 * tooltip.
 *
 * ## Where it goes, and what stays words
 *
 * - **On the row** it is about, beside the name or the status: `TDPrimary`'s
 *   `mark`, or inside the cell that carries the status. A status that is plain
 *   text stays plain text; the mark is the only colour on the row.
 * - **On a section or a page**, when the fact is a count for the whole of it:
 *   `CardHeader`'s `mark`, or `PageHeader`'s `meta`.
 * - **A failure that needs words on screen** is not this: a failed load or a
 *   refused action is a line of plain text (`Callout tone="danger"`). A hover is
 *   the wrong place for the one thing somebody must read to carry on.
 * - **A call to action** is not this either: that is a button, a row action or a
 *   link, and the mark can sit beside it to say why.
 *
 * Renders nothing when there is nothing to say, so a caller can write
 * `<AttentionMark text={overdue ? "…" : null} />` without a conditional.
 */
export function AttentionMark({
  text,
  label,
  tone = "attention",
  className,
}: {
  /**
   * The message: the tooltip's body and the icon's accessible name. A list is
   * shown one line each, and anything empty in it is skipped.
   */
  text?: string | readonly (string | null | false | undefined)[] | null | false;
  /** Overrides the accessible name; it is the message when left out. */
  label?: string;
  /**
   * `attention` (ochre) is for something the reader should look at: overdue,
   * missing, blocked, about to go wrong. `info` (grey) is for what a state
   * means once somebody has seen it: a record that is closed, a figure that
   * was carried over. Same control, same panel, a quieter glyph.
   */
  tone?: "attention" | "info";
  className?: string;
}) {
  const lines = (Array.isArray(text) ? text : [text]).filter(
    (line): line is string => typeof line === "string" && line.trim() !== "",
  );
  if (lines.length === 0) return null;

  return (
    <span className={cn("inline-flex shrink-0 align-middle", className)}>
      <InfoTooltip
        tone={tone}
        text={lines.join("\n")}
        label={label ?? lines.join(" ")}
      />
    </span>
  );
}
