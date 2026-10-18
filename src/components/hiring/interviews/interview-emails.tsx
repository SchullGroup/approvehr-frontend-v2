"use client";

import { Badge } from "@/components/ui";
import type { InterviewNotice } from "@/lib/hiring/interviews/model";
import {
  groupNotices,
  inboxLine,
  noticeKindLabel,
  noticeLine,
} from "@/lib/hiring/interviews/words";
import { formatDateTimeShort } from "@/lib/time";

/**
 * Every message asked of the mail for one interview, and what became of each.
 *
 * Read from what the API holds, never from what this screen asked: a message is "Sent"
 * only when the API says it was, "Queued" while it waits, "Skipped" with the reason
 * when it was not sent, and "Not asked" when the person chose not to send one. Panelists
 * who got the same answer share a row.
 *
 * `notices` is `null` when this server does not say, which reads as nothing drawn: not
 * knowing is never "no email was sent".
 */
export function InterviewEmails({
  notices,
  timeZone,
}: {
  notices: readonly InterviewNotice[] | null;
  timeZone: string;
}) {
  if (notices === null) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-meta font-semibold text-muted">
        Emails about this interview
      </p>
      {notices.length === 0 ? (
        <p className="text-meta text-muted">
          No email has been asked for. One goes only when somebody chooses to
          send it, when the interview is booked, changed or cancelled.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {groupNotices(notices).map((group) => {
            const line = noticeLine({ ...group, kind: group.kind }, (iso) =>
              formatDateTimeShort(iso, timeZone),
            );
            return (
              <li
                key={group.key}
                className="flex flex-col gap-0.5 rounded-md bg-sunken px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-body-sm font-medium text-ink">
                    {noticeKindLabel(group.kind, group.audience)}
                  </span>
                  <Badge tone={line.tone} size="sm">
                    {line.label}
                  </Badge>
                </div>
                <p className="text-meta text-muted">
                  {group.recipients.join(", ")}
                </p>
                {line.detail && (
                  <p className="text-body-sm text-body">{line.detail}</p>
                )}
                {group.audience === "PANELIST" && inboxLine(group.inApp) && (
                  <p className="text-meta text-muted">
                    {inboxLine(group.inApp)}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
