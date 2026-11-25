"use client";

import { Spinner } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { NotFoundState } from "@/components/portal/not-found-state";
import { Ai2Chat } from "@/components/ai/ai2-chat";
import { useAi2Available } from "@/lib/store/ai2-chat";

/**
 * The `/ai2` assistant's own page.
 *
 * ## Why a route rather than a panel
 *
 * The same argument `/assistant` makes: a chat reachable only by scrolling
 * somebody else's screen is the discoverability defect this codebase has
 * recorded several times. It has an address, and the page answers for itself
 * when no assistant is wired — somebody arriving on a bookmark, or on a link a
 * colleague sent before the key was removed, gets a sentence rather than an
 * empty page.
 *
 * ## Why it is not `/assistant`
 *
 * `/ai2` is read-only and has no proposal path: it answers questions and cannot
 * offer to change anything. `/assistant` can, and its confirm step is the whole
 * point of that screen. Merging them would put a surface that writes and a
 * surface that cannot behind one title, and the difference is exactly what a
 * person needs to know before typing. They converge when `/ai2` grows an action
 * path, and not before.
 */
export function AskScreen() {
  const { available, loading, model } = useAi2Available();

  /* Not there at all until an assistant is answering (UAT 23 Nov, U52,
     HR-17): a page that only says "not switched on" is a page a customer can
     do nothing with, reachable only by its address. */
  if (!loading && !available) {
    return (
      <PageBody>
        <NotFoundState />
      </PageBody>
    );
  }

  return (
    <>
      <PageHeader title="Ask" />

      <PageBody className="flex flex-col gap-6">
        {loading && (
          <p className="flex items-center gap-2 py-8 text-body-sm text-muted">
            <Spinner size="sm" />
            Asking the server
          </p>
        )}

        {/* Renders nothing on its own when no assistant is wired — the check
            above is what puts a sentence in its place, not what makes it safe. */}
        <Ai2Chat />

        {available && !loading && model && (
          <p className="text-meta text-muted">
            Answering: <span className="text-ink">{model}</span>
          </p>
        )}
      </PageBody>
    </>
  );
}
