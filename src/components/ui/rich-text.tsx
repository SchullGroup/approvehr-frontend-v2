import { Fragment } from "react";
import { cn } from "@/lib/cn";
import { blocksOf, type Span } from "@/lib/inline-markdown";
import { LinkedText } from "./linked-text";

/**
 * An article body: paragraphs, lists, **bold** and *italic*, with links
 * clickable.
 *
 * What it understands is `lib/inline-markdown.ts` and nothing more, and it builds
 * React elements rather than markup, so there is nothing to escape. The reason it
 * exists is that the help centre printed `**Gross**` with its asterisks to every
 * employee who opened an article.
 */
function Spans({ spans }: { spans: Span[] }) {
  return (
    <>
      {spans.map((span, index) => {
        let node: React.ReactNode = <LinkedText>{span.text}</LinkedText>;
        if (span.italic) node = <em>{node}</em>;
        if (span.bold)
          node = <strong className="font-semibold text-ink">{node}</strong>;
        return <Fragment key={index}>{node}</Fragment>;
      })}
    </>
  );
}

export function RichText({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {blocksOf(children).map((block, index) =>
        block.kind === "paragraph" ? (
          <p key={index} className="text-body leading-relaxed">
            <Spans spans={block.spans} />
          </p>
        ) : block.ordered ? (
          <ol
            key={index}
            className="flex list-decimal flex-col gap-1.5 pl-5 text-body leading-relaxed"
          >
            {block.items.map((item, at) => (
              <li key={at}>
                <Spans spans={item} />
              </li>
            ))}
          </ol>
        ) : (
          <ul
            key={index}
            className="flex list-disc flex-col gap-1.5 pl-5 text-body leading-relaxed"
          >
            {block.items.map((item, at) => (
              <li key={at}>
                <Spans spans={item} />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
