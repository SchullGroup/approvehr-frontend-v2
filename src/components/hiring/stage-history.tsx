"use client";

import { Card, CardBody, CardHeader, Timeline } from "@/components/ui";
import {
  describeEvent,
  type ApiHistoryEvent,
} from "@/lib/api/application-history";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDateTimeShort } from "@/lib/time";

/**
 * Where this application has been, who moved it, and when.
 *
 * Read-only, oldest first so it reads as a story, and rendered from what the
 * application's own detail response carries — there is no second request and so
 * no second loading or error state to get wrong: the parent already has the
 * application or it would not be showing this.
 *
 * ## An empty list does not mean nothing happened
 *
 * History is kept from the day the API began writing it and is not backfilled, so
 * an application that moved before then has none. The empty state says that. A
 * bare "no history" beside a candidate sitting in the Interview stage would read
 * as a data fault.
 */
export function StageHistory({
  events,
  className,
}: {
  /** `undefined` from an API that predates history: nothing is claimed, so
   *  nothing is drawn. An empty list is a different fact and draws its card. */
  events: ApiHistoryEvent[] | undefined;
  className?: string;
}) {
  const timeZone = useOrgTimezone();
  if (events === undefined) return null;

  return (
    <Card {...(className ? { className } : {})}>
      <CardHeader
        title="History"
        description="Every move this application has made, oldest first."
      />
      <CardBody>
        {events.length === 0 ? (
          <p className="text-body-sm text-muted">
            No moves recorded. History is kept from when it was switched on, so
            moves made before then are not listed here.
          </p>
        ) : (
          <Timeline
            entries={events.map((event) => {
              const described = describeEvent(event);
              return {
                id: event.id,
                title: described.title,
                actor: described.actor,
                timestamp: formatDateTimeShort(event.at, timeZone),
                tone: described.tone,
                ...(described.detail ? { detail: described.detail } : {}),
              };
            })}
          />
        )}
      </CardBody>
    </Card>
  );
}
