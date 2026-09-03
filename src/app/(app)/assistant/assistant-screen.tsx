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
import { useAssistantAvailable } from "@/lib/store/ai";
import { useAssistantActions } from "@/lib/store/ai-chat";
import { useSession } from "@/lib/store/session";

/**
 * The assistant's own page.
 *
 * ## Why a route and not a panel on the dashboard
 *
 * A chat reachable only by scrolling somebody else's screen is the defect this
 * file's neighbours have recorded four separate times — the company logo, the
 * suggestion buttons, the manual PAYE override — a thing that is built, correct,
 * and findable by nobody. So it has an address, a nav item, and a link from the
 * one-shot Ask box on the dashboard.
 *
 * The nav item is hidden when no assistant is wired, which is why this page has
 * to answer for itself as well: somebody arriving on a bookmark, or on a link a
 * colleague sent before the key was removed, gets a sentence rather than an
 * empty page. That is the same split `nav.tsx` already documents — a nav item is
 * a visibility hint, and the page enforces the real rule.
 */
export function AssistantScreen() {
  const { available, loading, assistant, reason } = useAssistantAvailable();
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

        {!loading && !available && <NotWired connected={isConnected} reason={reason} />}

        {/* Renders nothing on its own when no assistant is wired — the check
            above is what puts a sentence in its place, not what makes it safe. */}
        <AssistantChat />

        {available && !loading && (
          <>
            <WhatItCanDo />
            {assistant && (
              <p className="text-meta text-muted">
                Answering: <span className="text-ink">{assistant}</span>
              </p>
            )}
          </>
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
        {connected ? (
          <p className="text-body-sm text-body">
            {/* The API's own sentence. It knows whether this is a missing
                credential or a provider that would not answer; nothing here
                does, so nothing here rewords it. */}
            {reason ?? "No assistant is connected."}
          </p>
        ) : (
          <p className="text-body-sm text-body">
            There is no server answering, so there is no assistant to ask. This
            page needs a running API and the records behind it.
          </p>
        )}
        <p className="text-body-sm text-muted">
          Nothing else is affected. Every screen in the product works without it.
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

/**
 * What it may propose, from `GET /ai/actions`.
 *
 * Closed by default: somebody arriving to ask a question does not need the
 * catalogue first. It is here because "what can I ask it to do" otherwise has no
 * answer at all — a chat box with an invisible set of capabilities is a box
 * people try twice and stop opening.
 *
 * The gate on each row is the API's own. A permission this account does not hold
 * and a capability nobody has wired on the server are different problems with
 * different fixes, and flattening them into "unavailable" would send the wrong
 * person looking.
 */
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

      <Callout tone="neutral" title="Nothing happens on its own" className="mt-4">
        Asking cannot change anything. When a change is worth making the
        assistant describes it — read out of your own records, not written by
        it — and it is made only when you press Confirm.
      </Callout>
    </Disclosure>
  );
}
