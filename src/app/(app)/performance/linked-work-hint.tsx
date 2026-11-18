"use client";

import Link from "next/link";
import { Disclosure } from "@/components/ui";
import { dayLabel } from "@/lib/api/performance";
import {
  linkedTaskHref,
  type LinkedTask,
  type OpenableLinkedTask,
} from "@/lib/api/work-assists";
import { useFeatureSettings } from "@/lib/store/features";
import { useOrgTimezone } from "@/lib/store/session";
import { useLinkedWork } from "@/lib/store/work-assists";
import { formatDateShort } from "@/lib/time";

/**
 * The tasks linked to a done-or-not measure, beside Confirm.
 *
 * ## It lists. It never decides.
 *
 * Whoever is about to confirm a milestone can see which tasks are linked to it and where each stands:
 * open, finished on a day, closed as won't do, accepted by somebody. That is all. It does not say the
 * measure is done, does not say how many are left, does not say "all finished" and does not recommend
 * confirming. A milestone is a manager's judgement and a list of tasks is one thing a manager may look
 * at while making it. The tasks carry no title, so each is its key, which opens the task. A task the
 * reader may not open is one plain line, "A task you cannot open": the API sends nothing else about it
 * (no key, state or day), it is counted in the total, and nothing here would draw more.
 *
 * ## It draws nothing it was not told
 *
 * Nothing for a company that has not switched the assists on (and then no request is made at all),
 * nothing for a server that has no such route, nothing for a reader the API refuses, nothing for a
 * failed read. A hint that did not arrive is not a reason to say anything or to hold up Confirm. An
 * answer that **is** a list may be empty, and then it says so in words: "No task is linked to this
 * measure" is a fact, and is never a count or a percentage.
 *
 * ## Truncation is said
 *
 * The API sends up to fifty. When there are more, the list says how many it shows of how many there
 * are, and nothing counts the rest.
 *
 * Closed until opened, because it is a thing to look at while deciding, not a thing every confirmation
 * has to scroll past.
 */
export function LinkedWorkHint({ measureId }: { measureId: string }) {
  const features = useFeatureSettings();
  const timeZone = useOrgTimezone();
  const { work } = useLinkedWork(measureId, features.workAssists === true);
  if (!work) return null;

  /* A finished day is the company's calendar day and is never put through a zone (`dayLabel`); the day
     something was accepted is an instant and is read in the company's own zone. Read the other way
     round, a day west of Greenwich is the day before. */
  const formats = {
    day: dayLabel,
    instant: (value: string) => formatDateShort(value, timeZone),
  };

  if (work.items.length === 0 && work.total === 0) {
    return (
      <p className="text-body-sm text-muted">
        No task is linked to this measure.
      </p>
    );
  }

  return (
    <Disclosure
      title="Tasks linked to this measure"
      meta={String(work.total)}
      level={4}
      dense
    >
      <ul className="divide-y divide-line">
        {openableFirst(work.items).map((item) =>
          item.canOpen ? (
            <li
              key={item.issueId}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-body-sm"
            >
              <Link
                href={linkedTaskHref(item.issueId)}
                className="tabular font-medium text-accent-text underline-offset-4 hover:underline"
              >
                {item.key}
              </Link>
              <span className="text-muted">{stateWords(item, formats)}</span>
              {item.personal && (
                <span className="text-meta text-muted">On a personal list</span>
              )}
            </li>
          ) : (
            /* Counted in the total, and nothing else: no key, no state, no day. */
            <li key={item.issueId} className="py-2 text-body-sm text-muted">
              A task you cannot open
            </li>
          ),
        )}
      </ul>
      {work.truncated && (
        <p className="pt-1 text-meta text-muted">
          Showing {work.items.length} of {work.total}.
        </p>
      )}
    </Disclosure>
  );
}

/**
 * The list as it is drawn: what the reader may open first, in the order the server gave it, and what
 * they cannot open last. The server lists open tasks and then finished ones, newest first, so where a
 * line they cannot open sits would say whether it is open or finished and roughly when, which is the
 * very thing that line is kept from saying. Together at the end it says only that there is one.
 */
export function openableFirst(items: readonly LinkedTask[]): LinkedTask[] {
  return [
    ...items.filter((item) => item.canOpen),
    ...items.filter((item) => !item.canOpen),
  ];
}

/**
 * Where a linked task stands, in words and never in a figure: "Open", "Finished 4 Nov", "Closed as
 * won't do", with who accepted it when somebody did. A finished task whose day did not arrive says only
 * that it was finished, and never a made-up day.
 *
 * Two formatters, because the two dates are different things: `day` takes the company's calendar day
 * the task was finished (`YYYY-MM-DD`) and `instant` takes the moment it was accepted.
 */
export function stateWords(
  item: Pick<OpenableLinkedTask, "state" | "finishedOn" | "accepted">,
  format: {
    day: (value: string) => string;
    instant: (value: string) => string;
  },
): string {
  const base =
    item.state === "OPEN"
      ? "Open"
      : item.state === "WONT_DO"
        ? "Closed as won't do"
        : item.finishedOn
          ? `Finished ${format.day(item.finishedOn)}`
          : "Finished";
  if (!item.accepted) return base;
  const who = item.accepted.byName.trim();
  return `${base}, accepted${who ? ` by ${who}` : ""} on ${format.instant(item.accepted.at)}`;
}
