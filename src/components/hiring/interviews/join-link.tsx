"use client";

import { Copy, ExternalLink } from "lucide-react";
import { useToast } from "@/components/ui";

/**
 * The link to an online interview: open it, or copy it. Nothing at all without one.
 *
 * Opens in a new tab with `noopener noreferrer`, so the page that is opened learns
 * nothing about this one.
 */
export function JoinLink({ url }: { url: string | null }) {
  const toast = useToast();
  if (!url) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url as string);
      toast.push({ title: "Join link copied", tone: "success" });
    } catch {
      toast.push({
        title: "The link was not copied",
        tone: "danger",
        detail:
          "Your browser would not let this page copy. Select it and copy it by hand.",
      });
    }
  }

  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-w-0 items-center gap-1 text-accent-text underline-offset-2 hover:underline"
      >
        <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
        Join the call
      </a>
      <button
        type="button"
        onClick={() => void copy()}
        className="inline-flex items-center gap-1 rounded-sm text-muted underline-offset-2 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
      >
        <Copy aria-hidden="true" className="size-3" />
        Copy link
      </button>
    </span>
  );
}
