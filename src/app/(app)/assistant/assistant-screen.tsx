"use client";

import { KeyRound, Server, Spline } from "lucide-react";
import {
  Badge,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Disclosure,
  Spinner,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { AssistantChat } from "@/components/portal/assistant-chat";
import { LoadFailure } from "@/components/portal/load-failure";
import { salesScriptAssistantName } from "@/lib/sales-script";
import { useAssistantAvailable } from "@/lib/store/ai";
import { useAssistantActions } from "@/lib/store/ai-chat";
import { useSession } from "@/lib/store/session";

/**
 * The assistant's own page. Has its own address and nav item so it is not
 * only reachable by scrolling another screen. Answers for itself when no
 * assistant is wired, since the nav item is a visibility hint, not the rule.
 */
export function AssistantScreen() {
  const { available, loading, reason } = useAssistantAvailable();
  const scriptName = salesScriptAssistantName();
  const { isConnected } = useSession();

  return (
    <>
      <PageHeader
        title="Assistant"
        action={
          available ? (
            <ButtonLink href="/settings/ai" variant="ghost" size="sm">
              How it works
            </ButtonLink>
          ) : undefined
        }
      />

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

        <AssistantChat />

        {available && !loading && (
          <>
            <WhatItCanDo />
            {scriptName && (
              <p className="text-meta text-muted">
                Answering: <span className="text-ink">{scriptName}</span>
              </p>
            )}
          </>
        )}
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/** No assistant, and why. Connected: the API's own sentence. Not connected: no server to ask. */
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
        {connected ? (
          <p className="text-body-sm text-body">
            {reason ?? "No assistant is connected."}
          </p>
        ) : (
          <p className="text-body-sm text-body">
            There is no server answering, so there is no assistant to ask. This
            page needs a running API and the records behind it.
          </p>
        )}
        <p className="text-body-sm text-muted">
          Nothing else is affected. Every screen in the product works without
          it.
        </p>
        {connected && (
          <ButtonLink href="/settings/ai" variant="secondary" size="sm">
            <KeyRound aria-hidden="true" className="size-3.5" />
            What this is, and how to switch it on
          </ButtonLink>
        )}
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

/** What it may propose, from `GET /ai/actions`. Closed by default. */
function WhatItCanDo() {
  const { actions, loading, error } = useAssistantActions();

  return (
    <Disclosure
      title="What it can offer to do"
      level={2}
      hint="It reads freely. Anything that would change a record is offered as a proposal you confirm."
    >
      {loading ? (
        <p className="flex items-center gap-2 text-body-sm text-muted">
          <Spinner size="sm" />
          Loading
        </p>
      ) : error ? (
        <LoadFailure subject="what the assistant can do" error={error} />
      ) : actions.length === 0 ? (
        <p className="text-body-sm text-muted">
          Nothing yet. It can answer questions about your records; there is
          nothing it can offer to change.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {actions.map((action) => (
            <li key={action.name} className="flex flex-col gap-1">
              <p className="text-body-sm text-ink">{action.description}</p>
              <p className="flex items-center gap-1.5 text-meta text-muted">
                {action.gate.kind === "permission" ? (
                  <>
                    <Spline aria-hidden="true" className="size-3.5" />
                    Needs the {action.gate.permission} permission
                  </>
                ) : (
                  <>
                    <Server aria-hidden="true" className="size-3.5" />
                    Needs the service behind it to be wired
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}

      <Callout
        tone="neutral"
        title="Nothing happens on its own"
        className="mt-4"
      >
        Asking cannot change anything. When a change is worth making the
        assistant describes it (read out of your own records, not written by it)
        and it is made only when you press Confirm.
      </Callout>
    </Disclosure>
  );
}
