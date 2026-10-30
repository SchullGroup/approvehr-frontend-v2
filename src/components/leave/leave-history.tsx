"use client";

import { DrawerSection } from "@/components/ui";
import type { LeaveHistoryEntry, LeaveHistoryKind } from "@/lib/api/leave";
import { shortDate } from "@/lib/today";

/**
 * What happened to a request, in the order it happened.
 *
 * The API keeps this list and never rewrites it, so a reopen does not erase what
 * was said before it: `decisionNote` is the decision of record's note and a
 * reopen clears it, and this is where the earlier words survive. Each line says
 * what happened, who did it and when, and what they said.
 *
 * Plain text, in the order it arrived. No status pill and no colour: a state is
 * a word here, and the one thing somebody opens this to read is the reason, which
 * is the line under the name.
 *
 * The employee's own reason is **not** repeated: it is already a row above, and
 * the same sentence twice in one panel reads as two statements.
 */

const LABEL: Record<LeaveHistoryKind, string> = {
  REQUESTED: "Requested",
  FIRST_APPROVED: "Approved first",
  APPROVED: "Approved",
  /* The same word the status uses on this screen, so a request that "Sent
     back" in its status does not read "Declined" a paragraph below. */
  DECLINED: "Sent back",
  REOPENED: "Reopened",
  CANCELLED: "Withdrawn",
};

export function LeaveHistory({
  history,
}: {
  history: readonly LeaveHistoryEntry[];
}) {
  if (history.length === 0) return null;
  return (
    <DrawerSection title="What happened">
      <ol aria-label="What happened" className="flex flex-col">
        {history.map((entry, index) => {
          const who = entry.byName
            ? `${entry.byName}${entry.byJobTitle ? `, ${entry.byJobTitle}` : ""}`
            : null;
          /* The employee's reason is a row above. Every other entry's note is
             what somebody said when they acted. */
          const note = entry.kind === "REQUESTED" ? null : entry.note;
          return (
            <li
              key={`${entry.kind}-${entry.at}-${String(index)}`}
              className="flex flex-col gap-0.5 border-b border-line py-2 last:border-b-0"
            >
              <p className="flex items-baseline justify-between gap-3 text-body-sm">
                <span className="font-medium text-ink">
                  {LABEL[entry.kind]}
                </span>
                <span className="tabular shrink-0 text-meta text-muted">
                  {shortDate(entry.at)}
                </span>
              </p>
              {who && <p className="text-meta text-muted">{who}</p>}
              {note && (
                <p className="whitespace-pre-line text-body-sm text-body">
                  &ldquo;{note}&rdquo;
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </DrawerSection>
  );
}
