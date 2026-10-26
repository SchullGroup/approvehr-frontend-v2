"use client";

import { Fragment, isValidElement, useContext, useId } from "react";
import { Check, CircleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { InfoTooltip } from "./field";
import { InDialog } from "./in-dialog";

/** The words of a callout whose children are only words, or null. */
function plainText(children: React.ReactNode): string | null {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (
    Array.isArray(children) &&
    children.every(
      (child) => typeof child === "string" || typeof child === "number",
    )
  ) {
    return children.join("");
  }
  return null;
}

const INLINE_TAGS = new Set(["strong", "em", "b", "i", "span", "code", "u"]);
const BLOCK_TAGS = new Set(["p", "ul", "ol", "li", "div"]);

/**
 * The words of a callout whose children are words with formatting in them: a
 * name in bold, a list of reasons, two paragraphs. Null the moment there is
 * anything that is not words: a link, a button, a component of ours. Those have
 * to be on the page, because a control inside a tooltip cannot be used.
 */
function deepText(node: React.ReactNode): string | null {
  if (node === null || node === undefined || typeof node === "boolean")
    return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) {
    let joined = "";
    for (const part of node) {
      const text = deepText(part as React.ReactNode);
      if (text === null) return null;
      joined += text;
    }
    return joined;
  }
  if (!isValidElement(node)) return null;
  const props = node.props as { children?: React.ReactNode };
  if (node.type === Fragment) return deepText(props.children);
  if (typeof node.type !== "string") return null;
  if (node.type === "br") return "\n";
  if (INLINE_TAGS.has(node.type)) return deepText(props.children);
  if (BLOCK_TAGS.has(node.type)) {
    const text = deepText(props.children);
    return text === null ? null : `\n${text}\n`;
  }
  return null;
}

/** `deepText`, laid out as a sentence or two: one blank space, one line break per block. */
function readable(children: React.ReactNode): string | null {
  const text = deepText(children);
  if (text === null) return null;
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/([.!?])(?=[A-Z])/g, "$1 ")
    .trim();
}

/** Whether there is anything to draw: `{null}` and `{false}` are the common empties. */
function hasContent(children: React.ReactNode): boolean {
  return children !== null && children !== undefined && children !== false;
}

/**
 * One sentence on the page, never a box.
 *
 * ## What this replaced
 *
 * A tinted panel: an icon, a heading, a paragraph and sometimes a button, laid
 * over the page it was about. The owner does not want large banners anywhere.
 * What each of them said now has a better home, and this is the floor that
 * makes it impossible to fall back to a box:
 *
 * - **A fact about a person, a row or a section** belongs on it, as an
 *   `AttentionMark` with the sentence behind it. That is a call-site decision and
 *   is made at the call site; reaching for `Callout` for it is the thing to stop.
 * - **A failure** (`danger`) is words on screen, because it is the one thing the
 *   reader must read to carry on: a refused action, a failed load. Plain red
 *   text, no fill, no border, no icon.
 * - **Everything else** is a quiet line. The first sentence (or the title) is
 *   visible; anything after it is behind an icon that shows it on hover, focus or
 *   a tap. A `warning` carries the ochre mark, because it is the one that asks to
 *   be noticed; the rest carry the grey help icon.
 *
 * `icon` is accepted and ignored, as `Badge`'s `tone` is: the glyph is decided
 * here so that two callouts cannot disagree about what a warning looks like.
 */
export function Callout({
  tone = "info",
  title,
  icon: _icon,
  className,
  children,
}: {
  tone?: "info" | "success" | "warning" | "danger" | "accent" | "neutral";
  title?: string;
  /** Kept for existing callers; has no visual effect. */
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const quiet = useId();
  void _icon;
  const inDialog = useContext(InDialog);
  /* On a page, words with formatting in them are read as words and go the same
     way as plain text. In a dialog they stay where they are: that is where the
     consequence of the button beside them is read. */
  const text =
    plainText(children) ??
    (inDialog || tone === "danger" ? null : readable(children));

  /* A failure: plain red words, inline. No role is added: a failure shown on
     arrival is announced by whoever raised it. The title is the heavier of the
     two words, so a message after it reads as the rest of the sentence. */
  if (tone === "danger") {
    const message = hasContent(children);
    return (
      <div
        className={cn(
          "flex flex-wrap items-baseline gap-x-2 text-body-sm leading-relaxed text-danger-text",
          className,
        )}
      >
        {title && <span className="font-medium">{title}</span>}
        {message && <div className="min-w-0">{children}</div>}
      </div>
    );
  }

  /* Words only: the first sentence, with the rest behind an icon. */
  if (text !== null && tone !== "success") {
    const first = text.match(/^.*?[.!?](?:\s|$)/)?.[0].trim() ?? text;
    const visible = title ?? first;
    const detail = title ? text : text.slice(first.length).trim();
    return (
      <p
        className={cn(
          "inline-flex max-w-full items-center gap-2 text-body-sm text-muted",
          className,
        )}
      >
        <span className="min-w-0">{visible}</span>
        {detail.length > 0 && (
          <InfoTooltip
            id={quiet}
            text={detail}
            label="Read more"
            tone={tone === "warning" ? "attention" : "info"}
          />
        )}
      </p>
    );
  }

  /* Something with markup in it, a name in bold or a link or a button: it has
     to stay on the page, so it is a line of text with the markup where it was. */
  return (
    <div
      className={cn(
        "flex items-start gap-2 text-body-sm leading-relaxed text-muted",
        className,
      )}
    >
      {tone === "warning" ? (
        <CircleAlert
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-warning-text"
        />
      ) : tone === "success" ? (
        <Check
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-accent-text"
        />
      ) : null}
      <div className="min-w-0">
        {title && <p className="font-medium text-ink">{title}</p>}
        {hasContent(children) && <div>{children}</div>}
      </div>
    </div>
  );
}
