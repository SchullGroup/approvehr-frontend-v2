"use client";

import { GoHomeWhenOff } from "@/components/portal/go-home-when-off";
import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  LoadState,
} from "@/components/ui";
import { isModuleOff } from "@/lib/api/queries";
import {
  DEMO_QUERY_HEADING,
  DEMO_QUERY_REASON,
  useMyQueries,
  useQueriesSwitch,
} from "@/lib/store/queries";
import { useOrgTimezone } from "@/lib/store/session";
import { LetterList, waitingLine } from "./entries";

/**
 * The letters addressed to the person who is looking: what the **Queries** row in the sidebar
 * opens for everybody who does not write or decide queries.
 *
 * ## Why this exists
 *
 * A person a query was issued to, and every line manager, used to have no way in but the
 * notification and a card on their profile. The row is for everybody now, and this is the page
 * behind it for them. It is `GET /queries/mine`: the caller's own letters and nobody else's. The
 * server answers it for any signed-in account, so nothing here is a permission check; a manager's
 * report's letter is not in it, because it is not theirs.
 *
 * ## Neutral lines, and a plain empty state
 *
 * The lines are the profile card's (`LetterList`): a reference, where the letter stands and the
 * reply-by time, never a subject line. Unlike the profile, this is a page somebody opens on
 * purpose, so an empty list says so in words and says where a letter would come from. An empty
 * list is only said once the read has worked: a failed read says it failed, with a way to try
 * again, and is never "no letters".
 *
 * ## `alongside`
 *
 * The people who write queries (and a manager who drafts them) land on the register or their drafts
 * instead, and can be sent a letter too. For them this draws the same list above the page, **only
 * when there is a letter**, and nothing otherwise: no empty state, no error, no wait. They have not
 * asked to see their own letters, so the page does not make a point of having none.
 */
export function MyLetters({ alongside = false }: { alongside?: boolean }) {
  const queries = useQueriesSwitch();
  const mine = useMyQueries(queries.on);
  const timeZone = useOrgTimezone();

  const rows = mine.data?.rows ?? [];
  const description = waitingLine(mine.data?.waiting ?? null);

  if (alongside) {
    if (!queries.on || rows.length === 0) return null;
    return (
      <Card>
        <CardHeader
          title="Letters addressed to you"
          {...(description ? { description } : {})}
        />
        <CardBody>
          <LetterList rows={rows} timeZone={timeZone} />
        </CardBody>
      </Card>
    );
  }

  if (mine.unavailable) {
    return (
      <Callout tone="info" title={DEMO_QUERY_HEADING}>
        {DEMO_QUERY_REASON}
      </Callout>
    );
  }

  /* The server is the authority on the switch, and the sidebar's copy of it is a default until the
     read lands. Nobody here can change it, so the page goes home rather than saying so. */
  if ((queries.known && !queries.on) || isModuleOff(mine.error)) {
    return <GoHomeWhenOff />;
  }

  /* The letters are not asked for until the company's settings have said queries are on, and a
     read that has not been asked for is neither loading nor failed to the hook that owns it: it
     reports no data and no error, which `LoadState` would take for an answer and draw "nothing has
     been sent to you" over. Until the settings answer, that is still waiting; if they cannot be
     read, that is the failure to show. */
  const settingsFailed = queries.error != null;
  const waiting = mine.data === null && !mine.error && !settingsFailed;

  return (
    <Card>
      <LoadState
        loading={mine.loading || waiting}
        error={mine.error ?? queries.error}
        subject="your letters"
        /* Reloading the letters does nothing while they are not being asked for, so a failed read of
           the settings offers no button rather than one that cannot work. */
        onRetry={settingsFailed && !mine.error ? undefined : mine.reload}
        hasData={mine.data !== null}
        skeleton="list"
      >
        {mine.data === null ? null : rows.length === 0 ? (
          <EmptyState
            mood="all-clear"
            title="Nothing has been sent to you"
            description="A letter from HR that asks you to explain something is listed here when it is sent to you. You are told in your notifications as well."
          />
        ) : (
          <>
            <CardHeader
              title="Letters addressed to you"
              {...(description ? { description } : {})}
            />
            <CardBody>
              <LetterList rows={rows} timeZone={timeZone} />
            </CardBody>
          </>
        )}
      </LoadState>
    </Card>
  );
}
