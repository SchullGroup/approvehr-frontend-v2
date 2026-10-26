import { Fragment } from "react";
import { parseRichText, type RichNode } from "@/lib/marketing/rich-text";

/**
 * A job description, drawn from the parsed tree.
 *
 * Server-renderable and free of `dangerouslySetInnerHTML`: see
 * `lib/marketing/rich-text.ts` for why. Every element here is one we chose and
 * every link carries `rel` and opens in the same tab unless it leaves the site,
 * where it opens a new one without handing over `window.opener`.
 */
export function RichText({ html }: { html: string }) {
  const tree = parseRichText(html);
  return (
    <div data-testid="rich-text" className="rich-text flex flex-col gap-4">
      {tree.map((node, index) => (
        <Node key={index} node={node} />
      ))}
    </div>
  );
}

function Nodes({ nodes }: { nodes: readonly RichNode[] }) {
  return (
    <>
      {nodes.map((node, index) => (
        <Node key={index} node={node} />
      ))}
    </>
  );
}

function Node({ node }: { node: RichNode }) {
  if (node.type === "text") return <Fragment>{node.text}</Fragment>;

  const children = <Nodes nodes={node.children} />;
  switch (node.tag) {
    case "br":
      return <br />;
    case "p":
      return <p className="leading-relaxed">{children}</p>;
    case "strong":
      return <strong className="font-semibold text-slate">{children}</strong>;
    case "em":
      return <em>{children}</em>;
    case "u":
      return <u>{children}</u>;
    case "ul":
      return (
        <ul className="list-disc space-y-1.5 pl-6 leading-relaxed marker:text-slate-muted">
          {children}
        </ul>
      );
    case "ol":
      return (
        <ol className="list-decimal space-y-1.5 pl-6 leading-relaxed marker:text-slate-muted">
          {children}
        </ol>
      );
    case "li":
      return <li>{children}</li>;
    case "h2":
      return <h2 className="mt-4 text-h4 text-slate">{children}</h2>;
    case "h3":
      return (
        <h3 className="mt-2 text-body-md font-semibold text-slate">
          {children}
        </h3>
      );
    case "h4":
      return (
        <h4 className="text-body-sm font-semibold text-slate">{children}</h4>
      );
    case "blockquote":
      return (
        <blockquote className="border-l-2 border-sand-line pl-4 text-slate-muted">
          {children}
        </blockquote>
      );
    case "a": {
      const href = node.href ?? "#";
      const external = /^https?:/i.test(href);
      return (
        <a
          href={href}
          {...(external
            ? { target: "_blank", rel: "noopener noreferrer nofollow ugc" }
            : { rel: "noopener noreferrer" })}
          className="font-medium text-slate underline decoration-slate/40 underline-offset-2 hover:decoration-slate"
        >
          {children}
        </a>
      );
    }
  }
}
