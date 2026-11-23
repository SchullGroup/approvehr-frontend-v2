"use client";

import { ButtonLink, Spinner } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { NotFoundState } from "@/components/portal/not-found-state";
import { AssistantChat } from "@/components/portal/assistant-chat";
import { salesScriptAssistantName } from "@/lib/sales-script";
import { useAssistantAvailable } from "@/lib/store/ai";

/**
 * The assistant's own page. Has its own address and nav item so it is not
 * only reachable by scrolling another screen. Answers for itself when no
 * assistant is wired, since the nav item is a visibility hint, not the rule.
 */
export function AssistantScreen() {
  const { available, loading } = useAssistantAvailable();
  const scriptName = salesScriptAssistantName();

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

        <AssistantChat />

        {available && !loading && (
          <>
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
