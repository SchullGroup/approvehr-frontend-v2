import { Fragment } from "react";
import { cn } from "@/lib/cn";
import { splitLinks } from "@/lib/linked-text";

/**
 * Text somebody typed, with any links in it clickable.
 *
 * ## Why this exists
 *
 * A performance task is one line of what you did this week, and what people
 * actually write is *"shipped the payment retry, PR at
 * https://github.com/…/412, notes in the doc"*. Every surface rendered that as
 * `{task.description}` — plain text — so the manager grading it had to select a
 * URL out of a sentence and paste it into a bar. A link in the middle of a
 * sentence is the ordinary case, not the edge one: the only time the old
 * rendering worked was when the whole field was a URL and nothing else.
 *
 * Where a link starts and stops is `lib/linked-text.ts`, which is gated by
 * `scripts/verify-linked-text.ts`. This file is only the rendering.
 */
export function LinkedText({
  children,
  className,
}: {
  /** One line of plain text. Not Markdown, and not HTML. */
  children: string | null | undefined;
  /** Applied to the links, not to the text around them. */
  className?: string;
}) {
  if (!children) return null;

  const pieces = splitLinks(children);
  /* Nothing to link. Returning the string itself keeps the common case out of
     any wrapper, so no layout changes anywhere for text with no URL in it. */
  if (pieces.length === 1 && pieces[0]?.href === null) return <>{children}</>;

  return (
    <>
      {pieces.map((piece, index) =>
        piece.href === null ? (
          <Fragment key={index}>{piece.text}</Fragment>
        ) : (
          <a
            key={index}
            href={piece.href}
            target="_blank"
            /* `noopener` because the new tab must not reach back through
               `window.opener`, and `noreferrer` because where somebody works is
               not this product's to hand to a third party. */
            rel="noreferrer noopener"
            className={cn(
              "font-medium text-accent-text underline underline-offset-4 hover:no-underline",
              /* A pasted URL is frequently longer than the cell it lands in.
                 Breaking it is what keeps a task row from widening its table. */
              "break-all",
              className,
            )}
          >
            {piece.text}
          </a>
        ),
      )}
    </>
  );
}
