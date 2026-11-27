"use client";

import type { ApiGoal } from "@/lib/api/performance";
import {
  declineByline,
  declineEntries,
  earlierDeclines,
  type DeclineEntry,
} from "@/lib/performance/declines";
import { useOrgTimezone } from "@/lib/store/session";

/**
 * Who declined an objective, and when, as one quiet line.
 *
 * Nothing for an entry that carries neither a name nor a date: there is then
 * only the words, and a line saying "by" and nothing would be a claim about
 * somebody.
 */
export function DeclineByline({ entry }: { entry: DeclineEntry }) {
  const timeZone = useOrgTimezone();
  const line = declineByline(entry, timeZone);
  if (!line) return null;
  return <span className="block text-meta text-muted">{line}</span>;
}

/**
 * The declines before the latest, each with its author and day, closed until
 * asked for. Drawn only when there was more than one, so a first decline adds
 * nothing to the page.
 */
export function EarlierDeclines({
  goal,
}: {
  goal: Pick<ApiGoal, "declines" | "approvalNote" | "approval">;
}) {
  const earlier = declineEntries(goal).slice(1);
  if (earlier.length === 0) return null;
  return (
    <details className="text-body-sm">
      <summary className="cursor-pointer text-meta text-muted hover:text-ink">
        {earlierDeclines(earlier.length)}
      </summary>
      <ul className="mt-1.5 flex flex-col gap-2">
        {earlier.map((entry, index) => (
          <li
            key={`${entry.at ?? "x"}-${String(index)}`}
            className="border-l-2 border-line pl-3"
          >
            <DeclineByline entry={entry} />
            <span className="mt-0.5 block whitespace-pre-line leading-relaxed text-body">
              {entry.reason}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Every decline, newest first, for a place that has room (an objective's own
 * window, an approver's history).
 */
export function DeclineList({
  goal,
}: {
  goal: Pick<ApiGoal, "declines" | "approvalNote" | "approval">;
}) {
  const entries = declineEntries(goal);
  if (entries.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {entries.map((entry, index) => (
        <li
          key={`${entry.at ?? "x"}-${String(index)}`}
          className="border-l-2 border-line-strong pl-3"
        >
          <DeclineByline entry={entry} />
          <span className="mt-0.5 block whitespace-pre-line text-body-sm leading-relaxed text-body">
            {entry.reason}
          </span>
        </li>
      ))}
    </ul>
  );
}
