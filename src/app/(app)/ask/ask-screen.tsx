"use client";

import { Badge, Card, CardBody, CardHeader, Spinner } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { Ai2Chat } from "@/components/ai/ai2-chat";
import { useAi2Available } from "@/lib/store/ai2-chat";
import { useSession } from "@/lib/store/session";

/**
 * The `/ai2` assistant's own page. Has its own address so it's discoverable
 * and answers for itself when no assistant is wired, rather than being
 * reachable only by scrolling another screen.
 *
 * Kept separate from `/assistant`: this one is read-only with no proposal
 * path, while `/assistant` can offer changes to confirm. Merge them once
 * `/ai2` grows an action path, and not before.
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
 * No assistant, and why. Connected, shows the API's own sentence about its
 * configuration verbatim. Not connected, there's no server to have a
 * configuration, so it says that instead of implying a switched-off setting.
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
