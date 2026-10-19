"use client";

import { Badge, Card, CardBody, CardHeader, Spinner } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { Ai2Chat } from "@/components/ai/ai2-chat";
import { useAi2Available } from "@/lib/store/ai2-chat";
import { useSession } from "@/lib/store/session";

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
  const { available, loading, model, reason } = useAi2Available();
  const { isConnected } = useSession();

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

        {!loading && !available && (
          <NotWired connected={isConnected} reason={reason} />
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

/* -------------------------------------------------------------------------- */

/**
 * No assistant, and why.
 *
 * Two different facts, kept apart. Connected, the API wrote a sentence about its
 * own configuration and it is shown verbatim. Not connected, there is no server
 * to have a configuration — nothing here is switched off, and saying so would
 * send somebody looking for a setting that is not the problem.
 */
function NotWired({
  connected,
  reason,
}: {
  connected: boolean;
  reason: string | null;
}) {
  return (
    <Card>
      <CardHeader
        level={2}
        title="The assistant is not switched on"
        action={
          <Badge tone="neutral" size="sm" dot>
            Off
          </Badge>
        }
      />
      <CardBody className="flex flex-col items-start gap-3">
        <p className="text-body-sm text-body">
          {connected
            ? (reason ?? "No assistant is connected.")
            : "There is no server answering, so there is no assistant to ask. This page needs a running API and the records behind it."}
        </p>
        <p className="text-body-sm text-muted">
          Nothing else is affected. Every screen in the product works without
          it.
        </p>
      </CardBody>
    </Card>
  );
}
