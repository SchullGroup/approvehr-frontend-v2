"use client";

import { useCallback } from "react";
import { MessageSquareText } from "lucide-react";
import { Callout, EmptyState, LoadState, TextLink } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { isModuleOff, queriesApi } from "@/lib/api/queries";
import { useCan } from "@/lib/permissions";
import {
  DEMO_QUERY_HEADING,
  DEMO_QUERY_REASON,
  useQueryDetail,
} from "@/lib/store/queries";
import { useSession } from "@/lib/store/session";
import { DraftEditor } from "./draft-editor";
import { StatusCard, Timeline } from "./facts";
import { LetterDocument } from "./letter-document";
import { LetterView } from "./letter-view";
import { OutcomeCard } from "./outcome-card";
import { ReplyCard } from "./reply-card";
import { StaffActions } from "./staff-actions";

/**
 * One query, for whoever the API says may read it.
 *
 * ## One route, narrowed by the API and not by the address
 *
 * The person the letter is addressed to, the issuer, the decider and HR all open the same page,
 * and the server answers each with what that reader may see: the person never gets a draft, never
 * gets anybody's user id and reads their own unsent reply; staff never read an unsent reply. A
 * colleague, a line manager or an auditor who types the address gets the answer a record that does
 * not exist gets. This screen draws what it is handed and offers only what `can` says.
 *
 * ## The person's view says "A letter from HR"
 *
 * The notification they followed said only that a letter was waiting, so the heading says the same.
 * The reference and the subject line are on the page, which is the only place either appears.
 *
 * ## Printing
 *
 * Everything but the letter is `print:hidden`; the letter is `LetterDocument`, drawn only on paper.
 */
export function QueryScreen({ id }: { id: string }) {
  const { detail, loading, error, reload, publish, unavailable } =
    useQueryDetail(id);
  const { employeeId, user } = useSession();
  const canDecide = useCan("DECIDE_QUERIES");
  const canSettings = useCan("MANAGE_SETTINGS");

  /* A file write answers with the file, not the query, so the page reads the query again and
     shows the server's own answer with no loading flash. */
  const refresh = useCallback(async () => {
    publish(await queriesApi.get(id));
  }, [id, publish]);

  const isSubject =
    detail !== null && employeeId !== null && detail.subject.id === employeeId;
  const isStaff = detail !== null && !isSubject;
  const title = isSubject
    ? "A letter from HR"
    : (detail?.reference ?? (detail ? "Draft query" : "Letter"));

  if (unavailable) {
    return (
      <>
        <PageHeader title="Letter" />
        <PageBody>
          <Callout tone="info" title={DEMO_QUERY_HEADING}>
            {DEMO_QUERY_REASON}
          </Callout>
        </PageBody>
      </>
    );
  }

  if (isModuleOff(error)) {
    return (
      <>
        <PageHeader title="Letter" />
        <PageBody>
          <EmptyState
            icon={<MessageSquareText aria-hidden="true" className="size-5" />}
            title="Queries are switched off for your company"
            description="Nothing has been deleted. An administrator can turn them on under Settings."
            {...(canSettings
              ? {
                  action: (
                    <TextLink href="/settings/queries">
                      Open Queries settings
                    </TextLink>
                  ),
                }
              : {})}
          />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={title}
          breadcrumb={
            isSubject
              ? [{ href: "/profile", label: "My profile" }]
              : [
                  { href: "/people", label: "Employees" },
                  { href: "/people/queries", label: "Queries" },
                ]
          }
        />
      </div>
      <PageBody>
        <div className="print:hidden">
          <LoadState
            loading={loading}
            error={error}
            subject="this letter"
            onRetry={reload}
            hasData={detail !== null}
            skeleton="page"
          >
            {detail && (
              <div className="flex flex-col gap-4">
                <StatusCard
                  detail={detail}
                  isSubject={isSubject}
                  publish={publish}
                />

                {detail.can.edit ? (
                  <DraftEditor
                    key={detail.id}
                    detail={detail}
                    publish={publish}
                    refresh={refresh}
                  />
                ) : (
                  <LetterView detail={detail} refresh={refresh} />
                )}

                <ReplyCard
                  detail={detail}
                  isSubject={isSubject}
                  publish={publish}
                  refresh={refresh}
                />

                <OutcomeCard
                  detail={detail}
                  holdsDecide={isStaff && canDecide}
                  issuedByMe={
                    detail.issuedById !== null &&
                    user !== null &&
                    detail.issuedById === user.id
                  }
                  publish={publish}
                />

                {isStaff && <StaffActions detail={detail} publish={publish} />}

                <Timeline detail={detail} isSubject={isSubject} />
              </div>
            )}
          </LoadState>
        </div>
        {detail && isStaff && detail.status !== "DRAFT" && (
          <LetterDocument detail={detail} />
        )}
      </PageBody>
    </>
  );
}
